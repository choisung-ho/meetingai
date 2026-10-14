import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.api.dependencies import (
    CurrentUser,
    ensure_workspace_member_action_access,
    get_current_user,
    require_workspace_role,
)
from app.core.config import settings
from app.core.logger import get_logger
from app.db.database import SessionLocal, get_db
from app.schemas.ai_analysis import AIAnalysisCallback, AIAnalysisResponse
from app.schemas.response import ApiResponse
from app.services import llm_service
from app.services.pubsub_service import publish_realtime_event
from app.utils.audit import log_audit_action

router = APIRouter(prefix="/workspaces/{workspace_id}/meetings/{meeting_id}/ai")
logger = get_logger(__name__)


def _meeting_or_404(db: Session, workspace_id: int, meeting_id: int) -> models.Meeting:
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None or meeting.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.get("", response_model=ApiResponse[AIAnalysisResponse])
def get_ai_analysis(
    workspace_id: int,
    meeting_id: int,
    _member=Depends(require_workspace_role("VIEWER")),
    db: Session = Depends(get_db),
):
    _meeting_or_404(db, workspace_id, meeting_id)
    analysis = db.query(models.AIAnalysis).filter_by(
        workspace_id=workspace_id, meeting_id=meeting_id
    ).first()
    if analysis is None:
        raise HTTPException(status_code=404, detail="AI analysis is not available")
    return {"status": "success", "data": analysis}


async def _dispatch_external_reanalysis(workspace_id: int, meeting_id: int) -> None:
    """외부 분석 파이프라인이 설정된 경우에만 위임한다(선택 사항)."""
    if not settings.AI_REANALYSIS_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=settings.ANALYSIS_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.AI_REANALYSIS_URL,
                json={"workspace_id": workspace_id, "meeting_id": meeting_id},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("[AI] reanalysis dispatch failed workspace_id=%s meeting_id=%s reason=%s", workspace_id, meeting_id, exc)


def run_meeting_analysis(workspace_id: int, meeting_id: int) -> None:
    """로컬 LLM으로 회의를 분석해 저장하고 실시간 이벤트를 발행한다.

    BackgroundTask로 실행되므로 자체 DB 세션을 연다.
    실패해도 요청 흐름에 영향을 주지 않는다.
    """
    db = SessionLocal()
    try:
        meeting = db.get(models.Meeting, meeting_id)
        if meeting is None or meeting.workspace_id != workspace_id:
            logger.warning("[AI] 분석 대상 회의 없음 meeting_id=%s", meeting_id)
            return

        # 회의의 모든 발화를 화자 라벨과 함께 시간순으로 모은다.
        utterances = (
            db.query(models.Utterance)
            .join(models.Utterance.stt_result)
            .filter(models.SttResult.meeting_id == meeting_id)
            .order_by(models.SttResult.id.asc(), models.Utterance.sequence.asc())
            .all()
        )
        transcript_lines = [
            f"[{utterance.speaker_label or 'Unknown'}]: {utterance.text}"
            for utterance in utterances
        ]

        topics = (
            db.query(models.Topic).filter(models.Topic.meeting_id == meeting_id).all()
        )
        topic_events = (
            db.query(models.TopicEvent)
            .filter(models.TopicEvent.topic_id.in_([topic.id for topic in topics]))
            .order_by(models.TopicEvent.id.asc())
            .all()
            if topics
            else []
        )

        rediscussion_report = llm_service.build_rediscussion_report(topics, topic_events)
        result = llm_service.analyze_meeting(transcript_lines, rediscussion_report)

        action_items = list(result.get("action_items", []))
        for decision in result.get("decisions", []):
            action_items.append({"task": decision, "owner": "결정사항", "type": "decision"})

        analysis = (
            db.query(models.AIAnalysis).filter_by(meeting_id=meeting_id).first()
        )
        if analysis is None:
            analysis = models.AIAnalysis(
                workspace_id=workspace_id,
                meeting_id=meeting_id,
                summary_text=result["summary"],
                action_items=action_items,
                rediscussion_report=rediscussion_report,
            )
            db.add(analysis)
        else:
            analysis.summary_text = result["summary"]
            analysis.action_items = action_items
            analysis.rediscussion_report = rediscussion_report

        db.commit()
        db.refresh(analysis)

        logger.info(
            "[AI] 분석 저장 완료 meeting_id=%s generated_by=%s 발화=%s 재논의=%s",
            meeting_id,
            result.get("generated_by"),
            len(transcript_lines),
            len(rediscussion_report),
        )

        publish_realtime_event(
            {
                "type": "ai.analysis.completed",
                "workspace_id": workspace_id,
                "meeting_id": meeting_id,
                "analysis_id": analysis.id,
            }
        )
    except Exception as exc:
        db.rollback()
        logger.error("[AI] 분석 실패 meeting_id=%s reason=%s", meeting_id, exc)
    finally:
        db.close()


@router.post("/re-analyze", response_model=ApiResponse[dict], status_code=202)
def request_reanalysis(
    workspace_id: int,
    meeting_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = _meeting_or_404(db, workspace_id, meeting_id)
    ensure_workspace_member_action_access(db, meeting.workspace, current_user)

    # 기본은 로컬 LLM 분석이고, 외부 파이프라인이 설정돼 있으면 그쪽에도 위임한다.
    background_tasks.add_task(run_meeting_analysis, workspace_id, meeting_id)
    if settings.AI_REANALYSIS_URL:
        background_tasks.add_task(_dispatch_external_reanalysis, workspace_id, meeting_id)
    log_audit_action(
        background_tasks,
        actor=current_user.user_id,
        action="AI_REANALYZE_REQUEST",
        resource_type="MEETING",
        resource_id=meeting_id,
        workspace_id=workspace_id,
    )
    return {"status": "success", "data": {"meeting_id": meeting_id, "accepted": True}}


@router.post("/result", response_model=ApiResponse[AIAnalysisResponse])
def save_ai_analysis_result(
    workspace_id: int,
    meeting_id: int,
    body: AIAnalysisCallback,
    x_ai_result_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not settings.AI_RESULT_CALLBACK_SECRET or x_ai_result_secret != settings.AI_RESULT_CALLBACK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid AI result callback secret")
    _meeting_or_404(db, workspace_id, meeting_id)
    analysis = db.query(models.AIAnalysis).filter_by(meeting_id=meeting_id).first()
    if analysis is None:
        analysis = models.AIAnalysis(workspace_id=workspace_id, meeting_id=meeting_id, **body.model_dump())
        db.add(analysis)
    else:
        analysis.summary_text = body.summary_text
        analysis.action_items = body.action_items
        analysis.rediscussion_report = body.rediscussion_report
    db.commit()
    db.refresh(analysis)
    publish_realtime_event({"type": "ai.analysis.completed", "workspace_id": workspace_id, "meeting_id": meeting_id, "analysis_id": analysis.id})
    return {"status": "success", "data": analysis}
