from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.dependencies import WORKSPACE_ACCESS_ROLES, CurrentUser, ensure_workspace_access, get_current_user
from app.db.database import get_db
from app.state import allowed_states, can_transition
from app.core.logger import get_logger
from app.services.alert_service import create_alert_record
from app.utils.audit import record_audit_log_safely

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


def get_alert_or_404(db: Session, alert_id: int):
    alert = db.get(models.Alert, alert_id)
    if alert is None:
        logger.warning("[ALERT] [GET_ONE] alert not found alert_id=%s", alert_id)
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


def create_alert(
    db: Session,
    alert: schemas.AlertCreate,
    current_user: CurrentUser,
):
    logger.info(
        "[ALERT] [CREATE] request received meeting_id=%s issue_id=%s level=%s status=%s",
        alert.meeting_id,
        alert.issue_id,
        alert.level,
        alert.status,
    )
    if alert.status not in allowed_states("alert"):
        logger.error("[ALERT] [ERROR] invalid status=%s", alert.status)
        raise HTTPException(status_code=400, detail="Invalid alert status")

    meeting = db.get(models.Meeting, alert.meeting_id)
    if meeting is None:
        logger.warning("[ALERT] [CREATE] meeting not found meeting_id=%s", alert.meeting_id)
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)

    if alert.issue_id is not None:
        issue = db.get(models.Issue, alert.issue_id)
        if issue is None:
            logger.warning("[ALERT] [CREATE] issue not found issue_id=%s", alert.issue_id)
            raise HTTPException(status_code=404, detail="Issue not found")
        if issue.meeting_id != alert.meeting_id:
            logger.error(
                "[ALERT] [ERROR] issue does not belong to meeting issue_id=%s meeting_id=%s",
                alert.issue_id,
                alert.meeting_id,
            )
            raise HTTPException(status_code=400, detail="Issue does not belong to meeting")

    try:
        db_alert = create_alert_record(
            db,
            meeting_id=alert.meeting_id,
            issue_id=alert.issue_id,
            message=alert.message,
            level=alert.level,
            status=alert.status,
            publish=True,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[ALERT] [ERROR] failed to create alert reason=%s", exc)
        raise
    record_audit_log_safely(
        actor=current_user.user_id_int,
        action="ALERT_CREATE",
        resource_type="ALERT",
        resource_id=db_alert.id,
        workspace_id=db_alert.workspace_id,
    )
    return db_alert


def change_alert_status(
    db: Session,
    alert_id: int,
    next_status: str,
    current_user: CurrentUser,
):
    alert = get_alert_or_404(db, alert_id)
    ensure_workspace_access(db, alert.meeting.workspace, current_user)

    if next_status not in allowed_states("alert"):
        logger.error("[ALERT] [ERROR] invalid status=%s", next_status)
        raise HTTPException(status_code=400, detail="Invalid alert status")
    if not can_transition("alert", alert.status, next_status):
        logger.error(
            "[ALERT] [ERROR] invalid status transition alert_id=%s %s -> %s",
            alert_id,
            alert.status,
            next_status,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition alert status from {alert.status} to {next_status}",
        )

    previous_status = alert.status
    alert.status = next_status
    try:
        db.commit()
        db.refresh(alert)
        logger.info("[ALERT] [UPDATE] alert_id=%s status %s -> %s", alert_id, previous_status, alert.status)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action=f"ALERT_{next_status}",
            resource_type="ALERT",
            resource_id=alert.id,
            workspace_id=alert.workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[ALERT] [ERROR] failed to change alert status alert_id=%s reason=%s", alert_id, exc)
        raise
    return alert


@router.get("/", response_model=schemas.ApiResponse[list[schemas.Alert]])
def get_alerts(
    meeting_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if meeting_id is None:
        logger.error("[ALERT] [ERROR] meeting_id is required for alert list")
        raise HTTPException(status_code=400, detail="meeting_id is required")

    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        logger.warning("[ALERT] [GET_ALL] meeting not found meeting_id=%s", meeting_id)
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)

    query = (
        db.query(models.Alert)
        .join(models.Alert.meeting)
        .join(models.Meeting.workspace)
        .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
        .filter(
            models.Alert.meeting_id == meeting_id,
            models.WorkspaceMember.user_id == current_user.user_id_int,
            models.WorkspaceMember.role.in_(WORKSPACE_ACCESS_ROLES),
        )
    )
    alerts = query.order_by(models.Alert.id.desc()).all()
    if not alerts:
        logger.warning("[ALERT] [GET_ALL] no alerts found meeting_id=%s", meeting_id)
    logger.info("[ALERT] [GET_ALL] alerts fetched count=%s meeting_id=%s", len(alerts), meeting_id)
    return success(alerts)


@router.get("/{alert_id}", response_model=schemas.ApiResponse[schemas.Alert])
def get_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    alert = get_alert_or_404(db, alert_id)
    ensure_workspace_access(db, alert.meeting.workspace, current_user)
    logger.info("[ALERT] [GET_ONE] alert fetched id=%s", alert_id)
    return success(alert)


@router.post("/", response_model=schemas.ApiResponse[schemas.Alert], status_code=201)
def create_alert_endpoint(
    alert: schemas.AlertCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    return success(create_alert(db, alert, current_user))


@router.patch("/{alert_id}/acknowledge", response_model=schemas.ApiResponse[schemas.Alert])
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ALERT] [ACKNOWLEDGE] request received alert_id=%s", alert_id)
    return success(change_alert_status(db, alert_id, "ACKNOWLEDGED", current_user))


@router.patch("/{alert_id}/dismiss", response_model=schemas.ApiResponse[schemas.Alert])
def dismiss_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ALERT] [DISMISS] request received alert_id=%s", alert_id)
    return success(change_alert_status(db, alert_id, "DISMISSED", current_user))


