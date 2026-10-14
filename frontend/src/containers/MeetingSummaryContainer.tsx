import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useSocketContext } from "../app/providers/SocketProvider";
import { MeetingSummaryPage } from "../pages/MeetingSummaryPage";
import { getWorkspace } from "../services/workspaceService";
import { getAiAnalysis } from "../services/aiAnalysisService";
import { useAuthStore } from "../store/authStore";
import { useDocumentStore } from "../store/documentStore";
import { useTranscriptStore } from "../store/transcriptStore";
import type { Meeting } from "../pages/DashboardPage";
import type { User } from "../pages/DashboardPage";

export function MeetingSummaryContainer() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const rawWorkspaceId = params.get("workspaceId");
  const rawMeetingId = params.get("meetingId");
  const rawMeetingRoomId = params.get("meetingRoomId");

  const workspaceId =
    rawWorkspaceId !== null && rawWorkspaceId !== ""
      ? Number(rawWorkspaceId)
      : null;
  const meetingId =
    rawMeetingId !== null && rawMeetingId !== ""
      ? Number(rawMeetingId)
      : null;
  const routeMeetingRoomId =
    rawMeetingRoomId !== null && rawMeetingRoomId !== ""
      ? Number(rawMeetingRoomId)
      : null;

  const socket = useSocketContext();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const meetingRoomId = routeMeetingRoomId ?? socket.meetingRoom.meetingRoomId;
  const getAlertsRef = useRef(socket.actions.getAlerts);
  const lastAlertRequestKeyRef = useRef<string | null>(null);
  const requestedMeetingDataKeyRef = useRef<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({});
  const [aiAnalysis, setAiAnalysis] = useState<Awaited<ReturnType<typeof getAiAnalysis>>>(null);
  const [isAiAnalysisLoading, setIsAiAnalysisLoading] = useState(false);
  const [aiAnalysisErrorMessage, setAiAnalysisErrorMessage] = useState<string | null>(null);
  const documents = useDocumentStore((state) => state.documents);
  const transcriptLines = useTranscriptStore((state) => state.lines);

  useEffect(() => {
    getAlertsRef.current = socket.actions.getAlerts;
  }, [socket.actions.getAlerts]);

  useEffect(() => {
    if (!workspaceId) return;
    localStorage.setItem("lastWorkspaceId", String(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !socket.isSocketConnected) return;
    if (!socket.workspace.isWorkspaceJoined && socket.workspace.status !== "joining") {
      socket.actions.joinWorkspace(workspaceId);
    }
  }, [socket.actions, socket.isSocketConnected, socket.workspace.isWorkspaceJoined, socket.workspace.status, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !meetingId || !socket.isSocketConnected) return;
    const loadedMeeting = socket.meeting.meetings.some(
      (meeting) => Number(meeting.id) === Number(meetingId)
    );
    if (!loadedMeeting && socket.workspace.isWorkspaceJoined) {
      socket.actions.getMeetings(workspaceId);
    }
  }, [meetingId, socket.actions, socket.isSocketConnected, socket.meeting.meetings, socket.workspace.isWorkspaceJoined, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !meetingId || !meetingRoomId || !socket.isSocketConnected) return;
    if (!socket.workspace.isWorkspaceJoined || socket.workspace.status !== "joined") return;
    if (!socket.meetingRoom.isMeetingRoomJoined && socket.meetingRoom.status !== "joining") {
      socket.actions.joinMeetingRoom(workspaceId, meetingId, meetingRoomId);
    }
  }, [meetingId, meetingRoomId, socket.actions, socket.isSocketConnected, socket.meetingRoom.isMeetingRoomJoined, socket.meetingRoom.status, socket.workspace.isWorkspaceJoined, socket.workspace.status, workspaceId]);

  useEffect(() => {
    if (!workspaceId || !meetingId) return;

    let ignore = false;
    let attempts = 0;
    let timer: number | null = null;

    const loadAnalysis = async () => {
      if (ignore) return;
      attempts += 1;
      setIsAiAnalysisLoading(true);
      try {
        const result = await getAiAnalysis(workspaceId, meetingId);
        if (!ignore) {
          setAiAnalysis(result);
          setAiAnalysisErrorMessage(null);
        }
        if (result || attempts >= 15) return;
      } catch (error) {
        if (!ignore) {
          setAiAnalysisErrorMessage(error instanceof Error ? error.message : "AI 분석 결과 조회에 실패했습니다.");
        }
        return;
      } finally {
        if (!ignore) setIsAiAnalysisLoading(false);
      }

      timer = window.setTimeout(loadAnalysis, 2000);
    };

    void loadAnalysis();

    return () => {
      ignore = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [meetingId, workspaceId]);

  useEffect(() => {
    let ignore = false;

    const loadWorkspaceName = async () => {
      if (!workspaceId) {
        setWorkspaceName(null);
        return;
      }

      try {
        const workspace = await getWorkspace(workspaceId);
        if (ignore) return;
        setWorkspaceName(workspace.name ?? null);
      } catch (error) {
        if (ignore) return;
        console.warn("[SUMMARY_WORKSPACE_NAME:FETCH_FAILED]", {
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

  useEffect(() => {
    if (!socket.isSocketConnected) return;
    if (!workspaceId || !meetingId) return;
    if (!meetingRoomId || !Number.isFinite(meetingRoomId) || meetingRoomId <= 0) {
      console.warn("[SUMMARY_ALERTS:SEND_BLOCKED] missing meetingRoomId", {
        workspaceId,
        meetingId,
      });
      return;
    }

    const requestKey = `${workspaceId}-${meetingId}-${meetingRoomId}`;
    if (lastAlertRequestKeyRef.current === requestKey) return;

    lastAlertRequestKeyRef.current = requestKey;
    getAlertsRef.current({
      workspaceId,
      meetingId,
      meetingRoomId,
    });
  }, [meetingId, meetingRoomId, socket.isSocketConnected, workspaceId]);

  useEffect(() => {
    if (!socket.isSocketConnected || !socket.workspace.isWorkspaceJoined) return;
    if (!socket.meetingRoom.isMeetingRoomJoined || !workspaceId || !meetingId || !meetingRoomId) return;

    const requestKey = `${workspaceId}-${meetingId}-${meetingRoomId}`;
    if (requestedMeetingDataKeyRef.current === requestKey) return;
    requestedMeetingDataKeyRef.current = requestKey;
    socket.actions.getIssues(workspaceId, meetingId, meetingRoomId);
    socket.actions.getDocuments(workspaceId, meetingId, meetingRoomId);
    getAlertsRef.current({ workspaceId, meetingId, meetingRoomId });
  }, [meetingId, meetingRoomId, socket.actions, socket.isSocketConnected, socket.meetingRoom.isMeetingRoomJoined, socket.workspace.isWorkspaceJoined, workspaceId]);

  const handleBackDashboard = () => {
    console.log("[SUMMARY:BACK_DASHBOARD]");
    if (
      workspaceId &&
      meetingId &&
      meetingRoomId &&
      Number.isFinite(meetingRoomId) &&
      meetingRoomId > 0
    ) {
      socket.actions.leaveMeetingRoom(workspaceId, meetingId, meetingRoomId);
    }

    const storedLastWorkspaceId = Number(localStorage.getItem("lastWorkspaceId"));
    const fallbackWorkspaceId =
      workspaceId ??
      socket.workspace.workspaceId ??
      (Number.isFinite(storedLastWorkspaceId) && storedLastWorkspaceId > 0
        ? storedLastWorkspaceId
        : null);
    const targetUrl = `/dashboard?workspaceId=${fallbackWorkspaceId ?? ""}`;
    console.log("[NAVIGATE:DASHBOARD]", targetUrl);
    navigate(targetUrl);
  };

  const selectedMeeting =
    socket.meeting.meetings.find((meeting) => Number(meeting.id) === Number(meetingId)) ??
    (Number(socket.meeting.lastFetchedMeeting?.id) === Number(meetingId) ? socket.meeting.lastFetchedMeeting : null) ??
    (Number(socket.meeting.lastCreatedMeeting?.id) === Number(meetingId) ? socket.meeting.lastCreatedMeeting : null);
  const participantSource = socket.meetingRoom.users.length > 0 ? socket.meetingRoom.users : socket.workspace.users;
  const participants: User[] = participantSource.map((participant) => ({
    id: String(participant.userId),
    name: participant.name || "사용자",
    email: participant.email ?? "",
    role: participant.role ?? "MEMBER",
    teamName: participant.status,
    status: participant.status,
    isOnline: participant.status === "online",
  }));
  const summaryMeeting: Meeting | null = selectedMeeting ? {
    id: String(selectedMeeting.id),
    title: selectedMeeting.title,
    status: selectedMeeting.status,
    startTime: selectedMeeting.startedAt ?? selectedMeeting.createdAt ?? selectedMeeting.created_at ?? "-",
    createdAt: selectedMeeting.createdAt ?? selectedMeeting.created_at,
    created_at: selectedMeeting.created_at ?? selectedMeeting.createdAt,
    participantCount: participants.length,
    participants,
    decisionCount: socket.issues.filter((issue) => Number(issue.meetingId) === Number(meetingId)).length,
    rediscussCount: socket.alerts.items.filter((alert) => Number(alert.meetingId) === Number(meetingId)).length,
  } : null;

  return (
    <MeetingSummaryPage
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      meetingId={meetingId}
      meeting={summaryMeeting}
      participants={participants}
      documents={documents}
      transcriptLines={transcriptLines}
      aiAnalysis={aiAnalysis}
      isAiAnalysisLoading={isAiAnalysisLoading}
      aiAnalysisErrorMessage={aiAnalysisErrorMessage}
      issues={{
        items: socket.issues,
        isLoading: false,
        errorMessage: null,
      }}
      alerts={{
        items: socket.alerts.items.filter((alert) => Number(alert.meetingId) === Number(meetingId)),
        isLoading: socket.alerts.isLoading,
        errorMessage: socket.alerts.errorMessage,
      }}
      pageExpansion={expandedPages}
      actions={{
        getIssues: () => {
          if (!workspaceId || !meetingId) return;
          console.log("[USER] 안건 조회");
          if (!meetingRoomId || !Number.isFinite(meetingRoomId) || meetingRoomId <= 0) {
            console.warn("[SUMMARY:SEND_BLOCKED] missing meetingRoomId", {
              workspaceId,
              meetingId,
            });
            return;
          }
          socket.actions.getIssues(workspaceId, meetingId, meetingRoomId);
        },

        updateIssueStatus: (issueId, status) => {
          if (!workspaceId || !meetingId) return;

          if (!meetingRoomId || !Number.isFinite(meetingRoomId) || meetingRoomId <= 0) {
            console.warn("[SUMMARY:SEND_BLOCKED] missing meetingRoomId", {
              workspaceId,
              meetingId,
              issueId,
            });
            return;
          }

          if (issueId <= 0 || (status !== "IN_PROGRESS" && status !== "CLOSED")) {
            console.warn("[CHANGE_ISSUE_STATE:SEND_BLOCKED] invalid payload", {
              issueId,
              status,
            });
            return;
          }

          const defaultReason =
            status === "IN_PROGRESS"
              ? "안건 상태를 진행 중으로 변경"
              : status === "CLOSED"
                ? "안건 상태를 종료로 변경"
                : "안건 상태를 열림으로 변경";

          const defaultEvidence =
            "회의 요약 화면에서 사용자가 상태 변경 버튼을 클릭함";

          console.log(
            status === "IN_PROGRESS"
              ? "[USER] 안건 진행 중 변경"
              : "[USER] 안건 종료 변경"
          );

          socket.actions.changeIssueState({
            workspaceId,
            meetingId,
            meetingRoomId,
            issueId,
            toState: status,
            reason: defaultReason,
            evidence: defaultEvidence,
          });
        },

        updateIssue: (issueId, values) => {
          if (!workspaceId || !meetingId) return;

          if (!meetingRoomId || !Number.isFinite(meetingRoomId) || meetingRoomId <= 0) {
            console.warn("[UPDATE_ISSUE:SEND_BLOCKED] missing meetingRoomId", {
              workspaceId,
              meetingId,
              issueId,
            });
            return;
          }

          if (!Number.isFinite(issueId) || issueId <= 0) {
            console.warn("[UPDATE_ISSUE:SEND_BLOCKED] invalid issueId", issueId);
            return;
          }

          const title = values.title.trim();

          if (!title) {
            console.warn("[UPDATE_ISSUE:SEND_BLOCKED] empty title", {
              issueId,
            });
            return;
          }

          socket.actions.updateIssue({
            workspaceId,
            meetingId,
            meetingRoomId,
            issueId,
            title,
            description: values.description ?? null,
            priority: values.priority ?? null,
            dueDate: values.dueDate ?? null,
            assigneeId: values.assigneeId ?? null,
          });
        },

        deleteIssue: (issueId) => {
          if (!workspaceId || !meetingId) return;
          console.log("[USER] 안건 삭제");
          if (!meetingRoomId || !Number.isFinite(meetingRoomId) || meetingRoomId <= 0) {
            console.warn("[SUMMARY:SEND_BLOCKED] missing meetingRoomId", {
              workspaceId,
              meetingId,
              issueId,
            });
            return;
          }
          socket.actions.deleteIssue({
            workspaceId,
            meetingId,
            meetingRoomId,
            issueId,
          });
        },

        backDashboard: handleBackDashboard,
        openAlert: () => {
          const targetUrl = `/dashboard?workspaceId=${workspaceId ?? ""}&menu=menu-4`;
          navigate(targetUrl);
        },
        openDashboardMenu: (menuId: string) => {
          navigate(`/dashboard?workspaceId=${workspaceId ?? ""}${menuId ? `&menu=${encodeURIComponent(menuId)}` : ""}`);
        },
        openLiveMeeting: () => {
          if (!meetingId) return;
          navigate(`/meeting/live/${meetingId}?workspaceId=${workspaceId ?? ""}&meetingRoomId=${meetingRoomId ?? 1}`);
        },
        openSettings: () => navigate("/settings"),
        switchWorkspace: (workspaceIdValue: string) => {
          const nextWorkspaceId = Number(workspaceIdValue);
          if (!Number.isFinite(nextWorkspaceId) || nextWorkspaceId <= 0) return;
          navigate(`/dashboard?workspaceId=${nextWorkspaceId}`);
        },
        togglePage: (pageId: string) => {
          setExpandedPages((current) => ({ ...current, [pageId]: !(current[pageId] ?? true) }));
        },
        addPage: () => {
          navigate(`/dashboard?workspaceId=${workspaceId ?? ""}`);
        },
        openMeeting: (targetMeetingId: string) => {
          const nextMeetingId = Number(targetMeetingId);
          if (!Number.isFinite(nextMeetingId) || nextMeetingId <= 0) return;
          navigate(`/meeting-records/${nextMeetingId}?workspaceId=${workspaceId ?? ""}&meetingRoomId=${meetingRoomId ?? 1}`);
        },
        logout: () => {
          if (workspaceId && meetingId && meetingRoomId) {
            socket.actions.leaveMeetingRoom(workspaceId, meetingId, meetingRoomId);
          }
          socket.actions.disconnect();
          socket.actions.clearWorkspaceData();
          clearAuth();
          navigate("/login");
        },
      }}
    />
  );
}
