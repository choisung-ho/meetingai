from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.schemas.validation import (
    NormalizedEmailStr,
    SafeNameStr,
    SafeTokenStr,
    WorkspaceInviteRole,
    WorkspaceMemberRole,
)


class WorkspaceCreate(BaseModel):
    name: SafeNameStr


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_user_id: int | None = None
    my_role: str | None = None
    canInviteMember: bool = False
    created_at: datetime


class WorkspaceInviteCreate(BaseModel):
    email: NormalizedEmailStr
    role: WorkspaceInviteRole = "MEMBER"

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return value.strip().upper()


class WorkspaceMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    user_id: int
    role: str
    created_at: datetime


class WorkspaceMemberListItem(BaseModel):
    id: int
    workspace_id: int
    user_id: int
    name: str
    email: str
    role: str
    created_at: datetime


class WorkspaceMemberRoleUpdate(BaseModel):
    role: WorkspaceMemberRole

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return value.strip().upper()


class WorkspaceInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    invited_email: str
    invited_user_id: int
    invited_by_user_id: int
    role: str
    token: str
    status: str
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None = None


class WorkspaceInvitationListItem(BaseModel):
    id: int
    workspace_id: int
    workspace_name: str
    invited_email: str
    invited_by_user_id: int
    invited_by_user_name: str
    invited_by_user_email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime


class WorkspaceInvitationAdminListItem(BaseModel):
    id: int
    workspace_id: int
    invited_email: str
    invited_user_id: int
    invited_by_user_id: int
    role: str
    status: str
    expires_at: datetime
    created_at: datetime
    accepted_at: datetime | None = None


class WorkspaceInvitationAcceptByTokenRequest(BaseModel):
    token: SafeTokenStr


class WorkspaceInvitationAcceptResponse(BaseModel):
    invitation_id: int
    workspace_id: int
    user_id: int
    role: str
    status: str


class WorkspaceInvitationRejectResponse(BaseModel):
    invitation_id: int
    status: str


Workspace = WorkspaceResponse
