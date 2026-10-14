from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Topic(Base):
    __tablename__ = "topics"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PROPOSED', 'DECIDED', 'REVISITED', 'DROPPED')",
            name="ck_topics_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label = Column(Text, nullable=False)
    status = Column(String(50), nullable=False, default="PROPOSED")
    proposed_by = Column(String(100), nullable=True)
    decided_by = Column(String(100), nullable=True)
    embedding = Column(Text, nullable=False)
    source_utterance_id = Column(
        Integer, ForeignKey("utterances.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    events = relationship(
        "TopicEvent", back_populates="topic", cascade="all, delete-orphan"
    )

    @property
    def workspace_id(self) -> int | None:
        return self.meeting.workspace_id if self.meeting else None

    meeting = relationship("Meeting", back_populates="topics")


class TopicEvent(Base):
    __tablename__ = "topic_events"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(
        Integer, ForeignKey("topics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type = Column(String(100), nullable=False)
    speaker_label = Column(String(100), nullable=True)
    utterance_id = Column(
        Integer, ForeignKey("utterances.id", ondelete="SET NULL"), nullable=True
    )
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    topic = relationship("Topic", back_populates="events")
