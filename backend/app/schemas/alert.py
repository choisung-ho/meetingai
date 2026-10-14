from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.validation import AlertLevel, AlertStatus, SafeMessageStr


class AlertBase(BaseModel):
    meeting_id: int
    message: SafeMessageStr
    level: AlertLevel = "info"
    status: AlertStatus = "PENDING"
    issue_id: int | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("level", mode="before")
    @classmethod
    def normalize_level(cls, value: str) -> str:
        return value.strip().lower()


class AlertCreate(AlertBase):
    pass


class AlertUpdate(BaseModel):
    meeting_id: int | None = None
    message: SafeMessageStr | None = None
    level: AlertLevel | None = None
    status: AlertStatus | None = None
    issue_id: int | None = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None

    @field_validator("level", mode="before")
    @classmethod
    def normalize_level(cls, value: str | None) -> str | None:
        return value.strip().lower() if value is not None else None


class Alert(AlertBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    created_at: datetime
