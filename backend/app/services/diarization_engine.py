"""화자 임베딩 추출 (speechbrain ECAPA-TDNN).

오디오의 특정 구간에서 화자 특징 벡터(192차원)를 뽑는다.
이 벡터를 speaker_service의 클러스터링에 넘기면
같은 목소리가 같은 Speaker N 라벨로 묶인다.

STT 세그먼트 경계를 그대로 화자 구간으로 사용한다.
(문장 단위로 화자가 바뀐다는 가정 — 회의 녹음에서 실용적으로 잘 맞는다)
"""

import threading
from pathlib import Path

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

# ECAPA는 16kHz 모노를 기대한다.
TARGET_SAMPLE_RATE = 16000

# 너무 짧은 구간은 화자 특징이 불안정해 신뢰할 수 없다.
MIN_SEGMENT_MS = 400

_encoder = None
_encoder_lock = threading.Lock()
_load_failed = False


class DiarizationUnavailableError(Exception):
    """화자 임베딩 엔진을 쓸 수 없을 때"""


def is_available() -> bool:
    if not settings.DIARIZATION_ENABLED or _load_failed:
        return False

    try:
        import speechbrain  # noqa: F401
        import torchaudio  # noqa: F401
    except ImportError:
        return False

    return True


def _load_encoder():
    """ECAPA 인코더를 지연 로드한다."""
    global _encoder, _load_failed

    if _encoder is not None:
        return _encoder

    with _encoder_lock:
        if _encoder is not None:
            return _encoder

        try:
            # speechbrain 1.x는 inference, 0.5.x는 pretrained 경로를 쓴다.
            try:
                from speechbrain.inference.speaker import EncoderClassifier
            except ImportError:
                from speechbrain.pretrained import EncoderClassifier

            cache_dir = Path.home() / ".cache" / "meeting-ai" / "ecapa"
            cache_dir.mkdir(parents=True, exist_ok=True)

            logger.info("[DIARIZATION] ECAPA 모델 로딩 시작")
            _encoder = EncoderClassifier.from_hparams(
                source=settings.DIARIZATION_MODEL,
                savedir=str(cache_dir),
            )
            logger.info("[DIARIZATION] ECAPA 모델 로딩 완료")
        except Exception as exc:
            _load_failed = True
            raise DiarizationUnavailableError(
                f"화자 임베딩 모델 로드 실패: {exc}"
            ) from exc

    return _encoder


def _load_audio(audio_path: str | Path):
    """오디오를 16kHz 모노 텐서로 읽는다."""
    import torch
    import torchaudio

    try:
        waveform, sample_rate = torchaudio.load(str(audio_path))
    except Exception as soundfile_error:
        # Electron MediaRecorder의 기본 출력은 audio/webm( opus )이다.
        # 현재 macOS torchaudio 설치가 soundfile backend만 제공하면 WebM/M4A를
        # 읽지 못하므로, faster-whisper가 이미 사용하는 PyAV를 fallback decoder로
        # 사용한다. 이렇게 해야 실제 마이크 녹음에서도 화자 임베딩이 Unknown으로
        # 떨어지지 않고 STT 세그먼트와 동일한 오디오를 처리할 수 있다.
        try:
            import av
            import numpy as np

            container = av.open(str(audio_path))
            if not container.streams.audio:
                raise ValueError("오디오 스트림이 없습니다")

            resampler = av.audio.resampler.AudioResampler(
                format="fltp",
                layout="mono",
                rate=TARGET_SAMPLE_RATE,
            )
            arrays = []
            for frame in container.decode(audio=0):
                converted = resampler.resample(frame)
                if not isinstance(converted, list):
                    converted = [converted]
                for item in converted:
                    arrays.append(item.to_ndarray())

            if not arrays:
                raise ValueError("디코딩된 오디오 프레임이 없습니다")

            samples = np.concatenate(arrays, axis=1).copy()
            waveform = torch.from_numpy(samples).to(torch.float32)
            sample_rate = TARGET_SAMPLE_RATE
            logger.info(
                "[DIARIZATION] PyAV fallback decoder 사용 file=%s",
                Path(audio_path).name,
            )
        except Exception as av_error:
            raise DiarizationUnavailableError(
                f"오디오 디코딩 실패(soundfile={soundfile_error}; pyav={av_error})"
            ) from av_error

    # 스테레오 등 다채널은 평균 내어 모노로 만든다.
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)

    if sample_rate != TARGET_SAMPLE_RATE:
        resampler = torchaudio.transforms.Resample(sample_rate, TARGET_SAMPLE_RATE)
        waveform = resampler(waveform)

    return waveform, TARGET_SAMPLE_RATE


