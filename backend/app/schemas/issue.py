from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_serializer, field_validator
from app.core.timezone import to_kst
from app.schemas.validation import (
    IssuePriority,
    IssueStatus,
    OptionalShortTextStr,
    SafeDescriptionStr,
    SafeTitleStr,
)


class IssueBase(BaseModel):
    title: SafeTitleStr
    description: SafeDescriptionStr | None = None
    meeting_id: int | None = None
    status: IssueStatus = "OPEN"
    priority: IssuePriority = "MEDIUM"
    due_date: datetime | None = None
    assignee_id: int | None = None

    @field_validator("status", "priority", mode="before")
    @classmethod
    def normalize_upper_fields(cls, value: str) -> str:
        return value.strip().upper()


class IssueCreate(IssueBase):
    pass


class IssueUpdate(BaseModel):
    title: SafeTitleStr | None = None
    description: SafeDescriptionStr | None = None
    priority: IssuePriority | None = None
    due_date: datetime | None = None
    assignee_id: int | None = None
    meeting_id: int | None = None

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None


class IssueStateUpdate(BaseModel):
    to_state: IssueStatus
    meeting_id: int | None = None
    reason: OptionalShortTextStr | None = None
    evidence: SafeDescriptionStr | None = None

    @field_validator("to_state", mode="before")
    @classmethod
    def normalize_to_state(cls, value: str) -> str:
        return value.strip().upper()


class IssueResponse(IssueBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspaceId: int | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None

    @field_serializer("created_at", "updated_at", "due_date")
    def serialize_datetime(self, dt: datetime | None):
        if dt is None:
            return None

        return to_kst(dt).isoformat()


class IssueStateResponse(BaseModel):
    issue_id: int
    from_state: str
    to_state: str
    event_type: str
    changed_at: datetime

    @field_serializer("changed_at")
    def serialize_datetime(self, dt: datetime | None):
        if dt is None:
            return None

        return to_kst(dt).isoformat()
