from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.sql import func

from app.db.database import Base


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    __table_args__ = (
        UniqueConstraint("meeting_id", "chunk_id", name="uq_analysis_result_meeting_chunk"),
    )

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    stt_result_id = Column(Integer, ForeignKey("stt_results.id", ondelete="CASCADE"), nullable=False)
    utterance_id = Column(Integer, ForeignKey("utterances.id", ondelete="CASCADE"), nullable=False)
    chunk_id = Column(String(100), nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
