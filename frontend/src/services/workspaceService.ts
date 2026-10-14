import { useAuthStore } from "../store/authStore";
import type {
    CreateWorkspaceRequest,
    InviteWorkspaceRequest,
    ServerWorkspaceInvitation,
    ServerWorkspaceInvitationAcceptResult,
    ServerWorkspaceInvitationRejectResult,
    ServerWorkspaceMember,
    WorkspaceInvitation,
    WorkspaceInvitationAcceptResult,
    WorkspaceInvitationCreateResult,
    WorkspaceInvitationRejectResult,
    WorkspaceMember,
    WorkspaceResponse,
    WorkspaceRole,
} from "../types/workspace.types";
import { parseApiError, type ApiFieldErrors } from "./apiError";
import { authorizedFetch } from "./apiClient";

export class WorkspaceApiError extends Error {
    status: number;
    fieldErrors: ApiFieldErrors;

    constructor(
        status: number,
        message: string,
        fieldErrors: ApiFieldErrors = {}
    ) {
        super(message);
        this.name = "WorkspaceApiError";
        this.status = status;
        this.fieldErrors = fieldErrors;
    }
}

async function toWorkspaceApiError(response: Response, fallbackMessage: string) {
    const error = await parseApiError(response, fallbackMessage);
    return new WorkspaceApiError(error.status, error.message, error.fieldErrors);
}

function mapWorkspaceInvitation(
    invitation: ServerWorkspaceInvitation
): WorkspaceInvitation {
    return {
        id: invitation.id,
        workspaceId: invitation.workspace_id,
        workspaceName: invitation.workspace_name ?? "",
        invitedEmail: invitation.invited_email,
        invitedByUserId: invitation.invited_by_user_id ?? null,
        invitedByUserName: invitation.invited_by_user_name ?? "",
        invitedByUserEmail: invitation.invited_by_user_email ?? "",
        role: invitation.role === "ADMIN" ? "ADMIN" : "MEMBER",
        status: "PENDING",
        expiresAt: invitation.expires_at ?? null,
        createdAt: invitation.created_at,
    };
}

function isPendingWorkspaceInvitation(invitation: ServerWorkspaceInvitation) {
    return invitation.status === "PENDING";
}

function mapWorkspaceInvitationAcceptResult(
    result: ServerWorkspaceInvitationAcceptResult
): WorkspaceInvitationAcceptResult {
    return {
        invitationId: result.invitation_id,
        workspaceId: result.workspace_id,
        userId: result.user_id,
        role: result.role === "ADMIN" ? "ADMIN" : "MEMBER",
        status: "ACCEPTED",
    };
}

function mapWorkspaceInvitationCreateResult(
    invitation: ServerWorkspaceInvitation
): WorkspaceInvitationCreateResult {
    return {
        id: invitation.id,
        workspaceId: invitation.workspace_id,
        invitedEmail: invitation.invited_email,
        invitedUserId: invitation.invited_user_id ?? null,
        invitedByUserId: invitation.invited_by_user_id ?? null,
        role: invitation.role === "ADMIN" ? "ADMIN" : "MEMBER",
        token: invitation.token ?? "",
        status: invitation.status,
        expiresAt: invitation.expires_at ?? null,
        createdAt: invitation.created_at,
        acceptedAt: invitation.accepted_at ?? null,
    };
}

function mapWorkspaceInvitationRejectResult(
    result: ServerWorkspaceInvitationRejectResult
): WorkspaceInvitationRejectResult {
    return {
        invitationId: result.invitation_id,
        status: "REJECTED",
    };
}

export async function createWorkspace(
    request: CreateWorkspaceRequest
): Promise<WorkspaceResponse> {
    console.log("[REST] POST /workspaces");

    const response = await authorizedFetch("/workspaces", {
        method: "POST",
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "워크스페이스 생성에 실패했습니다.");
    }

    const rawData = await response.json();

    return rawData.data ?? rawData;
}

export async function getWorkspaces(): Promise<WorkspaceResponse[]> {
    const response = await authorizedFetch("/workspaces", {
        method: "GET",
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "워크스페이스 목록 조회에 실패했습니다.");
    }

    const rawData = await response.json();

    return rawData.data ?? rawData;
}

export async function getWorkspace(
    workspaceId: number
): Promise<WorkspaceResponse> {
    const response = await authorizedFetch(`/workspaces/${workspaceId}`, {
        method: "GET",
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "워크스페이스 조회에 실패했습니다.");
    }

    const rawData = await response.json();

    return rawData.data ?? rawData;
}

