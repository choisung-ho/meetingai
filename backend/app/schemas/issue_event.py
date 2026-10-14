from datetime import datetime

from pydantic import BaseModel, ConfigDict


class IssueEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    issue_id: int
    meeting_id: int | None = None

    event_type: str

    from_state: str | None = None
    to_state: str

    reason: str | None = None
    evidence: str | None = None

    created_at: datetime