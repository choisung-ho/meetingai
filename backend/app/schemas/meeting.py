from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.validation import MeetingStatus, SafeTitleStr


class MeetingCreate(BaseModel):
    title: SafeTitleStr
    status: MeetingStatus = "READY"

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return value.strip().upper()


class MeetingUpdate(BaseModel):
    title: SafeTitleStr | None = None
    status: MeetingStatus | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None


class MeetingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    title: str
    description: str | None = None
    status: str
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_at: datetime


class MeetingListResponse(BaseModel):
    workspaceId: int
    page: int
    size: int
    meetings: list[MeetingResponse]


Meeting = MeetingResponse
