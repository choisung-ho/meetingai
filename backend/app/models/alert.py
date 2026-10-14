from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')",
            name="ck_alerts_status",
        ),
        CheckConstraint(
            "level IN ('info', 'warning', 'error')",
            name="ck_alerts_level",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    message = Column(Text, nullable=False)
    level = Column(String(50), nullable=False, default="info")
    status = Column(String(50), nullable=False, default="PENDING")
    issue_id = Column(Integer, ForeignKey("issues.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    meeting = relationship("Meeting", back_populates="alerts")
    issue = relationship("Issue", back_populates="alerts")

    @property
    def workspace_id(self):
        return self.meeting.workspace_id if self.meeting else None
