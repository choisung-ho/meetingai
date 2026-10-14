from typing import Annotated, Literal

from pydantic import StringConstraints


SafeTitleStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
]
SafeNameStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
]
SafeDescriptionStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=1000),
]
SafeMessageStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=1000),
]
SafeTokenStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=16, max_length=255),
]
NormalizedEmailStr = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_lower=True,
        min_length=3,
        max_length=255,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    ),
]
PasswordStr = Annotated[
    str,
    StringConstraints(min_length=8, max_length=64),
]
OptionalShortTextStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=255),
]
LongTextStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20000),
]

MeetingStatus = Literal["READY", "ACTIVE", "ENDED"]
IssueStatus = Literal["OPEN", "IN_PROGRESS", "CLOSED"]
IssuePriority = Literal["LOW", "MEDIUM", "HIGH"]
AlertStatus = Literal["PENDING", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"]
AlertLevel = Literal["info", "warning", "error"]
WorkspaceInviteRole = Literal["ADMIN", "MEMBER"]
WorkspaceMemberRole = Literal["OWNER", "ADMIN", "MEMBER", "VIEWER"]
