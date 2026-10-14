from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.logger import get_logger, mask_sensitive_text
from app.core.config import settings
from app.core.security import decode_access_token
from app.db.database import get_db
from app.models.workspace_member import WorkspaceMember
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

# 권한 체크 수문장

# auto_error=False로 두어야 Authorization 헤더가 없을 때도 이 함수로 흐름이 들어온다.
# (기본값 True면 FastAPI가 403을 반환해 명세의 "인증 실패 = 401"과 어긋난다)
security = HTTPBearer(auto_error=False)
logger = get_logger(__name__)
WORKSPACE_ACCESS_ROLES = {"MEMBER", "ADMIN", "OWNER"}
WORKSPACE_MEMBER_ACTION_ROLES = {"MEMBER", "ADMIN", "OWNER"}
WORKSPACE_ADMIN_ROLES = {"ADMIN", "OWNER"}
WORKSPACE_ROLE_HIERARCHY = {
    "VIEWER": 1,
    "MEMBER": 2,
    "ADMIN": 3,
    "OWNER": 4,
}

class CurrentUser(BaseModel):
    user_id: str
    role: str
    email: str | None = None
    name: str | None = None

    @property
    def user_id_int(self) -> int:
        return int(self.user_id)

def get_workspace_member(db: Session, user_id: int, workspace_id: int) -> WorkspaceMember | None:
    return (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.workspace_id == workspace_id,
        )
        .first()
    )


def set_current_workspace_id(db: Session, workspace_id: int):
    if not settings.ENABLE_WORKSPACE_RLS:
        return
    db.execute(
        text("SELECT set_config('app.current_workspace_id', :workspace_id, true)"),
        {"workspace_id": str(workspace_id)},
    )


def require_workspace_role(required_role: str):
    required_role = required_role.upper()
    required_rank = WORKSPACE_ROLE_HIERARCHY.get(required_role)
    if required_rank is None:
        raise ValueError(f"Unsupported workspace role: {required_role}")

    async def dependency(
        workspace_id: int,
        current_user: CurrentUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> WorkspaceMember:
        member = get_workspace_member(db, current_user.user_id_int, workspace_id)
        if member is None:
            logger.warning(
                "[AUTH] [WORKSPACE_ROLE] membership not found user_id=%s workspace_id=%s required_role=%s",
                mask_sensitive_text(current_user.user_id),
                workspace_id,
                required_role,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="해당 workspace에 접근할 권한이 없습니다.",
            )

        member_rank = WORKSPACE_ROLE_HIERARCHY.get(member.role, 0)
        if member_rank < required_rank:
            logger.warning(
                "[AUTH] [WORKSPACE_ROLE] role denied user_id=%s workspace_id=%s role=%s required_role=%s",
                mask_sensitive_text(current_user.user_id),
                workspace_id,
                member.role,
                required_role,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="해당 workspace에서 필요한 역할 권한이 없습니다.",
            )

        logger.info(
            "[AUTH] [WORKSPACE_ROLE] access granted user_id=%s workspace_id=%s role=%s required_role=%s",
            mask_sensitive_text(current_user.user_id),
            workspace_id,
            member.role,
            required_role,
        )
        set_current_workspace_id(db, workspace_id)
        return member

    return dependency


def ensure_workspace_access(db: Session, workspace, current_user: CurrentUser) -> WorkspaceMember:
    member = get_workspace_member(db, current_user.user_id_int, workspace.id)
    if member is None:
        logger.warning(
            "[AUTH] [ERROR] workspace membership not found user_id=%s workspace_id=%s",
            mask_sensitive_text(current_user.user_id),
            workspace.id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 workspace에 접근할 권한이 없습니다.",
        )
    if member.role not in WORKSPACE_ACCESS_ROLES:
        logger.warning(
            "[AUTH] [ERROR] workspace role denied user_id=%s workspace_id=%s role=%s",
            mask_sensitive_text(current_user.user_id),
            workspace.id,
            member.role,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 workspace에서 필요한 역할 권한이 없습니다.",
        )
    set_current_workspace_id(db, workspace.id)
    return member


def ensure_workspace_member_action_access(db: Session, workspace, current_user: CurrentUser) -> WorkspaceMember:
    member = ensure_workspace_access(db, workspace, current_user)
    if member.role not in WORKSPACE_MEMBER_ACTION_ROLES:
        logger.warning(
            "[AUTH] [ERROR] workspace member action denied user_id=%s workspace_id=%s role=%s",
            mask_sensitive_text(current_user.user_id),
            workspace.id,
            member.role,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 workspace에서 작업을 수행할 권한이 없습니다.",
        )
    return member


def ensure_workspace_admin_access(db: Session, workspace, current_user: CurrentUser) -> WorkspaceMember:
    member = ensure_workspace_access(db, workspace, current_user)
    if member.role not in WORKSPACE_ADMIN_ROLES:
        logger.warning(
            "[AUTH] [ERROR] workspace admin action denied user_id=%s workspace_id=%s role=%s",
            mask_sensitive_text(current_user.user_id),
            workspace.id,
            member.role,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="해당 workspace를 관리할 권한이 없습니다.",
        )
    return member

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser:
    # 헤더 자체가 없거나 Bearer 형식이 아니면 인증 실패(401)로 처리한다.
    if credentials is None or not credentials.credentials:
        logger.warning("[AUTH] [ERROR] missing access token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 정보가 필요합니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    
    if not payload:
        logger.warning("[AUTH] [ERROR] invalid access token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 정보가 유효하지 않습니다."
        )
    
    user_id = payload.get("sub")
    if not user_id:
        logger.warning(
            "[AUTH] [ERROR] permission info missing user_id=%s",
            mask_sensitive_text(str(user_id)),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="사용자 권한 정보가 누락되었습니다."
        )
        
    return CurrentUser(
        user_id=user_id,
        role=payload.get("role", "authenticated"),
        email=payload.get("email"),
        name=payload.get("name"),
    )
