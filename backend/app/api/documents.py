from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db

from app.api.dependencies import WORKSPACE_ACCESS_ROLES, CurrentUser, ensure_workspace_access, get_current_user
from app.core.config import settings
from app.core.logger import get_logger
from app.models.document import Document
from app.models.meeting import Meeting
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember

from app.models.document_chunk import DocumentChunk
from app.schemas.document import (
    DocumentResponse,
)
from app.schemas.rag import DocumentChunkResponse, DocumentProcessResult
from app.schemas.response import ApiResponse
from app.services import rag_service
from app.services.document_parser import DocumentParseError, supported_extensions
from app.services.pubsub_service import publish_realtime_event

router = APIRouter()
logger = get_logger(__name__)

# 앱 번들 안에 쓰지 않도록 설정에서 경로를 받는다(데스크톱 설치본 대응).
UPLOAD_DIR = settings.upload_dir
MAX_DOCUMENT_UPLOAD_BYTES = max(settings.DOCUMENT_MAX_UPLOAD_MB, 1) * 1024 * 1024


def success(data):
    return {"status": "success", "data": data}


def get_document_workspace(db: Session, document: Document):
    if document.workspace is not None:
        return document.workspace
    if document.meeting is not None:
        return document.meeting.workspace
    logger.error("[DOCUMENT] [ERROR] document has no workspace document_id=%s", document.id)
    raise HTTPException(status_code=500, detail="Document workspace is missing")


@router.get("/", response_model=ApiResponse[list[DocumentResponse]])
def get_documents(
    meeting_id: int | None = None,
    workspace_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if meeting_id is None and workspace_id is None:
        logger.error("[DOCUMENT] [ERROR] meeting_id or workspace_id is required for document list")
        raise HTTPException(status_code=400, detail="meeting_id or workspace_id is required")

    if meeting_id is not None:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None:
            logger.warning("[DOCUMENT] [GET_ALL] meeting not found meeting_id=%s", meeting_id)
            raise HTTPException(status_code=404, detail="Meeting not found")
        if workspace_id is not None and meeting.workspace_id != workspace_id:
            logger.error(
                "[DOCUMENT] [ERROR] meeting does not belong to workspace meeting_id=%s workspace_id=%s meeting_workspace_id=%s",
                meeting_id,
                workspace_id,
                meeting.workspace_id,
            )
            raise HTTPException(status_code=400, detail="Meeting does not belong to workspace")
        ensure_workspace_access(db, meeting.workspace, current_user)
        workspace_id = meeting.workspace_id
    else:
        workspace = db.get(Workspace, workspace_id)
        if workspace is None:
            logger.warning("[DOCUMENT] [GET_ALL] workspace not found workspace_id=%s", workspace_id)
            raise HTTPException(status_code=404, detail="Workspace not found")
        ensure_workspace_access(db, workspace, current_user)

    query = (
        db.query(Document)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Document.workspace_id)
        .filter(
            Document.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.user_id_int,
            WorkspaceMember.role.in_(WORKSPACE_ACCESS_ROLES),
        )
    )
    if meeting_id is not None:
        query = query.filter(Document.meeting_id == meeting_id)

    documents = query.order_by(Document.id.desc()).all()
    if not documents:
        logger.warning("[DOCUMENT] [GET_ALL] no documents found meeting_id=%s workspace_id=%s", meeting_id, workspace_id)
    logger.info(
        "[DOCUMENT] [GET_ALL] documents fetched count=%s meeting_id=%s workspace_id=%s",
        len(documents),
        meeting_id,
        workspace_id,
    )
    return success(documents)


@router.get("/{document_id}", response_model=ApiResponse[DocumentResponse])
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    document = db.get(Document, document_id)

    if document is None:
        logger.warning("[DOCUMENT] [GET_ONE] document not found document_id=%s", document_id)
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )
    ensure_workspace_access(db, get_document_workspace(db, document), current_user)

    logger.info("[DOCUMENT] [GET_ONE] document fetched id=%s", document_id)
    return success(document)


