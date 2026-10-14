from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.validation import OptionalShortTextStr, SafeMessageStr


class UtteranceBase(BaseModel):
    stt_result_id: int
    sequence: int = Field(ge=1)
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    speaker_label: OptionalShortTextStr | None = None
    text: SafeMessageStr


class UtteranceCreate(UtteranceBase):
    pass


class UtteranceUpdate(BaseModel):
    stt_result_id: int | None = None
    sequence: int | None = Field(default=None, ge=1)
    start_ms: int | None = Field(default=None, ge=0)
    end_ms: int | None = Field(default=None, ge=0)
    speaker_label: OptionalShortTextStr | None = None
    text: SafeMessageStr | None = None


class Utterance(UtteranceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
