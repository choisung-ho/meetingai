"""Text embedding for RAG similarity search and rediscussion detection.

EMBEDDING_PROVIDER로 방식을 고른다.

- "sentence-transformers" (기본): multilingual-e5-small 로컬 모델.
  한국어 의미 유사도를 실제로 판단하므로 재논의 탐지 품질이 높다.
  회의 내용이 외부로 나가지 않는다.
- "hash": 외부 의존성 없이 동작하는 결정적 feature hashing.
  모델을 못 쓰는 환경에서의 폴백이며, 의미가 아니라 표면 형태만 본다.

두 provider는 벡터 차원이 다르므로(384 vs 256) 전환 시
저장된 임베딩을 다시 만들어야 한다.
"""

import hashlib
import math
import re
import threading

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_st_model = None
_st_lock = threading.Lock()
_st_failed = False

_TOKEN_PATTERN = re.compile(r"[0-9a-zA-Z가-힣]+")


def _tokenize(text: str) -> list[str]:
    tokens = _TOKEN_PATTERN.findall(text.lower())
    features = list(tokens)
    # character bigrams make Korean particles/conjugation variants overlap
    for token in tokens:
        features.extend(token[i : i + 2] for i in range(len(token) - 1))
    return features


def _hash_embed(text: str, dim: int) -> list[float]:
    vector = [0.0] * dim
    for feature in _tokenize(text):
        digest = hashlib.md5(feature.encode("utf-8")).digest()
        bucket = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[bucket] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [value / norm for value in vector]


def _load_sentence_transformer():
    """로컬 문장 임베딩 모델을 지연 로드한다(로드에 수 초 걸린다)."""
    global _st_model, _st_failed

    if _st_model is not None or _st_failed:
        return _st_model

    with _st_lock:
        if _st_model is not None or _st_failed:
            return _st_model

        try:
            from sentence_transformers import SentenceTransformer

            logger.info(
                "[EMBEDDING] 문장 임베딩 모델 로딩 시작 model=%s",
                settings.EMBEDDING_MODEL,
            )
            _st_model = SentenceTransformer(settings.EMBEDDING_MODEL)
            logger.info(
                "[EMBEDDING] 문장 임베딩 모델 로딩 완료 dim=%s",
                _st_model.get_sentence_embedding_dimension(),
            )
        except Exception as exc:
            _st_failed = True
            logger.warning(
                "[EMBEDDING] 문장 임베딩 모델을 쓸 수 없어 hash로 폴백합니다: %s", exc
            )

    return _st_model


def active_provider() -> str:
    """실제로 사용 중인 provider 이름을 돌려준다(폴백 반영)."""
    if settings.EMBEDDING_PROVIDER == "hash":
        return "hash"

    return "sentence-transformers" if _load_sentence_transformer() else "hash"


def embedding_dimension() -> int:
    """현재 provider의 벡터 차원."""
    model = _load_sentence_transformer() if settings.EMBEDDING_PROVIDER != "hash" else None

    if model is not None:
        return model.get_sentence_embedding_dimension()

    # sentence-transformers가 로드되지 않아 hash 폴백을 쓰더라도
    # pgvector 컬럼에 선언된 모델 차원과 반드시 일치해야 한다.
    # 명시적으로 EMBEDDING_PROVIDER=hash인 경우에만 EMBEDDING_DIM을
    # vector_dimension이 그대로 반환한다.
    return settings.vector_dimension


def embed_text(text: str) -> list[float]:
    if settings.EMBEDDING_PROVIDER != "hash":
        model = _load_sentence_transformer()

        if model is not None:
            # e5 계열은 "query: " 접두사를 붙였을 때 성능이 가장 좋다.
            encoded = model.encode(
                f"query: {text or ''}",
                normalize_embeddings=True,
            )
            return [float(value) for value in encoded]

    # sentence-transformers 모델을 사용할 때 로드 실패로 hash fallback이
    # 선택되어도 pgvector 컬럼 차원(예: e5-small=384)과 일치해야 한다.
    # EMBEDDING_DIM(기본 256)은 hash provider를 명시적으로 선택한 경우에만
    # 사용한다.
    return _hash_embed(text or "", settings.vector_dimension)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)
