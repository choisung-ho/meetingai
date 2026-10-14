// meetingRoom.types.ts

import type { WorkspaceRole, WorkspaceUserStatus } from "./workspace.types";

/**
 * 회의실 참가 사용자 정보 타입
 * 서버의 MEETING_ROOM_USERS_UPDATED payload.users 원소와 동일한 구조입니다.
 */
export type MeetingRoomUser = {
    userId: string; // 사용자 고유 ID
    name: string; // 사용자 이름
    email?: string;
    role?: WorkspaceRole;
    status: WorkspaceUserStatus; // 현재 접속 상태
    joinedAt?: string;
    lastSeenAt?: string;
};

// 서버의 MEETING_ROOM_USERS_UPDATED 응답에서 users가
// ["user-001", "user-002"] 처럼 string 배열로 올 수도 있고,
// [{ userId, name, status }] 형태로 올 수도 있어서 둘 다 허용하는 타입
export type RawMeetingRoomUser = MeetingRoomUser;

/**
 * 회의실 연결 상태 흐름 타입
 */
export type MeetingRoomConnectionStatus =
    | "idle" // 초기 상태
    | "joining" // 회의실 참가 요청 중
    | "joined" // 회의실 참가 완료
    | "leaving" // 회의실 퇴장 요청 중
    | "left" // 회의실 퇴장 완료
    | "error"; // 오류 상태

/**
 * 회의실 참가 요청 payload
 * 클라이언트 → 서버 전송
 */
export type JoinMeetingRoomPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
};

/**
 * 회의실 퇴장 요청 payload
 * 클라이언트 → 서버 전송
 */
export type LeaveMeetingRoomPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
};

/**
 * 회의실 참가 성공 ACK payload
 * 서버 → 클라이언트 응답
 */
export type JoinMeetingRoomAckPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  userId: string;
  joinedAt: string;
};
/**
 * 회의실 퇴장 성공 ACK payload
 * 서버 → 클라이언트 응답
 */
export type LeaveMeetingRoomAckPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  userId: string;
  leftAt: string;
};

/**
 * 회의실 참가자 목록 갱신 payload
 * 서버 → 클라이언트 브로드캐스트
 */
export type MeetingRoomUsersUpdatedPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  users: MeetingRoomUser[];
  updatedAt: string;
};
