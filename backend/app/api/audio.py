import hashlib
import hmac
import time
from uuid import uuid4
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.api.dependencies import CurrentUser, ensure_workspace_member_action_access, get_current_user
from app.core.config import settings
from app.db.database import get_db
from app.schemas.response import ApiResponse
from app.core.logger import get_logger
from app.services import audio_pipeline, diarization_engine, stt_engine
from app.services.pubsub_service import get_redis_client
from app.utils.audit import log_audit_action

logger = get_logger(__name__)

# ffmpeg가 읽을 수 있는 회의 녹음 포맷
ALLOWED_AUDIO_SUFFIXES = {".wav", ".mp3", ".m4a", ".mp4", ".webm", ".ogg", ".flac", ".aac"}

router = APIRouter(prefix="/workspaces/{workspace_id}/meetings/{meeting_id}/audio")


def _meeting_or_404(db: Session, workspace_id: int, meeting_id: int) -> models.Meeting:
    meeting = db.get(models.Meeting, meeting_id)
    if meeting is None or meeting.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


def _signature(workspace_id: int, meeting_id: int, expires: int) -> str:
    message = f"audio:{workspace_id}:{meeting_id}:{expires}".encode()
    return hmac.new(settings.AUDIO_SIGNING_SECRET.encode(), message, hashlib.sha256).hexdigest()


