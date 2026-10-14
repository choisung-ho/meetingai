"""State-machine-based judgment over final utterances.

For every final utterance the pipeline:
1. embeds the text and compares it against the meeting's existing topics
2. similar + DECIDED topic  -> rediscussion detected: topic DECIDED->REVISITED,
   a warning Alert is created, and the speaker who triggered it is recorded
   on a TopicEvent (who rediscussed what)
3. similar + REVISITED topic + decision phrasing -> topic re-decided
4. no similar topic + decision/proposal phrasing -> a new topic is extracted
   with the proposing speaker attached

All transitions go through app.state's "topic" machine, so invalid moves
raise instead of silently corrupting status.
"""

import json
import re

from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.services.embedding_service import cosine_similarity, embed_text
from app.state import assert_transition, event_type_for_transition

logger = get_logger(__name__)

# decision phrasing: the utterance settles something
_DECISION_PATTERN = re.compile(
    r"(하기로|결정|확정|합의|채택|적용하(죠|자|겠)|진행하(죠|자|겠)|도입하(죠|자|겠)|가기로|넘기(죠|기로)|배포하(죠|자|기로))"
)
# proposal phrasing: the utterance raises something to discuss
_PROPOSAL_PATTERN = re.compile(
    r"(어떨까요|어떻습니까|제안|논의|검토|얘기해|이야기해|다뤄|고민해|필요할 것 같)"
)

_MAX_LABEL_LENGTH = 200


def classify_utterance(text: str) -> str | None:
    """Return "decision", "proposal" or None for a piece of utterance text."""
    if _DECISION_PATTERN.search(text):
        return "decision"
    if _PROPOSAL_PATTERN.search(text):
        return "proposal"
    return None


def _find_similar_topic(
    topics: list[models.Topic], embedding: list[float]
) -> tuple[models.Topic | None, float]:
    best_topic = None
    best_score = -1.0
    for topic in topics:
        score = cosine_similarity(embedding, json.loads(topic.embedding))
        if score > best_score:
            best_topic = topic
            best_score = score
    return best_topic, best_score


