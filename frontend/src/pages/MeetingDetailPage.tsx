import type { MeetingDetailPageProps } from "../types/meeting.types";

/**
 * 임시 회의 상세 Page
 *
 * 기능:
 * - MeetingDetailContainer에서 받은 mock 데이터/actions 연결 확인용
 *
 * 주의:
 * - 최종 UI 디자인 파일 아님
 * - 윤여민 UI 작업 시 교체 가능
 */
export function MeetingDetailPage({
  meeting,
  decisions,
  alerts,
  documents,
  actions,
}: MeetingDetailPageProps) {
  return (
    <div>
      <h1>{meeting.title}</h1>

      <button onClick={actions.backDashboard}>대시보드</button>
      <button onClick={actions.openLiveMeeting}>회의중 화면</button>
      <button onClick={actions.shareMeeting}>공유</button>
      <button onClick={actions.downloadMeeting}>다운로드</button>

      <section>
        <h2>의사결정</h2>
        {decisions.map((decision) => (
          <button
            key={decision.id}
            onClick={() => actions.openDecision(decision.id)}
          >
            {decision.title}
          </button>
        ))}
      </section>

      <section>
        <h2>재논의 알림</h2>
        {alerts.map((alert) => (
          <button key={alert.id} onClick={() => actions.openAlert(alert.id)}>
            {alert.title}
          </button>
        ))}
      </section>

      <section>
        <h2>관련 파일</h2>
        {documents.map((document) => (
          <button
            key={document.id}
            onClick={() => actions.openFile(document.id)}
          >
            {document.name}
          </button>
        ))}
      </section>
    </div>
  );
}