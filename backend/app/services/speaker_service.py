"""Meeting-scoped speaker identification.

Audio diarization itself happens on the client/STT engine side; the server
receives an optional speaker embedding (and/or a raw engine label) per chunk
and clusters those onto stable canonical labels: "Speaker 1", "Speaker 2", …
falling back to "Unknown" when there is nothing to identify the voice with.

Clustering is incremental nearest-centroid: a new embedding joins the closest
existing profile when cosine similarity >= SPEAKER_SIMILARITY_THRESHOLD,
otherwise a new profile (next Speaker N) is created. Centroids are running
means, renormalized after each update.
"""

import json
import math

from sqlalchemy.orm import Session

from app import models
from app.core.config import settings
from app.core.logger import get_logger
from app.services.embedding_service import cosine_similarity

logger = get_logger(__name__)

UNKNOWN_LABEL = "Unknown"


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


def _next_canonical_label(profiles: list[models.SpeakerProfile]) -> str:
    return f"Speaker {len(profiles) + 1}"


def _update_centroid(profile: models.SpeakerProfile, embedding: list[float]) -> None:
    count = profile.sample_count or 0
    if profile.centroid:
        centroid = json.loads(profile.centroid)
        merged = [
            (old * count + new) / (count + 1)
            for old, new in zip(centroid, embedding)
        ]
    else:
        merged = list(embedding)
    profile.centroid = json.dumps(_normalize(merged))
    profile.sample_count = count + 1


def assign_speaker_by_cluster(
    db: Session,
    meeting_id: int,
    cluster_index: int | None,
) -> str:
    """오프라인 클러스터링 결과(군집 번호)를 canonical 라벨로 바꾼다.

    녹음 파일 전체를 한 번에 클러스터링한 뒤 사용하는 경로다.
    군집 번호가 없으면(짧은 구간 등) Unknown으로 둔다.
    """
    if cluster_index is None:
        return UNKNOWN_LABEL

    source_label = f"cluster-{cluster_index}"

    profile = (
        db.query(models.SpeakerProfile)
        .filter(
            models.SpeakerProfile.meeting_id == meeting_id,
            models.SpeakerProfile.source_label == source_label,
        )
        .first()
    )

    if profile is not None:
        profile.sample_count = (profile.sample_count or 0) + 1
        db.flush()
        return profile.canonical_label

    profiles = (
        db.query(models.SpeakerProfile)
        .filter(models.SpeakerProfile.meeting_id == meeting_id)
        .order_by(models.SpeakerProfile.id.asc())
        .all()
    )

    profile = models.SpeakerProfile(
        meeting_id=meeting_id,
        canonical_label=_next_canonical_label(profiles),
        source_label=source_label,
        sample_count=1,
    )
    db.add(profile)
    db.flush()

    logger.info(
        "[SPEAKER] 군집 → 라벨 매핑 meeting_id=%s cluster=%s label=%s",
        meeting_id,
        cluster_index,
        profile.canonical_label,
    )

    return profile.canonical_label


def assign_speaker(
    db: Session,
    meeting_id: int,
    raw_label: str | None,
    speaker_embedding: list[float] | None,
) -> str:
    """Resolve a chunk's speaker to a canonical per-meeting label."""
    profiles = (
        db.query(models.SpeakerProfile)
        .filter(models.SpeakerProfile.meeting_id == meeting_id)
        .order_by(models.SpeakerProfile.id.asc())
        .all()
    )

    if speaker_embedding:
        embedding = _normalize(speaker_embedding)
        best_profile = None
        best_score = -1.0
        for profile in profiles:
            if not profile.centroid:
                continue
            score = cosine_similarity(embedding, json.loads(profile.centroid))
            if score > best_score:
                best_profile = profile
                best_score = score
        if best_profile is not None and best_score >= settings.SPEAKER_SIMILARITY_THRESHOLD:
            _update_centroid(best_profile, embedding)
            db.flush()
            return best_profile.canonical_label
        profile = models.SpeakerProfile(
            meeting_id=meeting_id,
            canonical_label=_next_canonical_label(profiles),
            source_label=(raw_label or "").strip()[:100] or None,
            sample_count=0,
        )
        _update_centroid(profile, embedding)
        db.add(profile)
        db.flush()
        logger.info(
            "[SPEAKER] new profile meeting_id=%s label=%s best_score=%.3f",
            meeting_id,
            profile.canonical_label,
            best_score,
        )
        return profile.canonical_label

    raw = (raw_label or "").strip()
    if not raw:
        return UNKNOWN_LABEL
    # no embedding: map identical engine labels onto one canonical profile
    for profile in profiles:
        if profile.source_label == raw[:100]:
            profile.sample_count = (profile.sample_count or 0) + 1
            db.flush()
            return profile.canonical_label
    profile = models.SpeakerProfile(
        meeting_id=meeting_id,
        canonical_label=_next_canonical_label(profiles),
        source_label=raw[:100],
        sample_count=1,
    )
    db.add(profile)
    db.flush()
    return profile.canonical_label
