// workspace.types.ts

/**
 * 워크스페이스 사용자 접속 상태 타입
 */
export type WorkspaceUserStatus =
    | "online" // 접속 중
    | "offline"; // 접속 종료

/**
 * 워크스페이스 참가 사용자 정보 타입
 * 사용 위치:
 * - 참가자 리스트
 * - 실시간 협업 상태
 */
export type WorkspaceUser = {
    userId: string; // 사용자 고유 ID
    name: string; // 사용자 이름
    email?: string;
    role?: WorkspaceRole;
    status: WorkspaceUserStatus; // 현재 접속 상태
    joinedAt: string;
    lastSeenAt: string;
};

/**
 * 워크스페이스 연결 상태 흐름 타입
 */
export type WorkspaceConnectionStatus =
    | "idle" // 초기 상태
    | "joining" // 참가 요청 중
    | "joined" // 참가 완료
    | "leaving" // 나가는 중
    | "left" // 나간 상태
    | "error"; // 오류 상태

/**
 * 워크스페이스 참가 요청 payload
 * 클라이언트 → 서버 전송
 */
export type JoinWorkspacePayload = {
    workspaceId: number; // 워크스페이스 ID
};

/**
 * 워크스페이스 퇴장 요청 payload
 */
export type LeaveWorkspacePayload = {
    workspaceId: number; // 워크스페이스 ID
};

/**
 * 워크스페이스 참가 성공 응답 payload
 * 서버 → 클라이언트 응답
 */
export type JoinWorkspaceAckPayload = {
    workspaceId: number; // 워크스페이스 ID
    userId: string; // 사용자 ID
    joinedAt: string; // 참가 시간
};

/**
 * 워크스페이스 퇴장 성공 응답 payload
 */
export type LeaveWorkspaceAckPayload = {
    workspaceId: number; // 워크스페이스 ID
    userId: string; // 사용자 ID
    leftAt: string; // 퇴장 시간
};

/**
 * 현재 워크스페이스 사용자 목록 갱신 payload
 * 실시간 참가자 상태 동기화용
 */
export type WorkspaceUsersUpdatedPayload = {
    workspaceId: number; // 워크스페이스 ID
    users: WorkspaceUser[]; // 현재 접속 사용자 목록
    updatedAt: string; // 갱신 시간
};

export type WorkspaceRole =
    | "OWNER"
    | "ADMIN"
    | "MEMBER";

export type InvitationStatus =
    | "PENDING"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED";

export type ServerWorkspaceInvitation = {
    id: number;
    workspace_id: number;
    workspace_name?: string;
    invited_email: string;
    invited_user_id?: number | null;
    invited_by_user_id?: number;
    invited_by_user_name?: string;
    invited_by_user_email?: string;
    role: WorkspaceRole;
    token?: string;
    status: InvitationStatus;
    expires_at?: string;
    created_at: string;
    accepted_at?: string | null;
};

export type WorkspaceInvitation = {
    id: number;
    workspaceId: number;
    workspaceName: string;
    invitedEmail: string;
    invitedByUserId: number | null;
    invitedByUserName: string;
    invitedByUserEmail: string;
    role: "MEMBER" | "ADMIN";
    status: "PENDING";
    expiresAt: string | null;
    createdAt: string;
};

export type WorkspaceInvitationCreateResult = {
    id: number;
    workspaceId: number;
    invitedEmail: string;
    invitedUserId: number | null;
    invitedByUserId: number | null;
    role: "MEMBER" | "ADMIN";
    token: string;
    status: InvitationStatus;
    expiresAt: string | null;
    createdAt: string;
    acceptedAt: string | null;
};

export type ServerWorkspaceInvitationAcceptResult = {
    invitation_id: number;
    workspace_id: number;
    user_id: number;
    role: WorkspaceRole;
    status: InvitationStatus;
};

export type WorkspaceInvitationAcceptResult = {
    invitationId: number;
    workspaceId: number;
    userId: number;
    role: "MEMBER" | "ADMIN";
    status: "ACCEPTED";
};

export type ServerWorkspaceInvitationRejectResult = {
    invitation_id: number;
    status: InvitationStatus;
};

export type WorkspaceInvitationRejectResult = {
    invitationId: number;
    status: "REJECTED";
};

export type InviteWorkspaceRequest = {
    email: string;
    role: "MEMBER" | "ADMIN";
};

export type WorkspaceResponse = {
    id: number;
    name: string;
    owner_user_id: number;
    my_role: WorkspaceRole;
    canInviteMember: boolean;
    created_at: string;
};

/**
 * GET /workspaces/{workspace_id}/members 응답 항목 (서버 원형)
 */
export type ServerWorkspaceMember = {
    id: number;
    workspace_id: number;
    user_id: number;
    name: string;
    email: string;
    role: WorkspaceRole;
    created_at: string;
};

/**
 * 화면에서 사용하는 워크스페이스 멤버 정보
 */
export type WorkspaceMember = {
    id: number;
    workspaceId: number;
    userId: number;
    name: string;
    email: string;
    role: WorkspaceRole;
    createdAt: string;
};

export type CreateWorkspaceRequest = {
    name: string;
};
