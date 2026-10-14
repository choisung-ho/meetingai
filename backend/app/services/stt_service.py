import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models
from app.schemas.stt_result import SttResultCreate
from app.core.logger import get_logger
from app.state import assert_transition, event_type_for_transition


logger = get_logger(__name__)


def split_raw_text(raw_text: str) -> list[str]:
    normalized_text = re.sub(r"\r\n?", "\n", raw_text.strip())
    if not normalized_text:
        return []

    parts = re.findall(r"[^.!?\n]+[.!?]?|[^\n]+", normalized_text)
    sentences = []
    for part in parts:
        sentence = part.strip()
        if sentence:
            sentences.append(sentence)

    return sentences


def create_stt_result_with_utterances(
    db: Session,
    stt_result: SttResultCreate,
) -> tuple[models.SttResult, int]:
    logger.info("[STT] [CREATE] request received meeting_id=%s", stt_result.meeting_id)

    meeting = db.get(models.Meeting, stt_result.meeting_id)
    if meeting is None:
        logger.warning("[STT] [CREATE] meeting not found meeting_id=%s", stt_result.meeting_id)
        raise HTTPException(status_code=404, detail="Meeting not found")

    sentences = split_raw_text(stt_result.raw_text)
    if not sentences:
        logger.warning("[STT] [PROCESS] empty raw_text meeting_id=%s", stt_result.meeting_id)
    logger.info("[STT] [PROCESS] raw_text split count=%s", len(sentences))

    try:
        assert_transition("stt_result", "PENDING", "PROCESSING")
        processing_event = event_type_for_transition(
            "stt_result",
            "PENDING",
            "PROCESSING",
        )
        db_stt_result = models.SttResult(
            meeting_id=stt_result.meeting_id,
            language=stt_result.language,
            raw_text=stt_result.raw_text,
            status="PROCESSING",
        )
        db.add(db_stt_result)
        db.flush()
        logger.info(
            "[STT] [STATE] %s stt_result_id=%s PENDING -> PROCESSING",
            processing_event,
            db_stt_result.id,
        )

        utterances = [
            models.Utterance(
                stt_result_id=db_stt_result.id,
                sequence=index,
                start_ms=None,
                end_ms=None,
                speaker_label=None,
                text=sentence,
            )
            for index, sentence in enumerate(sentences, start=1)
        ]

        db.add_all(utterances)
        logger.info("[UTTERANCE] [BULK_CREATE] inserted count=%s", len(utterances))
        assert_transition("stt_result", db_stt_result.status, "COMPLETED")
        completed_event = event_type_for_transition(
            "stt_result",
            db_stt_result.status,
            "COMPLETED",
        )
        db_stt_result.status = "COMPLETED"
        db.commit()
        db.refresh(db_stt_result)
        logger.info(
            "[STT] [STATE] %s stt_result_id=%s status=%s",
            completed_event,
            db_stt_result.id,
            db_stt_result.status,
        )
        return db_stt_result, len(utterances)
    except Exception as exc:
        db.rollback()
        logger.error(
            "[STT] [ERROR] failed to process stt_result meeting_id=%s reason=%s",
            stt_result.meeting_id,
            exc,
        )
        raise
