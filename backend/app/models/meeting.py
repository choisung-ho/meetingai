from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Meeting(Base):
    __tablename__ = "meetings"
    __table_args__ = (
        CheckConstraint(
            "status IN ('READY', 'ACTIVE', 'ENDED')",
            name="ck_meetings_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="READY")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    # Set by the recording pipeline; never returned in API responses.
    audio_storage_path = Column(Text, nullable=True)
    audio_original_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    workspace = relationship("Workspace", back_populates="meetings")
    issues = relationship("Issue", back_populates="meeting", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="meeting", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="meeting", cascade="all, delete-orphan")
    stt_results = relationship("SttResult", back_populates="meeting", cascade="all, delete-orphan")
    topics = relationship("Topic", back_populates="meeting", cascade="all, delete-orphan")