export async function inviteWorkspaceMember(
    workspaceId: number,
    payload: InviteWorkspaceRequest
): Promise<WorkspaceInvitationCreateResult> {
    if (payload.role !== "MEMBER" && payload.role !== "ADMIN") {
        throw new WorkspaceApiError(400, "초대 role은 MEMBER 또는 ADMIN만 허용됩니다.");
    }

    let response = await authorizedFetch(`/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    if (response.status === 404 || response.status === 405) {
        response = await authorizedFetch(`/workspaces/${workspaceId}/invite`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "초대 요청에 실패했습니다.");
    }

    const rawData = await response.json();
    const invitation = rawData.data ?? rawData;

    return mapWorkspaceInvitationCreateResult(invitation);
}

export async function getMyWorkspaceInvitations(): Promise<WorkspaceInvitation[]> {
    const accessToken =
        useAuthStore.getState().accessToken ?? localStorage.getItem("accessToken");

    if (!accessToken) {
        throw new WorkspaceApiError(401, "인증 정보가 필요합니다.");
    }

    const response = await authorizedFetch("/workspace-invitations/me", {
        method: "GET",
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "받은 초대 목록 조회에 실패했습니다.");
    }

    const rawData = await response.json();
    const invitations = Array.isArray(rawData.data) ? rawData.data : rawData;

    return invitations
        .filter(isPendingWorkspaceInvitation)
        .map((invitation: ServerWorkspaceInvitation) =>
            mapWorkspaceInvitation(invitation)
        );
}

export async function acceptWorkspaceInvitation(
    invitationId: number
): Promise<WorkspaceInvitationAcceptResult> {
    const response = await authorizedFetch(
        `/workspace-invitations/${invitationId}/accept`,
        {
            method: "POST",
        }
    );

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "초대 수락에 실패했습니다.");
    }

    const rawData = await response.json();
    const result = rawData.data ?? rawData;

    return mapWorkspaceInvitationAcceptResult(result);
}

export async function rejectWorkspaceInvitation(
    invitationId: number
): Promise<WorkspaceInvitationRejectResult> {
    const response = await authorizedFetch(
        `/workspace-invitations/${invitationId}/reject`,
        {
            method: "POST",
        }
    );

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "초대 거절에 실패했습니다.");
    }

    const rawData = await response.json();
    const result = rawData.data ?? rawData;

    return mapWorkspaceInvitationRejectResult(result);
}

export async function acceptInvitationByToken(
    token: string
): Promise<WorkspaceInvitationAcceptResult> {
    const trimmedToken = token.trim();

    if (!trimmedToken) {
        throw new WorkspaceApiError(400, "초대 토큰이 필요합니다.");
    }

    const response = await authorizedFetch("/auth/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: trimmedToken }),
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "초대 링크 수락에 실패했습니다.");
    }

    const rawData = await response.json();
    const result = rawData.data ?? rawData;

    return mapWorkspaceInvitationAcceptResult(result);
}

function mapWorkspaceMember(member: ServerWorkspaceMember): WorkspaceMember {
    return {
        id: member.id,
        workspaceId: member.workspace_id,
        userId: member.user_id,
        name: member.name,
        email: member.email,
        role: member.role,
        createdAt: member.created_at,
    };
}

/**
 * 워크스페이스 멤버 목록 조회
 * GET /workspaces/{workspace_id}/members
 */
export async function getWorkspaceMembers(
    workspaceId: number
): Promise<WorkspaceMember[]> {
    const response = await authorizedFetch(`/workspaces/${workspaceId}/members`, {
        method: "GET",
    });

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "멤버 목록 조회에 실패했습니다.");
    }

    const rawData = await response.json();
    const members: ServerWorkspaceMember[] = rawData.data ?? rawData ?? [];

    return members.map(mapWorkspaceMember);
}

/**
 * 워크스페이스 멤버 권한 변경
 * PATCH /workspaces/{workspace_id}/members/{target_user_id}
 *
 * OWNER로의 변경은 서버 정책상 허용되지 않으므로 클라이언트에서도 차단한다.
 */
export async function updateWorkspaceMemberRole(
    workspaceId: number,
    targetUserId: number,
    role: Exclude<WorkspaceRole, "OWNER">
): Promise<WorkspaceMember> {
    if (role !== "MEMBER" && role !== "ADMIN") {
        throw new WorkspaceApiError(400, "권한은 MEMBER 또는 ADMIN만 변경할 수 있습니다.");
    }

    const response = await authorizedFetch(
        `/workspaces/${workspaceId}/members/${targetUserId}`,
        {
            method: "PATCH",
            body: JSON.stringify({ role }),
        }
    );

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "멤버 권한 변경에 실패했습니다.");
    }

    const rawData = await response.json();

    return mapWorkspaceMember(rawData.data ?? rawData);
}

/**
 * 워크스페이스 멤버 제거(본인이면 나가기)
 * DELETE /workspaces/{workspace_id}/members/{target_user_id}
 */
export async function removeWorkspaceMember(
    workspaceId: number,
    targetUserId: number
): Promise<void> {
    const response = await authorizedFetch(
        `/workspaces/${workspaceId}/members/${targetUserId}`,
        {
            method: "DELETE",
        }
    );

    if (!response.ok) {
        throw await toWorkspaceApiError(response, "멤버 제거에 실패했습니다.");
    }
}
