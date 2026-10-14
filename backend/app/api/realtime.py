import hmac

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.dependencies import CurrentUser, ensure_workspace_access, get_current_user
from app.core.config import settings
from app.core.logger import get_logger
from app.db.database import get_db
from app.schemas.realtime import AnalysisResultCreate, RealtimeAnalysisRequest, RealtimeChunkResult, SttChunkCreate
from app.services import judgment_service, realtime_service
from app.services.pubsub_service import publish_realtime_event
from app.websocket.manager import connection_manager

router = APIRouter()
logger = get_logger(__name__)


@router.get("/meetings/{meeting_id}/access", response_model=schemas.ApiResponse[dict])
def verify_meeting_access(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)
    return {"status": "success", "data": {"allowed": True}}


@router.post(
    "/meetings/{meeting_id}/chunks",
    response_model=schemas.ApiResponse[RealtimeChunkResult],
    status_code=201,
)
async def receive_stt_chunk(
    meeting_id: int,
    chunk: SttChunkCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)

    if not chunk.is_final:
        event = {
            "type": "utterance.partial",
            # 실시간 서버가 회의방 대상을 특정하려면 workspace_id가 필요하다.
            "workspace_id": meeting.workspace_id,
            "meeting_id": meeting_id,
            "chunk_id": chunk.chunk_id,
            "utterance": {
                "text": chunk.text,
                "speaker_label": realtime_service.normalize_speaker(chunk.speaker_label),
                "start_ms": chunk.start_ms,
                "end_ms": chunk.end_ms,
                "is_final": False,
            },
        }
        publish_realtime_event(event)
        await connection_manager.broadcast(meeting_id, event)
        return {
            "status": "success",
            "data": {
                "chunk_id": chunk.chunk_id,
                "buffered_count": len(await realtime_service.get_context(meeting_id)),
                "analysis_status": "partial",
            },
        }

    stt_result, utterance, created, stt_result_created = realtime_service.save_chunk(
        db, meeting, chunk
    )
    context = realtime_service.load_context(db, stt_result.id)
    event = {
        "type": "utterance.created",
        "workspace_id": meeting.workspace_id,
        "meeting_id": meeting_id,
        "chunk_id": chunk.chunk_id,
        "utterance": {
            "id": utterance.id,
            "stt_result_id": stt_result.id,
            "sequence": utterance.sequence,
            "speaker_label": utterance.speaker_label,
            "text": utterance.text,
            "start_ms": utterance.start_ms,
            "end_ms": utterance.end_ms,
            "is_final": chunk.is_final,
        },
    }
    if created:
        if stt_result_created:
            publish_realtime_event(
                {
                    "type": "stt.created",
                    "workspace_id": meeting.workspace_id,
                    "meeting_id": meeting_id,
                    "stt_result_id": stt_result.id,
                    "status": stt_result.status,
                }
            )
        publish_realtime_event(event)
        await connection_manager.broadcast(meeting_id, event)
        try:
            topic_events = judgment_service.process_utterance(db, meeting, utterance)
        except Exception as exc:
            # utterance/STT 저장과 transcript 이벤트는 이미 성공했다.
            # 판단 로직 장애가 chunk 재전송/중복 저장으로 이어지지 않도록
            # 분석 이벤트만 생략하고 ACK는 정상 반환한다.
            logger.warning(
                "[REALTIME] topic judgment skipped utterance_id=%s reason=%s",
                utterance.id,
                exc,
            )
            topic_events = []
        for topic_event in topic_events:
            publish_realtime_event(topic_event)
            await connection_manager.broadcast(meeting_id, topic_event)

    analysis_payload = {
        "meeting_id": meeting_id,
        "stt_result_id": stt_result.id,
        "chunk_id": chunk.chunk_id,
        "current_utterance": event["utterance"],
        "context_window": context,
        "speaker_preprocessing": {
            "current_speaker": utterance.speaker_label,
            "speaker_changed": len(context) > 1
            and context[-2]["speaker_label"] != utterance.speaker_label,
        },
    }
    analysis_status, analysis = (
        await realtime_service.request_analysis(analysis_payload)
        if created
        else ("duplicate", None)
    )
    if analysis is not None:
        analysis_event = {
            "type": "analysis.completed",
            "workspace_id": meeting.workspace_id,
            "meeting_id": meeting_id,
            "stt_result_id": stt_result.id,
            "utterance_id": utterance.id,
            "chunk_id": chunk.chunk_id,
            "result": analysis,
        }
        publish_realtime_event(analysis_event)
        await connection_manager.broadcast(meeting_id, analysis_event)
    return {
        "status": "success",
        "data": {
            "chunk_id": chunk.chunk_id,
            "stt_result_id": stt_result.id,
            "utterance_id": utterance.id,
            "sequence": utterance.sequence,
            "speaker_label": utterance.speaker_label,
            "buffered_count": len(context),
            "analysis_status": analysis_status,
            "analysis": analysis,
        },
    }


@router.post("/analysis-results", response_model=schemas.ApiResponse[dict])
async def receive_analysis_result(
    body: AnalysisResultCreate,
    x_analysis_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not settings.ANALYSIS_CALLBACK_SECRET:
        raise HTTPException(status_code=503, detail="Analysis callback is not configured")
    if x_analysis_secret != settings.ANALYSIS_CALLBACK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid analysis callback secret")
    utterance = db.get(models.Utterance, body.utterance_id)
    if (
        utterance is None
        or utterance.stt_result_id != body.stt_result_id
        or utterance.stt_result.meeting_id != body.meeting_id
    ):
        raise HTTPException(status_code=400, detail="Analysis result references are inconsistent")
    saved = (
        db.query(models.AnalysisResult)
        .filter(
            models.AnalysisResult.meeting_id == body.meeting_id,
            models.AnalysisResult.chunk_id == body.chunk_id,
        )
        .first()
    )
    if saved is None:
        saved = models.AnalysisResult(**body.model_dump())
        db.add(saved)
    else:
        saved.result = body.result
    db.commit()
    analysis_event = {
        "type": "analysis.completed",
        # 실시간 서버가 회의방 대상을 특정하려면 workspace_id가 필요하다.
        "workspace_id": utterance.stt_result.meeting.workspace_id,
        "meeting_id": body.meeting_id,
        "stt_result_id": body.stt_result_id,
        "utterance_id": body.utterance_id,
        "chunk_id": body.chunk_id,
        "result": body.result,
    }
    await connection_manager.broadcast(body.meeting_id, analysis_event)
    publish_realtime_event(analysis_event)
    return {"status": "success", "data": {"delivered": True}}


@router.post("/analysis/realtime", response_model=schemas.ApiResponse[dict])
async def analyze_realtime_contract(
    body: RealtimeAnalysisRequest,
    x_analysis_secret: str | None = Header(default=None),
):
    """Phase 3 transport contract; Phase 4 replaces the pending decision."""
    if not settings.ANALYSIS_CALLBACK_SECRET:
        raise HTTPException(status_code=503, detail="Analysis callback is not configured")
    if not x_analysis_secret or not hmac.compare_digest(
        x_analysis_secret, settings.ANALYSIS_CALLBACK_SECRET
    ):
        raise HTTPException(status_code=401, detail="Invalid analysis callback secret")

    return {
        "status": "success",
        "data": {
            "chunk_id": body.chunk_id,
            "decision": "PENDING_PHASE4",
            "context_count": len(body.context_window),
            "speaker_preprocessing": body.speaker_preprocessing,
        },
    }
