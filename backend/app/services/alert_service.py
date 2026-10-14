from datetime import datetime, timedelta

from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.services.pubsub_service import publish_json

logger = get_logger(__name__)

ASSIGNEE_REQUIRED_MESSAGE = "담당자 확인 필요 안건입니다."
DUE_SOON_MESSAGE = "마감일이 가까운 안건입니다."
DUE_SOON_DAYS = 3
ACTIVE_ALERT_STATUSES = {"PENDING", "ACKNOWLEDGED"}


def build_alert_created_event(alert: models.Alert):
    return {
        "type": "alert.created",
        "payload": {
            "id": alert.id,
            "workspace_id": alert.workspace_id,
            "meeting_id": alert.meeting_id,
            "issue_id": alert.issue_id,
            "message": alert.message,
            "level": alert.level,
            "status": alert.status,
            "created_at": alert.created_at.isoformat() if alert.created_at else None,
        },
    }


def publish_alert_created(alert: models.Alert):
    event = build_alert_created_event(alert)
    subscriber_count = publish_json(settings.ALERT_CREATED_CHANNEL, event)
    logger.info(
        "[ALERT] [PUBLISHED] channel=%s subscribers=%s event=%s",
        settings.ALERT_CREATED_CHANNEL,
        subscriber_count,
        event,
    )


def create_alert_record(
    db: Session,
    *,
    meeting_id: int,
    message: str,
    level: str = "info",
    status: str = "PENDING",
    issue_id: int | None = None,
    publish: bool = True,
):
    db_alert = models.Alert(
        meeting_id=meeting_id,
        issue_id=issue_id,
        message=message,
        level=level,
        status=status,
    )

    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    logger.info("[ALERT] [CREATE] alert created id=%s", db_alert.id)

    if publish:
        try:
            publish_alert_created(db_alert)
        except RedisError as exc:
            logger.error("[ALERT] [ERROR] failed to publish alert.created id=%s reason=%s", db_alert.id, exc)
            raise

    return db_alert


def get_active_issue_alert(db: Session, issue_id: int, message: str):
    return (
        db.query(models.Alert)
        .filter(
            models.Alert.issue_id == issue_id,
            models.Alert.message == message,
            models.Alert.status.in_(ACTIVE_ALERT_STATUSES),
        )
        .order_by(models.Alert.id.desc())
        .first()
    )


def resolve_issue_alert_if_exists(db: Session, issue_id: int, message: str) -> bool:
    alert = get_active_issue_alert(db, issue_id, message)
    if alert is None:
        return False

    alert.status = "RESOLVED"
    db.commit()
    db.refresh(alert)
    logger.info("[ALERT] [RESOLVE] alert resolved id=%s issue_id=%s", alert.id, issue_id)
    return True


def is_due_soon(due_date: datetime | None, *, now: datetime | None = None) -> bool:
    if due_date is None:
        return False
    now = now or datetime.now(due_date.tzinfo)
    return due_date >= now and due_date <= now + timedelta(days=DUE_SOON_DAYS)


def sync_issue_alerts(db: Session, issue: models.Issue):
    if issue.deleted_at is not None or issue.status == "CLOSED":
        resolve_issue_alert_if_exists(db, issue.id, ASSIGNEE_REQUIRED_MESSAGE)
        resolve_issue_alert_if_exists(db, issue.id, DUE_SOON_MESSAGE)
        return

    if issue.assignee_id is None:
        if get_active_issue_alert(db, issue.id, ASSIGNEE_REQUIRED_MESSAGE) is None:
            create_alert_record(
                db,
                meeting_id=issue.meeting_id,
                issue_id=issue.id,
                message=ASSIGNEE_REQUIRED_MESSAGE,
                level="warning",
            )
    else:
        resolve_issue_alert_if_exists(db, issue.id, ASSIGNEE_REQUIRED_MESSAGE)

    if is_due_soon(issue.due_date):
        if get_active_issue_alert(db, issue.id, DUE_SOON_MESSAGE) is None:
            create_alert_record(
                db,
                meeting_id=issue.meeting_id,
                issue_id=issue.id,
                message=DUE_SOON_MESSAGE,
                level="info",
            )
    else:
        resolve_issue_alert_if_exists(db, issue.id, DUE_SOON_MESSAGE)