@router.get("/download-link", response_model=ApiResponse[dict])
def issue_download_link(
    workspace_id: int,
    meeting_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    meeting = _meeting_or_404(db, workspace_id, meeting_id)
    ensure_workspace_member_action_access(db, meeting.workspace, current_user)
    if not settings.AUDIO_SIGNING_SECRET:
        raise HTTPException(status_code=503, detail="Audio signing is not configured")
    if not meeting.audio_storage_path:
        raise HTTPException(status_code=404, detail="Meeting audio is not available")
    expires = int(time.time()) + settings.AUDIO_SIGNED_URL_TTL_SECONDS
    signature = _signature(workspace_id, meeting_id, expires)
    url = f"/workspaces/{workspace_id}/meetings/{meeting_id}/audio/download?expires={expires}&signature={signature}"
    log_audit_action(background_tasks, actor=current_user.user_id, action="AUDIO_SIGNED_URL_GENERATE", resource_type="AUDIO_FILE", resource_id=meeting_id, workspace_id=workspace_id)
    return {"status": "success", "data": {"signed_url": url, "expires_at": expires}}


@router.get("/download")
def download_audio(
    workspace_id: int,
    meeting_id: int,
    expires: int = Query(...),
    signature: str = Query(...),
    db: Session = Depends(get_db),
):
    if not settings.AUDIO_SIGNING_SECRET or expires < int(time.time()):
        raise HTTPException(status_code=403, detail="Audio link has expired")
    if not hmac.compare_digest(signature, _signature(workspace_id, meeting_id, expires)):
        raise HTTPException(status_code=403, detail="Invalid audio link")
    # A signed link is deliberately single-use. Redis makes this atomic across workers.
    ttl = expires - int(time.time())
    if ttl <= 0:
        raise HTTPException(status_code=403, detail="Audio link has expired")
    try:
        consumed = get_redis_client().set(
            f"audio-download-used:{signature}", "1", nx=True, ex=ttl
        )
    except Exception:
        # Fail closed: never downgrade a one-time link to a reusable link.
        raise HTTPException(status_code=503, detail="Audio download validation is unavailable")
    if not consumed:
        raise HTTPException(status_code=403, detail="Audio link has already been used")
    meeting = _meeting_or_404(db, workspace_id, meeting_id)
    if not meeting.audio_storage_path:
        raise HTTPException(status_code=404, detail="Meeting audio is not available")
    # 데스크톱 설치본은 MEETING_AI_DATA_DIR 아래에 오디오를 저장한다.
    # 업로드 시 사용한 동일한 루트를 기준으로 검사해야 signed URL이
    # 패키징 앱의 사용자 데이터 폴더에서도 정상적으로 파일을 찾는다.
    root = settings.audio_dir.resolve()
    path = Path(meeting.audio_storage_path).resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Meeting audio is not available")
    return FileResponse(
        path,
        filename=meeting.audio_original_filename or path.name,
        headers={"Cache-Control": "private, no-store"},
    )


@router.post("/transcribe", response_model=ApiResponse[dict], status_code=201)
async def transcribe_meeting_audio(
    workspace_id: int,
    meeting_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str | None = Query(default=None, description="ko / en / auto. 미지정 시 서버 기본값"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """회의 녹음을 업로드해 전사 + 화자 분리 + 안건/재논의 판단까지 수행한다.

    음성은 서버 로컬에서만 처리되며 외부로 전송되지 않는다.
    """
    meeting = _meeting_or_404(db, workspace_id, meeting_id)
    ensure_workspace_member_action_access(db, meeting.workspace, current_user)

    if not stt_engine.is_available():
        raise HTTPException(
            status_code=503,
            detail="STT 엔진을 사용할 수 없습니다. 서버 설정을 확인하세요.",
        )

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_AUDIO_SUFFIXES:
        raise HTTPException(
            status_code=422,
            detail=f"지원하지 않는 오디오 형식입니다: {suffix or 'unknown'}",
        )

    max_audio_bytes = max(settings.STT_MAX_UPLOAD_MB, 1) * 1024 * 1024
    content = await file.read(max_audio_bytes + 1)
    if not content:
        raise HTTPException(status_code=400, detail="빈 오디오 파일은 처리할 수 없습니다.")
    if len(content) > max_audio_bytes:
        size_mb = len(content) / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"오디오 파일이 너무 큽니다({size_mb:.1f}MB). 최대 {settings.STT_MAX_UPLOAD_MB}MB",
        )
    size_mb = len(content) / (1024 * 1024)

    audio_dir = settings.audio_dir / str(meeting_id)
    audio_dir.mkdir(parents=True, exist_ok=True)
    # 같은 초에 여러 회의가 업로드되어도 파일이 덮어써지지 않도록 난수 접미사를 붙인다.
    audio_path = audio_dir / f"{int(time.time())}-{uuid4().hex}{suffix}"
    audio_path.write_bytes(content)

    logger.info(
        "[AUDIO] 전사 요청 workspace_id=%s meeting_id=%s size=%.1fMB",
        workspace_id,
        meeting_id,
        size_mb,
    )

    try:
        result = audio_pipeline.process_meeting_audio(
            db, meeting, audio_path, language
        )
        # 전사 성공 후에도 원본 녹음을 회의에 연결해 signed download API가
        # 실제 파일을 제공할 수 있도록 한다. 경로는 settings.audio_dir 아래만
        # 생성되므로 다운로드 엔드포인트의 path traversal 검사와 일치한다.
        meeting.audio_storage_path = str(audio_path)
        meeting.audio_original_filename = Path(file.filename or audio_path.name).name[:255]
        db.commit()
        db.refresh(meeting)
    except audio_pipeline.AudioPipelineError as exc:
        logger.error("[AUDIO] 전사 실패 meeting_id=%s reason=%s", meeting_id, exc)
        audio_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        db.rollback()
        logger.exception("[AUDIO] 원본 녹음 메타데이터 저장 실패 meeting_id=%s", meeting_id)
        audio_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="오디오 결과 저장에 실패했습니다.") from exc

    log_audit_action(
        background_tasks,
        actor=current_user.user_id,
        action="AUDIO_TRANSCRIBE",
        resource_type="MEETING",
        resource_id=meeting_id,
        workspace_id=workspace_id,
    )

    return {
        "status": "success",
        "data": {
            "stt_result_id": result["stt_result_id"],
            "utterance_count": result["utterance_count"],
            "speakers": result["speakers"],
            "language": result["language"],
            "topic_event_count": len(result["topic_events"]),
        },
    }


@router.get("/engine-status", response_model=ApiResponse[dict])
def get_engine_status(
    workspace_id: int,
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """STT / 화자 분리 엔진 사용 가능 여부를 알려준다(클라이언트 UI 분기용)."""
    meeting = _meeting_or_404(db, workspace_id, meeting_id)
    ensure_workspace_member_action_access(db, meeting.workspace, current_user)

    return {
        "status": "success",
        "data": {
            "stt_available": stt_engine.is_available(),
            "stt_model": settings.STT_MODEL,
            "diarization_available": diarization_engine.is_available(),
            "max_upload_mb": settings.STT_MAX_UPLOAD_MB,
            "allowed_formats": sorted(ALLOWED_AUDIO_SUFFIXES),
        },
    }
