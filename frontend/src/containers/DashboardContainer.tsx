import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useSocketContext } from "../app/providers/SocketProvider";
import {
  canDeleteMeeting,
  canInviteWorkspaceMember,
} from "../constants/permissions";
import { useUpload } from "../hooks/useUpload";
import { useWorkspace } from "../hooks/useWorkspace";
import { DashboardPage } from "../pages/DashboardPage";
import { createWorkspace, getWorkspace, getWorkspaces } from "../services/workspaceService";
import { isTokenRefreshing } from "../services/auth/authRefreshLock";
import { useAuthStore } from "../store/authStore";
import { useDocumentStore } from "../store/documentStore";
import { processDocument as processDocumentApi } from "../services/documentApi";
import { useWorkspacePresenceStore } from "../store/workspacePresenceStore";
import type { IssuePriority, IssueStatus } from "../types/meeting.types";
import type { InviteWorkspaceRequest, WorkspaceResponse } from "../types/workspace.types";

const INVITATION_POLL_INTERVAL_MS = 30 * 1000;

const hasWorkspacePermissionFields = (workspace: WorkspaceResponse | null) =>
  Boolean(
    workspace &&
      Object.prototype.hasOwnProperty.call(workspace, "my_role") &&
      Object.prototype.hasOwnProperty.call(workspace, "canInviteMember")
  );

const mergeWorkspace = (
  workspaces: WorkspaceResponse[],
  workspace: WorkspaceResponse | null
) => {
  if (!workspace) return workspaces;

  const exists = workspaces.some((item) => Number(item.id) === Number(workspace.id));

  if (!exists) {
    return [...workspaces, workspace];
  }

  return workspaces.map((item) =>
    Number(item.id) === Number(workspace.id) ? { ...item, ...workspace } : item
  );
};

