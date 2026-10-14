from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import (
    CurrentUser,
    ensure_workspace_access,
    ensure_workspace_member_action_access,
)
from app.models.issue import Issue
from app.models.meeting import Meeting
from app.models.workspace import Workspace
from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueStateUpdate,
)
from app.state import can_transition, event_type_for_transition
from app.models.issue_event import IssueEvent
from app.core.logger import get_logger
from app.services.alert_service import sync_issue_alerts
from app.utils.audit import record_audit_log_safely

VALID_ISSUE_STATUSES = {"OPEN", "IN_PROGRESS", "CLOSED"}
logger = get_logger(__name__)


def sync_issue_alerts_safely(db: Session, issue: Issue):
    try:
        sync_issue_alerts(db, issue)
    except Exception as exc:
        logger.error("[ISSUE] [ALERT_SYNC] failed issue_id=%s reason=%s", issue.id, exc)


def validate_issue_status(status: str):
    if status not in VALID_ISSUE_STATUSES:
        logger.error("[ISSUE] [ERROR] invalid status=%s", status)
        raise HTTPException(
            status_code=400,
            detail="Invalid issue status. Allowed values: OPEN, IN_PROGRESS, CLOSED",
        )


def get_issues(db: Session, meeting_id: int | None = None, current_user: CurrentUser | None = None):
    if meeting_id is None:
        logger.error("[ISSUE] [ERROR] meeting_id is required for issue list")
        raise HTTPException(
            status_code=400,
            detail="meeting_id is required",
        )

    query = db.query(Issue).filter(Issue.deleted_at.is_(None))

    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        logger.warning("[ISSUE] [GET_ALL] meeting not found meeting_id=%s", meeting_id)
        raise HTTPException(
            status_code=404,
            detail="Meeting not found",
        )
    if current_user is not None:
        ensure_workspace_access(db, meeting.workspace, current_user)
    query = query.filter(Issue.meeting_id == meeting_id)

    issues = query.order_by(Issue.created_at.desc()).all()
    if not issues:
        logger.warning("[ISSUE] [GET_ALL] no issues found meeting_id=%s", meeting_id)
    logger.info("[ISSUE] [GET_ALL] issues fetched count=%s meeting_id=%s", len(issues), meeting_id)
    return issues


def get_issues_by_meeting(
    db: Session,
    meeting_id: int,
    current_user: CurrentUser | None = None,
):
    return get_issues(db, meeting_id=meeting_id, current_user=current_user)


def get_issues_by_workspace(
    db: Session,
    workspace_id: int,
    current_user: CurrentUser | None = None,
):
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        logger.warning("[ISSUE] [GET_WORKSPACE] workspace not found workspace_id=%s", workspace_id)
        raise HTTPException(
            status_code=404,
            detail="Workspace not found",
        )
    if current_user is not None:
        ensure_workspace_access(db, workspace, current_user)

    issues = (
        db.query(Issue)
        .join(Meeting, Meeting.id == Issue.meeting_id)
        .filter(
            Meeting.workspace_id == workspace_id,
            Issue.deleted_at.is_(None),
        )
        .order_by(Issue.created_at.desc())
        .all()
    )
    if not issues:
        logger.warning("[ISSUE] [GET_WORKSPACE] no issues found workspace_id=%s", workspace_id)
    logger.info(
        "[ISSUE] [GET_WORKSPACE] issues fetched count=%s workspace_id=%s",
        len(issues),
        workspace_id,
    )
    return issues



def get_issue(db: Session, issue_id: int, current_user: CurrentUser | None = None):
    issue = (
        db.query(Issue)
        .filter(
            Issue.id == issue_id,
            Issue.deleted_at.is_(None),
        )
        .first()
    )

    if not issue:
        logger.warning("[ISSUE] [GET_ONE] issue not found issue_id=%s", issue_id)
        raise HTTPException(
            status_code=404,
            detail="Issue not found",
        )

    if current_user is not None:
        ensure_workspace_access(db, issue.meeting.workspace, current_user)

    return issue


