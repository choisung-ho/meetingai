import os
import secrets

from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_VERSION: str = os.getenv("APP_VERSION", "0.4.0")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    ALERT_CREATED_CHANNEL: str = os.getenv("ALERT_CREATED_CHANNEL", "alert.created")
    MEETING_UPDATED_CHANNEL: str = os.getenv("MEETING_UPDATED_CHANNEL", "meeting.updated")
    ANALYSIS_SERVER_URL: str = os.getenv("ANALYSIS_SERVER_URL", "").rstrip("/")
    ANALYSIS_TIMEOUT_SECONDS: float = float(os.getenv("ANALYSIS_TIMEOUT_SECONDS", 3))
    ANALYSIS_CALLBACK_SECRET: str = os.getenv("ANALYSIS_CALLBACK_SECRET", "")
    AI_REANALYSIS_URL: str = os.getenv("AI_REANALYSIS_URL", "").rstrip("/")
    AI_RESULT_CALLBACK_SECRET: str = os.getenv("AI_RESULT_CALLBACK_SECRET", "")
    AUDIO_SIGNING_SECRET: str = os.getenv("AUDIO_SIGNING_SECRET", "")
    AUDIO_SIGNED_URL_TTL_SECONDS: int = int(os.getenv("AUDIO_SIGNED_URL_TTL_SECONDS", 300))
    # 업로드 파일 저장 위치.
    #
    # 데스크톱 설치본에서는 Electron이 MEETING_AI_DATA_DIR을 사용자 데이터 폴더로 지정한다.
    # 앱 번들 안에 파일을 쓰면 코드 서명이 깨져 앱이 실행되지 않고,
    # 재설치 시 사용자 파일이 함께 지워지기 때문이다.
    DATA_DIR: str = os.getenv("MEETING_AI_DATA_DIR", "")
    AUDIO_STORAGE_ROOT: str = os.getenv("AUDIO_STORAGE_ROOT", "uploads/audio")
    DOCUMENT_MAX_UPLOAD_MB: int = int(os.getenv("DOCUMENT_MAX_UPLOAD_MB", 50))

    @property
    def upload_dir(self) -> "Path":
        from pathlib import Path

        base = Path(self.DATA_DIR) if self.DATA_DIR else Path("uploads")
        return base / "uploads" if self.DATA_DIR else base

    @property
    def audio_dir(self) -> "Path":
        from pathlib import Path

        if self.DATA_DIR:
            return Path(self.DATA_DIR) / "uploads" / "audio"

        return Path(self.AUDIO_STORAGE_ROOT)
    REALTIME_CONTEXT_SIZE: int = int(os.getenv("REALTIME_CONTEXT_SIZE", 20))
    REALTIME_CONTEXT_MAX_CHARS: int = int(os.getenv("REALTIME_CONTEXT_MAX_CHARS", 8000))
    REALTIME_EVENT_CHANNEL: str = os.getenv("REALTIME_EVENT_CHANNEL", "realtime.events")
    REALTIME_EVENT_STREAM: str = os.getenv("REALTIME_EVENT_STREAM", "realtime.events.stream")
    REALTIME_STREAM_MAXLEN: int = int(os.getenv("REALTIME_STREAM_MAXLEN", 10000))
    ACCESS_TOKEN_EXPIRE_MINUTES: float = float(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 15)
    )
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", 30))
    ENABLE_WORKSPACE_RLS: bool = os.getenv("ENABLE_WORKSPACE_RLS", "false").lower() == "true"
    # 로컬 LLM (Ollama). 회의 내용은 외부로 나가지 않는다.
    LLM_ENABLED: bool = os.getenv("LLM_ENABLED", "true").lower() == "true"
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "qwen2.5:7b")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", 0.2))
    LLM_MAX_TOKENS: int = int(os.getenv("LLM_MAX_TOKENS", 1200))
    LLM_TIMEOUT_SECONDS: float = float(os.getenv("LLM_TIMEOUT_SECONDS", 180))

    # 로컬 STT (faster-whisper)
    STT_ENABLED: bool = os.getenv("STT_ENABLED", "true").lower() == "true"
    STT_MODEL: str = os.getenv("STT_MODEL", "base")
    STT_DEVICE: str = os.getenv("STT_DEVICE", "cpu")
    STT_COMPUTE_TYPE: str = os.getenv("STT_COMPUTE_TYPE", "int8")
    STT_LANGUAGE: str = os.getenv("STT_LANGUAGE", "ko")
    STT_MAX_UPLOAD_MB: int = int(os.getenv("STT_MAX_UPLOAD_MB", 200))
    # faster-whisper 품질/안정성 옵션. 회의 도메인 prompt는 선택값이며
    # 비워 두면 모델의 기본 동작을 사용한다.
    STT_TEMPERATURE: float = float(os.getenv("STT_TEMPERATURE", "0.0"))
    STT_INITIAL_PROMPT: str = os.getenv(
        "STT_INITIAL_PROMPT",
        "회의 안건, 결정사항, 액션 아이템을 정확히 전사합니다.",
    )
    STT_CONDITION_ON_PREVIOUS_TEXT: bool = os.getenv(
        "STT_CONDITION_ON_PREVIOUS_TEXT", "true"
    ).lower() == "true"
    STT_VAD_FILTER: bool = os.getenv("STT_VAD_FILTER", "true").lower() == "true"
    STT_VAD_MIN_SILENCE_MS: int = int(os.getenv("STT_VAD_MIN_SILENCE_MS", 500))
    STT_REMOVE_FILLERS: bool = os.getenv("STT_REMOVE_FILLERS", "true").lower() == "true"

    # 화자 분리 (speechbrain ECAPA)
    DIARIZATION_ENABLED: bool = os.getenv("DIARIZATION_ENABLED", "true").lower() == "true"
    DIARIZATION_MODEL: str = os.getenv(
        "DIARIZATION_MODEL", "speechbrain/spkrec-ecapa-voxceleb"
    )
    # 녹음 파일 전체를 한 번에 클러스터링할 때 두 구간을 같은 화자로 볼 최소 유사도.
    # 실제 사람 음성 기준값이며, 화자가 과도하게 쪼개지면 낮추고 뭉치면 높인다.
    DIARIZATION_CLUSTER_THRESHOLD: float = float(
        os.getenv("DIARIZATION_CLUSTER_THRESHOLD", 0.85)
    )

    # sentence-transformers(기본) | hash(외부 의존성 없는 폴백)
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "sentence-transformers")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    # hash provider 전용 차원. sentence-transformers는 모델 차원(384)을 따른다.
    EMBEDDING_DIM: int = int(os.getenv("EMBEDDING_DIM", 256))
    RAG_CHUNK_SIZE: int = int(os.getenv("RAG_CHUNK_SIZE", 800))
    RAG_CHUNK_OVERLAP: int = int(os.getenv("RAG_CHUNK_OVERLAP", 100))
    RAG_SEARCH_TOP_K: int = int(os.getenv("RAG_SEARCH_TOP_K", 5))
    # multilingual-e5-small 실측 보정값.
    #   유사 발화 0.908~0.954 / 무관 발화 0.785~0.861 / 약한 관련 0.888
    # hash provider로 되돌릴 때는 0.4로 낮춰야 한다.
    REDISCUSSION_SIMILARITY_THRESHOLD: float = float(
        os.getenv("REDISCUSSION_SIMILARITY_THRESHOLD", 0.90)
    )
    SPEAKER_SIMILARITY_THRESHOLD: float = float(
        os.getenv("SPEAKER_SIMILARITY_THRESHOLD", 0.75)
    )
    FRONTEND_ORIGINS: list[str] = [
        origin.strip()
        for origin in os.getenv(
            "FRONTEND_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ]

    # 알려진 모델의 벡터 차원. 모델을 로드하지 않고 pgvector 컬럼을 만들기 위해 사용한다.
    _KNOWN_EMBEDDING_DIMS = {
        "intfloat/multilingual-e5-small": 384,
        "intfloat/multilingual-e5-base": 768,
        "sentence-transformers/all-MiniLM-L6-v2": 384,
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2": 384,
    }

    @property
    def vector_dimension(self) -> int:
        """저장될 임베딩의 차원. pgvector 컬럼 정의에 사용한다."""
        if self.EMBEDDING_PROVIDER == "hash":
            return self.EMBEDDING_DIM

        return self._KNOWN_EMBEDDING_DIMS.get(self.EMBEDDING_MODEL, self.EMBEDDING_DIM)

    def __init__(self):
        weak_secret_keys = {
            "",
            "change-this-secret-key",
            "dev-secret-key-change-before-production",
            "replace-with-a-long-random-secret",
            "시크릿키",
        }
        if self.SECRET_KEY in weak_secret_keys or len(self.SECRET_KEY) < 32:
            example = secrets.token_urlsafe(48)
            raise RuntimeError(
                "SECRET_KEY is missing or too weak. "
                f"Set a strong SECRET_KEY in .env, for example: {example}"
            )


settings = Settings()
