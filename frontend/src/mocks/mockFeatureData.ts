import type {
  DecisionItem,
  DocumentFile,
  Meeting,
  RediscussAlert,
} from "../types/meeting.types";

/**
 * mock 문서 데이터
 *
 * 기능:
 * - 대시보드 최근 문서
 * - 회의 상세 관련 파일
 * - 파일 클릭 이벤트 테스트용
 *
 * 나중에 변경될 값:
 * - 문서 목록 API 응답값
 * - 파일 업로드 API 응답값
 */
export const mockDocuments: DocumentFile[] = [
  {
    id: "doc-001",
    name: "회의 기획서.pdf",
    fileExt: "pdf",
    uploadedAt: "2026-05-13T10:00:00",
    status: "completed",
  },
  {
    id: "doc-002",
    name: "기능정의.txt",
    fileExt: "txt",
    uploadedAt: "2026-05-13T11:00:00",
    status: "uploaded",
  },
];

/**
 * mock 재논의 알림 데이터
 *
 * 기능:
 * - 재논의 알림 카드 표시
 * - 알림 클릭 / 비교하기 이벤트 테스트용
 *
 * 나중에 변경될 값:
 * - WebSocket 재논의 감지 이벤트
 * - 알림 API 응답값
 */
export const mockAlerts: RediscussAlert[] = [
  {
    id: "alert-001",
    title: "이전 회의와 유사한 안건 감지",
    message: "이미 논의된 안건과 유사도가 높습니다.",
    previousMeetingId: "meeting-001",
    previousMeetingTitle: "이전 기획 회의",
    similarityScore: 87,
    severity: "high",
    isRead: false,
  },
];

/**
 * mock 의사결정 데이터
 *
 * 기능:
 * - 의사결정 목록 표시
 * - 필터 / 상세 패널 / 상태 변경 이벤트 테스트용
 *
 * 나중에 변경될 값:
 * - 의사결정 API 응답값
 * - AI 안건 추출 결과
 */
export const mockDecisions: DecisionItem[] = [
  {
    id: "decision-001",
    title: "회의록 자동 요약 기능 적용",
    content: "회의 종료 후 AI가 자동으로 요약본을 생성한다.",
    status: "APPROVED",
    priority: "high",
    assigneeName: "유수민",
    dueDate: "2026-05-20",
    relatedMeetingId: "mock",
  },
  {
    id: "decision-002",
    title: "재논의 감지 알림 방식 결정",
    content: "팝업 알림과 TTS 알림 중 기본 방식을 정해야 한다.",
    status: "DISCUSSING",
    priority: "medium",
    assigneeName: "윤여민",
    dueDate: "2026-05-22",
    relatedMeetingId: "mock",
  },
];

/**
 * mock 회의 상세 데이터
 *
 * 기능:
 * - 회의 후/회의록 상세 화면 표시용
 *
 * 나중에 변경될 값:
 * - 회의 상세 API 응답값
 */
export const mockMeetingDetail: Meeting = {
  id: 1,
  title: "AI 회의 협업 테스트 회의",
  status: "completed",
  startTime: "2026-05-13T10:00:00",
  endTime: "2026-05-13T11:00:00",
  duration: "01:00:00",
  participantCount: 3,
  participants: [],
  decisionCount: 2,
  rediscussCount: 1,
};