def create_issue(
    db: Session,
    issue_data: IssueCreate,
    current_user: CurrentUser | None = None,
):
    logger.info(
        "[ISSUE] [CREATE] request received meeting_id=%s title=%s",
        issue_data.meeting_id,
        issue_data.title,
    )
    validate_issue_status(issue_data.status)
    if issue_data.meeting_id is None:
        logger.error("[ISSUE] [ERROR] meeting_id is required for issue create")
        raise HTTPException(
            status_code=400,
            detail="meeting_id is required",
        )

    meeting = db.get(Meeting, issue_data.meeting_id)
    if meeting is None:
        logger.warning("[ISSUE] [CREATE] meeting not found meeting_id=%s", issue_data.meeting_id)
        raise HTTPException(
            status_code=404,
            detail="Meeting not found",
        )
    if current_user is not None:
        ensure_workspace_member_action_access(db, meeting.workspace, current_user)

    issue = Issue(
        title=issue_data.title,
        description=issue_data.description,
        meeting_id=issue_data.meeting_id,
        priority=issue_data.priority,
        due_date=issue_data.due_date,
        assignee_id=issue_data.assignee_id,
        status=issue_data.status,
    )

    try:
        db.add(issue)
        db.commit()
        db.refresh(issue)
        logger.info("[ISSUE] [CREATE] issue created id=%s", issue.id)
        if current_user is not None:
            record_audit_log_safely(
                actor=current_user.user_id_int,
                action="ISSUE_CREATE",
                resource_type="ISSUE",
                resource_id=issue.id,
                workspace_id=meeting.workspace_id,
            )
        sync_issue_alerts_safely(db, issue)
    except Exception as exc:
        db.rollback()
        logger.error("[ISSUE] [ERROR] failed to create issue reason=%s", exc)
        raise

    event = IssueEvent(
        issue_id=issue.id,
        meeting_id=issue.meeting_id,
        event_type=event_type_for_transition("issue", None, issue.status, "ISSUE_CREATED"),
        from_state=None,
        to_state=issue.status,
        reason="안건 생성",
        evidence=None,
    )

    try:
        db.add(event)
        db.commit()
        logger.info("[ISSUE] [CREATE] issue event created id=%s type=%s", event.id, event.event_type)
    except Exception as exc:
        db.rollback()
        logger.error("[ISSUE] [ERROR] failed to create issue event issue_id=%s reason=%s", issue.id, exc)
        raise

    return issue


def update_issue(
    db: Session,
    issue_id: int,
    issue_data: IssueUpdate,
    current_user: CurrentUser | None = None,
):
    issue = get_issue(db, issue_id, current_user=current_user)
    if current_user is not None:
        ensure_workspace_member_action_access(db, issue.meeting.workspace, current_user)

    update_data = issue_data.model_dump(exclude_unset=True)
    previous_status = issue.status

    if "status" in update_data:
        logger.error("[ISSUE] [ERROR] status update must use state endpoint issue_id=%s", issue_id)
        raise HTTPException(
            status_code=400,
            detail="Use PATCH /issues/{issue_id}/state to change issue status",
        )

    if "meeting_id" in update_data:
        if update_data["meeting_id"] is None:
            logger.error("[ISSUE] [ERROR] meeting_id cannot be null issue_id=%s", issue_id)
            raise HTTPException(
                status_code=400,
                detail="meeting_id cannot be null",
            )
        meeting = db.get(Meeting, update_data["meeting_id"])
        if meeting is None:
            logger.warning("[ISSUE] [UPDATE] meeting not found meeting_id=%s", update_data["meeting_id"])
            raise HTTPException(
                status_code=404,
                detail="Meeting not found",
            )
        if current_user is not None:
            ensure_workspace_member_action_access(db, meeting.workspace, current_user)

    for key, value in update_data.items():
        setattr(issue, key, value)

    try:
        db.commit()
        db.refresh(issue)
        if "status" in update_data:
            logger.info(
                "[ISSUE] [UPDATE] issue_id=%s status %s -> %s",
                issue_id,
                previous_status,
                issue.status,
            )
        else:
            logger.info("[ISSUE] [UPDATE] issue updated id=%s", issue_id)
        sync_issue_alerts_safely(db, issue)
    except Exception as exc:
        db.rollback()
        logger.error("[ISSUE] [ERROR] failed to update issue issue_id=%s reason=%s", issue_id, exc)
        raise

    return issue


