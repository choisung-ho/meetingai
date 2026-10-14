from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.api.dependencies import (
    CurrentUser,
    ensure_workspace_access,
    ensure_workspace_member_action_access,
    get_current_user,
)
from app.core.logger import get_logger
from app.db.database import get_db
from app.schemas.rag import TopicEventResponse, TopicResponse, TopicStateUpdate
from app.schemas.response import ApiResponse
from app.services.pubsub_service import publish_realtime_event
from app.state import can_transition
from app.utils.audit import log_audit_action

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


@router.get(
    "/meetings/{meeting_id}/topics",
    response_model=ApiResponse[list[TopicResponse]],
)
def get_meeting_topics(
    meeting_id: int,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None:
        raise HTTPException(status_code=404, detail="Meeting not found")
    ensure_workspace_access(db, meeting.workspace, current_user)

    query = db.query(models.Topic).filter(models.Topic.meeting_id == meeting_id)
    if status is not None:
        query = query.filter(models.Topic.status == status.upper())
    topics = query.order_by(models.Topic.id.asc()).all()
    logger.info("[TOPIC] [GET_ALL] meeting_id=%s count=%s", meeting_id, len(topics))
    return success(topics)


@router.get("/topics/{topic_id}", response_model=ApiResponse[TopicResponse])
def get_topic(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    topic = db.get(models.Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    ensure_workspace_access(db, topic.meeting.workspace, current_user)
    return success(topic)


@router.get(
    "/topics/{topic_id}/events",
    response_model=ApiResponse[list[TopicEventResponse]],
)
def get_topic_events(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    topic = db.get(models.Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    ensure_workspace_access(db, topic.meeting.workspace, current_user)
    events = (
        db.query(models.TopicEvent)
        .filter(models.TopicEvent.topic_id == topic_id)
        .order_by(models.TopicEvent.id.asc())
        .all()
    )
    return success(events)


@router.patch("/topics/{topic_id}/state", response_model=ApiResponse[TopicResponse])
def update_topic_state(
    topic_id: int,
    state_update: TopicStateUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    topic = db.get(models.Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    # 상태 변경은 읽기 전용 권한(VIEWER)으로는 수행할 수 없다.
    ensure_workspace_member_action_access(db, topic.meeting.workspace, current_user)

    next_status = state_update.status
    if not can_transition("topic", topic.status, next_status):
        logger.error(
            "[TOPIC] [ERROR] invalid transition topic_id=%s %s -> %s",
            topic_id,
            topic.status,
            next_status,
        )
        raise HTTPException(
            status_code=400,
            detail=f"Cannot transition topic status from {topic.status} to {next_status}",
        )

    previous_status = topic.status
    topic.status = next_status
    db.add(
        models.TopicEvent(
            topic_id=topic.id,
            event_type="TOPIC_STATE_CHANGED_MANUALLY",
            speaker_label=None,
            detail=f"{previous_status} -> {next_status} by user {current_user.user_id_int}",
        )
    )
    try:
        db.commit()
        db.refresh(topic)
        logger.info(
            "[TOPIC] [STATE] topic_id=%s %s -> %s", topic_id, previous_status, next_status
        )
    except Exception as exc:
        db.rollback()
        logger.error("[TOPIC] [ERROR] failed to update state topic_id=%s reason=%s", topic_id, exc)
        raise
    log_audit_action(
        background_tasks,
        actor=current_user.user_id,
        action="TOPIC_STATE_CHANGE",
        resource_type="TOPIC",
        resource_id=topic.id,
        workspace_id=topic.meeting.workspace_id,
    )
    publish_realtime_event(
        {
            "type": "topic.updated",
            "workspace_id": topic.meeting.workspace_id,
            "meeting_id": topic.meeting_id,
            "topic_id": topic.id,
            "status": topic.status,
            "changed_fields": ["status"],
        }
    )
    return success(topic)
