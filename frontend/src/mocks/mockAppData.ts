import type { Meeting, User } from "../types/meeting.types";

/**
 * 현재 mock 사용자 데이터
 *
 * 기능:
 * - 로그인 API 없이 UI에 사용자 정보를 전달하기 위한 임시 데이터
 *
 * 나중에 변경될 값:
 * - 실제 로그인 API 응답값
 * - authStore의 user 상태값
 * - JWT 검증 후 받은 사용자 정보
 */
export const mockUser: User = {
  id: "user-001",
  name: "고라니",
  email: "goralani@example.com",
  role: "member",
  teamName: "Frontend",
};

/**
 * 현재 mock 회의 목록 데이터
 *
 * 기능:
 * - 대시보드에서 회의 목록 UI를 확인하기 위한 임시 데이터
 *
 * 나중에 변경될 값:
 * - 대시보드 회의 목록 API 응답값
 * - 최근 회의 목록 API 응답값
 */
export const mockMeetings: Meeting[] = [
  {
    id: 1,
    title: "AI 회의 협업 테스트 회의",
    status: "ready",
    startTime: "2026-05-13T10:00:00",
    participantCount: 3,
    participants: [],
    decisionCount: 0,
    rediscussCount: 0,
  },
];
