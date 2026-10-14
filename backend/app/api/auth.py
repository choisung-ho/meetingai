from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.logger import get_logger, mask_email
from app.core.limiter import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.db.database import get_db
from app.models.auth import Auth
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.utils.audit import record_audit_log_safely
from app.schemas.auth import (
    AuthMeResponse,
    AuthRegister,
    AuthResponse,
    TokenRefreshRequest,
    TokenRefreshResponse,
    TokenResponse,
    UserLogin,
)
from app.schemas.response import ApiResponse

router = APIRouter()
logger = get_logger(__name__)


def success(data):
    return {"status": "success", "data": data}


def add_workspace_member(
    db: Session,
    workspace_id: int,
    user_id: int,
    role: str = "OWNER",
) -> WorkspaceMember:
    member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=user_id,
        role=role,
    )
    db.add(member)
    db.flush()
    logger.info(
        "[WORKSPACE_MEMBER] [CREATE] member created workspace_id=%s user_id=%s role=%s",
        workspace_id,
        user_id,
        role,
    )
    return member


def create_default_workspace(db: Session, user: Auth) -> Workspace:
    workspace = Workspace(
        name=f"{user.name} Default Workspace",
        owner_user_id=user.id,
    )
    db.add(workspace)
    db.flush()
    add_workspace_member(db, workspace.id, user.id, role="OWNER")
    logger.info("[WORKSPACE] [CREATE] default workspace created id=%s user_id=%s", workspace.id, user.id)
    return workspace


def get_or_create_default_workspace(db: Session, user: Auth) -> Workspace:
    workspace = (
        db.query(Workspace)
        .filter(Workspace.owner_user_id == user.id)
        .order_by(Workspace.id.asc())
        .first()
    )
    if workspace is not None:
        return workspace

    workspace = create_default_workspace(db, user)
    db.commit()
    db.refresh(workspace)
    return workspace


def build_token_payload(user: Auth) -> dict:
    return {
        "sub": str(user.id),
        "role": "authenticated",
        "email": user.email,
        "name": user.name,
    }


def build_token_payload_from_claims(payload: dict) -> dict:
    return {
        "sub": str(payload.get("sub")),
        "role": payload.get("role", "authenticated"),
        "email": payload.get("email"),
        "name": payload.get("name"),
    }


def build_auth_me_response(user: Auth) -> dict:
    return {
        "id": user.id,
        "userId": user.id,
        "name": user.name,
        "userName": user.name,
        "email": user.email,
        "organization_team_name": user.organization_team_name,
    }


