"""회의 오디오 → STT → 화자 분리 → 발화 저장 → 안건/재논의 판단 파이프라인.

전체 흐름:
    오디오 파일
    → faster-whisper 전사 (세그먼트 단위)
    → ECAPA로 세그먼트별 화자 임베딩 추출
    → speaker_service 클러스터링 (Speaker 1 / Speaker 2 / Unknown)
    → Utterance 저장
    → judgment_service로 안건 추출 / 재논의 탐지
    → 실시간 이벤트 발행

화자 임베딩을 못 뽑아도 전사 결과는 저장된다(화자는 Unknown).
"""

from pathlib import Path

from sqlalchemy.orm import Session

from app import models
from app.core.logger import get_logger
from app.services import (
    diarization_engine,
    judgment_service,
    speaker_service,
    stt_engine,
)
from app.services.pubsub_service import publish_realtime_event
from app.state import assert_transition

logger = get_logger(__name__)


class AudioPipelineError(Exception):
    """오디오 처리에 실패했을 때"""


def process_meeting_audio(
    db: Session,
    meeting: models.Meeting,
    audio_path: str | Path,
    language: str | None = None,
) -> dict:
    """회의 오디오를 전사하고 발화/화자/안건까지 저장한다.

    Returns:
        {stt_result_id, utterance_count, speakers, language, topic_events}
    """
    if not stt_engine.is_available():
        raise AudioPipelineError(
            "STT 엔진을 사용할 수 없습니다. STT_ENABLED 설정과 faster-whisper 설치를 확인하세요."
        )

    # 1) 전사
    try:
        segments, detected_language = stt_engine.transcribe(audio_path, language)
    except stt_engine.SttUnavailableError as exc:
        raise AudioPipelineError(str(exc)) from exc

    if not segments:
        raise AudioPipelineError("오디오에서 인식된 발화가 없습니다.")

    # 2) 화자 임베딩 + 클러스터링 (실패해도 전사는 살린다)
    #
    # 녹음 파일은 전체를 이미 갖고 있으므로, 실시간처럼 순차 판단하지 않고
    # 모든 구간을 함께 보고 묶는다(앞쪽 오판이 뒤로 전파되지 않는다).
    cluster_labels: list[int | None] = [None] * len(segments)

    if diarization_engine.is_available():
        try:
            speaker_embeddings = diarization_engine.extract_segment_embeddings(
                audio_path,
                [(segment.start_ms, segment.end_ms) for segment in segments],
            )
            cluster_labels = diarization_engine.cluster_speakers(speaker_embeddings)
        except diarization_engine.DiarizationUnavailableError as exc:
            logger.warning("[AUDIO] 화자 분리 생략: %s", exc)
    else:
        logger.info("[AUDIO] 화자 분리 비활성화 → 전 발화 Unknown 처리")

    # 3) STT Result 생성
    raw_text = "\n".join(segment.text for segment in segments)

    stt_result = models.SttResult(
        meeting_id=meeting.id,
        language=detected_language,
        raw_text=raw_text,
        status="PROCESSING",
    )
    db.add(stt_result)
    db.flush()

    # 4) 세그먼트별 화자 배정 + 발화 저장
    utterances: list[models.Utterance] = []

    for segment, cluster_index in zip(segments, cluster_labels):
        # 클러스터 번호를 회의 단위 canonical 라벨로 등록한다.
        # (같은 회의를 다시 처리해도 같은 번호가 같은 화자에 매핑된다)
        speaker_label = speaker_service.assign_speaker_by_cluster(
            db,
            meeting.id,
            cluster_index,
        )

        utterance = models.Utterance(
            stt_result_id=stt_result.id,
            sequence=segment.index,
            source_chunk_id=f"audio-{stt_result.id}-{segment.index}",
            start_ms=segment.start_ms,
            end_ms=segment.end_ms,
            speaker_label=speaker_label,
            text=segment.text,
        )
        db.add(utterance)
        utterances.append(utterance)

    assert_transition("stt_result", stt_result.status, "COMPLETED")
    stt_result.status = "COMPLETED"

    try:
        db.commit()
        db.refresh(stt_result)
    except Exception as exc:
        db.rollback()
        raise AudioPipelineError(f"발화 저장 실패: {exc}") from exc

    speakers = sorted({utterance.speaker_label for utterance in utterances})

    logger.info(
        "[AUDIO] 처리 완료 meeting_id=%s stt_result_id=%s 발화=%s 화자=%s",
        meeting.id,
        stt_result.id,
        len(utterances),
        speakers,
    )

    publish_realtime_event(
        {
            "type": "stt.created",
            "workspace_id": meeting.workspace_id,
            "meeting_id": meeting.id,
            "stt_result_id": stt_result.id,
            "status": stt_result.status,
            "utterance_count": len(utterances),
        }
    )

    # 5) 발화 순서대로 안건 추출 / 재논의 탐지
    topic_events: list[dict] = []
    for utterance in utterances:
        db.refresh(utterance)
        try:
            events = judgment_service.process_utterance(db, meeting, utterance)
        except Exception as exc:
            # 전사/화자 저장은 이미 커밋된 상태다. 특정 발화의 규칙
            # 판단 실패가 전체 녹음 결과를 500으로 되돌리지 않도록
            # 로그만 남기고 다음 발화를 계속 처리한다.
            logger.warning(
                "[AUDIO] 발화 판단 생략 utterance_id=%s reason=%s",
                utterance.id,
                exc,
            )
            continue
        for event in events:
            publish_realtime_event(event)
        topic_events.extend(events)

    return {
        "stt_result_id": stt_result.id,
        "utterance_count": len(utterances),
        "speakers": speakers,
        "language": detected_language,
        "topic_events": topic_events,
    }
