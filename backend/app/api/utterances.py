from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.dependencies import WORKSPACE_ACCESS_ROLES, CurrentUser, ensure_workspace_access, get_current_user
from app.db.database import get_db
from app.core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


@router.get("/", response_model=schemas.ApiResponse[list[schemas.Utterance]])
def get_utterances(
    stt_result_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[UTTERANCE] [GET_ALL] request received stt_result_id=%s",
        stt_result_id,
    )
    query = db.query(models.Utterance)

    if stt_result_id is not None:
        stt_result = db.get(models.SttResult, stt_result_id)
        if stt_result is None:
            logger.warning("[UTTERANCE] [GET_ALL] stt_result not found stt_result_id=%s", stt_result_id)
            raise HTTPException(status_code=404, detail="STT result not found")
        ensure_workspace_access(db, stt_result.meeting.workspace, current_user)
        query = query.filter(models.Utterance.stt_result_id == stt_result_id)
    else:
        query = (
            query.join(models.Utterance.stt_result)
            .join(models.SttResult.meeting)
            .join(models.Meeting.workspace)
            .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
            .filter(
                models.WorkspaceMember.user_id == current_user.user_id_int,
                models.WorkspaceMember.role.in_(WORKSPACE_ACCESS_ROLES),
            )
        )

    utterances = query.order_by(
        models.Utterance.stt_result_id.asc(),
        models.Utterance.sequence.asc(),
    ).all()
    if not utterances:
        logger.warning(
            "[UTTERANCE] [GET_ALL] no utterances found stt_result_id=%s",
            stt_result_id,
        )
    logger.info("[UTTERANCE] [GET_ALL] utterances fetched count=%s", len(utterances))
    return success(utterances)


@router.get("/{utterance_id}", response_model=schemas.ApiResponse[schemas.Utterance])
def get_utterance(
    utterance_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    utterance = db.get(models.Utterance, utterance_id)
    if utterance is None:
        logger.warning("[UTTERANCE] [GET_ONE] utterance not found utterance_id=%s", utterance_id)
        raise HTTPException(status_code=404, detail="Utterance not found")
    ensure_workspace_access(db, utterance.stt_result.meeting.workspace, current_user)
    logger.info("[UTTERANCE] [GET_ONE] utterance fetched id=%s", utterance_id)
    return success(utterance)


@router.post("/", response_model=schemas.ApiResponse[schemas.Utterance], status_code=201)
def create_utterance(
    utterance: schemas.UtteranceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[UTTERANCE] [CREATE] request received stt_result_id=%s sequence=%s",
        utterance.stt_result_id,
        utterance.sequence,
    )
    stt_result = db.get(models.SttResult, utterance.stt_result_id)
    if stt_result is None:
        logger.warning("[UTTERANCE] [CREATE] stt_result not found stt_result_id=%s", utterance.stt_result_id)
        raise HTTPException(status_code=404, detail="STT result not found")
    ensure_workspace_access(db, stt_result.meeting.workspace, current_user)

    db_utterance = models.Utterance(**utterance.model_dump())
    try:
        db.add(db_utterance)
        db.commit()
        db.refresh(db_utterance)
        logger.info("[UTTERANCE] [CREATE] utterance created id=%s", db_utterance.id)
    except Exception as exc:
        db.rollback()
        logger.error("[UTTERANCE] [ERROR] failed to create utterance reason=%s", exc)
        raise
    return success(db_utterance)


@router.patch("/{utterance_id}", response_model=schemas.ApiResponse[schemas.Utterance])
def update_utterance(
    utterance_id: int,
    utterance_update: schemas.UtteranceUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    utterance = db.get(models.Utterance, utterance_id)
    if utterance is None:
        logger.warning("[UTTERANCE] [UPDATE] utterance not found utterance_id=%s", utterance_id)
        raise HTTPException(status_code=404, detail="Utterance not found")
    ensure_workspace_access(db, utterance.stt_result.meeting.workspace, current_user)

    data = utterance_update.model_dump(exclude_unset=True)
    if "stt_result_id" in data and data["stt_result_id"] is not None:
        stt_result = db.get(models.SttResult, data["stt_result_id"])
        if stt_result is None:
            logger.warning("[UTTERANCE] [UPDATE] stt_result not found stt_result_id=%s", data["stt_result_id"])
            raise HTTPException(status_code=404, detail="STT result not found")
        ensure_workspace_access(db, stt_result.meeting.workspace, current_user)

    for key, value in data.items():
        setattr(utterance, key, value)

    try:
        db.commit()
        db.refresh(utterance)
        logger.info("[UTTERANCE] [UPDATE] utterance updated id=%s", utterance_id)
    except Exception as exc:
        db.rollback()
        logger.error("[UTTERANCE] [ERROR] failed to update utterance utterance_id=%s reason=%s", utterance_id, exc)
        raise
    return success(utterance)


@router.delete("/{utterance_id}", status_code=204)
def delete_utterance(
    utterance_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    utterance = db.get(models.Utterance, utterance_id)
    if utterance is None:
        logger.warning("[UTTERANCE] [DELETE] utterance not found utterance_id=%s", utterance_id)
        raise HTTPException(status_code=404, detail="Utterance not found")
    ensure_workspace_access(db, utterance.stt_result.meeting.workspace, current_user)

    try:
        db.delete(utterance)
        db.commit()
        logger.info("[UTTERANCE] [DELETE] utterance deleted id=%s", utterance_id)
    except Exception as exc:
        db.rollback()
        logger.error("[UTTERANCE] [ERROR] failed to delete utterance utterance_id=%s reason=%s", utterance_id, exc)
        raise
    return None
