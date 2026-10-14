from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base


class Issue(Base):
    __tablename__ = "issues"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')",
            name="ck_issues_status",
        ),
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH')",
            name="ck_issues_priority",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    status = Column(String(50), nullable=False, default="OPEN")

    # Decision management fields
    priority = Column(String(20), nullable=False, default="MEDIUM") # 우선순위: LOW, MEDIUM, HIGH
    due_date = Column(DateTime(timezone=True), nullable=True)
    assignee_id = Column(Integer, ForeignKey("auth.id", ondelete="SET NULL"), nullable=True) # 담당자 ID

    # Soft delete
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    meeting = relationship("Meeting", back_populates="issues")
    alerts = relationship("Alert", back_populates="issue", cascade="all, delete-orphan")
    events = relationship("IssueEvent", back_populates="issue", cascade="all, delete-orphan")

    @property
    def workspaceId(self):
        if self.meeting is None:
            return None
        return self.meeting.workspace_id
