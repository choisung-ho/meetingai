from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.validation import SafeMessageStr


class DocumentProcessResult(BaseModel):
    document_id: int
    status: str
    chunk_count: int


class DocumentChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_id: int
    chunk_index: int
    text: str
    created_at: datetime


class RagSearchRequest(BaseModel):
    workspace_id: int
    query: SafeMessageStr
    top_k: int | None = Field(default=None, ge=1, le=50)
    target: Literal["documents", "utterances", "topics", "all"] = "documents"


class RagSearchResponse(BaseModel):
    query: str
    target: str
    results: list[dict[str, Any]]


class TopicEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    topic_id: int
    event_type: str
    speaker_label: str | None = None
    utterance_id: int | None = None
    detail: str | None = None
    created_at: datetime


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    workspace_id: int | None = None
    label: str
    status: str
    proposed_by: str | None = None
    decided_by: str | None = None
    source_utterance_id: int | None = None
    created_at: datetime
    updated_at: datetime


class TopicStateUpdate(BaseModel):
    status: Literal["PROPOSED", "DECIDED", "REVISITED", "DROPPED"]


class SttTranscriptResponse(BaseModel):
    stt_result_id: int
    meeting_id: int
    workspace_id: int
    line_count: int
    lines: list[str]
    text: str
