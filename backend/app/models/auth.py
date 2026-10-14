from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Auth(Base):
    __tablename__ = "auth"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    birth_date = Column(Date, nullable=False)
    password_hash = Column(String(512), nullable=False)
    organization_team_name = Column(String(255), nullable=True)
    terms_agreed = Column(Boolean, nullable=False, default=False)
    terms_agreed_at = Column(DateTime(timezone=True), nullable=True)
    terms_version = Column(String(50), nullable=False, default="v1")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    workspace_members = relationship("WorkspaceMember", back_populates="user", cascade="all, delete-orphan")
    received_workspace_invitations = relationship(
        "WorkspaceInvitation",
        foreign_keys="WorkspaceInvitation.invited_user_id",
        back_populates="invited_user",
    )
