/**
 * Workspace / MeetingRoom 관련 데이터 타입 정의
 *
 * Input  : JOIN/LEAVE 이벤트 payload에서 추출된 식별자들
 * Output : 서비스 처리 결과 — 변경 후 참여자 목록(userId[]) 포함
 */

/** joinWorkspace 서비스 입력 */
export interface JoinWorkspaceInput {
  workspaceId: number;
  userId: string;
}

/** leaveWorkspace 서비스 입력 */
export interface LeaveWorkspaceInput {
  workspaceId: number;
  userId: string;
}

/**
 * Workspace 서비스 처리 결과
 * users: 변경 후 현재 참여자 userId 배열
 */
export interface WorkspaceServiceResult {
  workspaceId: number;
  userId: string;
  users: string[];
}

/** joinMeetingRoom 서비스 입력 */
export interface JoinMeetingRoomInput {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  userId: string;
}

/** leaveMeetingRoom 서비스 입력 */
export interface LeaveMeetingRoomInput {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  userId: string;
}

/**
 * MeetingRoom 서비스 처리 결과
 * users: 변경 후 현재 참여자 userId 배열
 */
export interface MeetingRoomServiceResult {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  userId: string;
  users: string[];
}

/** broadcastMeetingRoomUsersUpdated 입력 파라미터 */
export interface BroadcastMeetingRoomParams {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
}
