from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.validation import LongTextStr, OptionalShortTextStr


class SttResultCreate(BaseModel):
    meeting_id: int
    language: OptionalShortTextStr | None = None
    raw_text: LongTextStr


class SttResultUpdate(BaseModel):
    language: OptionalShortTextStr | None = None
    raw_text: LongTextStr | None = None
    status: str | None = None


class SttResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    meeting_id: int
    language: str | None = None
    raw_text: str
    status: str
    created_at: datetime


class SttPipelineResult(BaseModel):
    stt_result_id: int
    utterance_count: int
