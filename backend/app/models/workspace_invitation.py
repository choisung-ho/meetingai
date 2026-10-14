import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class WorkspaceInvitation(Base):
    __tablename__ = "workspace_invitations"
    __table_args__ = (
        CheckConstraint(
            "role IN ('MEMBER', 'ADMIN')",
            name="ck_workspace_invitations_role",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')",
            name="ck_workspace_invitations_status",
        ),
        Index(
            "uq_workspace_invitations_pending_workspace_user",
            "workspace_id",
            "invited_user_id",
            unique=True,
            postgresql_where=text("status = 'PENDING'"),
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_email = Column(String(255), nullable=False, index=True)
    invited_user_id = Column(Integer, ForeignKey("auth.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by_user_id = Column(Integer, ForeignKey("auth.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False, default="MEMBER")
    token = Column(String(255), nullable=False, unique=True, index=True, default=lambda: secrets.token_urlsafe(32))
    status = Column(String(50), nullable=False, default="PENDING", index=True)
    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc) + timedelta(hours=24),
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at = Column(DateTime(timezone=True), nullable=True)

    workspace = relationship("Workspace", back_populates="invitations")
    invited_user = relationship("Auth", foreign_keys=[invited_user_id], back_populates="received_workspace_invitations")
    invited_by_user = relationship("Auth", foreign_keys=[invited_by_user_id])