export function DashboardContainer() {
  const navigate = useNavigate();
  const location = useLocation();
  const socket = useSocketContext();
  const joinWorkspace = socket.actions.joinWorkspace;
  const leaveWorkspace = socket.actions.leaveWorkspace;
  const getMeetings = socket.actions.getMeetings;
  const clearWorkspaceData = socket.actions.clearWorkspaceData;
  const currentUserId = socket.currentUser?.userId ?? null;

  const accessToken = useAuthStore((state) => state.accessToken);
  const defaultWorkspaceId = useAuthStore((state) => state.defaultWorkspaceId);
  const setDefaultWorkspaceId = useAuthStore(
    (state) => state.setDefaultWorkspaceId
  );
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const authUser = useAuthStore((state) => state.user);

  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<number | null>(
    null
  );
  const [currentWorkspaceName, setCurrentWorkspaceName] = useState<string | null>(
    null
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceResponse[]>([]);
  const [isWorkspaceListOpen, setIsWorkspaceListOpen] = useState(true);
  const [, setIsLoadingWorkspaces] = useState(false);
  const [, setWorkspaceErrorMessage] = useState<
    string | null
  >(null);
  const requestedWorkspaceIdRef = useRef<number | null>(null);
  const requestedMeetingsWorkspaceIdRef = useRef<number | null>(null);
  const requestedAllIssuesWorkspaceIdRef = useRef<number | null>(null);
  const requestedWorkspaceDocumentsWorkspaceIdRef = useRef<number | null>(null);
  const explicitWorkspaceIdRef = useRef<number | null>(null);
  const previousWorkspaceIdRef = useRef<number | null>(null);
  const pendingCreatedMeetingNavigationRef = useRef(false);
  const previousCreatedMeetingIdRef = useRef<string | null>(null);
  const pendingOpenMeetingIdRef = useRef<number | null>(null);
  const handledWorkspaceErrorIdRef = useRef<number | null>(null);
  const isInvitationLoadingRef = useRef(false);
  const documents = useDocumentStore((state) => state.documents);
  const selectedDocument = useDocumentStore((state) => state.selectedDocument);
  const setSelectedDocument = useDocumentStore(
    (state) => state.setSelectedDocument
  );
  const {
    attachFile: uploadWorkspaceDocument,
    isUploading: isDocumentUploading,
    uploadError: documentUploadError,
  } = useUpload({
    workspaceId: currentWorkspaceId,
  });
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const [processingDocumentId, setProcessingDocumentId] = useState<number | null>(null);
  const [documentProcessError, setDocumentProcessError] = useState<string | null>(null);
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null;
  const currentWorkspaceRole = currentWorkspace?.my_role ?? null;
  const canCurrentWorkspaceDeleteMeeting = canDeleteMeeting(currentWorkspaceRole);
  const currentWorkspaceMeetings = socket.meeting.meetings.filter(
    (meeting) =>
      meeting.workspaceId == null ||
      Number(meeting.workspaceId) === Number(currentWorkspaceId)
  );
  const alertTargetMeetingId = currentWorkspaceMeetings[0]?.id ?? null;
  const alertTargetMeetingRoomId = alertTargetMeetingId ? 1 : null;
  const workspaceActions = useWorkspace();
  const {
    invitations,
    isInvitationLoading,
    invitationError,
    isInvitationPollingBlocked,
    fetchMyInvitations,
    acceptInvitation,
    rejectInvitation,
  } = workspaceActions;

  useEffect(() => {
    isInvitationLoadingRef.current = isInvitationLoading;
  }, [isInvitationLoading]);

  const getDashboardUrl = useCallback((workspaceId: number) => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("workspaceId", String(workspaceId));

    return `/dashboard?${nextParams.toString()}`;
  }, [location.search]);

  useEffect(() => {
    const resolveWorkspace = async () => {
      if (!accessToken) {
        return;
      }

      try {
        setIsLoadingWorkspaces(true);
        setWorkspaceErrorMessage(null);

        let workspaceList = await getWorkspaces();

        if (workspaceList.length === 0) {
          const createdWorkspace = await createWorkspace({
            name: "내 워크스페이스",
          });

          workspaceList = [createdWorkspace];
        }

        const searchParams = new URLSearchParams(location.search);
        const queryWorkspaceId = Number(searchParams.get("workspaceId"));
        const validQueryWorkspaceId =
          Number.isFinite(queryWorkspaceId) && queryWorkspaceId > 0
            ? queryWorkspaceId
            : null;
        const storeWorkspaceId = socket.workspace.workspaceId ?? null;
        const rawLastWorkspaceId = localStorage.getItem("lastWorkspaceId");
        const parsedLastWorkspaceId = rawLastWorkspaceId
          ? Number(rawLastWorkspaceId)
          : null;
        const lastWorkspaceId =
          parsedLastWorkspaceId &&
          Number.isFinite(parsedLastWorkspaceId) &&
          parsedLastWorkspaceId > 0
            ? parsedLastWorkspaceId
            : null;
        const workspaceListIds = workspaceList
          .map((workspace) => Number(workspace.id))
          .filter((id) => Number.isFinite(id) && id > 0);
        const isKnownWorkspaceId = (id: number | null) =>
          id !== null && workspaceListIds.includes(Number(id));
        // 사용자가 직접 선택하거나 초대 수락으로 이동한 workspaceId와
        // 이미 JOIN된 workspaceId는 목록 응답보다 우선해 stale 전환을 막는다.
        const presenceState = useWorkspacePresenceStore.getState();
        const joinedWorkspaceId =
          presenceState.status === "joined" && presenceState.workspaceId
            ? Number(presenceState.workspaceId)
            : null;
        const protectedWorkspaceIds = [
          explicitWorkspaceIdRef.current,
          joinedWorkspaceId,
        ].filter((id): id is number => id !== null);
        const isProtectedWorkspaceId = (id: number | null) =>
          id !== null && protectedWorkspaceIds.includes(Number(id));
        const isSelectableWorkspaceId = (id: number | null) =>
          isKnownWorkspaceId(id) || isProtectedWorkspaceId(id);
        const candidates = [
          { source: "explicitWorkspaceId", id: explicitWorkspaceIdRef.current },
          { source: "queryWorkspaceId", id: validQueryWorkspaceId },
          { source: "storeWorkspaceId", id: storeWorkspaceId },
          { source: "lastWorkspaceId", id: lastWorkspaceId },
          { source: "defaultWorkspaceId", id: defaultWorkspaceId },
        ];
        const rejectedCandidates = candidates.filter(
          (candidate) => candidate.id !== null && !isKnownWorkspaceId(candidate.id)
        );
        const removableRejectedCandidates = rejectedCandidates.filter(
          (candidate) => !isProtectedWorkspaceId(candidate.id)
        );
        const protectedRejectedCandidates = rejectedCandidates.filter(
          (candidate) => isProtectedWorkspaceId(candidate.id)
        );
        const selectedWorkspaceId =
          candidates.find((candidate) => isSelectableWorkspaceId(candidate.id))?.id ??
          workspaceList[0]?.id ??
          null;
        let nextWorkspace =
          workspaceList.find((workspace) => Number(workspace.id) === Number(selectedWorkspaceId)) ??
          null;

        if (!nextWorkspace && isProtectedWorkspaceId(selectedWorkspaceId)) {
          // 방금 선택하거나 입장한 workspace가 아직 목록 응답에 반영되지
          // 않았을 수 있으므로 단건 조회로 보완한다.
          try {
            nextWorkspace = await getWorkspace(Number(selectedWorkspaceId));
            workspaceList = mergeWorkspace(workspaceList, nextWorkspace);
            console.warn("[WORKSPACE:PROTECTED_FETCHED]", {
              workspaceId: selectedWorkspaceId,
              reason: "GET /workspaces ?묐떟 諛섏쁺 吏?곗쑝濡??④굔 議고쉶濡?蹂닿컯",
            });
          } catch (fetchError) {
            console.error("[WORKSPACE:PROTECTED_FETCH_FAILED]", {
              workspaceId: selectedWorkspaceId,
              error: fetchError,
            });
          }
        }

        nextWorkspace = nextWorkspace ?? workspaceList[0] ?? null;

        console.log("[WORKSPACE:RESOLVE]", {
          queryWorkspaceId: validQueryWorkspaceId,
          storeWorkspaceId,
          lastWorkspaceId,
          defaultWorkspaceId,
          workspaceListIds,
          selectedWorkspaceId,
          rejectedCandidates,
        });

        if (!selectedWorkspaceId) return;

        protectedRejectedCandidates.forEach((candidate) => {
          console.warn("[WORKSPACE:STALE_PROTECTED]", {
            staleId: candidate.id,
            source: candidate.source,
          });
        });

        removableRejectedCandidates.forEach((candidate) => {
          console.warn("[WORKSPACE:STALE_REMOVED]", {
            staleId: candidate.id,
            source: candidate.source,
          });
        });

        if (
          lastWorkspaceId &&
          !isKnownWorkspaceId(lastWorkspaceId) &&
          !isProtectedWorkspaceId(lastWorkspaceId)
        ) {
          localStorage.removeItem("lastWorkspaceId");
        }

        if (
          storeWorkspaceId &&
          !isKnownWorkspaceId(storeWorkspaceId) &&
          !isProtectedWorkspaceId(storeWorkspaceId)
        ) {
          useWorkspacePresenceStore.getState().resetWorkspacePresence();
        }

        if (!hasWorkspacePermissionFields(nextWorkspace)) {
          nextWorkspace = await getWorkspace(selectedWorkspaceId);
          workspaceList = mergeWorkspace(workspaceList, nextWorkspace);
        }

        setWorkspaces(workspaceList);
        setCurrentWorkspaceId(selectedWorkspaceId);
        setCurrentWorkspaceName(nextWorkspace?.name ?? null);
        localStorage.setItem("lastWorkspaceId", String(selectedWorkspaceId));

        if (!isKnownWorkspaceId(validQueryWorkspaceId)) {
          const nextParams = new URLSearchParams(location.search);
          nextParams.set("workspaceId", String(selectedWorkspaceId));
          const targetUrl = `/dashboard?${nextParams.toString()}`;

          if (location.search !== `?${nextParams.toString()}`) {
            console.log("[NAVIGATE:DASHBOARD]", targetUrl);
            navigate(targetUrl, { replace: true });
          }
        }
      } catch (error) {
        console.error("[Dashboard] workspace resolve failed:", error);
        setWorkspaceErrorMessage(
          "워크스페이스를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요."
        );
      } finally {
        setIsLoadingWorkspaces(false);
      }
    };

    resolveWorkspace();
  }, [
    accessToken,
    defaultWorkspaceId,
    location.search,
    navigate,
    socket.workspace.workspaceId,
  ]);

  useEffect(() => {
    if (!accessToken) return;
    if (!currentUserId) return;
    if (isTokenRefreshing()) return;
    if (isInvitationPollingBlocked) return;

    fetchMyInvitations();
  }, [accessToken, currentUserId, fetchMyInvitations, isInvitationPollingBlocked]);

  useEffect(() => {
    if (
      !socket.isUserRegistered ||
      socket.workspace.status === "left" ||
      (currentWorkspaceId &&
        socket.workspace.workspaceId &&
        Number(socket.workspace.workspaceId) !== Number(currentWorkspaceId))
    ) {
      requestedWorkspaceIdRef.current = null;
    }
  }, [
    currentWorkspaceId,
    socket.isUserRegistered,
    socket.workspace.status,
    socket.workspace.workspaceId,
  ]);

  useEffect(() => {
    if (!accessToken) return;
    if (!currentUserId) return;
    if (isTokenRefreshing()) return;
    if (isInvitationPollingBlocked) return;

    const invitationPollTimer = window.setInterval(() => {
      if (!localStorage.getItem("accessToken")) return;
      if (isTokenRefreshing()) return;
      if (isInvitationLoadingRef.current) return;

      fetchMyInvitations();
    }, INVITATION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(invitationPollTimer);
    };
  }, [
    accessToken,
    currentUserId,
    fetchMyInvitations,
    isInvitationPollingBlocked,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (!socket.isUserRegistered) return;

    const isKnownWorkspaceId = workspaces.some(
      (workspace) => Number(workspace.id) === Number(currentWorkspaceId)
    );

    if (!isKnownWorkspaceId) {
      console.warn("[WORKSPACE:SEND_BLOCKED]", {
        workspaceId: currentWorkspaceId,
        reason: "workspaceId not found in workspaceList",
      });
      return;
    }

    if (requestedWorkspaceIdRef.current === currentWorkspaceId) return;

    if (
      socket.workspace.workspaceId === currentWorkspaceId &&
      (socket.workspace.status === "joining" ||
        socket.workspace.status === "joined")
    ) {
      return;
    }

    if (
      socket.workspace.workspaceId &&
      socket.workspace.workspaceId !== currentWorkspaceId &&
      (socket.workspace.status === "joining" ||
        socket.workspace.status === "joined")
    ) {
      leaveWorkspace(socket.workspace.workspaceId);
    }

    requestedWorkspaceIdRef.current = currentWorkspaceId;
    joinWorkspace(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    socket.isUserRegistered,
    socket.workspace.workspaceId,
    socket.workspace.status,
    workspaces,
    joinWorkspace,
    leaveWorkspace,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;

    const previousWorkspaceId = previousWorkspaceIdRef.current;
    const loadedMeetingsWorkspaceId = socket.meeting.loadedWorkspaceId;
    const isWorkspaceChanged =
      (previousWorkspaceId !== null &&
        previousWorkspaceId !== currentWorkspaceId) ||
      (loadedMeetingsWorkspaceId !== null &&
        loadedMeetingsWorkspaceId !== currentWorkspaceId);

    requestedMeetingsWorkspaceIdRef.current = null;
    requestedAllIssuesWorkspaceIdRef.current = null;
    requestedWorkspaceDocumentsWorkspaceIdRef.current = null;

    if (isWorkspaceChanged) {
      clearWorkspaceData();
    }

    previousWorkspaceIdRef.current = currentWorkspaceId;
  }, [
    clearWorkspaceData,
    currentWorkspaceId,
    socket.meeting.loadedWorkspaceId,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (socket.workspace.status !== "joined") return;
    if (socket.workspace.workspaceId !== currentWorkspaceId) return;
    if (requestedMeetingsWorkspaceIdRef.current === currentWorkspaceId) return;

    requestedMeetingsWorkspaceIdRef.current = currentWorkspaceId;
    console.log("[GET_MEETINGS:AFTER_JOIN]", { workspaceId: currentWorkspaceId });
    getMeetings(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    socket.workspace.status,
    socket.workspace.workspaceId,
    getMeetings,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (socket.workspace.status !== "error") return;
    if (socket.workspace.workspaceId !== currentWorkspaceId) {
      console.warn("[WORKSPACE:STALE_ERROR_IGNORED]", {
        currentWorkspaceId,
        errorWorkspaceId: socket.workspace.workspaceId,
      });
      return;
    }
    if (handledWorkspaceErrorIdRef.current === currentWorkspaceId) return;

    const errorMessage = socket.workspace.errorMessage ?? socket.error?.message ?? "";
    const shouldRecover =
      errorMessage.includes("Workspace not found") ||
      errorMessage.includes("권한") ||
      errorMessage.toLowerCase().includes("permission") ||
      errorMessage.toLowerCase().includes("access");

    if (!shouldRecover) return;

    handledWorkspaceErrorIdRef.current = currentWorkspaceId;

    if (localStorage.getItem("lastWorkspaceId") === String(currentWorkspaceId)) {
      localStorage.removeItem("lastWorkspaceId");
      console.warn("[WORKSPACE:STALE_REMOVED]", {
        staleId: currentWorkspaceId,
        source: "lastWorkspaceId",
      });
    }

    const fallbackWorkspace =
      workspaces.find((workspace) => Number(workspace.id) !== Number(currentWorkspaceId)) ??
      null;

    useWorkspacePresenceStore.getState().resetWorkspacePresence();
    requestedWorkspaceIdRef.current = null;

    if (!fallbackWorkspace) {
      console.warn("[WORKSPACE:SEND_BLOCKED]", {
        workspaceId: currentWorkspaceId,
        reason: "workspace error and no fallback workspace",
      });
      window.setTimeout(() => setCurrentWorkspaceId(null), 0);
      return;
    }

    const fallbackWorkspaceId = Number(fallbackWorkspace.id);
    window.setTimeout(() => {
      setCurrentWorkspaceId(fallbackWorkspaceId);
      setCurrentWorkspaceName(fallbackWorkspace.name);
    }, 0);
    localStorage.setItem("lastWorkspaceId", String(fallbackWorkspaceId));

    const targetUrl = getDashboardUrl(fallbackWorkspaceId);
    console.log("[NAVIGATE:DASHBOARD]", targetUrl);
    navigate(targetUrl, { replace: true });
  }, [
    currentWorkspaceId,
    getDashboardUrl,
    navigate,
    socket.error?.message,
    socket.workspace.errorMessage,
    socket.workspace.workspaceId,
    socket.workspace.status,
    workspaces,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (!socket.isUserRegistered) return;
    if (socket.workspace.status !== "joined") return;
    if (Number(socket.workspace.workspaceId) !== Number(currentWorkspaceId)) return;
    if (requestedAllIssuesWorkspaceIdRef.current === currentWorkspaceId) return;

    requestedAllIssuesWorkspaceIdRef.current = currentWorkspaceId;
    socket.actions.getAllIssues(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    socket.isUserRegistered,
    socket.workspace.status,
    socket.workspace.workspaceId,
    socket.actions,
  ]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (!socket.isUserRegistered) return;
    if (socket.workspace.status !== "joined") return;
    if (Number(socket.workspace.workspaceId) !== Number(currentWorkspaceId)) return;
    if (requestedWorkspaceDocumentsWorkspaceIdRef.current === currentWorkspaceId) return;

    requestedWorkspaceDocumentsWorkspaceIdRef.current = currentWorkspaceId;
    socket.actions.getWorkspaceDocuments(currentWorkspaceId);
  }, [
    currentWorkspaceId,
    socket.isUserRegistered,
    socket.workspace.status,
    socket.workspace.workspaceId,
    socket.actions,
  ]);

  useEffect(() => {
    const createdMeeting = socket.meeting.lastCreatedMeeting;

    if (!pendingCreatedMeetingNavigationRef.current) return;
    if (!createdMeeting) return;
    if (!currentWorkspaceId) return;
    if (String(createdMeeting.id) === previousCreatedMeetingIdRef.current) {
      return;
    }

    pendingCreatedMeetingNavigationRef.current = false;
    previousCreatedMeetingIdRef.current = String(createdMeeting.id);
    const targetUrl = `/meeting/live/${createdMeeting.id}?workspaceId=${currentWorkspaceId}`;
    console.log("[NAVIGATE:MEETING_LIVE]", targetUrl);

    navigate(targetUrl);
  }, [currentWorkspaceId, navigate, socket.meeting.lastCreatedMeeting]);

  useEffect(() => {
    const fetchedMeeting = socket.meeting.lastFetchedMeeting;

    if (!currentWorkspaceId) return;
    if (!pendingOpenMeetingIdRef.current) return;
    if (!fetchedMeeting) return;
    if (Number(fetchedMeeting.id) !== pendingOpenMeetingIdRef.current) return;

    pendingOpenMeetingIdRef.current = null;

    if (fetchedMeeting.status === "ENDED") {
      const targetUrl = `/meeting/summary?workspaceId=${currentWorkspaceId}&meetingId=${fetchedMeeting.id}&meetingRoomId=1`;
      console.log("[NAVIGATE:SUMMARY]", targetUrl);
      navigate(targetUrl);
    } else {
      const targetUrl = `/meeting/live/${fetchedMeeting.id}?workspaceId=${currentWorkspaceId}`;
      console.log("[NAVIGATE:MEETING_LIVE]", targetUrl);
      navigate(targetUrl);
    }
  }, [
    currentWorkspaceId,
    navigate,
    socket.meeting.lastFetchedMeeting,
  ]);

  const handleStartMeeting = (title: string) => {
    if (!currentWorkspaceId) {
      alert("회의를 시작하려면 워크스페이스를 먼저 선택해 주세요.");
      return;
    }

    if (!title?.trim()) return;

    console.log("[USER] 회의 시작");

    pendingCreatedMeetingNavigationRef.current = true;
    previousCreatedMeetingIdRef.current = socket.meeting.lastCreatedMeeting
      ? String(socket.meeting.lastCreatedMeeting.id)
      : null;

    socket.actions.createMeeting({
      workspaceId: currentWorkspaceId,
      title: title.trim(),
      status: "READY",
    });
  };

  const handleDeleteMeeting = (meetingId: string | number) => {
    if (!currentWorkspaceId) return;
    if (!canCurrentWorkspaceDeleteMeeting) {
      console.warn("[DELETE_MEETING:SEND_BLOCKED] permission denied", {
        role: currentWorkspaceRole,
      });
      return;
    }

    socket.actions.deleteMeeting(
      currentWorkspaceId,
      Number(meetingId),
      currentWorkspaceRole
    );
  };

  const handleUpdateIssueStatus = (
    issueId: number,
    status: Exclude<IssueStatus, "OPEN">,
    meetingId: number,
    meetingRoomId = 1
  ) => {
    if (!currentWorkspaceId) return;
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    if (!Number.isFinite(meetingId) || meetingId <= 0) return;

    socket.actions.changeIssueState({
      workspaceId: currentWorkspaceId,
      meetingId,
      meetingRoomId,
      issueId,
      toState: status,
      reason: "Dashboard decision status change",
      evidence: "Decision dashboard action",
    });
  };

  const handleUpdateIssue = (
    issueId: number,
    meetingId: number,
    values: {
      title: string;
      description: string | null;
      priority: IssuePriority | null;
      dueDate: string | null;
      assigneeId: number | null;
    },
    meetingRoomId = 1
  ) => {
    if (!currentWorkspaceId) return;
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    if (!Number.isFinite(meetingId) || meetingId <= 0) return;

    const title = values.title.trim();
    if (!title) {
      console.warn("[UPDATE_ISSUE:SEND_BLOCKED] empty title", { issueId, meetingId });
      return;
    }

    socket.actions.updateIssue({
      workspaceId: currentWorkspaceId,
      meetingId,
      meetingRoomId,
      issueId,
      title,
      description: values.description ?? null,
      priority: values.priority ?? null,
      dueDate: values.dueDate ?? null,
      assigneeId: values.assigneeId ?? null,
    });
  };

  const handleDeleteIssue = (
    issueId: number,
    meetingId: number,
    meetingRoomId = 1
  ) => {
    if (!currentWorkspaceId) return;
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    if (!Number.isFinite(meetingId) || meetingId <= 0) return;

    socket.actions.deleteIssue({
      workspaceId: currentWorkspaceId,
      meetingId,
      meetingRoomId,
      issueId,
    });
  };

  const handleCreateWorkspace = async (name: string) => {
    const workspaceName = name.trim() || "내 워크스페이스";

    try {
      console.log("[USER] 워크스페이스 생성");

      const createdWorkspace = await createWorkspace({ name: workspaceName });
      const createdWorkspaceId = Number(createdWorkspace.id);
      if (!Number.isFinite(createdWorkspaceId) || createdWorkspaceId <= 0) {
        console.warn("[WORKSPACE_CREATE:INVALID_RESPONSE]", {
          workspaceId: createdWorkspaceId,
          reason: "created workspace id is invalid",
        });
        setWorkspaceErrorMessage(
          "워크스페이스 권한을 반영하는 중입니다. 잠시 후 다시 시도해 주세요."
        );
        return;
      }

      requestedWorkspaceIdRef.current = null;
      requestedMeetingsWorkspaceIdRef.current = null;
      requestedAllIssuesWorkspaceIdRef.current = null;
      pendingOpenMeetingIdRef.current = null;

      explicitWorkspaceIdRef.current = createdWorkspaceId;
      setDefaultWorkspaceId(createdWorkspaceId);
      setWorkspaces((prev) => mergeWorkspace(prev, createdWorkspace));
      setCurrentWorkspaceId(createdWorkspaceId);
      setCurrentWorkspaceName(createdWorkspace.name);
      localStorage.setItem("lastWorkspaceId", String(createdWorkspaceId));

      const targetUrl = getDashboardUrl(createdWorkspaceId);
      console.log("[NAVIGATE:DASHBOARD]", targetUrl);
      navigate(targetUrl, { replace: true });

      try {
        const workspaceList = await getWorkspaces();
        const hasCreatedWorkspace = workspaceList.some(
          (workspace) => Number(workspace.id) === createdWorkspaceId
        );

        if (hasCreatedWorkspace) {
          setWorkspaces(workspaceList);
        } else {
          console.warn("[WORKSPACE_CREATE:SYNC_DELAYED]", {
            workspaceId: createdWorkspaceId,
            reason: "created workspace not found in workspace list",
          });
        }
      } catch (syncError) {
        console.warn("[WORKSPACE_CREATE:SYNC_FAILED]", {
          workspaceId: createdWorkspaceId,
          error: syncError,
        });
      }
    } catch (error) {
      console.error("[Dashboard] createWorkspace failed:", error);
      setWorkspaceErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "워크스페이스를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  };

  const handleInviteMember = async (
    workspaceId: number,
    email: string,
    role: InviteWorkspaceRequest["role"]
  ) => {
    const targetWorkspace = workspaces.find(
      (workspace) => Number(workspace.id) === Number(workspaceId)
    );

    if (!targetWorkspace) {
      throw new Error("워크스페이스를 찾을 수 없습니다.");
    }

    if (
      !canInviteWorkspaceMember(
        targetWorkspace.my_role,
        targetWorkspace.canInviteMember
      )
    ) {
      throw new Error("멤버 초대 권한이 없습니다.");
    }

    return workspaceActions.inviteMember(workspaceId, email, role);
  };

  const handleAcceptInvitation = async (invitationId: number) => {
    const accepted = await acceptInvitation(invitationId);
    const acceptedWorkspaceId = Number(accepted.workspaceId);

    const workspaceList = await getWorkspaces();
    const acceptedWorkspace = workspaceList.find(
      (workspace) => Number(workspace.id) === acceptedWorkspaceId
    );

    setWorkspaces(workspaceList);

    if (!acceptedWorkspace) {
      console.warn("[INVITATION_ACCEPT:WORKSPACE_NOT_FOUND]", {
        workspaceId: acceptedWorkspaceId,
      });
      return;
    }

    requestedWorkspaceIdRef.current = null;
    requestedMeetingsWorkspaceIdRef.current = null;
    requestedAllIssuesWorkspaceIdRef.current = null;
    handledWorkspaceErrorIdRef.current = null;
    explicitWorkspaceIdRef.current = acceptedWorkspaceId;

    setCurrentWorkspaceId(acceptedWorkspaceId);
    setCurrentWorkspaceName(acceptedWorkspace.name);
    localStorage.setItem("lastWorkspaceId", String(acceptedWorkspaceId));

    const targetUrl = getDashboardUrl(acceptedWorkspaceId);
    console.log("[NAVIGATE:DASHBOARD]", targetUrl);
    navigate(targetUrl, { replace: true });
  };

  const handleRejectInvitation = async (invitationId: number) => {
    await rejectInvitation(invitationId);
  };

  const handleToggleWorkspaceList = () => {
    setIsWorkspaceListOpen((prev) => !prev);
  };

  const handleSelectWorkspace = (workspaceId: number) => {
    if (!workspaces.some((item) => item.id === workspaceId)) {
      return;
    }

    console.log("[USER] 워크스페이스 선택");

    const queryWorkspaceId = Number(
      new URLSearchParams(location.search).get("workspaceId")
    );
    const rawLastWorkspaceId = localStorage.getItem("lastWorkspaceId");
    const lastWorkspaceId = rawLastWorkspaceId ? Number(rawLastWorkspaceId) : null;

    console.log("[WORKSPACE_SELECT_DEBUG]", {
      selectedWorkspaceId: workspaceId,
      currentWorkspaceId,
      queryWorkspaceId: Number.isFinite(queryWorkspaceId) ? queryWorkspaceId : null,
      lastWorkspaceId:
        lastWorkspaceId !== null && Number.isFinite(lastWorkspaceId)
          ? lastWorkspaceId
          : null,
      defaultWorkspaceId,
    });

    console.log("[WORKSPACE:SELECT]", workspaceId);
    explicitWorkspaceIdRef.current = workspaceId;
    setCurrentWorkspaceId(workspaceId);
    localStorage.setItem("lastWorkspaceId", String(workspaceId));
    const targetUrl = getDashboardUrl(workspaceId);
    console.log("[NAVIGATE:DASHBOARD]", targetUrl);
    navigate(targetUrl, { replace: true });
  };

  const handleOpenMeeting = (meetingId: string) => {
    if (!currentWorkspaceId) return;

    const targetMeetingId = Number(meetingId);

    if (!Number.isFinite(targetMeetingId) || targetMeetingId <= 0) return;
    console.log("[USER] 기존 회의 열기");
    pendingOpenMeetingIdRef.current = targetMeetingId;
    socket.actions.getMeeting(currentWorkspaceId, targetMeetingId);
  };

  const handleOpenMeetingRecord = (meetingId: string) => {
    if (!currentWorkspaceId) return;

    const targetMeetingId = Number(meetingId);

    if (!Number.isFinite(targetMeetingId) || targetMeetingId <= 0) return;
    const targetUrl = `/meeting-records/${targetMeetingId}?workspaceId=${currentWorkspaceId}&meetingRoomId=1`;
    console.log("[NAVIGATE:MEETING_RECORD_DETAIL]", targetUrl);
    navigate(targetUrl);
  };

  const handleOpenSettings = () => {
    navigate("/settings");
  };

  const handleOpenDocumentDetail = (documentId: number) => {
    if (!currentWorkspaceId) return;
    if (!Number.isFinite(documentId) || documentId <= 0) return;

    socket.actions.getDocument({
      workspaceId: currentWorkspaceId,
      documentId,
    });
  };

  const handleCloseDocumentDetail = () => {
    setSelectedDocument(null);
  };

  const handleDeleteDocument = (documentId: number, meetingId?: number | null) => {
    if (!currentWorkspaceId) return;
    if (!Number.isFinite(documentId) || documentId <= 0) return;

    socket.actions.deleteDocument({
      workspaceId: currentWorkspaceId,
      documentId,
      ...(meetingId != null
        ? { meetingId: Number(meetingId), meetingRoomId: 1 }
        : {}),
    });
  };

  const handleProcessDocument = async (documentId: number) => {
    if (processingDocumentId !== null) return;

    setProcessingDocumentId(documentId);
    setDocumentProcessError(null);
    try {
      const result = await processDocumentApi(documentId);
      updateDocument(documentId, { status: result.status });
    } catch (error) {
      setDocumentProcessError(
        error instanceof Error ? error.message : "문서 분석에 실패했습니다."
      );
    } finally {
      setProcessingDocumentId(null);
    }
  };

  const handleLogout = () => {
    if (currentWorkspaceId) {
      socket.actions.leaveWorkspace(currentWorkspaceId);
    }

    socket.actions.disconnect();
    socket.actions.clearWorkspaceData();
    clearAuth();
    navigate("/login");
  };

  return (
    <DashboardPage
      currentWorkspaceId={currentWorkspaceId}
      currentWorkspaceName={
        workspaces.find((workspace) => workspace.id === currentWorkspaceId)
          ?.name ?? currentWorkspaceName
      }
      authUser={authUser}
      workspaces={workspaces}
      isWorkspaceListOpen={isWorkspaceListOpen}
      workspace={{
        users: socket.workspace.users,
      }}
      invitations={{
        items: invitations,
        isLoading: isInvitationLoading,
        errorMessage: invitationError,
      }}
      meetings={{
        items: socket.meeting.meetings,
        isLoading: socket.meeting.isLoading,
        errorMessage: socket.meeting.errorMessage,
      }}
      issues={{
        items: socket.allIssues,
      }}
      documents={documents}
      selectedDocument={selectedDocument}
      documentProcessing={{
        isUploading: isDocumentUploading,
        uploadErrorMessage: documentUploadError,
        processingDocumentId,
        errorMessage: documentProcessError,
      }}
      issue={{
        selectedIssueDetail: socket.issue.selectedIssueDetail,
        selectedIssueEvents: socket.issue.selectedIssueEvents,
        isLoading: socket.issue.isLoading,
        isEventsLoading: socket.issue.isEventsLoading,
      }}
      alertCenter={{
        items: socket.alerts.items,
        selectedAlertId: socket.alerts.selectedAlertId,
        detail: socket.alerts.detail,
        isLoading: socket.alerts.isLoading,
        isDetailLoading: socket.alerts.isDetailLoading,
        isAcknowledgeLoading: socket.alerts.isAcknowledgeLoading,
        isDismissLoading: socket.alerts.isDismissLoading,
        isResolveLoading: socket.alerts.isResolveLoading,
        isUpdateLoading: socket.alerts.isUpdateLoading,
        isDeleteLoading: socket.alerts.isDeleteLoading,
        errorMessage: socket.alerts.errorMessage,
        detailErrorMessage: socket.alerts.detailErrorMessage,
        acknowledgeErrorMessage: socket.alerts.acknowledgeErrorMessage,
        dismissErrorMessage: socket.alerts.dismissErrorMessage,
        resolveErrorMessage: socket.alerts.resolveErrorMessage,
        updateErrorMessage: socket.alerts.updateErrorMessage,
        deleteErrorMessage: socket.alerts.deleteErrorMessage,
        workspaceId: currentWorkspaceId,
        meetingId: alertTargetMeetingId ? Number(alertTargetMeetingId) : null,
        meetingRoomId: alertTargetMeetingRoomId,
        isSocketConnected: socket.isSocketConnected,
      }}
      actions={{
        toggleWorkspaceList: handleToggleWorkspaceList,
        selectWorkspace: handleSelectWorkspace,
        createWorkspace: handleCreateWorkspace,
        inviteMember: handleInviteMember,
        fetchMyInvitations,
        acceptInvitation: handleAcceptInvitation,
        rejectInvitation: handleRejectInvitation,
        startMeeting: handleStartMeeting,
        openMeeting: handleOpenMeeting,
        openMeetingRecord: handleOpenMeetingRecord,
        openSettings: handleOpenSettings,
        logout: handleLogout,
        deleteMeeting: handleDeleteMeeting,
        getIssue: socket.actions.getIssue,
        getIssueEvents: socket.actions.getIssueEvents,
        getAlerts: socket.actions.getAlerts,
        getAlert: socket.actions.getAlert,
        acknowledgeAlert: socket.actions.acknowledgeAlert,
        dismissAlert: socket.actions.dismissAlert,
        resolveAlert: socket.actions.resolveAlert,
        updateAlert: socket.actions.updateAlert,
        deleteAlert: socket.actions.deleteAlert,
        updateIssueStatus: handleUpdateIssueStatus,
        updateIssue: handleUpdateIssue,
        deleteIssue: handleDeleteIssue,
        uploadWorkspaceDocument,
        processDocument: handleProcessDocument,
        openDocumentDetail: handleOpenDocumentDetail,
        closeDocumentDetail: handleCloseDocumentDetail,
        deleteDocument: handleDeleteDocument,
      }}
    />
  );
}
