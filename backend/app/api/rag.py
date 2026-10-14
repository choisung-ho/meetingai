from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.api.dependencies import CurrentUser, ensure_workspace_access, get_current_user
from app.core.logger import get_logger
from app.db.database import get_db
from app.schemas.rag import RagSearchRequest, RagSearchResponse
from app.schemas.response import ApiResponse
from app.services import rag_service
from app.utils.audit import log_audit_action

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


@router.post("/search", response_model=ApiResponse[RagSearchResponse])
def search(
    request: RagSearchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = db.get(models.Workspace, request.workspace_id)
    if workspace is None:
        logger.warning("[RAG] [SEARCH] workspace not found workspace_id=%s", request.workspace_id)
        raise HTTPException(status_code=404, detail="Workspace not found")
    ensure_workspace_access(db, workspace, current_user)

    results = rag_service.search(
        db,
        workspace_id=request.workspace_id,
        query=request.query,
        top_k=request.top_k,
        target=request.target,
    )
    # 검색어 자체가 회의 내용일 수 있으므로 로그에는 남기지 않는다.
    logger.info(
        "[RAG] [SEARCH] workspace_id=%s target=%s results=%s",
        request.workspace_id,
        request.target,
        len(results),
    )
    log_audit_action(
        background_tasks,
        actor=current_user.user_id,
        action="RAG_SEARCH",
        resource_type="WORKSPACE",
        resource_id=request.workspace_id,
        workspace_id=request.workspace_id,
    )
    return success(
        {
            "query": request.query,
            "target": request.target,
            "results": results,
        }
    )
