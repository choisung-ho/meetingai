from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.database import Base


class SpeakerProfile(Base):
    __tablename__ = "speaker_profiles"
    __table_args__ = (
        UniqueConstraint("meeting_id", "canonical_label", name="uq_speaker_profile_label"),
    )

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(
        Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    canonical_label = Column(String(100), nullable=False)
    source_label = Column(String(100), nullable=True)
    # running mean of client-provided speaker embeddings (JSON list), used to
    # cluster later chunks of the same voice onto the same canonical label
    centroid = Column(Text, nullable=True)
    sample_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
