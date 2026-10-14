from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Document(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    meeting_id: int | None = None
    original_filename: str
    stored_filename: str
    content_type: str | None
    file_size: int
    storage_path: str
    status: str
    created_at: datetime


DocumentResponse = Document
