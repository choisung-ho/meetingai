from redis.exceptions import RedisError

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.services.pubsub_service import publish_json

logger = get_logger(__name__)


def _isoformat(value):
    return value.isoformat() if value else None


def build_meeting_updated_event(meeting: models.Meeting, *, previous_status: str | None = None):
    return {
        "type": "meeting.updated",
        "payload": {
            "id": meeting.id,
            "meeting_id": meeting.id,
            "meetingId": meeting.id,
            "workspace_id": meeting.workspace_id,
            "workspaceId": meeting.workspace_id,
            "title": meeting.title,
            "description": meeting.description,
            "status": meeting.status,
            "previous_status": previous_status,
            "previousStatus": previous_status,
            "scheduled_at": _isoformat(meeting.scheduled_at),
            "scheduledAt": _isoformat(meeting.scheduled_at),
            "started_at": _isoformat(meeting.started_at),
            "startedAt": _isoformat(meeting.started_at),
            "ended_at": _isoformat(meeting.ended_at),
            "endedAt": _isoformat(meeting.ended_at),
            "created_at": _isoformat(meeting.created_at),
            "createdAt": _isoformat(meeting.created_at),
        },
    }


def publish_meeting_updated(meeting: models.Meeting, *, previous_status: str | None = None):
    event = build_meeting_updated_event(meeting, previous_status=previous_status)
    try:
        subscriber_count = publish_json(settings.MEETING_UPDATED_CHANNEL, event)
    except RedisError as exc:
        logger.error(
            "[MEETING] [ERROR] failed to publish meeting.updated meeting_id=%s reason=%s",
            meeting.id,
            exc,
        )
        return 0

    logger.info(
        "[MEETING] [PUBLISHED] channel=%s subscribers=%s event=%s",
        settings.MEETING_UPDATED_CHANNEL,
        subscriber_count,
        event,
    )
    return subscriber_count
