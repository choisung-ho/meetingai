from fastapi import BackgroundTasks, APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.api.dependencies import (
    WORKSPACE_ACCESS_ROLES,
    WORKSPACE_ADMIN_ROLES,
    WORKSPACE_ROLE_HIERARCHY,
    CurrentUser,
    ensure_workspace_admin_access,
    ensure_workspace_access,
    ensure_workspace_member_action_access,
    get_workspace_member,
    get_current_user,
    require_workspace_role,
)
from app.core.limiter import get_inviter_rate_limit_key, limiter
from app.core.logger import get_logger, mask_email
from app.core.timezone import now_kst
from app.db.database import get_db
from app.services import issue_service
from app.services.meeting_service import publish_meeting_updated
from app.state import can_transition
from app.utils.audit import record_audit_log_safely


router = APIRouter()
logger = get_logger(__name__)

VALID_MEETING_STATUS = {"READY", "ACTIVE", "ENDED"}
VALID_INVITATION_ROLES = {"MEMBER", "ADMIN"}
VALID_MEMBER_ROLES = {"VIEWER", "MEMBER", "ADMIN", "OWNER"}
INVITATION_EXPIRED_STATUS = "EXPIRED"


def success(data):
    return {"status": "success", "data": data}


def get_workspace_or_404(db: Session, workspace_id: int):
    workspace = db.get(models.Workspace, workspace_id)
    if workspace is None:
        logger.warning("[WORKSPACE] [GET_ONE] workspace not found workspace_id=%s", workspace_id)
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


def get_workspace_with_access(db: Session, workspace_id: int, current_user: CurrentUser):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_access(db, workspace, current_user)
    return workspace


def build_workspace_response(db: Session, workspace, current_user: CurrentUser):
    member = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == workspace.id,
            models.WorkspaceMember.user_id == current_user.user_id_int,
        )
        .first()
    )
    my_role = member.role.upper() if member is not None and member.role is not None else None
    return {
        "id": workspace.id,
        "name": workspace.name,
        "owner_user_id": workspace.owner_user_id,
        "my_role": my_role,
        "canInviteMember": my_role in WORKSPACE_ADMIN_ROLES,
        "created_at": workspace.created_at,
    }


def build_workspace_member_response(member):
    return {
        "id": member.id,
        "workspace_id": member.workspace_id,
        "user_id": member.user_id,
        "name": member.user.name,
        "email": member.user.email,
        "role": member.role,
        "created_at": member.created_at,
    }


def role_rank(role: str | None) -> int:
    return WORKSPACE_ROLE_HIERARCHY.get((role or "").upper(), 0)


def get_workspace_member_or_404(db: Session, workspace_id: int, target_user_id: int):
    target_member = get_workspace_member(db, target_user_id, workspace_id)
    if target_member is None:
        logger.warning(
            "[WORKSPACE_MEMBER] [GET_ONE] member not found workspace_id=%s target_user_id=%s",
            workspace_id,
            target_user_id,
        )
        raise HTTPException(status_code=404, detail="워크스페이스에서 해당 멤버를 찾을 수 없습니다.")
    return target_member


def ensure_can_change_member_role(operator_member, target_member):
    operator_rank = role_rank(operator_member.role)
    target_rank = role_rank(target_member.role)
    if operator_member.user_id != target_member.user_id and operator_rank <= target_rank:
        logger.warning(
            "[WORKSPACE_MEMBER] [ROLE] denied operator_user_id=%s operator_role=%s target_user_id=%s target_role=%s",
            operator_member.user_id,
            operator_member.role,
            target_member.user_id,
            target_member.role,
        )
        raise HTTPException(status_code=403, detail="자신과 같거나 높은 등급의 관리자 권한은 변경할 수 없습니다.")


def ensure_can_remove_member(operator_member, target_member):
    if target_member.role == "OWNER":
        logger.warning(
            "[WORKSPACE_MEMBER] [REMOVE] owner removal denied workspace_id=%s target_user_id=%s",
            target_member.workspace_id,
            target_member.user_id,
        )
        raise HTTPException(status_code=400, detail="워크스페이스의 소유자(OWNER)는 제거할 수 없습니다.")

    if operator_member.user_id == target_member.user_id:
        return

    operator_rank = role_rank(operator_member.role)
    target_rank = role_rank(target_member.role)
    if operator_rank < WORKSPACE_ROLE_HIERARCHY["ADMIN"]:
        raise HTTPException(status_code=403, detail="멤버를 추방할 권한이 없습니다.")
    if operator_rank <= target_rank:
        logger.warning(
            "[WORKSPACE_MEMBER] [REMOVE] denied operator_user_id=%s operator_role=%s target_user_id=%s target_role=%s",
            operator_member.user_id,
            operator_member.role,
            target_member.user_id,
            target_member.role,
        )
        raise HTTPException(status_code=403, detail="자신과 같거나 높은 권한을 가진 관리자는 추방할 수 없습니다.")


