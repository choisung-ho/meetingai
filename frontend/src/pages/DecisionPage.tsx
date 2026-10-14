import type { DecisionPageProps } from "../types/meeting.types";

/**
 * 임시 의사결정 Page
 *
 * 기능:
 * - DecisionContainer에서 받은 filter, selectedDecisionId, actions 확인용
 *
 * 주의:
 * - 최종 UI 디자인 파일 아님
 * - 윤여민 UI 작업 시 교체 가능
 */
export function DecisionPage({
  decisions,
  filter,
  selectedDecisionId,
  actions,
}: DecisionPageProps) {
  return (
    <div>
      <h1>의사결정</h1>

      <button onClick={actions.backDashboard}>대시보드</button>
      <button onClick={actions.resetFilter}>필터 초기화</button>

      <input
        value={filter.keyword}
        onChange={(event) => actions.searchDecision(event.target.value)}
        placeholder="안건 검색"
      />

      <button onClick={() => actions.changeFilter({ status: "APPROVED" })}>
        승인만 보기
      </button>

      <button onClick={() => actions.changeFilter({ priority: "high" })}>
        중요도 높음
      </button>

      <section>
        {decisions.map((decision) => (
          <div key={decision.id}>
            <button onClick={() => actions.selectDecision(decision.id)}>
              {decision.title}
            </button>

            <button
              onClick={() =>
                actions.changeDecisionStatus(decision.id, "EXECUTED")
              }
            >
              실행 처리
            </button>

            <button
              onClick={() => actions.changePriority(decision.id, "high")}
            >
              중요도 높음
            </button>

            {decision.relatedMeetingId && (
              <button
                onClick={() =>
                  actions.openRelatedMeeting(decision.relatedMeetingId!)
                }
              >
                관련 회의
              </button>
            )}
          </div>
        ))}
      </section>

      {selectedDecisionId && (
        <aside>
          <p>선택된 안건 ID: {selectedDecisionId}</p>
          <button onClick={actions.closeDetail}>닫기</button>
        </aside>
      )}
    </div>
  );
}