from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Utterance(Base):
    __tablename__ = "utterances"
    __table_args__ = (
        UniqueConstraint("stt_result_id", "source_chunk_id", name="uq_utterance_stt_chunk"),
        UniqueConstraint("stt_result_id", "sequence", name="uq_utterance_stt_sequence"),
    )

    id = Column(Integer, primary_key=True, index=True)
    stt_result_id = Column(Integer, ForeignKey("stt_results.id", ondelete="CASCADE"), nullable=False)
    sequence = Column(Integer, nullable=False)
    source_chunk_id = Column(String(100), nullable=True)
    start_ms = Column(Integer, nullable=True)
    end_ms = Column(Integer, nullable=True)
    speaker_label = Column(String(100), nullable=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    stt_result = relationship("SttResult", back_populates="utterances")
