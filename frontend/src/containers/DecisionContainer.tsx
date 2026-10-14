import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DecisionPage } from "../pages/DecisionPage";
import { useSocketContext } from "../app/providers/SocketProvider";
import type {
  DecisionFilter,
  DecisionItem,
  Issue,
  IssueState,
  Priority,
} from "../types/meeting.types";

function mapIssueStatus(status: Issue["status"]): IssueState {
  if (status === "CLOSED") return "EXECUTED";
  if (status === "IN_PROGRESS") return "DISCUSSING";
  return "PROPOSED";
}

function mapIssuePriority(priority: Issue["priority"]): Priority {
  if (priority === "HIGH") return "high";
  if (priority === "LOW") return "low";
  return "medium";
}

function mapDecisionStatusToIssueStatus(status: IssueState): "OPEN" | "IN_PROGRESS" | "CLOSED" {
  if (status === "DISCUSSING") return "IN_PROGRESS";
  if (status === "APPROVED" || status === "EXECUTED") return "CLOSED";
  return "OPEN";
}

function mapPriorityToIssuePriority(priority: Priority): "LOW" | "MEDIUM" | "HIGH" {
  return priority.toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
}

function mapIssueToDecision(issue: Issue): DecisionItem {
  return {
    id: String(issue.id),
    title: issue.title,
    content: issue.description ?? "",
    status: mapIssueStatus(issue.status),
    priority: mapIssuePriority(issue.priority),
    dueDate: issue.dueDate ?? undefined,
    relatedMeetingId: String(issue.meetingId),
  };
}

/**
 * 의사결정 화면 기능 Container
 *
 * 기능:
 * - 의사결정 목록 mock 데이터 전달
 * - 필터 상태 관리
 * - 안건 선택 상태 관리
 * - actions 제공
 *
 * UI 담당 사용 방식:
 * - decisions, filter, selectedDecisionId는 화면 표시
 * - actions는 검색/필터/행 클릭/초기화 버튼에 연결
 */
export function DecisionContainer() {
  const navigate = useNavigate();
  const socket = useSocketContext();
  const requestedWorkspaceIdRef = useRef<number | null>(null);
  const currentWorkspaceId = socket.workspace.workspaceId;
  const decisions = useMemo(
    () => socket.allIssues.map(mapIssueToDecision),
    [socket.allIssues]
  );

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (!socket.isUserRegistered) return;
    if (socket.workspace.status !== "joined") return;
    if (requestedWorkspaceIdRef.current === currentWorkspaceId) return;

    requestedWorkspaceIdRef.current = currentWorkspaceId;
    socket.actions.getAllIssues(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    socket.actions,
    socket.isUserRegistered,
    socket.workspace.status,
  ]);

  /**
   * 현재 의사결정 필터 상태
   *
   * 현재:
   * - 클라이언트 내부 상태
   *
   * 나중:
   * - URL query
   * - API request parameter
   * - decisionStore
   * 로 확장 가능
   */
  const [filter, setFilter] = useState<DecisionFilter>({
    keyword: "",
    status: "ALL",
    priority: "ALL",
  });

  /**
   * 현재 선택된 의사결정 ID
   *
   * 현재:
   * - 상세 패널 표시용 상태
   *
   * 나중:
   * - 상세 API 조회 기준 ID로 사용 가능
   */
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(
    null
  );

  /**
   * 의사결정 검색
   *
   * 현재:
   * - keyword 상태만 변경
   *
   * 나중:
   * - API 검색 파라미터로 전달
   */
  const handleSearchDecision = (keyword: string) => {
    setFilter((prev) => ({
      ...prev,
      keyword,
    }));
  };

  /**
   * 필터 변경
   *
   * 현재:
   * - 클라이언트 필터 상태만 변경
   *
   * 나중:
   * - 서버 필터 API 요청으로 교체 가능
   */
  const handleChangeFilter = (nextFilter: Partial<DecisionFilter>) => {
    setFilter((prev) => ({
      ...prev,
      ...nextFilter,
    }));
  };

  /**
   * 필터 초기화
   */
  const handleResetFilter = () => {
    setFilter({
      keyword: "",
      status: "ALL",
      priority: "ALL",
    });
  };

  /**
   * 의사결정 행 클릭
   *
   * 현재:
   * - 선택 ID만 저장
   *
   * 나중:
   * - 상세 패널 API 조회 가능
   */
  const handleSelectDecision = (decisionId: string) => {
    setSelectedDecisionId(decisionId);
  };

  /**
   * 상세 패널 닫기
   */
  const handleCloseDetail = () => {
    setSelectedDecisionId(null);
  };

  /**
   * 안건 상태 변경
   *
   * 현재:
   * - console 확인용
   *
   * 나중:
   * - decision status update API 연결
   */
  const handleChangeDecisionStatus = (
    decisionId: string,
    status: IssueState
  ) => {
    const issue = socket.allIssues.find((item) => String(item.id) === String(decisionId));
    if (!issue || !currentWorkspaceId) return;

    socket.actions.changeIssueState({
      workspaceId: Number(issue.workspaceId ?? currentWorkspaceId),
      meetingId: Number(issue.meetingId),
      meetingRoomId: Number(socket.meetingRoom.meetingRoomId ?? 1),
      issueId: Number(issue.id),
      toState: mapDecisionStatusToIssueStatus(status),
      reason: "의사결정 화면에서 상태 변경",
      evidence: "사용자가 의사결정 목록에서 상태를 변경함",
    });
  };

  /**
   * 우선순위 변경
   *
   * 현재:
   * - console 확인용
   *
   * 나중:
   * - priority update API 연결
   */
  const handleChangePriority = (decisionId: string, priority: Priority) => {
    const issue = socket.allIssues.find((item) => String(item.id) === String(decisionId));
    if (!issue || !currentWorkspaceId) return;

    socket.actions.updateIssue({
      workspaceId: Number(issue.workspaceId ?? currentWorkspaceId),
      meetingId: Number(issue.meetingId),
      meetingRoomId: Number(socket.meetingRoom.meetingRoomId ?? 1),
      issueId: Number(issue.id),
      title: issue.title,
      description: issue.description ?? null,
      priority: mapPriorityToIssuePriority(priority),
      dueDate: issue.dueDate ?? null,
      assigneeId: issue.assigneeId ?? null,
    });
  };

  /**
   * 관련 회의 이동
   */
  const handleOpenRelatedMeeting = (meetingId: string) => {
    navigate(`/meetings/${meetingId}`);
  };

  /**
   * 대시보드 이동
   */
  const handleBackDashboard = () => {
    navigate("/dashboard");
  };

  return (
    <DecisionPage
      decisions={decisions}
      filter={filter}
      selectedDecisionId={selectedDecisionId}
      actions={{
        searchDecision: handleSearchDecision,
        changeFilter: handleChangeFilter,
        resetFilter: handleResetFilter,
        selectDecision: handleSelectDecision,
        closeDetail: handleCloseDetail,
        changeDecisionStatus: handleChangeDecisionStatus,
        changePriority: handleChangePriority,
        openRelatedMeeting: handleOpenRelatedMeeting,
        backDashboard: handleBackDashboard,
      }}
    />
  );
}