@router.post("/auth/register", response_model=ApiResponse[AuthResponse], status_code=201)
def register(request: AuthRegister, db: Session = Depends(get_db)):
    safe_email = mask_email(request.email)
    logger.info("[AUTH] [REGISTER] request received email=%s", safe_email)
    existing_user = db.query(Auth).filter(Auth.email == request.email).first()
    if existing_user is not None:
        logger.warning("[AUTH] [REGISTER] email already exists email=%s", safe_email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 가입된 이메일입니다.",
        )

    user = Auth(
        name=request.name,
        email=request.email,
        birth_date=request.birth_date,
        password_hash=hash_password(request.password),
        organization_team_name=request.organization_team_name,
        terms_agreed=request.terms_agreed,
        terms_agreed_at=datetime.now(timezone.utc),
        terms_version=request.terms_version,
    )

    try:
        db.add(user)
        db.flush()
        create_default_workspace(db, user)
        db.commit()
        db.refresh(user)
        logger.info("[AUTH] [REGISTER] user created id=%s email=%s", user.id, safe_email)
    except Exception as exc:
        db.rollback()
        logger.error("[AUTH] [ERROR] failed to register email=%s reason=%s", safe_email, exc)
        raise

    return success(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(request: Request, body: UserLogin, db: Session = Depends(get_db)):
    identifier = body.email or body.user_id
    login_email = "admin@example.com" if identifier == "admin" else identifier
    safe_identifier = mask_email(identifier)
    logger.info("[AUTH] [LOGIN] request received identifier=%s", safe_identifier)

    user = db.query(Auth).filter(Auth.email == login_email).first()

    if user is not None and verify_password(body.password, user.password_hash):
        default_workspace = get_or_create_default_workspace(db, user)
        user_data = build_token_payload(user)

        access_token = create_access_token(data=user_data)
        refresh_token = create_refresh_token(data=user_data)
        logger.info("[AUTH] [LOGIN] login success user_id=%s email=%s", user.id, mask_email(user.email))
        record_audit_log_safely(
            actor=user.id,
            action="LOGIN",
            resource_type="AUTH",
            resource_id=user.id,
            workspace_id=default_workspace.id,
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "token_type": "bearer",
            "defaultWorkspaceId": default_workspace.id,
            "userId": user.id,
            "name": user.name,
            "userName": user.name,
            "email": user.email,
        }

    logger.warning("[AUTH] [LOGIN] login failed identifier=%s", safe_identifier)
    record_audit_log_safely(
        actor=identifier or "unknown",
        action="LOGIN_FAILED",
        resource_type="AUTH",
        resource_id=identifier or "unknown",
        workspace_id=None,
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="아이디 또는 비밀번호가 일치하지 않습니다.",
    )


@router.post("/auth/refresh", response_model=TokenRefreshResponse)
def refresh_access_token(
    request: TokenRefreshRequest | None = None,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db)
):
    logger.info("[AUTH] [REFRESH] 토큰 재발급 요청 수신")

    payload = None
    is_active_session = False  # 14분 주기 활동 중인 세션인지 여부 판별 플래그
    message = "세션이 연장되었습니다."

    # 활동 중 (Axios 인터셉터가 14분마다 만료 전 Access Token을 들고 온 경우)
    if authorization and authorization.startswith("Bearer "):
        payload = decode_access_token(authorization.removeprefix("Bearer ").strip())
        is_active_session = True
        message = "실시간 세션이 연장되었습니다."

    # 앱 재시작 (Access Token 만료 후 로컬의 Refresh Token을 바디에 실어 온 경우)
    elif request and request.refresh_token:
        payload = decode_refresh_token(request.refresh_token)
        is_active_session = False
        message = "로그인 유지가 확인되어 세션을 복구합니다."

    elif request and request.access_token:
        payload = decode_access_token(request.access_token)
        is_active_session = True
        message = "실시간 세션이 연장되었습니다."

    # 토큰 검증 실패 예외 처리
    if not payload:
        logger.warning("[AUTH] [REFRESH] 유효하지 않은 토큰 접근 차단")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 유효하지 않거나 만료되었습니다.",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="토큰 사용자 정보가 누락되었습니다.")

    try:
        user_id_int = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="토큰 사용자 정보가 올바르지 않습니다.")

    user = db.get(Auth, user_id_int)
    if user is None:
        raise HTTPException(status_code=401, detail="사용자 정보를 찾을 수 없습니다.")

    # 공통 인증 정보 스키마 빌드
    token_claims = build_token_payload(user)

    # 새로운 단기 엑세스 토큰(15분)은 무조건 발급
    access_token = create_access_token(data=token_claims)

    # 활동 중인 세션(is_active_session=True)일 때는 장기 토큰을 굳이 만들지 않고 기존 값 유지 또는 생략
    # 오직 앱을 껐다 켜서 "최초 재접속(is_active_session=False)" 할 때만 30일짜리 장기 토큰을 새로 갱신(Rotation)
    new_refresh_token = None if is_active_session else create_refresh_token(data=token_claims)

    logger.info(
        "[AUTH] [REFRESH] 발급 완료 - 세션연장모드=%s, 유저=%s",
        is_active_session, user_id
    )

    return {
        "success": True,
        "access_token": access_token,
        "accessToken": access_token,
        # 재접속 시에만 새 토큰이 실려 나가고, 평소에는 기존 저장된 값을 그대로 쓰도록 None 또는 생략 처리
        "refresh_token": new_refresh_token,
        "refreshToken": new_refresh_token,
        "token_type": "bearer",
        "message": message,
        "userId": user.id,
        "name": user.name,
        "userName": user.name,
        "email": user.email,
    }


@router.get("/auth/me", response_model=ApiResponse[AuthMeResponse])
def get_me(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증 정보가 필요합니다.")

    payload = decode_access_token(authorization.removeprefix("Bearer ").strip())
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증 정보가 유효하지 않습니다.")

    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰 사용자 정보가 올바르지 않습니다.")

    user = db.get(Auth, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="사용자 정보를 찾을 수 없습니다.")

    return success(build_auth_me_response(user))
