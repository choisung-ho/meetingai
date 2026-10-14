from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.schemas.realtime import SttChunkCreate
from app.services import speaker_service
from app.services.context_buffer import BufferedUtterance, context_buffer

logger = get_logger(__name__)


def normalize_speaker(label: str | None) -> str:
    value = (label or "").strip()
    return value[:100] if value else "Unknown"


def save_chunk(
    db: Session, meeting: models.Meeting, chunk: SttChunkCreate
) -> tuple[models.SttResult, models.Utterance, bool, bool]:
    # One active STT result and monotonically increasing sequence per meeting,
    # including the race where two first chunks arrive simultaneously.
    db.execute(
        text("SELECT pg_advisory_xact_lock(:meeting_id)"),
        {"meeting_id": meeting.id},
    )
    stt_result = db.get(models.SttResult, chunk.stt_result_id) if chunk.stt_result_id else None
    if stt_result is not None and stt_result.meeting_id != meeting.id:
        raise HTTPException(status_code=400, detail="STT result does not belong to meeting")
    if stt_result is None and chunk.stt_result_id is not None:
        raise HTTPException(status_code=404, detail="STT result not found")
    stt_result_created = False
    if stt_result is None:
        stt_result = (
            db.query(models.SttResult)
            .filter(
                models.SttResult.meeting_id == meeting.id,
                models.SttResult.status == "PROCESSING",
            )
            .order_by(models.SttResult.id.desc())
            .first()
        )
    if stt_result is None:
        stt_result_created = True
        stt_result = models.SttResult(
            meeting_id=meeting.id,
            language=chunk.language,
            raw_text="",
            status="PROCESSING",
        )
        db.add(stt_result)
        db.flush()

    # Serialize sequence allocation for chunks arriving concurrently.
    stt_result = (
        db.query(models.SttResult)
        .filter(models.SttResult.id == stt_result.id)
        .with_for_update()
        .one()
    )
    duplicate = (
        db.query(models.Utterance)
        .filter(
            models.Utterance.stt_result_id == stt_result.id,
            models.Utterance.source_chunk_id == chunk.chunk_id,
        )
        .first()
    )
    if duplicate is not None:
        if duplicate.text == chunk.text:
            return stt_result, duplicate, False, False
        raise HTTPException(status_code=409, detail="Chunk ID already exists with different text")

    sequence = chunk.sequence
    if sequence is None:
        sequence = (
            db.query(func.coalesce(func.max(models.Utterance.sequence), 0))
            .filter(models.Utterance.stt_result_id == stt_result.id)
            .scalar()
            + 1
        )
    duplicate_sequence = (
        db.query(models.Utterance)
        .filter(
            models.Utterance.stt_result_id == stt_result.id,
            models.Utterance.sequence == sequence,
        )
        .first()
    )
    if duplicate_sequence is not None:
        if duplicate_sequence.text == chunk.text:
            return stt_result, duplicate_sequence, False, False
        raise HTTPException(status_code=409, detail="Utterance sequence already exists")

    if chunk.speaker_embedding or chunk.speaker_label:
        speaker_label = speaker_service.assign_speaker(
            db, meeting.id, chunk.speaker_label, chunk.speaker_embedding
        )
    else:
        speaker_label = speaker_service.UNKNOWN_LABEL
    utterance = models.Utterance(
        stt_result_id=stt_result.id,
        sequence=sequence,
        source_chunk_id=chunk.chunk_id,
        start_ms=chunk.start_ms,
        end_ms=chunk.end_ms,
        speaker_label=speaker_label,
        text=chunk.text,
    )
    stt_result.raw_text = f"{stt_result.raw_text}\n{chunk.text}".strip()
    if chunk.language and not stt_result.language:
        stt_result.language = chunk.language
    db.add(utterance)
    try:
        db.commit()
        db.refresh(utterance)
        db.refresh(stt_result)
    except Exception:
        db.rollback()
        raise
    return stt_result, utterance, True, stt_result_created


async def add_to_context(meeting_id: int, utterance: models.Utterance) -> list[dict]:
    return await context_buffer.append(
        meeting_id,
        BufferedUtterance(
            utterance_id=utterance.id,
            sequence=utterance.sequence,
            speaker_label=normalize_speaker(utterance.speaker_label),
            text=utterance.text,
            start_ms=utterance.start_ms,
            end_ms=utterance.end_ms,
        ),
    )


async def get_context(meeting_id: int) -> list[dict]:
    return await context_buffer.snapshot(meeting_id)


def load_context(db: Session, stt_result_id: int) -> list[dict]:
    utterances = (
        db.query(models.Utterance)
        .filter(models.Utterance.stt_result_id == stt_result_id)
        .order_by(models.Utterance.sequence.desc())
        .limit(settings.REALTIME_CONTEXT_SIZE)
        .all()
    )
    context = [
        {
            "utterance_id": item.id,
            "sequence": item.sequence,
            "speaker_label": normalize_speaker(item.speaker_label),
            "text": item.text,
            "start_ms": item.start_ms,
            "end_ms": item.end_ms,
        }
        for item in reversed(utterances)
    ]
    while context and sum(len(item["text"]) for item in context) > settings.REALTIME_CONTEXT_MAX_CHARS:
        context.pop(0)
    return context


async def request_analysis(payload: dict[str, Any]) -> tuple[str, dict | None]:
    if not settings.ANALYSIS_SERVER_URL:
        return "skipped", None
    callback_secret = settings.ANALYSIS_CALLBACK_SECRET.strip()
    if not callback_secret:
        logger.warning(
            "[REALTIME] analysis server is configured but ANALYSIS_CALLBACK_SECRET is missing"
        )
        return "unavailable", None
    try:
        async with httpx.AsyncClient(timeout=settings.ANALYSIS_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{settings.ANALYSIS_SERVER_URL}/realtime/analysis/realtime",
                json=payload,
                headers={"X-Analysis-Secret": callback_secret},
            )
            response.raise_for_status()
            return "completed", response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("[REALTIME] analysis delivery failed reason=%s", exc)
        return "unavailable", None
