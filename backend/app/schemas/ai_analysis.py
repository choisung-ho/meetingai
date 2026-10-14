from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.validation import LongTextStr


class AIAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    meeting_id: int
    summary_text: str
    action_items: list[dict]
    rediscussion_report: list[dict]
    created_at: datetime
    updated_at: datetime


class AIAnalysisCallback(BaseModel):
    summary_text: LongTextStr
    action_items: list[dict] = Field(default_factory=list)
    rediscussion_report: list[dict] = Field(default_factory=list)