def process_utterance(
    db: Session, meeting: models.Meeting, utterance: models.Utterance
) -> list[dict]:
    """Run the judgment state machine for one final utterance.

    Returns realtime events to publish/broadcast. Commits its own changes.
    """
    text = (utterance.text or "").strip()
    if not text:
        return []

    speaker = utterance.speaker_label or "Unknown"
    embedding = embed_text(text)
    topics = (
        db.query(models.Topic)
        .filter(models.Topic.meeting_id == meeting.id)
        .all()
    )
    similar_topic, score = _find_similar_topic(topics, embedding)
    kind = classify_utterance(text)
    events: list[dict] = []

    try:
        if similar_topic is not None and score >= settings.REDISCUSSION_SIMILARITY_THRESHOLD:
            if similar_topic.status == "DECIDED":
                assert_transition("topic", "DECIDED", "REVISITED")
                similar_topic.status = "REVISITED"
                db.add(
                    models.TopicEvent(
                        topic_id=similar_topic.id,
                        event_type=event_type_for_transition("topic", "DECIDED", "REVISITED"),
                        speaker_label=speaker,
                        utterance_id=utterance.id,
                        detail=text[:500],
                    )
                )
                alert = models.Alert(
                    meeting_id=meeting.id,
                    message=f"재논의 감지: '{similar_topic.label[:80]}' 안건을 {speaker}이(가) 다시 언급했습니다.",
                    level="warning",
                    status="PENDING",
                )
                db.add(alert)
                db.commit()
                db.refresh(similar_topic)
                db.refresh(alert)
                logger.info(
                    "[JUDGMENT] rediscussion detected meeting_id=%s topic_id=%s speaker=%s score=%.3f",
                    meeting.id,
                    similar_topic.id,
                    speaker,
                    score,
                )
                events.append(
                    {
                        "type": "topic.revisited",
                        "workspace_id": meeting.workspace_id,
                        "meeting_id": meeting.id,
                        "topic_id": similar_topic.id,
                        "topic_label": similar_topic.label,
                        "status": similar_topic.status,
                        "revisited_by": speaker,
                        "utterance_id": utterance.id,
                        "similarity": round(score, 6),
                        "alert_id": alert.id,
                    }
                )
                events.append(
                    {
                        "type": "alert.created",
                        "workspace_id": meeting.workspace_id,
                        "meeting_id": meeting.id,
                        "alert_id": alert.id,
                        "level": alert.level,
                        "message": alert.message,
                    }
                )
            elif similar_topic.status == "REVISITED" and kind == "decision":
                assert_transition("topic", "REVISITED", "DECIDED")
                similar_topic.status = "DECIDED"
                similar_topic.decided_by = speaker
                db.add(
                    models.TopicEvent(
                        topic_id=similar_topic.id,
                        event_type=event_type_for_transition("topic", "REVISITED", "DECIDED"),
                        speaker_label=speaker,
                        utterance_id=utterance.id,
                        detail=text[:500],
                    )
                )
                db.commit()
                db.refresh(similar_topic)
                events.append(
                    {
                        "type": "topic.redecided",
                        "workspace_id": meeting.workspace_id,
                        "meeting_id": meeting.id,
                        "topic_id": similar_topic.id,
                        "topic_label": similar_topic.label,
                        "status": similar_topic.status,
                        "decided_by": speaker,
                        "utterance_id": utterance.id,
                        "similarity": round(score, 6),
                    }
                )
            elif similar_topic.status == "PROPOSED" and kind == "decision":
                assert_transition("topic", "PROPOSED", "DECIDED")
                similar_topic.status = "DECIDED"
                similar_topic.decided_by = speaker
                db.add(
                    models.TopicEvent(
                        topic_id=similar_topic.id,
                        event_type=event_type_for_transition("topic", "PROPOSED", "DECIDED"),
                        speaker_label=speaker,
                        utterance_id=utterance.id,
                        detail=text[:500],
                    )
                )
                db.commit()
                db.refresh(similar_topic)
                events.append(
                    {
                        "type": "topic.decided",
                        "workspace_id": meeting.workspace_id,
                        "meeting_id": meeting.id,
                        "topic_id": similar_topic.id,
                        "topic_label": similar_topic.label,
                        "status": similar_topic.status,
                        "decided_by": speaker,
                        "utterance_id": utterance.id,
                        "similarity": round(score, 6),
                    }
                )
            # similar but no state change needed: nothing to do
        elif kind is not None:
            status = "DECIDED" if kind == "decision" else "PROPOSED"
            topic = models.Topic(
                meeting_id=meeting.id,
                label=text[:_MAX_LABEL_LENGTH],
                status=status,
                proposed_by=speaker,
                decided_by=speaker if status == "DECIDED" else None,
                embedding=json.dumps(embedding),
                source_utterance_id=utterance.id,
            )
            db.add(topic)
            db.flush()
            db.add(
                models.TopicEvent(
                    topic_id=topic.id,
                    event_type=event_type_for_transition("topic", None, "PROPOSED"),
                    speaker_label=speaker,
                    utterance_id=utterance.id,
                    detail=text[:500],
                )
            )
            db.commit()
            db.refresh(topic)
            logger.info(
                "[JUDGMENT] topic extracted meeting_id=%s topic_id=%s status=%s speaker=%s",
                meeting.id,
                topic.id,
                topic.status,
                speaker,
            )
            events.append(
                {
                    "type": "topic.created",
                    "workspace_id": meeting.workspace_id,
                    "meeting_id": meeting.id,
                    "topic_id": topic.id,
                    "topic_label": topic.label,
                    "status": topic.status,
                    "proposed_by": speaker,
                    "utterance_id": utterance.id,
                }
            )
    except Exception as exc:
        db.rollback()
        logger.error(
            "[JUDGMENT] [ERROR] failed meeting_id=%s utterance_id=%s reason=%s",
            meeting.id,
            utterance.id,
            exc,
        )
        return []
    return events
