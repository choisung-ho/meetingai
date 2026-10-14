import { useNavigate, useParams } from "react-router-dom";

import { MeetingDetailPage } from "../pages/MeetingDetailPage";
import {
  mockAlerts,
  mockDecisions,
  mockDocuments,
  mockMeetingDetail,
} from "../mocks/mockFeatureData";

/**
 * 회의 상세/회의 후 화면 기능 Container
 *
 * 기능:
 * - 회의 상세 화면에 mock 회의록/안건/알림/파일 데이터 전달
 * - 회의 상세 관련 actions 제공
 *
 * UI 담당 사용 방식:
 * - meeting, decisions, alerts, documents는 화면 표시
 * - actions는 버튼/카드 클릭에 연결
 */
export function MeetingDetailContainer() {
  const navigate = useNavigate();
  const { meetingId } = useParams();

  const numericMeetingId = Number(meetingId ?? 0);

  /**
   * 대시보드로 이동
   */
  const handleBackDashboard = () => {
    navigate("/dashboard");
  };

  /**
   * 회의중 화면으로 이동
   *
   * 현재 기능:
   * - 현재 meetingId 기준으로 live 화면 이동
   *
   * 나중:
   * - 실제 회의 재입장/이어보기 기능과 연결 가능
   */
  const handleOpenLiveMeeting = () => {
    navigate(`/meeting/live/${meetingId ?? "mock"}`);
  };

  /**
   * 의사결정 상세 이동
   *
   * 현재 기능:
   * - decisions 페이지로 이동만 처리
   *
   * 나중:
   * - 특정 decisionId 선택 상태까지 전달 가능
   */
  const handleOpenDecision = (decisionId: string) => {
    void decisionId;
    navigate("/decisions");
  };

  /**
   * 재논의 알림 열기
   *
   * 현재 기능:
   * - console 확인용
   *
   * 나중:
   * - 재논의 비교 모달 또는 상세 페이지 연결
   */
  const handleOpenAlert = (alertId: string) => {
    void alertId;
  };

  /**
   * 관련 파일 열기
   *
   * 현재 기능:
   * - console 확인용
   *
   * 나중:
   * - 파일 다운로드/미리보기 API 연결
   */
  const handleOpenFile = (fileId: string) => {
    void fileId;
  };

  /**
   * 회의록 공유
   *
   * 현재 기능:
   * - console 확인용
   *
   * 나중:
   * - 공유 링크 생성 API 연결
   */
  const handleShareMeeting = () => undefined;

  /**
   * 회의록 다운로드
   *
   * 현재 기능:
   * - console 확인용
   *
   * 나중:
   * - 다운로드 API 연결
   */
  const handleDownloadMeeting = () => undefined;


  return (
    <MeetingDetailPage
      meeting={{
        ...mockMeetingDetail,
        id: numericMeetingId,
      }}
      decisions={mockDecisions}
      alerts={mockAlerts}
      documents={mockDocuments}
      actions={{
        backDashboard: handleBackDashboard,
        openLiveMeeting: handleOpenLiveMeeting,
        openDecision: handleOpenDecision,
        openAlert: handleOpenAlert,
        openFile: handleOpenFile,
        shareMeeting: handleShareMeeting,
        downloadMeeting: handleDownloadMeeting,
      }}
    />
  );
}