def change_issue_state(
    db: Session,
    issue_id: int,
    state_data: IssueStateUpdate,
    current_user: CurrentUser | None = None,
):
    issue = get_issue(db, issue_id, current_user=current_user)
    if current_user is not None:
        ensure_workspace_member_action_access(db, issue.meeting.workspace, current_user)

    current_status = issue.status
    next_status = state_data.to_state
    validate_issue_status(next_status)

    if not can_transition(
        "issue",
        current_status,
        next_status,
    ):
        logger.error(
            "[ISSUE] [ERROR] invalid status transition issue_id=%s %s -> %s",
            issue_id,
            current_status,
            next_status,
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid state transition: "
                f"{current_status} -> {next_status}"
            ),
        )

    issue.status = next_status

    event = IssueEvent(
        issue_id=issue.id,
        meeting_id=state_data.meeting_id,
        event_type=get_issue_event_type(next_status),
        from_state=current_status,
        to_state=next_status,
        reason=state_data.reason,
        evidence=state_data.evidence,
    )

    db.add(event)

    try:
        db.commit()
        db.refresh(issue)
        db.refresh(event)
        logger.info(
            "[ISSUE] [UPDATE] issue_id=%s status %s -> %s",
            issue_id,
            current_status,
            next_status,
        )
        if current_user is not None:
            record_audit_log_safely(
                actor=current_user.user_id_int,
                action="ISSUE_STATE_CHANGE",
                resource_type="ISSUE",
                resource_id=issue.id,
                workspace_id=issue.meeting.workspace_id,
            )
        sync_issue_alerts_safely(db, issue)
    except Exception as exc:
        db.rollback()
        logger.error("[ISSUE] [ERROR] failed to change issue state issue_id=%s reason=%s", issue_id, exc)
        raise

    return {
    "issue_id": issue.id,
    "from_state": current_status,
    "to_state": next_status,
    "event_type": event.event_type,
    "changed_at": event.created_at,
    }


def delete_issue(
    db: Session,
    issue_id: int,
    current_user: CurrentUser | None = None,
):
    issue = get_issue(db, issue_id, current_user=current_user)
    if current_user is not None:
        ensure_workspace_member_action_access(db, issue.meeting.workspace, current_user)

    issue.deleted_at = datetime.now(timezone.utc)

    try:
        db.commit()
        db.refresh(issue)
        logger.info("[ISSUE] [DELETE] issue_id=%s soft deleted", issue_id)
        if current_user is not None:
            record_audit_log_safely(
                actor=current_user.user_id_int,
                action="ISSUE_DELETE",
                resource_type="ISSUE",
                resource_id=issue.id,
                workspace_id=issue.meeting.workspace_id,
            )
        sync_issue_alerts_safely(db, issue)
    except Exception as exc:
        db.rollback()
        logger.error("[ISSUE] [ERROR] failed to delete issue issue_id=%s reason=%s", issue_id, exc)
        raise

    return issue


def get_issue_event_type(state: str) -> str:
    event_map = {
        "OPEN": "ISSUE_OPENED",
        "IN_PROGRESS": "ISSUE_IN_PROGRESS",
        "CLOSED": "ISSUE_CLOSED",
    }

    return event_map.get(state, "ISSUE_UPDATED")
