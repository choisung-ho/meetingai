"""로컬 STT 엔진 (faster-whisper).

오디오 파일을 받아 문장 단위 세그먼트로 전사한다.
회의 음성이 외부로 나가지 않도록 전부 로컬에서 처리한다.

모델은 프로세스당 한 번만 로드해 재사용한다(로드에 수 초가 걸린다).
"""

import threading
import re
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_model = None
_model_lock = threading.Lock()


@dataclass(frozen=True)
class TranscribedSegment:
    """전사된 발화 한 구간"""

    index: int
    start_ms: int
    end_ms: int
    text: str


class SttUnavailableError(Exception):
    """STT 엔진을 쓸 수 없을 때"""


def is_available() -> bool:
    if not settings.STT_ENABLED:
        return False

    try:
        import faster_whisper  # noqa: F401
        import av  # noqa: F401  # MediaRecorder(webm/opus) 디코딩에 필요
    except ImportError:
        return False

    return True


_FILLER_PATTERN = re.compile(r"(?<!\S)(?:음+|어+|아+|네+)(?=\s|[,，.!?！？]|$)")


def postprocess_text(text: str) -> str:
    """회의 STT 결과에 적용하는 보수적 후처리.

    모델이 만든 문장을 임의로 재작성하지 않고 공백/연속 중복/대표적인
    독립 감탄사만 정리한다. 의미가 있을 수 있는 조사·어미는 건드리지 않는다.
    """
    value = re.sub(r"\s+", " ", (text or "").strip())
    if settings.STT_REMOVE_FILLERS:
        value = _FILLER_PATTERN.sub("", value)
        value = re.sub(r"\s{2,}", " ", value).strip(" ,，")
    return value


def _load_model():
    """WhisperModel을 지연 로드한다. 여러 요청이 동시에 와도 한 번만 로드한다."""
    global _model

    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise SttUnavailableError(
                "faster-whisper가 설치되어 있지 않습니다. pip install -r requirements.txt"
            ) from exc

        logger.info(
            "[STT] 모델 로딩 시작 model=%s device=%s compute_type=%s",
            settings.STT_MODEL,
            settings.STT_DEVICE,
            settings.STT_COMPUTE_TYPE,
        )

        try:
            _model = WhisperModel(
                settings.STT_MODEL,
                device=settings.STT_DEVICE,
                compute_type=settings.STT_COMPUTE_TYPE,
            )
        except Exception as exc:
            raise SttUnavailableError(f"STT 모델 로드 실패: {exc}") from exc

        logger.info("[STT] 모델 로딩 완료 model=%s", settings.STT_MODEL)

    return _model


def transcribe(
    audio_path: str | Path,
    language: str | None = None,
) -> tuple[list[TranscribedSegment], str]:
    """오디오를 전사해 세그먼트 목록과 감지된 언어를 반환한다.

    Args:
        audio_path: 오디오 파일 경로 (ffmpeg가 읽을 수 있는 포맷)
        language: 강제 언어 코드. None이면 설정값을 쓰고, "auto"면 자동 감지한다.

    Raises:
        SttUnavailableError: 엔진을 쓸 수 없거나 전사에 실패한 경우
    """
    path = Path(audio_path)
    if not path.exists():
        raise SttUnavailableError(f"오디오 파일을 찾을 수 없습니다: {path}")

    model = _load_model()

    resolved_language = language or settings.STT_LANGUAGE
    if resolved_language == "auto":
        resolved_language = None

    try:
        segments_iter, info = model.transcribe(
            str(path),
            language=resolved_language,
            temperature=settings.STT_TEMPERATURE,
            initial_prompt=settings.STT_INITIAL_PROMPT or None,
            condition_on_previous_text=settings.STT_CONDITION_ON_PREVIOUS_TEXT,
            # VAD로 무음을 걸러야 회의 녹음에서 빈 세그먼트가 줄어든다.
            vad_filter=settings.STT_VAD_FILTER,
            vad_parameters={"min_silence_duration_ms": settings.STT_VAD_MIN_SILENCE_MS}
            if settings.STT_VAD_FILTER
            else None,
        )

        segments = []
        for segment in segments_iter:
            text = postprocess_text(segment.text)
            if not text:
                continue
            segments.append(
                TranscribedSegment(
                    index=len(segments) + 1,
                    start_ms=int(segment.start * 1000),
                    end_ms=int(segment.end * 1000),
                    text=text,
                )
            )
    except Exception as exc:
        raise SttUnavailableError(f"전사 실패: {exc}") from exc

    detected_language = getattr(info, "language", None) or resolved_language or "unknown"

    logger.info(
        "[STT] 전사 완료 file=%s segments=%s language=%s duration=%.1fs",
        path.name,
        len(segments),
        detected_language,
        getattr(info, "duration", 0.0),
    )

    return segments, detected_language
