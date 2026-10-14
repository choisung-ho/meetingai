from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.schemas.validation import OptionalShortTextStr, SafeMessageStr


class SttChunkCreate(BaseModel):
    chunk_id: str = Field(min_length=1, max_length=100)
    text: SafeMessageStr
    stt_result_id: int | None = None
    sequence: int | None = Field(default=None, ge=1)
    speaker_label: OptionalShortTextStr | None = None
    speaker_embedding: list[float] | None = Field(default=None, max_length=2048)
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    language: OptionalShortTextStr | None = None
    is_final: bool = True
    captured_at: datetime | None = None

    @model_validator(mode="after")
    def validate_timestamps(self):
        if self.start_ms is not None and self.end_ms is not None and self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        return self


class RealtimeChunkResult(BaseModel):
    chunk_id: str
    stt_result_id: int | None = None
    utterance_id: int | None = None
    sequence: int | None = None
    # 화자 클러스터링으로 확정된 canonical 라벨 (Speaker 1 / Speaker 2 / Unknown).
    # 실시간 서버가 이 값을 그대로 TRANSCRIPT 이벤트에 실어 보낸다.
    speaker_label: str | None = None
    buffered_count: int
    analysis_status: str
    analysis: dict[str, Any] | None = None


class AnalysisResultCreate(BaseModel):
    meeting_id: int
    stt_result_id: int
    utterance_id: int
    chunk_id: str = Field(min_length=1, max_length=100)
    result: dict[str, Any]


class RealtimeAnalysisRequest(BaseModel):
    meeting_id: int
    stt_result_id: int
    chunk_id: str
    current_utterance: dict[str, Any]
    context_window: list[dict[str, Any]]
    speaker_preprocessing: dict[str, Any]
