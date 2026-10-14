from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, Text
from sqlalchemy.sql import func

from app.db.database import Base


class AIAnalysis(Base):
    """One privacy-scoped final AI analysis per meeting."""

    __tablename__ = "ai_analyses"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    summary_text = Column(Text, nullable=False, default="")
    action_items = Column(JSON, nullable=False, default=list)
    rediscussion_report = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
