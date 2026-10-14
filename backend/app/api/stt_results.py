from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.dependencies import WORKSPACE_ACCESS_ROLES, CurrentUser, ensure_workspace_access, get_current_user
from app.db.database import get_db
from app.state import allowed_states, can_transition
from app.services import stt_service
from app.core.logger import get_logger
from app.services.pubsub_service import publish_realtime_event

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


@router.get("/", response_model=schemas.ApiResponse[list[schemas.SttResult]])
def get_stt_results(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)
    query = (
        db.query(models.SttResult)
        .join(models.SttResult.meeting)
        .join(models.Meeting.workspace)
        .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
        .filter(
            models.WorkspaceMember.user_id == current_user.user_id_int,
            models.WorkspaceMember.role.in_(WORKSPACE_ACCESS_ROLES),
            models.SttResult.meeting_id == meeting_id,
        )
    )
    stt_results = query.order_by(models.SttResult.id.desc()).all()
    if not stt_results:
        logger.warning("[STT] [GET_ALL] no stt_results found")
    logger.info("[STT] [GET_ALL] stt_results fetched count=%s", len(stt_results))
    return success(stt_results)


@router.get("/{stt_result_id}", response_model=schemas.ApiResponse[schemas.SttResult])
def get_stt_result(
    stt_result_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    stt_result = db.get(models.SttResult, stt_result_id)
    if stt_result is None:
        logger.warning("[STT] [GET_ONE] stt_result not found stt_result_id=%s", stt_result_id)
        raise HTTPException(status_code=404, detail="STT result not found")
    ensure_workspace_access(db, stt_result.meeting.workspace, current_user)
    logger.info("[STT] [GET_ONE] stt_result fetched id=%s", stt_result_id)
    return success(stt_result)


@router.post(
    "/",
    response_model=schemas.ApiResponse[schemas.SttResult],
    status_code=201,
)
def create_stt_result(
    stt_result: schemas.SttResultCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = db.get(models.Meeting, stt_result.meeting_id)
    if meeting is None:
        logger.warning("[STT] [CREATE] meeting not found meeting_id=%s", stt_result.meeting_id)
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)
    try:
        db_stt_result, utterance_count = stt_service.create_stt_result_with_utterances(
            db,
            stt_result,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "[STT] [ERROR] create request failed meeting_id=%s reason=%s",
            stt_result.meeting_id,
            exc,
        )
        raise
    publish_realtime_event(
        {
            "type": "stt.created",
            "workspace_id": meeting.workspace_id,
            "meeting_id": meeting.id,
            "stt_result_id": db_stt_result.id,
            "status": db_stt_result.status,
            "utterance_count": utterance_count,
        }
    )
    return success(db_stt_result)


@router.patch("/{stt_result_id}", response_model=schemas.ApiResponse[schemas.SttResult])
def update_stt_result(
    stt_result_id: int,
    stt_update: schemas.SttResultUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    stt_result = db.get(models.SttResult, stt_result_id)
    if stt_result is None:
        logger.warning("[STT] [UPDATE] stt_result not found stt_result_id=%s", stt_result_id)
        raise HTTPException(status_code=404, detail="STT result not found")
    ensure_workspace_access(db, stt_result.meeting.workspace, current_user)

    data = stt_update.model_dump(exclude_unset=True)
    previous_status = stt_result.status
    next_status = data.get("status")
    if next_status is not None:
        if next_status not in allowed_states("stt_result"):
            logger.error("[STT] [ERROR] invalid status=%s", next_status)
            raise HTTPException(status_code=400, detail="Invalid STT result status")
        if not can_transition("stt_result", stt_result.status, next_status):
            logger.error(
                "[STT] [ERROR] invalid status transition stt_result_id=%s %s -> %s",
                stt_result_id,
                stt_result.status,
                next_status,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition STT result status from {stt_result.status} to {next_status}",
            )

    for key, value in data.items():
        setattr(stt_result, key, value)

    try:
        db.commit()
        db.refresh(stt_result)
        if "status" in data:
            logger.info(
                "[STT] [UPDATE] stt_result_id=%s status %s -> %s",
                stt_result_id,
                previous_status,
                stt_result.status,
            )
        else:
            logger.info("[STT] [UPDATE] stt_result updated id=%s", stt_result_id)
    except Exception as exc:
        db.rollback()
        logger.error("[STT] [ERROR] failed to update stt_result stt_result_id=%s reason=%s", stt_result_id, exc)
        raise
    publish_realtime_event(
        {
            "type": "stt.updated",
            "workspace_id": stt_result.meeting.workspace_id,
            "meeting_id": stt_result.meeting_id,
            "stt_result_id": stt_result.id,
            "status": stt_result.status,
            "changed_fields": sorted(data.keys()),
        }
    )
    return success(stt_result)


@router.get(
    "/{stt_result_id}/transcript",
    response_model=schemas.ApiResponse[schemas.SttTranscriptResponse],
)
def get_stt_transcript(
    stt_result_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    stt_result = db.get(models.SttResult, stt_result_id)
    if stt_result is None:
        logger.warning("[STT] [TRANSCRIPT] stt_result not found stt_result_id=%s", stt_result_id)
        raise HTTPException(status_code=404, detail="STT result not found")
    ensure_workspace_access(db, stt_result.meeting.workspace, current_user)

    utterances = (
        db.query(models.Utterance)
        .filter(models.Utterance.stt_result_id == stt_result_id)
        .order_by(models.Utterance.sequence.asc())
        .all()
    )
    lines = [
        f"[{utterance.speaker_label or 'Unknown'}]: {utterance.text}"
        for utterance in utterances
    ]
    logger.info("[STT] [TRANSCRIPT] stt_result_id=%s lines=%s", stt_result_id, len(lines))
    return success(
        {
            "stt_result_id": stt_result.id,
            "meeting_id": stt_result.meeting_id,
            "workspace_id": stt_result.meeting.workspace_id,
            "line_count": len(lines),
            "lines": lines,
            "text": "\n".join(lines),
        }
    )


@router.delete("/{stt_result_id}", status_code=204)
def delete_stt_result(
    stt_result_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    stt_result = db.get(models.SttResult, stt_result_id)
    if stt_result is None:
        logger.warning("[STT] [DELETE] stt_result not found stt_result_id=%s", stt_result_id)
        raise HTTPException(status_code=404, detail="STT result not found")
    ensure_workspace_access(db, stt_result.meeting.workspace, current_user)
    event = {
        "type": "stt.deleted",
        "workspace_id": stt_result.meeting.workspace_id,
        "meeting_id": stt_result.meeting_id,
        "stt_result_id": stt_result.id,
    }

    try:
        db.delete(stt_result)
        db.commit()
        logger.info("[STT] [DELETE] stt_result deleted id=%s", stt_result_id)
    except Exception as exc:
        db.rollback()
        logger.error("[STT] [ERROR] failed to delete stt_result stt_result_id=%s reason=%s", stt_result_id, exc)
        raise
    # 삭제도 생성/수정과 동일하게 realtime.events 단일 경로로 전달한다.
    publish_realtime_event(event)
    return None