@router.patch("/{alert_id}/resolve", response_model=schemas.ApiResponse[schemas.Alert])
def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ALERT] [RESOLVE] request received alert_id=%s", alert_id)
    return success(change_alert_status(db, alert_id, "RESOLVED", current_user))


@router.patch("/{alert_id}", response_model=schemas.ApiResponse[schemas.Alert])
def update_alert(
    alert_id: int,
    alert_update: schemas.AlertUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    alert = db.get(models.Alert, alert_id)
    if alert is None:
        logger.warning("[ALERT] [UPDATE] alert not found alert_id=%s", alert_id)
        raise HTTPException(status_code=404, detail="Alert not found")
    ensure_workspace_access(db, alert.meeting.workspace, current_user)

    data = alert_update.model_dump(exclude_unset=True)
    previous_status = alert.status
    next_meeting_id = data.get("meeting_id", alert.meeting_id)
    next_status = data.get("status")
    if next_status is not None:
        if next_status not in allowed_states("alert"):
            logger.error("[ALERT] [ERROR] invalid status=%s", next_status)
            raise HTTPException(status_code=400, detail="Invalid alert status")
        if not can_transition("alert", alert.status, next_status):
            logger.error(
                "[ALERT] [ERROR] invalid status transition alert_id=%s %s -> %s",
                alert_id,
                alert.status,
                next_status,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition alert status from {alert.status} to {next_status}",
            )

    if "meeting_id" in data:
        meeting = db.get(models.Meeting, data["meeting_id"])
        if meeting is None:
            logger.warning("[ALERT] [UPDATE] meeting not found meeting_id=%s", data["meeting_id"])
            raise HTTPException(status_code=404, detail="Meeting not found")
        ensure_workspace_access(db, meeting.workspace, current_user)

    if "issue_id" in data and data["issue_id"] is not None:
        issue = db.get(models.Issue, data["issue_id"])
        if issue is None:
            logger.warning("[ALERT] [UPDATE] issue not found issue_id=%s", data["issue_id"])
            raise HTTPException(status_code=404, detail="Issue not found")
        if issue.meeting_id != next_meeting_id:
            logger.error(
                "[ALERT] [ERROR] issue does not belong to meeting issue_id=%s meeting_id=%s",
                data["issue_id"],
                next_meeting_id,
            )
            raise HTTPException(status_code=400, detail="Issue does not belong to meeting")
    elif "meeting_id" in data and alert.issue_id is not None:
        issue = db.get(models.Issue, alert.issue_id)
        if issue is not None and issue.meeting_id != next_meeting_id:
            logger.error(
                "[ALERT] [ERROR] issue does not belong to meeting issue_id=%s meeting_id=%s",
                alert.issue_id,
                next_meeting_id,
            )
            raise HTTPException(status_code=400, detail="Issue does not belong to meeting")

    for key, value in data.items():
        setattr(alert, key, value)

    try:
        db.commit()
        db.refresh(alert)
        if "status" in data:
            logger.info(
                "[ALERT] [UPDATE] alert_id=%s status %s -> %s",
                alert_id,
                previous_status,
                alert.status,
            )
            record_audit_log_safely(
                actor=current_user.user_id_int,
                action="ALERT_STATUS_UPDATE",
                resource_type="ALERT",
                resource_id=alert.id,
                workspace_id=alert.workspace_id,
            )
        else:
            logger.info("[ALERT] [UPDATE] alert updated id=%s", alert_id)
    except Exception as exc:
        db.rollback()
        logger.error("[ALERT] [ERROR] failed to update alert alert_id=%s reason=%s", alert_id, exc)
        raise
    return success(alert)


@router.delete("/{alert_id}", status_code=204)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    alert = db.get(models.Alert, alert_id)
    if alert is None:
        logger.warning("[ALERT] [DELETE] alert not found alert_id=%s", alert_id)
        raise HTTPException(status_code=404, detail="Alert not found")
    ensure_workspace_access(db, alert.meeting.workspace, current_user)
    workspace_id = alert.workspace_id

    try:
        db.delete(alert)
        db.commit()
        logger.info("[ALERT] [DELETE] alert deleted id=%s", alert_id)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="ALERT_DELETE",
            resource_type="ALERT",
            resource_id=alert_id,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[ALERT] [ERROR] failed to delete alert alert_id=%s reason=%s", alert_id, exc)
        raise
    return None
