from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, get_current_user
from app.db.database import get_db
from app.schemas.issue import (
    IssueCreate,
    IssueUpdate,
    IssueStateUpdate,
    IssueResponse,
    IssueStateResponse,

)
from app.schemas.response import ApiResponse

from app.services import issue_service
from app.schemas.issue_event import IssueEventResponse
from app.models.issue_event import IssueEvent
from app.core.logger import get_logger

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


@router.get("/", response_model=ApiResponse[list[IssueResponse]])
def get_issues(
    meeting_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [GET_ALL] request received meeting_id=%s", meeting_id)
    return success(issue_service.get_issues(db, meeting_id=meeting_id, current_user=current_user))


@router.get("/{issue_id}", response_model=ApiResponse[IssueResponse])
def get_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [GET_ONE] request received issue_id=%s", issue_id)
    return success(issue_service.get_issue(db, issue_id, current_user=current_user))


@router.post("/", response_model=ApiResponse[IssueResponse], status_code=201)
def create_issue(
    issue: IssueCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [CREATE] route received meeting_id=%s title=%s", issue.meeting_id, issue.title)
    return success(issue_service.create_issue(db, issue, current_user=current_user))


@router.patch("/{issue_id}", response_model=ApiResponse[IssueResponse])
def update_issue(
    issue_id: int,
    issue_update: IssueUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [UPDATE] request received issue_id=%s", issue_id)
    return success(issue_service.update_issue(db, issue_id, issue_update, current_user=current_user))


@router.patch("/{issue_id}/state", response_model=ApiResponse[IssueStateResponse])
def change_issue_state(
    issue_id: int,
    state_update: IssueStateUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [UPDATE] state change request received issue_id=%s", issue_id)
    return success(issue_service.change_issue_state(db, issue_id, state_update, current_user=current_user))


@router.delete("/{issue_id}", response_model=ApiResponse[IssueResponse])
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [DELETE] request received issue_id=%s", issue_id)
    return success(issue_service.delete_issue(db, issue_id, current_user=current_user))


@router.get("/{issue_id}/events", response_model=ApiResponse[list[IssueEventResponse]])
def get_issue_events(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [GET_EVENTS] request received issue_id=%s", issue_id)
    issue_service.get_issue(db, issue_id, current_user=current_user)

    events = (
        db.query(IssueEvent)
        .filter(IssueEvent.issue_id == issue_id)
        .order_by(IssueEvent.created_at.asc())
        .all()
    )
    if not events:
        logger.warning("[ISSUE] [GET_EVENTS] no issue events found issue_id=%s", issue_id)
    logger.info("[ISSUE] [GET_EVENTS] issue events fetched count=%s issue_id=%s", len(events), issue_id)
    return success(events)
