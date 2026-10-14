import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useSocketContext } from "../app/providers/SocketProvider";
import { MeetingRecordDetailPage } from "../pages/MeetingRecordDetailPage";
import {
  getAudioUtterances,
  type AudioUtterance,
} from "../services/audioService";
import {
  getAiAnalysis,
  requestAiReanalysis,
} from "../services/aiAnalysisService";
import { updateSttResult } from "../services/sttResultService";
import { getWorkspace } from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";
import { useDocumentStore } from "../store/documentStore";
import type { AiAnalysis } from "../types/transcript.types";

export function MeetingRecordDetailContainer() {
  const navigate = useNavigate();
  const { meetingId: meetingIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const socket = useSocketContext();
  const authUser = useAuthStore((state) => state.user);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({});
  const [utterances, setUtterances] = useState<AudioUtterance[]>([]);
  const [utteranceErrorMessage, setUtteranceErrorMessage] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
  const [isAiAnalysisLoading, setIsAiAnalysisLoading] = useState(false);
  const [aiAnalysisErrorMessage, setAiAnalysisErrorMessage] = useState<string | null>(null);
  const requestedMeetingRef = useRef<string | null>(null);
  const documents = useDocumentStore((state) => state.documents);
  const getSttResultsAction = socket.actions.getSttResults;
  const getSttResultAction = socket.actions.getSttResult;
  const deleteSttResultAction = socket.actions.deleteSttResult;
  const getIssuesAction = socket.actions.getIssues;
  const getDocumentsAction = socket.actions.getDocuments;
  const getAlertsAction = socket.actions.getAlerts;

  const routeWorkspaceId = Number(searchParams.get("workspaceId"));
  const meetingId = Number(meetingIdParam);
  const routeMeetingRoomId = Number(searchParams.get("meetingRoomId"));
  const storedWorkspaceId = Number(localStorage.getItem("lastWorkspaceId"));
  const workspaceId =
    Number.isFinite(routeWorkspaceId) && routeWorkspaceId > 0
      ? routeWorkspaceId
      : socket.workspace.workspaceId ??
        (Number.isFinite(storedWorkspaceId) && storedWorkspaceId > 0
          ? storedWorkspaceId
          : NaN);
  const meetingRoomId =
    Number.isFinite(routeMeetingRoomId) && routeMeetingRoomId > 0
      ? routeMeetingRoomId
      : socket.meetingRoom.meetingRoomId ?? 1;
  const hasIds =
    Number.isFinite(workspaceId) &&
    workspaceId > 0 &&
    Number.isFinite(meetingId) &&
    meetingId > 0 &&
    Number.isFinite(meetingRoomId) &&
    meetingRoomId > 0;

  const meeting = useMemo(
    () =>
      socket.meeting.meetings.find((item) => Number(item.id) === meetingId) ??
      (Number(socket.meeting.lastFetchedMeeting?.id) === meetingId
        ? socket.meeting.lastFetchedMeeting
        : null),
    [meetingId, socket.meeting.lastFetchedMeeting, socket.meeting.meetings]
  );

  const meetingDocuments = useMemo(
    () => documents.filter((document) => Number(document.meetingId) === meetingId),
    [documents, meetingId]
  );

  const meetingIssues = useMemo(
    () => socket.issues.filter((issue) => Number(issue.meetingId) === meetingId),
    [meetingId, socket.issues]
  );

  const meetingAlerts = useMemo(
    () => socket.alerts.items.filter((alert) => Number(alert.meetingId) === meetingId),
    [meetingId, socket.alerts.items]
  );

  const filteredSttResults = useMemo(
    () =>
      socket.sttResult.items.filter(
        (item) => item.meetingId == null || Number(item.meetingId) === meetingId
      ),
    [meetingId, socket.sttResult.items]
  );

  const participantCount =
    socket.meetingRoom.users.length > 0
      ? socket.meetingRoom.users.length
      : socket.workspace.users.length;

  useEffect(() => {
    console.log("[MEETING_RECORD_DETAIL:INIT]", {
      workspaceId: Number.isFinite(workspaceId) ? workspaceId : null,
      meetingId: Number.isFinite(meetingId) ? meetingId : null,
      meetingRoomId: Number.isFinite(meetingRoomId) ? meetingRoomId : null,
    });
  }, [meetingId, meetingRoomId, workspaceId]);

  useEffect(() => {
    if (!hasIds) {
      console.warn("[GET_STT_RESULTS:BLOCKED]", "missing route params");
      return;
    }

    if (!socket.isSocketConnected) {
      console.warn("[GET_STT_RESULTS:BLOCKED]", "socket not connected");
      return;
    }

    getSttResultsAction(workspaceId, meetingId, meetingRoomId);
    getIssuesAction(workspaceId, meetingId, meetingRoomId);
    getDocumentsAction(workspaceId, meetingId, meetingRoomId);
    console.log("[MEETING_RECORD_DETAIL:GET_ALERTS]", {
      workspaceId,
      meetingId,
      meetingRoomId,
    });
    getAlertsAction({ workspaceId, meetingId, meetingRoomId });
  }, [
    getDocumentsAction,
    getAlertsAction,
    getIssuesAction,
    getSttResultsAction,
    hasIds,
    socket.isSocketConnected,
    meetingId,
    meetingRoomId,
    workspaceId,
  ]);

  useEffect(() => {
    const sttResultIds = filteredSttResults
      .map((item) => Number(item.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    let ignore = false;

    if (sttResultIds.length === 0) {
      const resetTimer = window.setTimeout(() => {
        if (ignore) return;
        setUtterances([]);
        setUtteranceErrorMessage(null);
      }, 0);

      return () => {
        ignore = true;
        window.clearTimeout(resetTimer);
      };
    }

    const requestTimer = window.setTimeout(() => {
      if (ignore) return;
      setUtteranceErrorMessage(null);

      void Promise.all(sttResultIds.map((sttResultId) => getAudioUtterances(sttResultId)))
        .then((results) => {
          if (ignore) return;
          setUtterances(
            results
              .flat()
              .sort((a, b) =>
                a.stt_result_id - b.stt_result_id || a.sequence - b.sequence
              )
          );
        })
        .catch((error) => {
          if (ignore) return;
          setUtterances([]);
          setUtteranceErrorMessage(
            error instanceof Error ? error.message : "화자별 발화를 불러오지 못했습니다."
          );
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(requestTimer);
    };
  }, [filteredSttResults]);

  useEffect(() => {
    if (!hasIds || !socket.isSocketConnected) return;

    let ignore = false;
    const requestTimer = window.setTimeout(() => {
      if (ignore) return;
      setIsAiAnalysisLoading(true);
      setAiAnalysisErrorMessage(null);

      void getAiAnalysis(workspaceId, meetingId)
        .then((analysis) => {
          if (!ignore) setAiAnalysis(analysis);
        })
        .catch((error) => {
          if (ignore) return;
          setAiAnalysis(null);
          setAiAnalysisErrorMessage(
            error instanceof Error ? error.message : "AI 분석 결과를 불러오지 못했습니다."
          );
        })
        .finally(() => {
          if (!ignore) setIsAiAnalysisLoading(false);
        });
    }, 0);

    return () => {
      ignore = true;
      window.clearTimeout(requestTimer);
    };
  }, [hasIds, meetingId, socket.isSocketConnected, workspaceId]);

  useEffect(() => {
    if (!hasIds || !socket.isSocketConnected || meeting) return;
    const requestKey = `${workspaceId}-${meetingId}`;
    if (requestedMeetingRef.current === requestKey) return;
    requestedMeetingRef.current = requestKey;
    socket.actions.getMeeting(workspaceId, meetingId);
  }, [hasIds, meeting, meetingId, socket.actions, socket.isSocketConnected, workspaceId]);

  useEffect(() => {
    if (!hasIds) return;
    if (!socket.isSocketConnected) return;
    if (!socket.sttResult.lastCreated) return;

    getSttResultsAction(workspaceId, meetingId, meetingRoomId);
  }, [
    getSttResultsAction,
    hasIds,
    meetingId,
    meetingRoomId,
    socket.isSocketConnected,
    socket.sttResult.lastCreated,
    workspaceId,
  ]);

  useEffect(() => {
    let ignore = false;

    const loadWorkspaceName = async () => {
      if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
        setWorkspaceName(null);
        return;
      }

      try {
        const workspace = await getWorkspace(workspaceId);
        if (ignore) return;
        setWorkspaceName(workspace.name?.trim() || null);
      } catch (error) {
        if (ignore) return;
        console.warn("[MEETING_RECORD_DETAIL:WORKSPACE_NAME_FAILED]", {
          workspaceId,
          error,
        });
        setWorkspaceName(null);
      }
    };

    loadWorkspaceName();

    return () => {
      ignore = true;
    };
  }, [workspaceId]);

  const backToList = () => {
    navigate(`/dashboard?workspaceId=${Number.isFinite(workspaceId) ? workspaceId : ""}&menu=menu-2`);
  };

  const openDashboardMenu = (menuId: string) => {
    if (menuId === "menu-8") {
      navigate("/settings");
      return;
    }

    const targetWorkspaceId = Number.isFinite(workspaceId) ? workspaceId : "";
    const menuParam = menuId === "menu-1" ? "" : `&menu=${menuId}`;
    navigate(`/dashboard?workspaceId=${targetWorkspaceId}${menuParam}`);
  };

  const openSettings = () => {
    navigate("/settings");
  };

  const switchWorkspace = (workspaceIdValue: string) => {
    const nextWorkspaceId = Number(workspaceIdValue);
    if (!Number.isFinite(nextWorkspaceId) || nextWorkspaceId <= 0) return;
    navigate(`/dashboard?workspaceId=${nextWorkspaceId}&menu=menu-2`);
  };

  const openMeeting = (targetMeetingId: string) => {
    const nextMeetingId = Number(targetMeetingId);
    if (!Number.isFinite(nextMeetingId) || nextMeetingId <= 0) return;
    navigate(`/meeting-records/${nextMeetingId}?workspaceId=${Number.isFinite(workspaceId) ? workspaceId : ""}&meetingRoomId=${Number.isFinite(meetingRoomId) ? meetingRoomId : 1}`);
  };

  const openSttResult = (sttResultId: number) => {
    if (!hasIds) {
      console.warn("[GET_STT_RESULT:BLOCKED]", "missing route params");
      return;
    }

    getSttResultAction(workspaceId, meetingId, meetingRoomId, sttResultId);
  };

  const deleteSttResult = (sttResultId: number) => {
    if (!hasIds) {
      console.warn("[DELETE_STT_RESULT:BLOCKED]", "missing route params");
      return;
    }

    deleteSttResultAction(workspaceId, meetingId, meetingRoomId, sttResultId);
  };

  const editSttResult = async (params: {
    sttResultId: number;
    language: string;
    rawText: string;
    status: string;
  }) => {
    const result = await updateSttResult(params);
    console.log("[STT_RESULT:UPDATED]", result);
    if (hasIds) {
      console.log("[STT_RESULT:REFETCH_AFTER_UPDATE]", {
        workspaceId,
        meetingId,
        meetingRoomId,
        sttResultId: result.id,
      });
      getSttResultsAction(workspaceId, meetingId, meetingRoomId);
    }
    return result;
  };

  const reAnalyze = async () => {
    if (!hasIds) return;

    setIsAiAnalysisLoading(true);
    setAiAnalysisErrorMessage(null);
    try {
      await requestAiReanalysis(workspaceId, meetingId);
      // The API accepts the request and runs the LLM in a background task.
      // Poll briefly so the detail screen reflects the completed result without
      // requiring a manual refresh. A missing result during the window is not
      // treated as an API error because the worker may still be running.
      let analysis: AiAnalysis | null = null;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (attempt > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }

        analysis = await getAiAnalysis(workspaceId, meetingId);
        if (analysis) break;
      }

      setAiAnalysis(analysis);
      if (!analysis) {
        setAiAnalysisErrorMessage('분석 요청이 접수되었습니다. 결과 생성에 시간이 걸릴 수 있습니다.');
      }
    } catch (error) {
      setAiAnalysisErrorMessage(
        error instanceof Error ? error.message : "AI 재분석 요청에 실패했습니다."
      );
    } finally {
      setIsAiAnalysisLoading(false);
    }
  };

  const logout = () => {
    if (Number.isFinite(workspaceId) && workspaceId > 0) {
      socket.actions.leaveWorkspace(workspaceId);
    }

    socket.actions.disconnect();
    socket.actions.clearWorkspaceData();
    clearAuth();
    navigate("/login");
  };

  const togglePage = (pageId: string) => {
    setExpandedPages((current) => ({ ...current, [pageId]: !(current[pageId] ?? true) }));
  };

  const addPage = () => {
    navigate(`/dashboard?workspaceId=${Number.isFinite(workspaceId) ? workspaceId : ""}`);
  };

  const updateIssueStatus = (issueId: number, status: "IN_PROGRESS" | "CLOSED") => {
    if (!hasIds) return;
    socket.actions.changeIssueState({
      workspaceId,
      meetingId,
      meetingRoomId,
      issueId,
      toState: status,
      reason: "회의록 상세 화면에서 상태 변경",
      evidence: "사용자가 회의록 상세 화면에서 상태를 변경함",
    });
  };

  const updateIssue = (issueId: number, values: { title: string; description: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | null; dueDate: string | null; assigneeId: number | null }) => {
    if (!hasIds) return;
    socket.actions.updateIssue({
      workspaceId,
      meetingId,
      meetingRoomId,
      issueId,
      title: values.title,
      description: values.description,
      priority: values.priority,
      dueDate: values.dueDate,
      assigneeId: values.assigneeId,
    });
  };

  const deleteIssue = (issueId: number) => {
    if (!hasIds) return;
    socket.actions.deleteIssue({ workspaceId, meetingId, meetingRoomId, issueId });
  };

  console.log("[MEETING_RECORD_DETAIL:STT_PROPS]", {
    routeMeetingId: meetingId,
    totalCount: socket.sttResult.items.length,
    filteredCount: filteredSttResults.length,
    items: socket.sttResult.items,
  });

  console.log("[MEETING_RECORD_DETAIL:REDISCUSS_ALERTS]", {
    meetingId,
    totalCount: socket.alerts.items.length,
    filteredCount: meetingAlerts.length,
    alerts: meetingAlerts,
  });

  const workspaceDisplayName = workspaceName ?? "-";
  const meetingMenuItems = socket.meeting.meetings.map((item) => ({
    id: String(item.id),
    title: item.title || `회의 ${item.id}`,
    icon: "/assets/icons/file-text.png",
    isActive: Number(item.id) === meetingId,
  }));

  return (
    <MeetingRecordDetailPage
      record={{
        meetingId: Number.isFinite(meetingId) ? meetingId : 0,
        workspaceId: Number.isFinite(workspaceId) ? workspaceId : null,
        meetingRoomId: Number.isFinite(meetingRoomId) ? meetingRoomId : null,
        meeting,
        sttResults: filteredSttResults,
        utterances,
        utteranceErrorMessage,
        selectedSttResult: socket.sttResult.selected,
        issues: meetingIssues,
        alerts: meetingAlerts,
        documents: meetingDocuments,
        participantCount,
        aiAnalysis,
        isAiAnalysisLoading,
        aiAnalysisErrorMessage,
      }}
      sidebar={{
        user: {
          id: String(socket.currentUser?.userId ?? authUser?.userId ?? "me"),
          name: authUser?.userName ?? authUser?.name ?? socket.currentUser?.name ?? "사용자",
          email: authUser?.email ?? "",
          role: "MEMBER",
          teamName: "",
        },
        navigation: {
          mainMenu: [
            { id: "menu-1", title: "대시보드", icon: "/assets/icons/home.png" },
            { id: "menu-2", title: "회의록", icon: "/assets/icons/file-text.png", badge: socket.meeting.meetings.length || undefined },
            { id: "menu-3", title: "안건 관리", icon: "/assets/icons/list-check.png" },
            { id: "menu-4", title: "재논의 알림", icon: "/assets/icons/bell.png" },
            { id: "menu-5", title: "문서 분석", icon: "/assets/icons/file-search.png" },
            { id: "menu-6", title: "캘린더", icon: "/assets/icons/calendar.png" },
            { id: "menu-7", title: "보고서", icon: "/assets/icons/chart.png" },
            { id: "menu-8", title: "설정", icon: "/assets/icons/settings.png" },
          ],
          weeklyMeeting: {
            id: "weekly-meetings",
            title: "주간 회의",
            icon: "/assets/icons/folder.png",
            isExpanded: expandedPages["weekly-meetings"] ?? true,
            subPages: meetingMenuItems,
          },
        },
        workspaces: {
          available: Number.isFinite(workspaceId)
            ? [{ id: String(workspaceId), name: workspaceDisplayName, icon: "/assets/icons/workspace.png" }]
            : [],
          current: {
            id: Number.isFinite(workspaceId) ? String(workspaceId) : "",
            name: workspaceDisplayName,
            icon: "/assets/icons/workspace.png",
          },
        },
      }}
      actions={{
        backToList,
        openDashboardMenu,
        openSettings,
        switchWorkspace,
        togglePage,
        addPage,
        openMeeting,
        openSttResult,
        deleteSttResult,
        editSttResult,
        reAnalyze,
        updateIssueStatus,
        updateIssue,
        deleteIssue,
        logout,
      }}
    />
  );
}