def get_meeting_or_404(db: Session, workspace_id: int, meeting_id: int):
    meeting = (
        db.query(models.Meeting)
        .filter(
            models.Meeting.id == meeting_id,
            models.Meeting.workspace_id == workspace_id,
        )
        .first()
    )
    if meeting is None:
        logger.warning(
            "[MEETING] [GET_ONE] meeting not found workspace_id=%s meeting_id=%s",
            workspace_id,
            meeting_id,
        )
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


def validate_meeting_status(status: str):
    if status not in VALID_MEETING_STATUS:
        logger.error("[MEETING] [ERROR] invalid status=%s", status)
        raise HTTPException(
            status_code=400,
            detail="Invalid meeting status. Allowed values: READY, ACTIVE, ENDED",
        )


def expire_expired_pending_invitations(
    db: Session,
    invited_user_id: int | None = None,
    workspace_id: int | None = None,
) -> int:
    query = db.query(models.WorkspaceInvitation).filter(
        models.WorkspaceInvitation.status == "PENDING",
        models.WorkspaceInvitation.expires_at <= now_kst(),
    )
    if invited_user_id is not None:
        query = query.filter(models.WorkspaceInvitation.invited_user_id == invited_user_id)
    if workspace_id is not None:
        query = query.filter(models.WorkspaceInvitation.workspace_id == workspace_id)

    expired_invitations = query.all()
    if not expired_invitations:
        return 0

    for invitation in expired_invitations:
        invitation.status = INVITATION_EXPIRED_STATUS
    db.commit()
    logger.info(
        "[WORKSPACE_INVITATION] [EXPIRE] expired pending invitations count=%s invited_user_id=%s workspace_id=%s",
        len(expired_invitations),
        invited_user_id,
        workspace_id,
    )
    return len(expired_invitations)


