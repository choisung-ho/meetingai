// collaborationUser.types.ts

/**
 * 실시간 협업 사용자 기본 정보 타입
 * 사용 위치:
 * - Presence 상태 관리
 * - WebSocket 사용자 연결
 * - 참가자 리스트 UI
 */
export type CollaborationUser = {
    userId: string; // 사용자 고유 ID
    name?: string; // 사용자 이름
};

/**
 * 협업 사용자 접속 상태 타입
 */
export type CollaborationUserStatus =
    | "online" // 접속 중
    | "offline"; // 접속 종료

/**
 * 현재 연결 완료된 사용자 정보 타입
 * 서버 연결 이후 상태 저장용
 */
export type ConnectedCollaborationUser = {
    userId: string; // 사용자 고유 ID
    name: string | null; // 사용자 이름
    status: CollaborationUserStatus; // 현재 접속 상태
    connectedAt: string; // 연결 시간
};

/**
 * 연결 종료된 사용자 정보 타입
 */
export type DisconnectedCollaborationUser = {
    userId: string; // 사용자 고유 ID
    disconnectedAt: string; // 연결 종료 시간
};

/**
 * Presence 전체 연결 흐름 상태 타입
 * usePresence 상태 관리용
 */
export type PresenceStatus =
    | "idle" // 초기 상태
    | "connecting" // 연결 시도 중
    | "socket_connected" // 소켓 연결 완료
    | "user_registered" // 사용자 등록 완료
    | "disconnecting" // 연결 종료 중
    | "disconnected" // 연결 종료 상태
    | "error"; // 오류 상태