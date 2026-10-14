from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class SttResult(Base):
    __tablename__ = "stt_results"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
            name="ck_stt_results_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    language = Column(String(50), nullable=True)
    raw_text = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="PENDING")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    meeting = relationship("Meeting", back_populates="stt_results")
    utterances = relationship("Utterance", back_populates="stt_result", cascade="all, delete-orphan")

    @property
    def workspace_id(self) -> int:
        return self.meeting.workspace_id