@router.post("/workspaces", response_model=schemas.ApiResponse[schemas.WorkspaceResponse], status_code=201)
def create_workspace(
    workspace: schemas.WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[WORKSPACE] [CREATE] request received name=%s user_id=%s", workspace.name, current_user.user_id)
    db_workspace = models.Workspace(
        **workspace.model_dump(),
        owner_user_id=current_user.user_id_int,
    )

    try:
        db.add(db_workspace)
        db.flush()
        db.add(
            models.WorkspaceMember(
                workspace_id=db_workspace.id,
                user_id=current_user.user_id_int,
                role="OWNER",
            )
        )
        db.commit()
        db.refresh(db_workspace)
        logger.info("[WORKSPACE] [CREATE] workspace created id=%s owner_member_role=OWNER", db_workspace.id)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="WORKSPACE_CREATE",
            resource_type="WORKSPACE",
            resource_id=db_workspace.id,
            workspace_id=db_workspace.id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[WORKSPACE] [ERROR] failed to create workspace reason=%s", exc)
        raise

    return success(build_workspace_response(db, db_workspace, current_user))


@router.get("/workspaces", response_model=schemas.ApiResponse[list[schemas.WorkspaceResponse]])
def get_workspaces(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = (
        db.query(models.Workspace)
        .join(models.WorkspaceMember, models.WorkspaceMember.workspace_id == models.Workspace.id)
        .filter(
            models.WorkspaceMember.user_id == current_user.user_id_int,
            models.WorkspaceMember.role.in_(WORKSPACE_ACCESS_ROLES),
        )
    )
    workspaces = query.order_by(models.Workspace.id.desc()).all()
    response = [build_workspace_response(db, workspace, current_user) for workspace in workspaces]
    logger.info("[WORKSPACE] [GET_ALL] workspaces fetched count=%s", len(workspaces))
    return success(response)


@router.get(
    "/workspaces/{workspace_id}",
    response_model=schemas.ApiResponse[schemas.WorkspaceResponse],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def get_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_with_access(db, workspace_id, current_user)
    return success(build_workspace_response(db, workspace, current_user))


@router.get(
    "/workspaces/{workspace_id}/members",
    response_model=schemas.ApiResponse[list[schemas.WorkspaceMemberListItem]],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def get_workspace_members(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_access(db, workspace, current_user)
    members = (
        db.query(models.WorkspaceMember)
        .join(models.WorkspaceMember.user)
        .filter(models.WorkspaceMember.workspace_id == workspace_id)
        .order_by(models.WorkspaceMember.id.asc())
        .all()
    )
    logger.info(
        "[WORKSPACE_MEMBER] [GET_ALL] members fetched workspace_id=%s requester_user_id=%s count=%s",
        workspace_id,
        current_user.user_id,
        len(members),
    )
    return success([build_workspace_member_response(member) for member in members])


@router.patch(
    "/workspaces/{workspace_id}/members/{target_user_id}",
    response_model=schemas.ApiResponse[schemas.WorkspaceMemberListItem],
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
@router.put(
    "/workspaces/{workspace_id}/members/{target_user_id}",
    response_model=schemas.ApiResponse[schemas.WorkspaceMemberListItem],
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
def update_workspace_member_role(
    workspace_id: int,
    target_user_id: int,
    body: schemas.WorkspaceMemberRoleUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    current_member = ensure_workspace_admin_access(db, workspace, current_user)
    target_member = get_workspace_member_or_404(db, workspace_id, target_user_id)
    new_role = body.role

    if new_role not in VALID_MEMBER_ROLES:
        raise HTTPException(status_code=400, detail="지원하지 않는 권한 역할입니다.")

    ensure_can_change_member_role(current_member, target_member)
    if new_role == "OWNER" and current_member.role != "OWNER":
        logger.warning(
            "[WORKSPACE_MEMBER] [ROLE] owner grant denied workspace_id=%s operator_user_id=%s target_user_id=%s",
            workspace_id,
            current_member.user_id,
            target_member.user_id,
        )
        raise HTTPException(status_code=403, detail="OWNER 권한 부여는 오직 현재 OWNER만 가능합니다.")
    if target_member.user_id == workspace.owner_user_id and new_role != "OWNER":
        logger.warning(
            "[WORKSPACE_MEMBER] [ROLE] workspace owner demotion denied workspace_id=%s target_user_id=%s new_role=%s",
            workspace_id,
            target_member.user_id,
            new_role,
        )
        raise HTTPException(status_code=400, detail="워크스페이스 소유자(OWNER)는 권한을 낮출 수 없습니다.")

    previous_role = target_member.role
    target_member.role = new_role
    try:
        db.commit()
        db.refresh(target_member)
        logger.info(
            "[WORKSPACE_MEMBER] [ROLE] member role updated workspace_id=%s target_user_id=%s %s -> %s operator_user_id=%s",
            workspace_id,
            target_user_id,
            previous_role,
            target_member.role,
            current_user.user_id,
        )
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="MEMBER_ROLE_UPDATE",
            resource_type="WORKSPACE_MEMBER",
            resource_id=target_user_id,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error(
            "[WORKSPACE_MEMBER] [ERROR] failed to update role workspace_id=%s target_user_id=%s reason=%s",
            workspace_id,
            target_user_id,
            exc,
        )
        raise

    return success(build_workspace_member_response(target_member))


@router.delete(
    "/workspaces/{workspace_id}/members/{target_user_id}",
    response_model=schemas.ApiResponse[dict],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def remove_workspace_member(
    workspace_id: int,
    target_user_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    current_member = ensure_workspace_access(db, workspace, current_user)
    target_member = get_workspace_member_or_404(db, workspace_id, target_user_id)
    ensure_can_remove_member(current_member, target_member)

    is_self_leave = current_member.user_id == target_member.user_id
    removed_user_id = target_member.user_id
    removed_role = target_member.role
    try:
        db.delete(target_member)
        db.commit()
        logger.info(
            "[WORKSPACE_MEMBER] [REMOVE] member removed workspace_id=%s target_user_id=%s target_role=%s operator_user_id=%s self_leave=%s",
            workspace_id,
            removed_user_id,
            removed_role,
            current_user.user_id,
            is_self_leave,
        )
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="MEMBER_LEAVE" if is_self_leave else "MEMBER_REMOVE",
            resource_type="WORKSPACE_MEMBER",
            resource_id=removed_user_id,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error(
            "[WORKSPACE_MEMBER] [ERROR] failed to remove member workspace_id=%s target_user_id=%s reason=%s",
            workspace_id,
            target_user_id,
            exc,
        )
        raise

    message = "워크스페이스에서 정상적으로 탈퇴되었습니다." if is_self_leave else "해당 멤버를 워크스페이스에서 성공적으로 추방했습니다."
    return success(
        {
            "workspace_id": workspace_id,
            "user_id": removed_user_id,
            "role": removed_role,
            "self_leave": is_self_leave,
            "message": message,
        }
    )


@router.post(
    "/workspaces/{workspace_id}/invitations",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationResponse],
    status_code=201,
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
@router.post(
    "/workspaces/{workspace_id}/invite",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationResponse],
    status_code=201,
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
@limiter.limit("3/minute", key_func=get_inviter_rate_limit_key)
def invite_workspace_member(
    request: Request,
    workspace_id: int,
    invite: schemas.WorkspaceInviteCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_admin_access(db, workspace, current_user)
    email = invite.email.strip().lower()
    role = invite.role.strip().upper()
    safe_email = mask_email(email)
    logger.info(
        "[WORKSPACE] [INVITE] request received workspace_id=%s inviter_user_id=%s email=%s role=%s",
        workspace_id,
        current_user.user_id,
        safe_email,
        role,
    )
    if role not in VALID_INVITATION_ROLES:
        logger.error("[WORKSPACE] [INVITE] invalid invitation role workspace_id=%s role=%s", workspace_id, role)
        raise HTTPException(status_code=400, detail="초대 role은 MEMBER 또는 ADMIN만 허용됩니다.")

    invited_user = db.query(models.Auth).filter(func.lower(models.Auth.email) == email).first()
    if invited_user is None:
        logger.warning("[WORKSPACE] [INVITE] invited user not found workspace_id=%s email=%s", workspace_id, safe_email)
        raise HTTPException(status_code=404, detail="초대할 회원을 찾을 수 없습니다.")
    logger.info(
        "[WORKSPACE] [INVITE] invited user resolved workspace_id=%s invited_user_id=%s email=%s",
        workspace_id,
        invited_user.id,
        safe_email,
    )
    expire_expired_pending_invitations(db, invited_user_id=invited_user.id, workspace_id=workspace_id)

    existing_member = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == workspace_id,
            models.WorkspaceMember.user_id == invited_user.id,
        )
        .first()
    )
    logger.info(
        "[WORKSPACE] [INVITE] existing member lookup workspace_id=%s invited_user_id=%s found=%s member_id=%s member_role=%s",
        workspace_id,
        invited_user.id,
        existing_member is not None,
        existing_member.id if existing_member is not None else None,
        existing_member.role if existing_member is not None else None,
    )
    if existing_member is not None:
        logger.warning(
            "[WORKSPACE] [INVITE] member already exists workspace_id=%s user_id=%s",
            workspace_id,
            invited_user.id,
        )
        raise HTTPException(status_code=409, detail="이미 workspace에 참여 중인 회원입니다.")

    existing_pending_invitation = (
        db.query(models.WorkspaceInvitation)
        .filter(
            models.WorkspaceInvitation.workspace_id == workspace_id,
            models.WorkspaceInvitation.invited_user_id == invited_user.id,
            models.WorkspaceInvitation.status == "PENDING",
        )
        .first()
    )
    logger.info(
        "[WORKSPACE] [INVITE] pending invitation lookup workspace_id=%s invited_user_id=%s found=%s invitation_id=%s status=%s",
        workspace_id,
        invited_user.id,
        existing_pending_invitation is not None,
        existing_pending_invitation.id if existing_pending_invitation is not None else None,
        existing_pending_invitation.status if existing_pending_invitation is not None else None,
    )
    if existing_pending_invitation is not None:
        logger.warning(
            "[WORKSPACE] [INVITE] pending invitation already exists workspace_id=%s user_id=%s invitation_id=%s",
            workspace_id,
            invited_user.id,
            existing_pending_invitation.id,
        )
        raise HTTPException(status_code=409, detail="이미 대기 중인 초대가 있습니다.")

    invitation = models.WorkspaceInvitation(
        workspace_id=workspace_id,
        invited_email=email,
        invited_user_id=invited_user.id,
        invited_by_user_id=current_user.user_id_int,
        role=role,
        status="PENDING",
    )
    try:
        db.add(invitation)
        db.commit()
        db.refresh(invitation)
        pending_count = (
            db.query(models.WorkspaceInvitation)
            .filter(
                models.WorkspaceInvitation.invited_user_id == invited_user.id,
                models.WorkspaceInvitation.status == "PENDING",
            )
            .count()
        )
        logger.info(
            "[WORKSPACE] [INVITE] invitation created workspace_id=%s user_id=%s invitation_id=%s role=%s target_pending_count=%s",
            workspace_id,
            invited_user.id,
            invitation.id,
            role,
            pending_count,
        )
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="INVITE_CREATE",
            resource_type="INVITATION",
            resource_id=invitation.id,
            workspace_id=workspace_id,
        )
    except IntegrityError as exc:
        db.rollback()
        constraint_name = getattr(
            getattr(getattr(exc, "orig", None), "diag", None),
            "constraint_name",
            None,
        )
        if constraint_name != "uq_workspace_invitations_pending_workspace_user":
            logger.error(
                "[WORKSPACE] [ERROR] invitation integrity failure workspace_id=%s constraint=%s reason=%s",
                workspace_id,
                constraint_name,
                exc,
            )
            raise
        logger.warning(
            "[WORKSPACE] [INVITE] pending invitation uniqueness conflict workspace_id=%s invited_user_id=%s",
            workspace_id,
            invited_user.id,
        )
        raise HTTPException(status_code=409, detail="이미 대기 중인 초대가 있습니다.") from exc
    except Exception as exc:
        db.rollback()
        logger.error("[WORKSPACE] [ERROR] failed to invite member workspace_id=%s reason=%s", workspace_id, exc)
        raise

    return success(invitation)


@router.get(
    "/workspaces/{workspace_id}/invitations",
    response_model=schemas.ApiResponse[list[schemas.WorkspaceInvitationAdminListItem]],
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
def get_workspace_invitations(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_admin_access(db, workspace, current_user)
    expire_expired_pending_invitations(db, workspace_id=workspace_id)
    invitations = (
        db.query(models.WorkspaceInvitation)
        .filter(models.WorkspaceInvitation.workspace_id == workspace_id)
        .order_by(models.WorkspaceInvitation.id.desc())
        .all()
    )
    logger.info(
        "[WORKSPACE_INVITATION] [GET_ALL] workspace_id=%s requester_user_id=%s count=%s",
        workspace_id,
        current_user.user_id,
        len(invitations),
    )
    return success(invitations)


@router.get(
    "/workspace-invitations/me",
    response_model=schemas.ApiResponse[list[schemas.WorkspaceInvitationListItem]],
)
def get_my_workspace_invitations(
    response: Response,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    expire_expired_pending_invitations(db, invited_user_id=current_user.user_id_int)
    logger.info(
        "[WORKSPACE_INVITATION] [GET_ME] request received user_id=%s email=%s",
        current_user.user_id,
        mask_email(current_user.email) if current_user.email is not None else None,
    )
    invitation_status_counts = (
        db.query(models.WorkspaceInvitation.status, func.count(models.WorkspaceInvitation.id))
        .filter(models.WorkspaceInvitation.invited_user_id == current_user.user_id_int)
        .group_by(models.WorkspaceInvitation.status)
        .all()
    )
    logger.info(
        "[WORKSPACE_INVITATION] [GET_ME] invitation status counts user_id=%s email=%s counts=%s",
        current_user.user_id,
        mask_email(current_user.email) if current_user.email is not None else None,
        {status: count for status, count in invitation_status_counts},
    )
    invitations = (
        db.query(models.WorkspaceInvitation)
        .join(models.WorkspaceInvitation.workspace)
        .filter(
            models.WorkspaceInvitation.invited_user_id == current_user.user_id_int,
            models.WorkspaceInvitation.status == "PENDING",
        )
        .order_by(models.WorkspaceInvitation.id.desc())
        .all()
    )
    logger.info(
        "[WORKSPACE_INVITATION] [GET_ME] invitations fetched user_id=%s email=%s count=%s invitation_ids=%s",
        current_user.user_id,
        mask_email(current_user.email) if current_user.email is not None else None,
        len(invitations),
        [invitation.id for invitation in invitations],
    )
    return success(
        [
            {
                "id": invitation.id,
                "workspace_id": invitation.workspace_id,
                "workspace_name": invitation.workspace.name,
                "invited_email": invitation.invited_email,
                "invited_by_user_id": invitation.invited_by_user_id,
                "invited_by_user_name": invitation.invited_by_user.name,
                "invited_by_user_email": invitation.invited_by_user.email,
                "role": invitation.role,
                "status": invitation.status,
                "expires_at": invitation.expires_at,
                "created_at": invitation.created_at,
            }
            for invitation in invitations
        ]
    )


def expire_invitation(db: Session, invitation):
    invitation.status = INVITATION_EXPIRED_STATUS
    db.commit()
    logger.warning(
        "[WORKSPACE_INVITATION] [EXPIRE] invitation expired invitation_id=%s workspace_id=%s invited_user_id=%s expires_at=%s",
        invitation.id,
        invitation.workspace_id,
        invitation.invited_user_id,
        invitation.expires_at,
    )


def ensure_invitation_processable(db: Session, invitation, current_user: CurrentUser):
    if invitation.status != "PENDING":
        logger.warning(
            "[WORKSPACE_INVITATION] [ERROR] invitation is not pending invitation_id=%s requester_user_id=%s workspace_id=%s status=%s accepted_at=%s",
            invitation.id,
            current_user.user_id,
            invitation.workspace_id,
            invitation.status,
            invitation.accepted_at,
        )
        raise HTTPException(status_code=409, detail="이미 처리된 초대입니다.")

    if current_user.email is None or current_user.email.lower() != invitation.invited_email.lower():
        logger.warning(
            "[WORKSPACE_INVITATION] [ERROR] invitation email mismatch invitation_id=%s requester_user_id=%s requester_email=%s invited_email=%s",
            invitation.id,
            current_user.user_id,
            mask_email(current_user.email) if current_user.email is not None else None,
            mask_email(invitation.invited_email),
        )
        raise HTTPException(status_code=403, detail="이 초대를 수락할 권한이 없습니다.")

    if invitation.expires_at <= now_kst():
        expire_invitation(db, invitation)
        raise HTTPException(status_code=400, detail="만료된 초대입니다. 다시 초대를 요청하세요.")


def get_my_pending_invitation_or_404(db: Session, invitation_id: int, current_user: CurrentUser):
    invitation = db.get(models.WorkspaceInvitation, invitation_id)
    if invitation is None or invitation.invited_user_id != current_user.user_id_int:
        logger.warning(
            "[WORKSPACE_INVITATION] [GET_ONE] invitation not found invitation_id=%s requester_user_id=%s found=%s invited_user_id=%s status=%s",
            invitation_id,
            current_user.user_id,
            invitation is not None,
            invitation.invited_user_id if invitation is not None else None,
            invitation.status if invitation is not None else None,
        )
        raise HTTPException(status_code=404, detail="초대를 찾을 수 없습니다.")
    logger.info(
        "[WORKSPACE_INVITATION] [GET_ONE] invitation resolved invitation_id=%s workspace_id=%s requester_user_id=%s invited_user_id=%s invited_by_user_id=%s status=%s",
        invitation.id,
        invitation.workspace_id,
        current_user.user_id,
        invitation.invited_user_id,
        invitation.invited_by_user_id,
        invitation.status,
    )
    ensure_invitation_processable(db, invitation, current_user)
    return invitation


def accept_invitation(db: Session, invitation, current_user: CurrentUser):
    ensure_invitation_processable(db, invitation, current_user)
    existing_member = (
        db.query(models.WorkspaceMember)
        .filter(
            models.WorkspaceMember.workspace_id == invitation.workspace_id,
            models.WorkspaceMember.user_id == current_user.user_id_int,
        )
        .first()
    )
    logger.info(
        "[WORKSPACE_INVITATION] [ACCEPT] existing member lookup invitation_id=%s workspace_id=%s requester_user_id=%s found=%s member_id=%s member_role=%s",
        invitation.id,
        invitation.workspace_id,
        current_user.user_id,
        existing_member is not None,
        existing_member.id if existing_member is not None else None,
        existing_member.role if existing_member is not None else None,
    )
    if existing_member is None:
        db.add(
            models.WorkspaceMember(
                workspace_id=invitation.workspace_id,
                user_id=current_user.user_id_int,
                role=invitation.role,
            )
        )

    invitation.status = "ACCEPTED"
    invitation.accepted_at = now_kst()

    try:
        db.commit()
        logger.info(
            "[WORKSPACE_INVITATION] [ACCEPT] invitation accepted invitation_id=%s workspace_id=%s user_id=%s role=%s member_created=%s accepted_at=%s",
            invitation.id,
            invitation.workspace_id,
            current_user.user_id,
            invitation.role,
            existing_member is None,
            invitation.accepted_at,
        )
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="INVITE_ACCEPT",
            resource_type="INVITATION",
            resource_id=invitation.id,
            workspace_id=invitation.workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[WORKSPACE_INVITATION] [ERROR] failed to accept invitation_id=%s reason=%s", invitation.id, exc)
        raise

    return success(
        {
            "invitation_id": invitation.id,
            "workspace_id": invitation.workspace_id,
            "user_id": current_user.user_id_int,
            "role": invitation.role,
            "status": invitation.status,
        }
    )


@router.post(
    "/workspace-invitations/{invitation_id}/accept",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationAcceptResponse],
)
def accept_workspace_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[WORKSPACE_INVITATION] [ACCEPT] request received invitation_id=%s requester_user_id=%s",
        invitation_id,
        current_user.user_id,
    )
    invitation = get_my_pending_invitation_or_404(db, invitation_id, current_user)
    return accept_invitation(db, invitation, current_user)


@router.post(
    "/auth/invitations/accept",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationAcceptResponse],
)
def accept_workspace_invitation_by_token(
    body: schemas.WorkspaceInvitationAcceptByTokenRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[WORKSPACE_INVITATION] [ACCEPT_TOKEN] request received requester_user_id=%s",
        current_user.user_id,
    )
    invitation = (
        db.query(models.WorkspaceInvitation)
        .filter(models.WorkspaceInvitation.token == body.token)
        .first()
    )
    if invitation is None:
        logger.warning("[WORKSPACE_INVITATION] [ACCEPT_TOKEN] invitation not found")
        raise HTTPException(status_code=404, detail="유효하지 않거나 존재하지 않는 초대 링크입니다.")
    return accept_invitation(db, invitation, current_user)


@router.post(
    "/workspace-invitations/{invitation_id}/reject",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationRejectResponse],
)
def reject_workspace_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[WORKSPACE_INVITATION] [REJECT] request received invitation_id=%s requester_user_id=%s",
        invitation_id,
        current_user.user_id,
    )
    invitation = get_my_pending_invitation_or_404(db, invitation_id, current_user)
    logger.info(
        "[WORKSPACE_INVITATION] [REJECT] invitation pending before reject invitation_id=%s workspace_id=%s requester_user_id=%s invited_by_user_id=%s status=%s",
        invitation.id,
        invitation.workspace_id,
        current_user.user_id,
        invitation.invited_by_user_id,
        invitation.status,
    )
    invitation.status = "REJECTED"

    try:
        db.commit()
        logger.info(
            "[WORKSPACE_INVITATION] [REJECT] invitation rejected invitation_id=%s workspace_id=%s user_id=%s",
            invitation.id,
            invitation.workspace_id,
            current_user.user_id,
        )
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="INVITE_REJECT",
            resource_type="INVITATION",
            resource_id=invitation.id,
            workspace_id=invitation.workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[WORKSPACE_INVITATION] [ERROR] failed to reject invitation_id=%s reason=%s", invitation_id, exc)
        raise

    return success({"invitation_id": invitation.id, "status": invitation.status})


@router.delete(
    "/workspaces/{workspace_id}/invitations/{invitation_id}",
    response_model=schemas.ApiResponse[schemas.WorkspaceInvitationRejectResponse],
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
def cancel_workspace_invitation(
    workspace_id: int,
    invitation_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_admin_access(db, workspace, current_user)
    invitation = (
        db.query(models.WorkspaceInvitation)
        .filter(
            models.WorkspaceInvitation.id == invitation_id,
            models.WorkspaceInvitation.workspace_id == workspace_id,
        )
        .first()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="초대를 찾을 수 없습니다.")
    if invitation.status != "PENDING":
        raise HTTPException(status_code=409, detail="이미 처리된 초대입니다.")
    if invitation.expires_at <= now_kst():
        expire_invitation(db, invitation)
        raise HTTPException(status_code=409, detail="이미 만료된 초대입니다.")

    invitation.status = "CANCELLED"
    try:
        db.commit()
        db.refresh(invitation)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="INVITE_CANCEL",
            resource_type="INVITATION",
            resource_id=invitation.id,
            workspace_id=workspace_id,
        )
        logger.info(
            "[WORKSPACE_INVITATION] [CANCEL] invitation_id=%s workspace_id=%s actor_user_id=%s",
            invitation.id,
            workspace_id,
            current_user.user_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error(
            "[WORKSPACE_INVITATION] [ERROR] failed to cancel invitation_id=%s workspace_id=%s reason=%s",
            invitation_id,
            workspace_id,
            exc,
        )
        raise

    return success({"invitation_id": invitation.id, "status": invitation.status})


@router.post(
    "/workspaces/{workspace_id}/meetings",
    response_model=schemas.ApiResponse[schemas.MeetingResponse],
    status_code=201,
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def create_workspace_meeting(
    workspace_id: int,
    meeting: schemas.MeetingCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info(
        "[MEETING] [CREATE] request received workspace_id=%s title=%s status=%s",
        workspace_id,
        meeting.title,
        meeting.status,
    )
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_member_action_access(db, workspace, current_user)
    validate_meeting_status(meeting.status)
    if meeting.status != "READY":
        logger.error("[MEETING] [ERROR] create status must be READY status=%s", meeting.status)
        raise HTTPException(status_code=400, detail="Meeting must be created with READY status")

    db_meeting = models.Meeting(
        workspace_id=workspace_id,
        **meeting.model_dump(),
    )

    try:
        db.add(db_meeting)
        db.commit()
        db.refresh(db_meeting)
        logger.info("[MEETING] [CREATE] meeting created id=%s workspace_id=%s", db_meeting.id, workspace_id)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="MEETING_CREATE",
            resource_type="MEETING",
            resource_id=db_meeting.id,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error("[MEETING] [ERROR] failed to create meeting workspace_id=%s reason=%s", workspace_id, exc)
        raise

    return success(db_meeting)


@router.get(
    "/workspaces/{workspace_id}/issues",
    response_model=schemas.ApiResponse[list[schemas.IssueResponse]],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def get_workspace_issues(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [GET_WORKSPACE] request received workspace_id=%s", workspace_id)
    return success(
        issue_service.get_issues_by_workspace(
            db,
            workspace_id=workspace_id,
            current_user=current_user,
        )
    )


@router.get(
    "/meetings/{meeting_id}/issues",
    response_model=schemas.ApiResponse[list[schemas.IssueResponse]],
)
def get_meeting_issues(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    logger.info("[ISSUE] [GET_MEETING] request received meeting_id=%s", meeting_id)
    return success(
        issue_service.get_issues_by_meeting(
            db,
            meeting_id=meeting_id,
            current_user=current_user,
        )
    )


@router.get(
    "/workspaces/{workspace_id}/meetings",
    response_model=schemas.ApiResponse[schemas.MeetingListResponse],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def get_workspace_meetings(
    workspace_id: int,
    page: int = 1,
    size: int = 20,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    get_workspace_with_access(db, workspace_id, current_user)

    if page < 1:
        raise HTTPException(status_code=400, detail="page must be greater than or equal to 1")
    if size < 1:
        raise HTTPException(status_code=400, detail="size must be greater than or equal to 1")

    offset = (page - 1) * size
    meetings = (
        db.query(models.Meeting)
        .filter(models.Meeting.workspace_id == workspace_id)
        .order_by(models.Meeting.id.desc())
        .offset(offset)
        .limit(size)
        .all()
    )

    logger.info(
        "[MEETING] [GET_ALL] meetings fetched workspace_id=%s page=%s size=%s count=%s",
        workspace_id,
        page,
        size,
        len(meetings),
    )

    return success(
        {
            "workspaceId": workspace_id,
            "page": page,
            "size": size,
            "meetings": meetings,
        }
    )


@router.get(
    "/workspaces/{workspace_id}/meetings/{meeting_id}",
    response_model=schemas.ApiResponse[schemas.MeetingResponse],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def get_workspace_meeting(
    workspace_id: int,
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    get_workspace_with_access(db, workspace_id, current_user)
    return success(get_meeting_or_404(db, workspace_id, meeting_id))


@router.patch(
    "/workspaces/{workspace_id}/meetings/{meeting_id}",
    response_model=schemas.ApiResponse[schemas.MeetingResponse],
    dependencies=[Depends(require_workspace_role("MEMBER"))],
)
def update_workspace_meeting(
    workspace_id: int,
    meeting_id: int,
    meeting_update: schemas.MeetingUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_member_action_access(db, workspace, current_user)
    meeting = get_meeting_or_404(db, workspace_id, meeting_id)

    data = meeting_update.model_dump(exclude_unset=True)
    previous_status = meeting.status
    next_status = data.get("status")

    if next_status is not None:
        validate_meeting_status(next_status)
        if not can_transition("meeting", meeting.status, next_status):
            logger.error(
                "[MEETING] [ERROR] invalid status transition workspace_id=%s meeting_id=%s %s -> %s",
                workspace_id,
                meeting_id,
                meeting.status,
                next_status,
            )
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition meeting status from {meeting.status} to {next_status}",
            )
        if next_status == "ACTIVE" and meeting.started_at is None:
            data["started_at"] = now_kst()
        if next_status == "ENDED" and meeting.ended_at is None:
            data["ended_at"] = now_kst()

    for key, value in data.items():
        setattr(meeting, key, value)

    try:
        db.commit()
        db.refresh(meeting)
        if "status" in data:
            logger.info(
                "[MEETING] [UPDATE] workspace_id=%s meeting_id=%s status %s -> %s",
                workspace_id,
                meeting_id,
                previous_status,
                meeting.status,
            )
            record_audit_log_safely(
                actor=current_user.user_id_int,
                action="MEETING_STATUS_UPDATE",
                resource_type="MEETING",
                resource_id=meeting_id,
                workspace_id=workspace_id,
            )
            publish_meeting_updated(meeting, previous_status=previous_status)

            # 회의가 끝나면 로컬 LLM으로 요약/액션아이템/재논의 리포트를 자동 생성한다.
            if meeting.status == "ENDED" and previous_status != "ENDED":
                from app.api.ai_analysis import run_meeting_analysis

                background_tasks.add_task(run_meeting_analysis, workspace_id, meeting_id)
                logger.info(
                    "[AI] 회의 종료 → 자동 분석 예약 workspace_id=%s meeting_id=%s",
                    workspace_id,
                    meeting_id,
                )
        else:
            logger.info("[MEETING] [UPDATE] meeting updated workspace_id=%s meeting_id=%s", workspace_id, meeting_id)
    except Exception as exc:
        db.rollback()
        logger.error(
            "[MEETING] [ERROR] failed to update meeting workspace_id=%s meeting_id=%s reason=%s",
            workspace_id,
            meeting_id,
            exc,
        )
        raise

    return success(meeting)


@router.delete(
    "/workspaces/{workspace_id}/meetings/{meeting_id}",
    response_model=schemas.ApiResponse[schemas.MeetingResponse],
    dependencies=[Depends(require_workspace_role("ADMIN"))],
)
def delete_workspace_meeting(
    workspace_id: int,
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    workspace = get_workspace_or_404(db, workspace_id)
    ensure_workspace_admin_access(db, workspace, current_user)
    meeting = get_meeting_or_404(db, workspace_id, meeting_id)

    try:
        db.delete(meeting)
        db.commit()
        logger.info("[MEETING] [DELETE] meeting deleted workspace_id=%s meeting_id=%s", workspace_id, meeting_id)
        record_audit_log_safely(
            actor=current_user.user_id_int,
            action="MEETING_DELETE",
            resource_type="MEETING",
            resource_id=meeting_id,
            workspace_id=workspace_id,
        )
    except Exception as exc:
        db.rollback()
        logger.error(
            "[MEETING] [ERROR] failed to delete meeting workspace_id=%s meeting_id=%s reason=%s",
            workspace_id,
            meeting_id,
            exc,
        )
        raise

    return success(meeting)