@router.post("/upload", response_model=ApiResponse[DocumentResponse], status_code=201)
async def upload_document(
    meeting_id: int | None = None,
    workspace_id: int | None = None,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[DOCUMENT] [UPLOAD] request received meeting_id=%s workspace_id=%s filename=%s",
        meeting_id,
        workspace_id,
        file.filename,
    )

    if meeting_id is None and workspace_id is None:
        logger.error("[DOCUMENT] [ERROR] meeting_id or workspace_id is required for upload")
        raise HTTPException(status_code=400, detail="meeting_id or workspace_id is required")

    if meeting_id is not None:
        meeting = db.get(Meeting, meeting_id)
        if meeting is None:
            logger.warning("[DOCUMENT] [UPLOAD] meeting not found meeting_id=%s", meeting_id)
            raise HTTPException(
                status_code=404,
                detail="Meeting not found",
            )
        if workspace_id is not None and meeting.workspace_id != workspace_id:
            logger.error(
                "[DOCUMENT] [ERROR] upload meeting does not belong to workspace meeting_id=%s workspace_id=%s meeting_workspace_id=%s",
                meeting_id,
                workspace_id,
                meeting.workspace_id,
            )
            raise HTTPException(status_code=400, detail="Meeting does not belong to workspace")
        workspace = meeting.workspace
        workspace_id = meeting.workspace_id
    else:
        workspace = db.get(Workspace, workspace_id)
        if workspace is None:
            logger.warning("[DOCUMENT] [UPLOAD] workspace not found workspace_id=%s", workspace_id)
            raise HTTPException(status_code=404, detail="Workspace not found")

    ensure_workspace_access(db, workspace, current_user)

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    original_filename = (file.filename or "").strip()
    suffix = Path(original_filename).suffix.lower()
    allowed_extensions = supported_extensions()
    if suffix not in allowed_extensions:
        allowed = ", ".join(sorted(allowed_extensions))
        raise HTTPException(
            status_code=415,
            detail=f"지원하지 않는 문서 형식입니다. 지원 형식: {allowed}",
        )

    content = await file.read(MAX_DOCUMENT_UPLOAD_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일은 업로드할 수 없습니다.")
    if len(content) > MAX_DOCUMENT_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"문서 크기는 {settings.DOCUMENT_MAX_UPLOAD_MB}MB 이하만 허용됩니다.",
        )

    stored_filename = f"{uuid4().hex}{suffix}"

    storage_path = UPLOAD_DIR / stored_filename
    storage_path.write_bytes(content)

    document = Document(
        workspace_id=workspace_id,
        meeting_id=meeting_id,
        original_filename=original_filename or stored_filename,
        stored_filename=stored_filename,
        content_type=file.content_type,
        file_size=len(content),
        storage_path=str(storage_path),
    )

    try:
        db.add(document)
        db.commit()
        db.refresh(document)
        logger.info(
            "[DOCUMENT] [UPLOAD] document created id=%s meeting_id=%s workspace_id=%s",
            document.id,
            meeting_id,
            workspace_id,
        )
    except Exception as exc:
        db.rollback()
        storage_path.unlink(missing_ok=True)
        logger.error(
            "[DOCUMENT] [ERROR] failed to upload document meeting_id=%s workspace_id=%s reason=%s",
            meeting_id,
            workspace_id,
            exc,
        )
        raise

    publish_realtime_event(
        {
            "type": "document.created",
            "workspace_id": document.workspace_id,
            "meeting_id": document.meeting_id,
            "document_id": document.id,
            "original_filename": document.original_filename,
            "stored_filename": document.stored_filename,
            "content_type": document.content_type,
            "file_size": document.file_size,
            "status": document.status,
            "created_at": document.created_at.isoformat() if document.created_at else None,
        }
    )
    return success(document)


@router.post("/{document_id}/process", response_model=ApiResponse[DocumentProcessResult])
def process_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        logger.warning("[DOCUMENT] [PROCESS] document not found document_id=%s", document_id)
        raise HTTPException(status_code=404, detail="Document not found")
    ensure_workspace_access(db, get_document_workspace(db, document), current_user)
    if document.status == "PROCESSING":
        raise HTTPException(status_code=409, detail="Document is already being processed")

    try:
        chunk_count = rag_service.process_document(db, document)
    except DocumentParseError as exc:
        logger.error(
            "[DOCUMENT] [PROCESS] parse failed document_id=%s reason=%s", document_id, exc
        )
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    publish_realtime_event(
        {
            "type": "document.processed",
            "workspace_id": document.workspace_id,
            "meeting_id": document.meeting_id,
            "document_id": document.id,
            "status": document.status,
            "chunk_count": chunk_count,
        }
    )
    return success(
        {
            "document_id": document.id,
            "status": document.status,
            "chunk_count": chunk_count,
        }
    )


@router.get("/{document_id}/chunks", response_model=ApiResponse[list[DocumentChunkResponse]])
def get_document_chunks(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    document = db.get(Document, document_id)
    if document is None:
        logger.warning("[DOCUMENT] [CHUNKS] document not found document_id=%s", document_id)
        raise HTTPException(status_code=404, detail="Document not found")
    ensure_workspace_access(db, get_document_workspace(db, document), current_user)
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return success(chunks)


@router.delete("/{document_id}", status_code=204)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    document = db.get(Document, document_id)

    if document is None:
        logger.warning("[DOCUMENT] [DELETE] document not found document_id=%s", document_id)
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )
    ensure_workspace_access(db, get_document_workspace(db, document), current_user)
    event = {
        "type": "document.deleted",
        "workspace_id": document.workspace_id,
        "meeting_id": document.meeting_id,
        "document_id": document.id,
    }

    storage_path = Path(document.storage_path)
    upload_root = settings.upload_dir.resolve()
    try:
        storage_path.resolve().relative_to(upload_root)
    except ValueError:
        # Never follow a path outside the configured upload directory even if
        # a legacy/corrupted database row contains an absolute path.
        logger.error(
            "[DOCUMENT] [DELETE] refusing to remove path outside upload root document_id=%s path=%s",
            document_id,
            document.storage_path,
        )
    else:
        if storage_path.exists():
            storage_path.unlink()

    try:
        db.delete(document)
        db.commit()
        logger.info("[DOCUMENT] [DELETE] document deleted id=%s", document_id)
    except Exception as exc:
        db.rollback()
        logger.error("[DOCUMENT] [ERROR] failed to delete document document_id=%s reason=%s", document_id, exc)
        raise

    publish_realtime_event(event)
    return None