def extract_segment_embeddings(
    audio_path: str | Path,
    segments: list[tuple[int, int]],
) -> list[list[float] | None]:
    """구간별 화자 임베딩을 뽑는다.

    Args:
        audio_path: 오디오 파일 경로
        segments: (start_ms, end_ms) 목록

    Returns:
        각 구간의 192차원 임베딩. 너무 짧거나 실패한 구간은 None.

    Raises:
        DiarizationUnavailableError: 엔진을 쓸 수 없는 경우
    """
    if not segments:
        return []

    import torch

    encoder = _load_encoder()

    try:
        waveform, sample_rate = _load_audio(audio_path)
    except Exception as exc:
        raise DiarizationUnavailableError(f"오디오 로드 실패: {exc}") from exc

    total_samples = waveform.shape[-1]
    embeddings: list[list[float] | None] = []

    for start_ms, end_ms in segments:
        duration_ms = end_ms - start_ms

        if duration_ms < MIN_SEGMENT_MS:
            embeddings.append(None)
            continue

        start_sample = max(int(start_ms / 1000 * sample_rate), 0)
        end_sample = min(int(end_ms / 1000 * sample_rate), total_samples)

        if end_sample <= start_sample:
            embeddings.append(None)
            continue

        chunk = waveform[:, start_sample:end_sample]

        try:
            with torch.no_grad():
                embedding = encoder.encode_batch(chunk)
            # (batch, 1, 192) → (192,)
            embeddings.append(embedding.squeeze().tolist())
        except Exception as exc:
            logger.warning(
                "[DIARIZATION] 구간 임베딩 실패 start_ms=%s end_ms=%s reason=%s",
                start_ms,
                end_ms,
                exc,
            )
            embeddings.append(None)

    extracted = sum(1 for item in embeddings if item is not None)
    logger.info(
        "[DIARIZATION] 화자 임베딩 추출 완료 구간=%s 성공=%s",
        len(segments),
        extracted,
    )

    return embeddings


def _cosine(a: list[float], b: list[float]) -> float:
    import math

    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))

    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return dot / (norm_a * norm_b)


def cluster_speakers(
    embeddings: list[list[float] | None],
    threshold: float | None = None,
) -> list[int | None]:
    """전체 구간을 한 번에 보고 화자를 묶는다(오프라인 응집 클러스터링).

    녹음 파일 전체를 이미 갖고 있을 때는 실시간처럼 앞에서부터 순차 판단하지 않고
    모든 구간을 함께 보는 편이 정확하다. 순차 방식은 앞쪽 판단 실수가
    뒤로 계속 전파되기 때문이다(centroid drift).

    average-linkage 방식으로, 가장 가까운 두 군집의 평균 유사도가
    threshold 이상인 동안 계속 병합한다.

    Args:
        embeddings: 구간별 화자 임베딩 (None이면 화자 판별 불가 구간)
        threshold: 병합 기준 코사인 유사도. None이면 설정값 사용

    Returns:
        구간별 화자 군집 번호(0부터). 판별 불가 구간은 None.
    """
    threshold = (
        threshold if threshold is not None else settings.DIARIZATION_CLUSTER_THRESHOLD
    )

    valid_indexes = [i for i, item in enumerate(embeddings) if item is not None]

    if not valid_indexes:
        return [None] * len(embeddings)

    # 각 구간을 1개짜리 군집으로 시작한다.
    clusters: list[list[int]] = [[i] for i in valid_indexes]

    def cluster_similarity(a: list[int], b: list[int]) -> float:
        scores = [
            _cosine(embeddings[i], embeddings[j])  # type: ignore[arg-type]
            for i in a
            for j in b
        ]
        return sum(scores) / len(scores) if scores else 0.0

    while len(clusters) > 1:
        best_pair = None
        best_score = -1.0

        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                score = cluster_similarity(clusters[i], clusters[j])
                if score > best_score:
                    best_score = score
                    best_pair = (i, j)

        if best_pair is None or best_score < threshold:
            break

        i, j = best_pair
        clusters[i] = clusters[i] + clusters[j]
        clusters.pop(j)

    # 처음 등장한 순서대로 화자 번호를 매긴다(Speaker 1, 2, ... 순서가 자연스럽도록).
    clusters.sort(key=lambda group: min(group))

    labels: list[int | None] = [None] * len(embeddings)
    for cluster_index, group in enumerate(clusters):
        for segment_index in group:
            labels[segment_index] = cluster_index

    logger.info(
        "[DIARIZATION] 화자 클러스터링 완료 구간=%s 화자=%s threshold=%.2f",
        len(valid_indexes),
        len(clusters),
        threshold,
    )

    return labels
