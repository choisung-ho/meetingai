import { useCallback, useEffect, useRef, useState } from "react";
import { CLIENT_SOCKET_EVENTS, SOCKET_URL } from "../constants/socketEvents";
import {
  createRequestId,
  createSocket,
  parseSocketMessage,
  sendSocketMessage,
} from "../services/socketClient";
import {
  runLogoutOnce,
  runRefreshOnce,
} from "../services/auth/authRefreshLock";
import {
  refreshWithRefreshToken,
  silentRefreshWithAccessToken,
} from "../services/auth/authService";
import {
  getJwtSubject,
  normalizeAccessToken,
} from "../services/auth/tokenGuard";
import { canDeleteMeeting } from "../constants/permissions";
import { useAuthStore } from "../store/authStore";
import { useAlertStore } from "../store/alertStore";
import { useDocumentStore } from "../store/documentStore";
import { useMeetingRoomPresenceStore } from "../store/meetingRoomPresenceStore";
import { usePresenceStore } from "../store/presenceStore";
import { useWorkspacePresenceStore } from "../store/workspacePresenceStore";
import { useTranscriptStore } from "../store/transcriptStore";
import { getAiAnalysis } from "../services/aiAnalysisService";
import type { CollaborationUser } from "../types/collaborationUser.types";
import type { RefreshResponse } from "../types/auth.types";
import type {
  RawMeetingRoomUser,
  MeetingRoomUser,
} from "../types/meetingRoom.types";
import type { WorkspaceRole } from "../types/workspace.types";
import type {
  ServerSocketMessage,
  CreateMeetingRequest,
  GetMeetingRequest,
  StartMeetingRequest,
  EndMeetingRequest,
  CreateIssueRequest,
  GetIssuesRequest,
  GetAllIssuesRequest,
  GetIssueRequest,
  GetIssueEventsRequest,
  GetAlertsRequest,
  GetAlertRequest,
  GetDocumentsRequest,
  GetWorkspaceDocumentsRequest,
  GetDocumentRequest,
  GetSttResultsRequest,
  GetSttResultRequest,
  DeleteSttResultRequest,
  DeleteDocumentRequest,
  AcknowledgeAlertRequest,
  DismissAlertRequest,
  ResolveAlertRequest,
  UpdateAlertRequest,
  DeleteAlertRequest,
  UpdateIssueRequest,
  ChangeIssueStateRequest,
  DeleteIssueRequest,
} from "../types/socket.types";
import type {
  WebSocketMeeting,
  MeetingSessionPayload,
  Issue,
  IssueEvent,
  CreateIssuePayload,
  GetAllIssuesPayload,
  GetIssuePayload,
  GetIssueEventsPayload,
  UpdateIssuePayload,
  ChangeIssueStatePayload,
  DeleteIssuePayload,
} from "../types/meeting.types";
import type { RawDocumentFile } from "../types/document.types";
import type { TranscriptChunkPayload } from "../types/transcript.types";
import type {
  GetSttResultsPayload,
  GetSttResultPayload,
  DeleteSttResultPayload,
  RawSttResult,
  SttResult,
  SttResultCreatedPayload,
  SttResultDeletedPayload,
} from "../types/sttResult.types";
import type { AcknowledgeAlertPayload, AlertStatus, DeleteAlertPayload, DismissAlertPayload, GetAlertPayload, GetAlertsPayload, ResolveAlertPayload, UpdateAlertPayload } from "../types/alert.types";


type UseSocketParams = {
  user: CollaborationUser;
  accessToken: string | null;
  socketUrl?: string;
  autoConnect?: boolean;
  heartbeatIntervalMs?: number;
};

const GET_ALERTS_TIMEOUT_MS = 10000;
const GET_ALERT_TIMEOUT_MS = 10000;
const ACKNOWLEDGE_ALERT_TIMEOUT_MS = 10000;
const DISMISS_ALERT_TIMEOUT_MS = 10000;
const RESOLVE_ALERT_TIMEOUT_MS = 10000;
const UPDATE_ALERT_TIMEOUT_MS = 10000;
const DELETE_ALERT_TIMEOUT_MS = 10000;

function normalizeIssue(issue: Issue): Issue {
  return {
    id: Number(issue.id),
    workspaceId: Number(issue.workspaceId),
    meetingId: Number(issue.meetingId),
    title: issue.title,
    description: issue.description ?? null,
    status: issue.status,
    priority: issue.priority ?? null,
    dueDate: issue.dueDate ?? null,
    assigneeId: issue.assigneeId ?? null,
    createdAt: issue.createdAt ?? null,
    updatedAt: issue.updatedAt ?? null,
    deletedAt: issue.deletedAt ?? null,
  };
}

function mergeIssueList(prev: Issue[], nextIssue: Issue) {
  const issue = normalizeIssue(nextIssue);
  const exists = prev.some((item) => Number(item.id) === Number(issue.id));

  if (!exists) {
    return [...prev, issue];
  }

  return prev.map((item) =>
    Number(item.id) === Number(issue.id) ? issue : item
  );
}

function getDocumentField(
  document: Record<string, unknown>,
  camelKey: string,
  snakeKey: string
) {
  return document[camelKey] !== undefined ? document[camelKey] : document[snakeKey];
}

function toOptionalNumber(value: unknown) {
  return value == null ? undefined : Number(value);
}

function toNullableNumber(value: unknown) {
  return value == null ? null : Number(value);
}

function normalizeDocumentPayload(payload: RawDocumentFile): RawDocumentFile {
  const document = payload as Record<string, unknown>;

  return {
    id: Number(document.id),
    workspaceId: toOptionalNumber(
      getDocumentField(document, "workspaceId", "workspace_id")
    ),
    meetingId: toNullableNumber(
      getDocumentField(document, "meetingId", "meeting_id")
    ),
    originalFilename: String(
      getDocumentField(document, "originalFilename", "original_filename") ?? ""
    ),
    storedFilename: String(
      getDocumentField(document, "storedFilename", "stored_filename") ?? ""
    ),
    contentType: String(
      getDocumentField(document, "contentType", "content_type") ?? ""
    ),
    fileSize: Number(getDocumentField(document, "fileSize", "file_size")),
    storagePath: String(
      getDocumentField(document, "storagePath", "storage_path") ?? ""
    ),
    status: String(document.status ?? ""),
    createdAt: String(getDocumentField(document, "createdAt", "created_at") ?? ""),
  };
}

function normalizeDeletedDocumentPayload(payload: Record<string, unknown>) {
  return {
    documentId: Number(
      payload.documentId !== undefined ? payload.documentId : payload.document_id
    ),
    workspaceId: Number(
      payload.workspaceId !== undefined ? payload.workspaceId : payload.workspace_id
    ),
    meetingId: toNullableNumber(
      payload.meetingId !== undefined ? payload.meetingId : payload.meeting_id
    ),
    deleted: Boolean(payload.deleted),
  };
}

function normalizeSttResult(result: RawSttResult): SttResult {
  return {
    id: Number(result.id),
    workspaceId: toNullableNumber(result.workspaceId ?? result.workspace_id),
    meetingId: toNullableNumber(result.meetingId ?? result.meeting_id),
    language: result.language ?? "",
    rawText: result.rawText ?? result.raw_text ?? "",
    status: result.status ?? "",
    createdAt: result.createdAt ?? result.created_at ?? "",
  };
}

function normalizeMeetingRoomUsers(
  users: RawMeetingRoomUser[]
): MeetingRoomUser[] {
  return users.map((user) => ({
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    joinedAt: user.joinedAt,
    lastSeenAt: user.lastSeenAt,
  }));
}

function mapMeetingSession(payload: MeetingSessionPayload): WebSocketMeeting {
  return {
    id: payload.meetingId,
    workspaceId: payload.workspaceId,
    title: payload.title,
    description: payload.description,
    status: payload.status,
    scheduledAt: payload.scheduledAt,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    createdAt: payload.createdAt,
    created_at: payload.createdAt,
  };
}

function mergeMeetingSession(
  meeting: WebSocketMeeting,
  payload: MeetingSessionPayload
): WebSocketMeeting {
  return {
    ...meeting,
    ...mapMeetingSession(payload),
    id: meeting.id,
  };
}

function getMeetingTitleFallback(meetingId: number, meetings: WebSocketMeeting[]) {
  return (
    meetings.find((meeting) => Number(meeting.id) === Number(meetingId))?.title?.trim() ||
    `회의 ${meetingId}`
  );
}

export function useSocket({
  user,
  accessToken,
  socketUrl = SOCKET_URL,
  autoConnect = true,
  heartbeatIntervalMs = 30000,
}: UseSocketParams) {
  const socketRef = useRef<WebSocket | null>(null);
  const socketAccessTokenRef = useRef<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectSocketRef = useRef<() => void>(() => undefined);
  const socketConnectionIdRef = useRef(0);
  const isHandlingSessionExpiredRef = useRef(false);
  const createMeetingPendingRef = useRef(false);
  const createMeetingAckReceivedRef = useRef(false);
  const isStartMeetingPendingRef = useRef(false);
  const isEndMeetingPendingRef = useRef(false);
  const isCreateIssuePendingRef = useRef(false);
  const isUpdateIssuePendingRef = useRef(false);
  const isDeleteIssuePendingRef = useRef(false);
  const getAlertsTimeoutRef = useRef<number | null>(null);
  const getAlertTimeoutRef = useRef<number | null>(null);
  const acknowledgeAlertTimeoutRef = useRef<number | null>(null);
  const dismissAlertTimeoutRef = useRef<number | null>(null);
  const resolveAlertTimeoutRef = useRef<number | null>(null);
  const updateAlertTimeoutRef = useRef<number | null>(null);
  const deleteAlertTimeoutRef = useRef<number | null>(null);
  const pendingGetAlertsKeyRef = useRef<string | null>(null);
  const pendingJoinWorkspaceRef = useRef<{
    requestId: string;
    workspaceId: number;
  } | null>(null);
  const lastJoinedWorkspaceIdRef = useRef<number | null>(null);
  const lastAutoJoinKeyRef = useRef<string | null>(null);
  const pendingGetMeetingsRef = useRef<{
    requestId: string;
    workspaceId: number;
  } | null>(null);
  const pendingGetMeetingRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
  } | null>(null);
  const pendingGetIssuesRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number | null;
  } | null>(null);
  const pendingGetAllIssuesRef = useRef<{
    requestId: string;
    workspaceId: number;
  } | null>(null);
  const pendingGetDocumentsRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number;
  } | null>(null);
  const pendingGetSttResultsRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number;
  } | null>(null);
  const getSttResultsRef = useRef<
    (workspaceId: number, meetingId: number, meetingRoomId: number) => void
  >(() => undefined);
  const pendingGetWorkspaceDocumentsRef = useRef<{
    requestId: string;
    workspaceId: number;
  } | null>(null);
  const pendingGetDocumentRef = useRef<{
    requestId: string;
    workspaceId: number;
    documentId: number;
  } | null>(null);
  const pendingDeleteDocumentRef = useRef<{
    requestId: string;
    workspaceId: number;
    documentId: number;
    meetingId?: number;
    meetingRoomId?: number;
  } | null>(null);
  const currentIssueContextRef = useRef<{
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number | null;
  } | null>(null);
  const pendingGetAlertsRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number;
    status?: AlertStatus;
  } | null>(null);
  const pendingGetAlertRef = useRef<{
    requestId: string;
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number;
    alertId: number;
  } | null>(null);
  const pendingAcknowledgeAlertRef = useRef<{
    requestId: string;
    alertId: number;
  } | null>(null);
  const pendingDismissAlertRef = useRef<{
    requestId: string;
    alertId: number;
  } | null>(null);
  const pendingResolveAlertRef = useRef<{
    requestId: string;
    alertId: number;
  } | null>(null);
  const pendingUpdateAlertRef = useRef<{
    requestId: string;
    alertId: number;
  } | null>(null);
  const pendingDeleteAlertRef = useRef<{
    requestId: string;
    alertId: number;
  } | null>(null);

  const [meetings, setMeetings] = useState<WebSocketMeeting[]>([]);
  //회의 안건
  const [issues, setIssues] = useState<Issue[]>([]);
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<Issue | null>(null);
  const [isIssueDetailLoading, setIsIssueDetailLoading] = useState(false);
  const [selectedIssueEvents, setSelectedIssueEvents] = useState<IssueEvent[]>([]);
  const [isIssueEventsLoading, setIsIssueEventsLoading] = useState(false);
  const [isMeetingLoading, setIsMeetingLoading] = useState(false);
  const [meetingErrorMessage, setMeetingErrorMessage] = useState<string | null>(
    null
  );
  const [loadedMeetingsWorkspaceId, setLoadedMeetingsWorkspaceId] =
    useState<number | null>(null);
  const [lastCreatedMeeting, setLastCreatedMeeting] =
    useState<WebSocketMeeting | null>(null);
  const [lastFetchedMeeting, setLastFetchedMeeting] =
    useState<WebSocketMeeting | null>(null);
  const [lastCreatedSttResult, setLastCreatedSttResult] =
    useState<SttResultCreatedPayload | null>(null);
  const [sttResults, setSttResults] = useState<SttResult[]>([]);
  const [selectedSttResult, setSelectedSttResult] =
    useState<SttResult | null>(null);
  const [, setSocketUserId] = useState<string | null>(null);

  const applySttResultDeleted = useCallback((sttResultId: number) => {
    setSttResults((items) =>
      items.filter((item) => Number(item.id) !== Number(sttResultId))
    );
    setSelectedSttResult((selected) =>
      selected && Number(selected.id) === Number(sttResultId) ? null : selected
    );
  }, []);

  const applySttResultUpdated = useCallback((sttResult: SttResult) => {
    setSttResults((items) =>
      items.map((item) =>
        Number(item.id) === Number(sttResult.id)
          ? {
              ...item,
              ...sttResult,
              workspaceId: sttResult.workspaceId ?? item.workspaceId,
              meetingId: sttResult.meetingId ?? item.meetingId,
              language: sttResult.language || item.language,
              rawText: sttResult.rawText || item.rawText,
              createdAt: sttResult.createdAt || item.createdAt,
              status: sttResult.status || item.status,
            }
          : item
      )
    );
    setSelectedSttResult((selected) =>
      selected && Number(selected.id) === Number(sttResult.id)
        ? {
            ...selected,
            ...sttResult,
            workspaceId: sttResult.workspaceId ?? selected.workspaceId,
            meetingId: sttResult.meetingId ?? selected.meetingId,
            language: sttResult.language || selected.language,
            rawText: sttResult.rawText || selected.rawText,
            createdAt: sttResult.createdAt || selected.createdAt,
            status: sttResult.status || selected.status,
          }
        : selected
    );
  }, []);

  const setStatus = usePresenceStore((state) => state.setStatus);
  const setCurrentUser = usePresenceStore((state) => state.setCurrentUser);
  const setLastServerTime = usePresenceStore(
    (state) => state.setLastServerTime
  );
  const setError = usePresenceStore((state) => state.setError);
  const alerts = useAlertStore((state) => state.alerts);
  const selectedAlertId = useAlertStore((state) => state.selectedAlertId);
  const alertDetail = useAlertStore((state) => state.alertDetail);
  const popupAlert = useAlertStore((state) => state.popupAlert);
  const isAlertLoading = useAlertStore((state) => state.isLoading);
  const isAlertDetailLoading = useAlertStore((state) => state.isDetailLoading);
  const isAcknowledgeAlertLoading = useAlertStore((state) => state.isAcknowledgeLoading);
  const isDismissAlertLoading = useAlertStore((state) => state.isDismissLoading);
  const isResolveAlertLoading = useAlertStore((state) => state.isResolveLoading);
  const isUpdateAlertLoading = useAlertStore((state) => state.isUpdateLoading);
  const isDeleteAlertLoading = useAlertStore((state) => state.isDeleteLoading);
  const alertErrorMessage = useAlertStore((state) => state.errorMessage);
  const alertDetailErrorMessage = useAlertStore((state) => state.detailErrorMessage);
  const acknowledgeAlertErrorMessage = useAlertStore((state) => state.acknowledgeErrorMessage);
  const dismissAlertErrorMessage = useAlertStore((state) => state.dismissErrorMessage);
  const resolveAlertErrorMessage = useAlertStore((state) => state.resolveErrorMessage);
  const updateAlertErrorMessage = useAlertStore((state) => state.updateErrorMessage);
  const deleteAlertErrorMessage = useAlertStore((state) => state.deleteErrorMessage);
  const setAlerts = useAlertStore((state) => state.setAlerts);
  const addAlert = useAlertStore((state) => state.addAlert);
  const mergeAlert = useAlertStore((state) => state.updateAlert);
  const removeAlert = useAlertStore((state) => state.removeAlert);
  const setSelectedAlertId = useAlertStore((state) => state.setSelectedAlertId);
  const setAlertDetail = useAlertStore((state) => state.setAlertDetail);
  const setPopupAlert = useAlertStore((state) => state.setPopupAlert);
  const setAlertLoading = useAlertStore((state) => state.setLoading);
  const setAlertDetailLoading = useAlertStore((state) => state.setDetailLoading);
  const setAcknowledgeAlertLoading = useAlertStore((state) => state.setAcknowledgeLoading);
  const setDismissAlertLoading = useAlertStore((state) => state.setDismissLoading);
  const setResolveAlertLoading = useAlertStore((state) => state.setResolveLoading);
  const setUpdateAlertLoading = useAlertStore((state) => state.setUpdateLoading);
  const setDeleteAlertLoading = useAlertStore((state) => state.setDeleteLoading);
  const setAlertErrorMessage = useAlertStore((state) => state.setErrorMessage);
  const setAlertDetailErrorMessage = useAlertStore((state) => state.setDetailErrorMessage);
  const setAcknowledgeAlertErrorMessage = useAlertStore((state) => state.setAcknowledgeErrorMessage);
  const setDismissAlertErrorMessage = useAlertStore((state) => state.setDismissErrorMessage);
  const setResolveAlertErrorMessage = useAlertStore((state) => state.setResolveErrorMessage);
  const setUpdateAlertErrorMessage = useAlertStore((state) => state.setUpdateErrorMessage);
  const setDeleteAlertErrorMessage = useAlertStore((state) => state.setDeleteErrorMessage);
  const resetAlerts = useAlertStore((state) => state.resetAlerts);
  const replaceDocumentsForMeeting = useDocumentStore(
    (state) => state.replaceDocumentsForMeeting
  );
  const replaceDocumentsForWorkspace = useDocumentStore(
    (state) => state.replaceDocumentsForWorkspace
  );
  const setSelectedDocument = useDocumentStore(
    (state) => state.setSelectedDocument
  );
  const addDocument = useDocumentStore((state) => state.addDocument);
  const updateDocument = useDocumentStore((state) => state.updateDocument);
  const removeDocument = useDocumentStore((state) => state.removeDocument);
  const resetDocuments = useDocumentStore((state) => state.resetDocuments);

  const socketStatus = usePresenceStore((state) => state.status);
  const currentUser = usePresenceStore((state) => state.currentUser);
  const lastServerTime = usePresenceStore((state) => state.lastServerTime);
  const error = usePresenceStore((state) => state.error);

  const setWorkspaceId = useWorkspacePresenceStore(
    (state) => state.setWorkspaceId
  );
  const setWorkspaceStatus = useWorkspacePresenceStore(
    (state) => state.setStatus
  );
  const setWorkspaceUsers = useWorkspacePresenceStore(
    (state) => state.setUsers
  );
  const setWorkspaceJoinedAt = useWorkspacePresenceStore(
    (state) => state.setJoinedAt
  );
  const setWorkspaceLeftAt = useWorkspacePresenceStore(
    (state) => state.setLeftAt
  );
  const setWorkspaceUpdatedAt = useWorkspacePresenceStore(
    (state) => state.setUpdatedAt
  );
  const setWorkspaceErrorMessage = useWorkspacePresenceStore(
    (state) => state.setErrorMessage
  );

  const workspaceId = useWorkspacePresenceStore((state) => state.workspaceId);
  const workspaceStatus = useWorkspacePresenceStore((state) => state.status);
  const workspaceUsers = useWorkspacePresenceStore((state) => state.users);
  const workspaceUpdatedAt = useWorkspacePresenceStore(
    (state) => state.updatedAt
  );
  const workspaceErrorMessage = useWorkspacePresenceStore(
    (state) => state.errorMessage
  );

  const setMeetingRoomWorkspaceId = useMeetingRoomPresenceStore(
    (state) => state.setWorkspaceId
  );
  const setMeetingRoomId = useMeetingRoomPresenceStore(
    (state) => state.setMeetingRoomId
  );
  const setMeetingRoomStatus = useMeetingRoomPresenceStore(
    (state) => state.setStatus
  );
  const setMeetingRoomUsers = useMeetingRoomPresenceStore(
    (state) => state.setUsers
  );
  const setMeetingRoomJoinedAt = useMeetingRoomPresenceStore(
    (state) => state.setJoinedAt
  );
  const setMeetingRoomLeftAt = useMeetingRoomPresenceStore(
    (state) => state.setLeftAt
  );
  const setMeetingRoomUpdatedAt = useMeetingRoomPresenceStore(
    (state) => state.setUpdatedAt
  );
  const setMeetingRoomErrorMessage = useMeetingRoomPresenceStore(
    (state) => state.setErrorMessage
  );

  const meetingRoomWorkspaceId = useMeetingRoomPresenceStore(
    (state) => state.workspaceId
  );
  const meetingRoomId = useMeetingRoomPresenceStore(
    (state) => state.meetingRoomId
  );
  const meetingRoomStatus = useMeetingRoomPresenceStore(
    (state) => state.status
  );
  const meetingRoomUsers = useMeetingRoomPresenceStore((state) => state.users);
  const meetingRoomUpdatedAt = useMeetingRoomPresenceStore(
    (state) => state.updatedAt
  );
  const meetingRoomErrorMessage = useMeetingRoomPresenceStore(
    (state) => state.errorMessage
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      console.log("[Socket] heartbeat stop");
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      console.log("[Socket] reconnect timer clear");
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (source: string, afterConnect?: () => void) => {
      clearReconnectTimer();

      console.log("[Socket] reconnect timer schedule", { source });

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectSocketRef.current();
        afterConnect?.();
      }, 0);
    },
    [clearReconnectTimer]
  );

  const clearGetAlertsTimeout = useCallback(() => {
    if (getAlertsTimeoutRef.current) {
      window.clearTimeout(getAlertsTimeoutRef.current);
      getAlertsTimeoutRef.current = null;
    }
  }, []);

  const clearGetAlertTimeout = useCallback(() => {
    if (getAlertTimeoutRef.current) {
      window.clearTimeout(getAlertTimeoutRef.current);
      getAlertTimeoutRef.current = null;
    }
  }, []);

  const clearAcknowledgeAlertTimeout = useCallback(() => {
    if (acknowledgeAlertTimeoutRef.current) {
      window.clearTimeout(acknowledgeAlertTimeoutRef.current);
      acknowledgeAlertTimeoutRef.current = null;
    }
  }, []);

  const clearDismissAlertTimeout = useCallback(() => {
    if (dismissAlertTimeoutRef.current) {
      window.clearTimeout(dismissAlertTimeoutRef.current);
      dismissAlertTimeoutRef.current = null;
    }
  }, []);

  const clearResolveAlertTimeout = useCallback(() => {
    if (resolveAlertTimeoutRef.current) {
      window.clearTimeout(resolveAlertTimeoutRef.current);
      resolveAlertTimeoutRef.current = null;
    }
  }, []);

  const clearUpdateAlertTimeout = useCallback(() => {
    if (updateAlertTimeoutRef.current) {
      window.clearTimeout(updateAlertTimeoutRef.current);
      updateAlertTimeoutRef.current = null;
    }
  }, []);

  const clearDeleteAlertTimeout = useCallback(() => {
    if (deleteAlertTimeoutRef.current) {
      window.clearTimeout(deleteAlertTimeoutRef.current);
      deleteAlertTimeoutRef.current = null;
    }
  }, []);

  const sendGetIssueEventsMessage = useCallback(
    (payload: GetIssueEventsPayload) => {
      const finalPayload: GetIssueEventsPayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        issueId: Number(payload.issueId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ISSUE_EVENTS:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !Number.isFinite(finalPayload.issueId) ||
        finalPayload.issueId <= 0
      ) {
        console.warn("[GET_ISSUE_EVENTS:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };

      const message: GetIssueEventsRequest = {
        type: "GET_ISSUE_EVENTS",
        requestId: createRequestId("get-issue-events"),
        payload: finalPayload,
      };

      setIsIssueEventsLoading(true);
      console.log("[GET_ISSUE_EVENTS:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ISSUE_EVENTS");
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const logoutExpiredSession = useCallback(() => {
    runLogoutOnce(() => {
      stopHeartbeat();
      clearReconnectTimer();

      const socket = socketRef.current;
      socketRef.current = null;

      if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }

      useAuthStore.getState().clearAuth();

      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    });
  }, [clearReconnectTimer, stopHeartbeat]);

  const refreshExpiredSession = useCallback(async () => {
    try {
      const result = await runRefreshOnce(async () => {
        const auth = useAuthStore.getState();
        let nextResult: RefreshResponse | null = null;

        if (auth.accessToken) {
          try {
            nextResult = await silentRefreshWithAccessToken(auth.accessToken);
          } catch (error) {
            console.error("[SOCKET_SILENT_REFRESH:FAILED]", error);
          }
        }

        if (!nextResult && auth.refreshToken) {
          nextResult = await refreshWithRefreshToken(auth.refreshToken);
        }

        if (!nextResult) {
          throw new Error("Session refresh failed");
        }

        return nextResult;
      });

      useAuthStore.getState().setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        ...(result.user ? { user: result.user } : {}),
      });

      return true;
    } catch (error) {
      console.error("[SOCKET_SESSION_REFRESH:FAILED]", error);
      return false;
    }
  }, []);

  const handleSessionExpired = useCallback(async () => {
    if (isHandlingSessionExpiredRef.current) {
      console.log("[Socket] SESSION_EXPIRED ignored: already handling");
      return;
    }

    isHandlingSessionExpiredRef.current = true;
    let didScheduleReconnect = false;

    try {
      const refreshed = await refreshExpiredSession();

      if (!refreshed) {
        logoutExpiredSession();
        return;
      }

      stopHeartbeat();

      const socket = socketRef.current;
      socketRef.current = null;

      if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }

      didScheduleReconnect = true;
      scheduleReconnect("session-expired", () => {
        isHandlingSessionExpiredRef.current = false;
      });
    } finally {
      if (!didScheduleReconnect) {
        isHandlingSessionExpiredRef.current = false;
      }
    }
  }, [
    logoutExpiredSession,
    refreshExpiredSession,
    scheduleReconnect,
    stopHeartbeat,
  ]);

  const getReconnectWorkspaceId = useCallback(() => {
    const workspaceState = useWorkspacePresenceStore.getState();
    const candidates = [
      workspaceState.workspaceId,
      lastJoinedWorkspaceIdRef.current,
      Number(localStorage.getItem("currentWorkspaceId")),
      Number(localStorage.getItem("lastWorkspaceId")),
      Number(sessionStorage.getItem("currentWorkspaceId")),
      Number(sessionStorage.getItem("lastWorkspaceId")),
      useAuthStore.getState().defaultWorkspaceId,
    ];

    return (
      candidates.find(
        (workspaceId): workspaceId is number =>
          typeof workspaceId === "number" &&
          Number.isInteger(workspaceId) &&
          workspaceId > 0
      ) ?? null
    );
  }, []);

  const sendJoinWorkspaceMessage = useCallback(
    (targetWorkspaceId: number, source: "manual" | "auto-reconnect") => {
      const finalWorkspaceId = Number(targetWorkspaceId);
      const currentWorkspace = useWorkspacePresenceStore.getState();

      if (!Number.isInteger(finalWorkspaceId) || finalWorkspaceId <= 0) {
        setWorkspaceStatus("error");
        setWorkspaceErrorMessage("유효한 workspaceId가 필요합니다.");
        return;
      }

      const socket = socketRef.current;

      if (socket === null) {
        setWorkspaceStatus("error");
        setWorkspaceErrorMessage(
          "WebSocket에 연결되지 않아 워크스페이스에 입장할 수 없습니다."
        );
        return;
      }

      const activeSocket: WebSocket = socket;

      if (activeSocket.readyState !== WebSocket.OPEN) {
        setWorkspaceStatus("error");
        setWorkspaceErrorMessage(
          "WebSocket에 연결되지 않아 워크스페이스에 입장할 수 없습니다."
        );
        return;
      }

      const auth = useAuthStore.getState();
      const authUserId = auth.authUserId ?? getJwtSubject(auth.accessToken);
      const connectedSocketUserId = getJwtSubject(socketAccessTokenRef.current);

      if (
        !authUserId ||
        !connectedSocketUserId ||
        authUserId !== connectedSocketUserId
      ) {
        console.warn("[SocketGuard] block JOIN_WORKSPACE", {
          authUser: authUserId ?? "unknown",
          socketUser: connectedSocketUserId ?? "unknown",
        });

        stopHeartbeat();

        const socketToClose = socketRef.current;

        if (socketToClose !== null) {
          const activeSocketToClose: WebSocket = socketToClose;

          if (
            activeSocketToClose.readyState === WebSocket.OPEN ||
            activeSocketToClose.readyState === WebSocket.CONNECTING
          ) {
            activeSocketToClose.close();
          }

          socketRef.current = null;
        }

        socketAccessTokenRef.current = null;
        setSocketUserId(null);
        setStatus("disconnected");
        setWorkspaceStatus("left");

        scheduleReconnect("join-workspace-guard");
        return;
      }

      if (
        pendingJoinWorkspaceRef.current?.workspaceId === finalWorkspaceId ||
        (currentWorkspace.workspaceId === finalWorkspaceId &&
          (currentWorkspace.status === "joining" ||
            currentWorkspace.status === "joined"))
      ) {
        return;
      }

      const requestId = createRequestId("join-workspace");

      pendingJoinWorkspaceRef.current = {
        requestId,
        workspaceId: finalWorkspaceId,
      };
      lastJoinedWorkspaceIdRef.current = finalWorkspaceId;

      setWorkspaceStatus("joining");
      setWorkspaceJoinedAt(null);
      setWorkspaceLeftAt(null);
      setWorkspaceErrorMessage(null);

      console.log("[SEND] JOIN_WORKSPACE", {
        workspaceId: finalWorkspaceId,
        requestId,
        source,
      });

      sendSocketMessage(activeSocket, {
        type: CLIENT_SOCKET_EVENTS.JOIN_WORKSPACE,
        requestId,
        payload: {
          workspaceId: finalWorkspaceId,
        },
      });
    },
    [
      setStatus,
      setWorkspaceErrorMessage,
      setWorkspaceJoinedAt,
      setWorkspaceLeftAt,
      setWorkspaceStatus,
      scheduleReconnect,
      stopHeartbeat,
    ]
  );

  const handleServerMessage = useCallback(
    (message: ServerSocketMessage) => {
      switch (message.type) {
        case "CONNECTED": {
          setStatus("socket_connected");
          setError(null);
          break;
        }

        case "CONNECT_USER_ACK": {
          console.log("[RECEIVE] CONNECT_USER_ACK");

          setStatus("user_registered");
          setCurrentUser({
            userId: message.payload.userId,
            name: message.payload.name,
            status: message.payload.status,
            connectedAt: message.payload.connectedAt,
          });
          setError(null);

          const reconnectWorkspaceId = getReconnectWorkspaceId();

          if (reconnectWorkspaceId) {
            const autoJoinKey = `${socketConnectionIdRef.current}:${reconnectWorkspaceId}`;

            if (lastAutoJoinKeyRef.current !== autoJoinKey) {
              lastAutoJoinKeyRef.current = autoJoinKey;
              sendJoinWorkspaceMessage(reconnectWorkspaceId, "auto-reconnect");
            }
          }

          break;
        }

        case "DISCONNECT_USER_ACK": {
          stopHeartbeat();
          setStatus("disconnected");
          setCurrentUser(null);
          setError(null);
          setWorkspaceStatus("left");
          setMeetingRoomStatus("left");

          if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
          }

          break;
        }

        case "PONG": {
          setLastServerTime(message.payload.serverTime);
          break;
        }

        case "JOIN_WORKSPACE_ACK": {
          console.log("[RECEIVE] JOIN_WORKSPACE_ACK", {
            workspaceId: message.payload.workspaceId,
            requestId: message.requestId,
            success: message.success,
          });

          const responseWorkspaceId = Number(message.payload.workspaceId);
          const pendingWorkspace = pendingJoinWorkspaceRef.current;

          if (
            pendingWorkspace &&
            (message.requestId !== pendingWorkspace.requestId ||
              responseWorkspaceId !== pendingWorkspace.workspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              pendingWorkspaceId: pendingWorkspace.workspaceId,
            });
            break;
          }

          if (!message.success) {
            if (pendingWorkspace) {
              pendingJoinWorkspaceRef.current = null;
              setWorkspaceId(pendingWorkspace.workspaceId);
            }
            setWorkspaceStatus("error");
            setWorkspaceErrorMessage("워크스페이스 입장에 실패했습니다.");
            break;
          }

          pendingJoinWorkspaceRef.current = null;
          setWorkspaceId(responseWorkspaceId);
          setWorkspaceStatus("joined");
          setWorkspaceJoinedAt(message.payload.joinedAt);
          setWorkspaceLeftAt(null);
          setWorkspaceErrorMessage(null);
          // users는 의도적으로 건드리지 않음: WORKSPACE_USERS_UPDATED가 ACK보다 먼저
          // 도착해 이미 반영된 값이 있으면 그대로 유지한다.
          break;
        }

        case "LEAVE_WORKSPACE_ACK": {
          console.log("[RECEIVE] LEAVE_WORKSPACE_ACK");

          if (!message.success) {
            setWorkspaceStatus("error");
            setWorkspaceErrorMessage("워크스페이스 퇴장에 실패했습니다.");
            break;
          }

          const leftWorkspaceId = Number(message.payload.workspaceId);
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;
          const pendingJoin = pendingJoinWorkspaceRef.current;
          const isTransitioningWorkspace = pendingJoin !== null;

          if (
            !isTransitioningWorkspace &&
            currentWorkspaceId &&
            Number(currentWorkspaceId) !== leftWorkspaceId
          ) {
            break;
          }

          if (isTransitioningWorkspace) {
            // workspace 전환 중에는 새 workspace의 JOIN 결과가 화면 상태를 결정해야 하므로
            // 이전 workspace의 leave ack로 users/상태를 비우면 일시적으로 0명이 표시된다.
            console.log("[LEAVE_WORKSPACE_ACK:SKIPPED_DURING_TRANSITION]", {
              leftWorkspaceId,
              pendingJoinWorkspaceId: pendingJoin.workspaceId,
            });
            break;
          }

          setWorkspaceId(leftWorkspaceId);
          setWorkspaceStatus("left");
          setWorkspaceLeftAt(message.payload.leftAt);
          setWorkspaceUsers([]);
          setWorkspaceUpdatedAt(null);
          setWorkspaceErrorMessage(null);
          break;
        }

        case "WORKSPACE_USERS_UPDATED": {
          console.log("[BROADCAST] WORKSPACE_USERS_UPDATED", message.payload);

          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId ?? null;
          const currentWorkspaceIdNumber =
            currentWorkspaceId === null ? null : Number(currentWorkspaceId);
          const pendingJoin = pendingJoinWorkspaceRef.current;

          const isCurrentWorkspace =
            currentWorkspaceIdNumber !== null &&
            incomingWorkspaceId === currentWorkspaceIdNumber;
          const isPendingJoinWorkspace =
            pendingJoin !== null && incomingWorkspaceId === pendingJoin.workspaceId;

          if (!isCurrentWorkspace && !isPendingJoinWorkspace) {
            console.log("[BROADCAST] WORKSPACE_USERS_UPDATED ignored", {
              incomingWorkspaceId,
              currentWorkspaceId: currentWorkspaceIdNumber,
              pendingJoinWorkspaceId: pendingJoin?.workspaceId ?? null,
            });
            break;
          }

          if (isPendingJoinWorkspace && !isCurrentWorkspace) {
            // JOIN_WORKSPACE_ACK보다 users update가 먼저 도착한 경우.
            // pending join workspace를 기준으로 workspaceId를 맞춰 화면과 일치시킨다.
            setWorkspaceId(incomingWorkspaceId);
          }

          setWorkspaceUsers(message.payload.users);
          setWorkspaceUpdatedAt(message.payload.updatedAt);
          setWorkspaceErrorMessage(null);
          console.log("[BROADCAST] WORKSPACE_USERS_UPDATED applied", {
            workspaceId: incomingWorkspaceId,
            userCount: message.payload.users.length,
            updatedAt: message.payload.updatedAt,
          });
          break;
        }

        case "GET_MEETING_ACK": {
          console.log("[GET_MEETING_ACK:RECEIVED]", message.payload);

          const responseWorkspaceId = Number(message.payload.workspaceId);
          const pendingMeeting = pendingGetMeetingRef.current;

          if (
            pendingMeeting &&
            (message.requestId !== pendingMeeting.requestId ||
              responseWorkspaceId !== pendingMeeting.workspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              pendingWorkspaceId: pendingMeeting.workspaceId,
            });
            break;
          }

          setIsMeetingLoading(false);

          if (!message.success) {
            setMeetingErrorMessage("회의 상세 조회에 실패했습니다.");
            break;
          }

          pendingGetMeetingRef.current = null;

          const fetchedMeeting: WebSocketMeeting = {
            id: message.payload.id,
            title: message.payload.title,
            status: message.payload.status,
            createdAt: message.payload.fetchedAt,
            created_at: message.payload.fetchedAt,
          };

          setLastFetchedMeeting(fetchedMeeting);
          setMeetingErrorMessage(null);
          console.log("[GET_MEETING_ACK:SAVED]", fetchedMeeting);
          break;
        }

        case "GET_MEETINGS_ACK": {
          console.log("[RECEIVE] GET_MEETINGS_ACK");

          const responseWorkspaceId = Number(message.payload.workspaceId);
          const pendingMeetings = pendingGetMeetingsRef.current;

          if (
            pendingMeetings &&
            (message.requestId !== pendingMeetings.requestId ||
              responseWorkspaceId !== pendingMeetings.workspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              pendingWorkspaceId: pendingMeetings.workspaceId,
            });
            break;
          }

          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;

          if (
            currentWorkspaceId &&
            responseWorkspaceId !== Number(currentWorkspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              currentWorkspaceId,
              reason: "workspace mismatch",
            });
            break;
          }

          setIsMeetingLoading(false);

          if (!message.success) {
            setMeetingErrorMessage("회의 목록 조회에 실패했습니다.");
            break;
          }

          // 최신 명세 기준: payload.meetings
          pendingGetMeetingsRef.current = null;

          const meetingList = Array.isArray(message.payload.meetings)
            ? message.payload.meetings.map((meeting) => ({
                ...meeting,
                workspaceId: responseWorkspaceId,
              }))
            : [];

          // GET_MEETINGS_ACK는 목록 전체 초기화/교체
          setMeetings(meetingList.filter((item) => item != null));
          setLoadedMeetingsWorkspaceId(responseWorkspaceId);
          setMeetingErrorMessage(null);
          console.log("[GET_MEETINGS_ACK:APPLIED]", { count: meetingList.length });

          break;
        }

        case "DELETE_MEETING_ACK": {
          console.log("[RECEIVE] DELETE_MEETING_ACK");

          setIsMeetingLoading(false);

          if (!message.success) {
            setMeetingErrorMessage("회의 삭제에 실패했습니다.");
            break;
          }

          setMeetingErrorMessage(null);
          break;
        }

        case "MEETING_DELETED": {
          console.log("[BROADCAST] MEETING_DELETED");

          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const storedWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;
          const currentWorkspaceId = storedWorkspaceId
            ? Number(storedWorkspaceId)
            : null;

          // 현재 보고 있는 workspace가 아니면 무시
          if (currentWorkspaceId && incomingWorkspaceId !== currentWorkspaceId) {
            break;
          }

          const deletedMeetingId = String(message.payload.id);

          // 삭제된 회의를 목록에서 제거
          setMeetings((prev) =>
            prev.filter(
              (meeting) => String(meeting.id) !== deletedMeetingId
            )
          );

          // 마지막 생성 회의가 삭제된 회의면 초기화
          setLastCreatedMeeting((prev) => {
            if (!prev) {
              return prev;
            }

            return String(prev.id) === deletedMeetingId ? null : prev;
          });

          setMeetingErrorMessage(null);

          break;
        }

        case "CREATE_MEETING_ACK": {
          console.log("[RECEIVE] CREATE_MEETING_ACK");

          setIsMeetingLoading(false);

          if (!message.success) {
            createMeetingPendingRef.current = false;
            setMeetingErrorMessage("회의 생성에 실패했습니다.");
            break;
          }

          // ACK payload에 meeting id가 없는 서버 구조에 대응.
          // id 비교 대신 "이 클라이언트가 CREATE_MEETING을 요청했고 ACK를 받았다"는 플래그를 사용.
          createMeetingAckReceivedRef.current = true;

          setMeetingErrorMessage(null);

          break;
        }

        case "MEETING_CREATED": {
          console.log("[BROADCAST] MEETING_CREATED");

          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const storedWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;
          const currentWorkspaceId = storedWorkspaceId
            ? Number(storedWorkspaceId)
            : null;

          // 현재 보고 있는 workspace와 같은 경우에만 목록에 추가
          if (currentWorkspaceId && incomingWorkspaceId !== currentWorkspaceId) {
            break;
          }

          const newMeeting = {
            id: message.payload.id,
            title: message.payload.title,
            status: message.payload.status,
            createdAt: message.payload.createdAt,
          };

          setMeetings((prev) => {
            const exists = prev.some(
              (meeting) => String(meeting.id) === String(newMeeting.id)
            );

            if (exists) {
              return prev;
            }

            return [...prev, newMeeting];
          });

          // 이 클라이언트가 CREATE_MEETING을 요청했고 ACK까지 받은 상태일 때만
          // 첫 번째 MEETING_CREATED를 내가 생성한 회의로 처리해 자동 이동.
          if (createMeetingPendingRef.current && createMeetingAckReceivedRef.current) {
            createMeetingPendingRef.current = false;
            createMeetingAckReceivedRef.current = false;
            setLastCreatedMeeting(newMeeting);
          }

          setMeetingErrorMessage(null);

          break;
        }

        case "GET_ALL_ISSUES_ACK": {
          if (!message.success) {
            const errorPayload = message.payload as {
              message?: string;
              errorMessage?: string;
              error?: string;
            };
            const errorMessage =
              errorPayload.message ??
              errorPayload.errorMessage ??
              errorPayload.error ??
              "전체 안건 조회에 실패했습니다.";

            pendingGetAllIssuesRef.current = null;
            setMeetingErrorMessage(errorMessage);
            break;
          }

          const allIssues = Array.isArray(message.payload?.issues)
            ? message.payload.issues.map(normalizeIssue)
            : [];
          const pendingIssues = pendingGetAllIssuesRef.current;
          const payloadWithContext = message.payload as {
            workspaceId?: number;
          };
          const responseWorkspaceId =
            payloadWithContext.workspaceId ?? allIssues[0]?.workspaceId ?? null;
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;

          console.log("[RECEIVE] GET_ALL_ISSUES_ACK");
          console.log("[GET_ALL_ISSUES_ACK:DEBUG]", {
            count: allIssues.length,
            sample: allIssues[0] ?? null,
            payloadWorkspaceId: responseWorkspaceId,
            pendingWorkspaceId: pendingIssues?.workspaceId ?? null,
          });

          if (
            pendingIssues &&
            (message.requestId !== pendingIssues.requestId ||
              (responseWorkspaceId !== null &&
                Number(responseWorkspaceId) !== pendingIssues.workspaceId) ||
              allIssues.some(
                (issue) =>
                  issue.workspaceId != null &&
                  Number(issue.workspaceId) !== pendingIssues.workspaceId
              ))
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              currentWorkspaceId,
              pendingWorkspaceId: pendingIssues.workspaceId,
            });
            break;
          }

          const ackWorkspaceId =
            responseWorkspaceId ??
            (pendingIssues && message.requestId === pendingIssues.requestId
              ? pendingIssues.workspaceId
              : null);

          if (
            currentWorkspaceId &&
            ackWorkspaceId !== null &&
            Number(ackWorkspaceId) !== Number(currentWorkspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId: ackWorkspaceId,
              currentWorkspaceId,
              reason: "workspace mismatch",
            });
            break;
          }

          pendingGetAllIssuesRef.current = null;
          setAllIssues(allIssues);
          break;
        }

        case "GET_ISSUES_ACK": {
          const issues = Array.isArray(message.payload?.issues)
            ? message.payload.issues.map(normalizeIssue)
            : [];
          const pendingIssues = pendingGetIssuesRef.current;
          const payloadWithContext = message.payload as {
            workspaceId?: number;
            meetingId?: number;
          };
          const responseWorkspaceId =
            payloadWithContext.workspaceId ?? issues[0]?.workspaceId ?? null;
          const responseMeetingId =
            payloadWithContext.meetingId ?? issues[0]?.meetingId ?? null;

          console.log("[RECEIVE] GET_ISSUES_ACK");
          console.log("[GET_ISSUES_ACK:DEBUG]", {
            count: issues.length,
            sample: issues[0] ?? null,
            hasWorkspaceId: issues[0]?.workspaceId != null,
            hasMeetingId: issues[0]?.meetingId != null,
            workspaceId: issues[0]?.workspaceId,
            meetingId: issues[0]?.meetingId,
            status: issues[0]?.status,
          });

          if (
            pendingIssues &&
            (message.requestId !== pendingIssues.requestId ||
              (responseWorkspaceId !== null &&
                Number(responseWorkspaceId) !== pendingIssues.workspaceId) ||
              (responseMeetingId !== null &&
                Number(responseMeetingId) !== pendingIssues.meetingId) ||
              issues.some(
                (issue) =>
                  (issue.workspaceId != null &&
                    Number(issue.workspaceId) !== pendingIssues.workspaceId) ||
                  (issue.meetingId != null &&
                    Number(issue.meetingId) !== pendingIssues.meetingId)
              ))
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId,
              responseMeetingId,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              pendingWorkspaceId: pendingIssues.workspaceId,
              pendingMeetingId: pendingIssues.meetingId,
            });
            break;
          }

          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;
          const ackWorkspaceId =
            responseWorkspaceId ??
            (pendingIssues && message.requestId === pendingIssues.requestId
              ? pendingIssues.workspaceId
              : null);

          if (
            currentWorkspaceId &&
            ackWorkspaceId !== null &&
            Number(ackWorkspaceId) !== Number(currentWorkspaceId)
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId: ackWorkspaceId,
              currentWorkspaceId,
              reason: "workspace mismatch",
            });
            break;
          }

          pendingGetIssuesRef.current = null;
          setIssues(issues);
          break;
        }

        case "GET_ISSUE_ACK": {
          console.log("[GET_ISSUE_ACK:RECEIVED]", message);
          setIsIssueDetailLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "안건 상세 조회에 실패했습니다.";
            setMeetingErrorMessage(errorMessage);
            console.error("[GET_ISSUE_ACK:RECEIVED]", message);
            break;
          }

          setSelectedIssueDetail(message.payload);
          console.log("[GET_ISSUE_ACK:SAVED]", message.payload);
          break;
        }

        case "GET_ISSUE_EVENTS_ACK": {
          console.log("[GET_ISSUE_EVENTS_ACK:RECEIVED]", message);
          setIsIssueEventsLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "안건 이력 조회에 실패했습니다.";
            setMeetingErrorMessage(errorMessage);
            console.error("[GET_ISSUE_EVENTS_ACK:RECEIVED]", message);
            break;
          }

          const events = Array.isArray(message.payload.events)
            ? [...message.payload.events].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )
            : [];

          setSelectedIssueEvents(events);
          console.log("[GET_ISSUE_EVENTS_ACK:SAVED]", events);
          break;
        }

        case "GET_ALERTS_ACK": {
          console.log("[GET_ALERTS_ACK:RECEIVED]", message);
          const pendingAlerts = pendingGetAlertsRef.current;

          if (
            pendingAlerts &&
            message.requestId !== pendingAlerts.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlerts.requestId,
            });
            break;
          }

          clearGetAlertsTimeout();
          pendingGetAlertsRef.current = null;
          pendingGetAlertsKeyRef.current = null;
          setAlertLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "재논의 알림 목록 조회에 실패했습니다.";
            setAlertErrorMessage(errorMessage);
            console.error("[GET_ALERTS_ACK:RECEIVED]", message);
            break;
          }

          const alerts = Array.isArray(message.payload?.alerts)
            ? message.payload.alerts
            : [];

          setAlerts(alerts);
          setAlertErrorMessage(null);
          console.log("[GET_ALERTS_ACK:SAVED]", { count: alerts.length });
          break;
        }

        case "GET_ALERT_ACK": {
          console.log("[GET_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingGetAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearGetAlertTimeout();
          pendingGetAlertRef.current = null;
          setAlertDetailLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "재논의 알림 상세 조회에 실패했습니다.";
            setAlertDetail(null);
            setAlertDetailErrorMessage(errorMessage);
            console.error("[GET_ALERT_ACK:RECEIVED]", message);
            break;
          }

          setAlertDetail(message.payload);
          setSelectedAlertId(Number(message.payload.id));
          setAlertDetailErrorMessage(null);
          console.log("[GET_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "ACKNOWLEDGE_ALERT_ACK": {
          console.log("[ACKNOWLEDGE_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingAcknowledgeAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearAcknowledgeAlertTimeout();
          pendingAcknowledgeAlertRef.current = null;
          setAcknowledgeAlertLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "알림 확인 완료 변경에 실패했습니다.";
            setAcknowledgeAlertErrorMessage(errorMessage);
            console.error("[ACKNOWLEDGE_ALERT_ACK:RECEIVED]", message);
            break;
          }

          mergeAlert(message.payload);
          setAcknowledgeAlertErrorMessage(null);
          console.log("[ACKNOWLEDGE_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "DISMISS_ALERT_ACK": {
          console.log("[DISMISS_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingDismissAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearDismissAlertTimeout();
          pendingDismissAlertRef.current = null;
          setDismissAlertLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "알림 무시 처리에 실패했습니다.";
            setDismissAlertErrorMessage(errorMessage);
            console.error("[DISMISS_ALERT_ACK:RECEIVED]", message);
            break;
          }

          mergeAlert(message.payload);
          setDismissAlertErrorMessage(null);
          console.log("[DISMISS_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "RESOLVE_ALERT_ACK": {
          console.log("[RESOLVE_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingResolveAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearResolveAlertTimeout();
          pendingResolveAlertRef.current = null;
          setResolveAlertLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "알림 해결 처리에 실패했습니다.";
            setResolveAlertErrorMessage(errorMessage);
            console.error("[RESOLVE_ALERT_ACK:RECEIVED]", message);
            break;
          }

          mergeAlert(message.payload);
          setResolveAlertErrorMessage(null);
          console.log("[RESOLVE_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "UPDATE_ALERT_ACK": {
          console.log("[UPDATE_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingUpdateAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearUpdateAlertTimeout();
          pendingUpdateAlertRef.current = null;
          setUpdateAlertLoading(false);

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "알림 수정에 실패했습니다.";
            setUpdateAlertErrorMessage(errorMessage);
            console.error("[UPDATE_ALERT_ACK:RECEIVED]", message);
            break;
          }

          mergeAlert(message.payload);
          setUpdateAlertErrorMessage(null);
          console.log("[UPDATE_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "DELETE_ALERT_ACK": {
          console.log("[DELETE_ALERT_ACK:RECEIVED]", message);
          const pendingAlert = pendingDeleteAlertRef.current;

          if (
            pendingAlert &&
            message.requestId !== pendingAlert.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingAlert.requestId,
            });
            break;
          }

          clearDeleteAlertTimeout();
          pendingDeleteAlertRef.current = null;
          setDeleteAlertLoading(false);

          if (!message.success || !message.payload.deleted) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "알림 삭제에 실패했습니다.";
            setDeleteAlertErrorMessage(errorMessage);
            console.error("[DELETE_ALERT_ACK:RECEIVED]", message);
            break;
          }

          removeAlert(Number(message.payload.alertId));
          setDeleteAlertErrorMessage(null);
          console.log("[DELETE_ALERT_ACK:SAVED]", message.payload);
          break;
        }

        case "ALERT_CREATED": {
          const alert = message.payload;
          const context = currentIssueContextRef.current;

          if (!context) {
            break;
          }

          if (
            Number(alert.workspaceId) !== Number(context.workspaceId) ||
            Number(alert.meetingId) !== Number(context.meetingId) ||
            alert.status !== "PENDING"
          ) {
            break;
          }

          console.log("[BROADCAST] ALERT_CREATED", alert);
          addAlert(alert);
          setPopupAlert(alert);
          break;
        }

        case "CREATE_ISSUE_ACK": {
          console.log("[CREATE_ISSUE_ACK:RECEIVED]", message);
          isCreateIssuePendingRef.current = false;

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "안건 생성에 실패했습니다.";
            setMeetingErrorMessage(errorMessage);
            console.error("[CREATE_ISSUE_ACK:RECEIVED]", message);
            break;
          }

          break;
        }
        case "ISSUE_CREATED": {
          console.log("[ISSUE_CREATED:RECEIVED]", message.payload);

          const currentWorkspaceId = Number(
            useWorkspacePresenceStore.getState().workspaceId
          );
          const currentMeetingRoom = useMeetingRoomPresenceStore.getState();
          const context = currentIssueContextRef.current;
          const currentMeetingId = context?.meetingId ?? null;
          const currentMeetingRoomId =
            currentMeetingRoom.meetingRoomId ?? context?.meetingRoomId ?? null;
          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const incomingMeetingId = Number(message.payload.meetingId);
          const incomingMeetingRoomId = Number(
            (message.payload as { meetingRoomId?: number }).meetingRoomId
          );

          if (incomingWorkspaceId === currentWorkspaceId) {
            setAllIssues((prev) => mergeIssueList(prev, message.payload));
          }

          if (
            incomingWorkspaceId !== currentWorkspaceId ||
            (currentMeetingId !== null && incomingMeetingId !== currentMeetingId) ||
            (Number.isFinite(incomingMeetingRoomId) &&
              currentMeetingRoomId !== null &&
              incomingMeetingRoomId !== currentMeetingRoomId)
          ) {
            break;
          }

          setIssues((prev) => {
            const exists = prev.some((issue) => issue.id === message.payload.id);

            if (exists) {
              return prev;
            }

            console.log("[ISSUE_CREATED:APPLIED]", message.payload.id);
            return [...prev, message.payload];
          });

          break;
        }

        case "UPDATE_ISSUE_ACK": {
          console.log("[UPDATE_ISSUE_ACK:RECEIVED]", message);
          isUpdateIssuePendingRef.current = false;

          if (!message.success) {
            const errorMessage =
              "message" in message.payload
                ? String(message.payload.message)
                : "안건 수정에 실패했습니다.";
            setMeetingErrorMessage(errorMessage);
            console.error("[UPDATE_ISSUE_ACK:RECEIVED]", message);
            break;
          }

          break;
        }

        case "CHANGE_ISSUE_STATE_ACK": {
          console.log("[CHANGE_ISSUE_STATE_ACK:RECEIVED]", message);
          isUpdateIssuePendingRef.current = false;

          if (!message.success) {
            setMeetingErrorMessage("안건 상태 변경에 실패했습니다.");
            console.error("[CHANGE_ISSUE_STATE_ACK:RECEIVED]", message);
            break;
          }

          if (selectedIssueDetail?.id === message.payload.issueId) {
            const context = currentIssueContextRef.current;

            if (context) {
              sendGetIssueEventsMessage({
                workspaceId: context.workspaceId,
                meetingId: context.meetingId,
                meetingRoomId: context.meetingRoomId ?? 1,
                issueId: message.payload.issueId,
              });
            }
          }

          break;
        }

        case "ISSUE_UPDATED": {
          console.log("[ISSUE_UPDATED:RECEIVED]", message.payload);

          const currentWorkspaceId = Number(
            useWorkspacePresenceStore.getState().workspaceId
          );
          const currentMeetingRoom = useMeetingRoomPresenceStore.getState();
          const context = currentIssueContextRef.current;
          const currentMeetingId = context?.meetingId ?? null;
          const currentMeetingRoomId =
            currentMeetingRoom.meetingRoomId ?? context?.meetingRoomId ?? null;
          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const incomingMeetingId = Number(message.payload.meetingId);
          const incomingMeetingRoomId = Number(
            (message.payload as { meetingRoomId?: number }).meetingRoomId
          );

          if (incomingWorkspaceId === currentWorkspaceId) {
            setAllIssues((prev) => mergeIssueList(prev, message.payload));
          }

          if (
            incomingWorkspaceId !== currentWorkspaceId ||
            (currentMeetingId !== null && incomingMeetingId !== currentMeetingId) ||
            (Number.isFinite(incomingMeetingRoomId) &&
              currentMeetingRoomId !== null &&
              incomingMeetingRoomId !== currentMeetingRoomId)
          ) {
            break;
          }

          setIssues((prev) => {
            const exists = prev.some((issue) => issue.id === message.payload.id);

            if (!exists) {
              console.warn("[ISSUE_UPDATED:SKIPPED] issue not found", message.payload.id);
              return prev;
            }

            console.log("[ISSUE_UPDATED:APPLIED]", message.payload.id);

            return prev.map((issue) =>
              issue.id === message.payload.id ? message.payload : issue
            );
          });

          setSelectedIssueDetail((prev) =>
            prev?.id === message.payload.id ? message.payload : prev
          );

          break;
        }

        case "ISSUE_STATE_CHANGED": {
          console.log("[ISSUE_STATE_CHANGED:RECEIVED]", message.payload);

          const { issueId, toState, changedAt } = message.payload;

          setIssues((prev) => {
            const exists = prev.some((issue) => issue.id === issueId);

            if (!exists) {
              console.warn("[ISSUE_STATE_CHANGED:SKIPPED] issue not found", issueId);
              return prev;
            }

            console.log("[ISSUE_STATE_CHANGED:APPLIED]", { issueId, toState });

            return prev.map((issue) =>
              issue.id === issueId
                ? { ...issue, status: toState, updatedAt: changedAt }
                : issue
            );
          });

          setAllIssues((prev) =>
            prev.map((issue) =>
              issue.id === issueId
                ? { ...issue, status: toState, updatedAt: changedAt }
                : issue
            )
          );

          setSelectedIssueDetail((prev) =>
            prev?.id === issueId
              ? { ...prev, status: toState, updatedAt: changedAt }
              : prev
          );

          break;
        }

        case "DELETE_ISSUE_ACK": {
          console.log("[RECEIVE] DELETE_ISSUE_ACK");
          isDeleteIssuePendingRef.current = false;
          break;
        }

        case "ISSUE_DELETED": {
          console.log("[BROADCAST] ISSUE_DELETED");
          const deletedIssueId = Number(
            (message.payload as { issueId?: number }).issueId ?? message.payload.id
          );

          setIssues((prev) =>
            prev.filter((issue) => issue.id !== deletedIssueId)
          );

          setAllIssues((prev) =>
            prev.filter((issue) => issue.id !== deletedIssueId)
          );

          setSelectedIssueDetail((prev) =>
            prev?.id === deletedIssueId ? null : prev
          );

          break;
        }

        case "STT_RESULT_CREATED": {
          const payload = {
            sttResultId: Number(message.payload.sttResultId),
            workspaceId: Number(message.payload.workspaceId),
            meetingId: Number(message.payload.meetingId),
            status: String(message.payload.status ?? ""),
          };

          console.log("[STT_RESULT_CREATED:RECEIVED]", payload);
          setLastCreatedSttResult(payload);
          if (
            payload.workspaceId > 0 &&
            payload.meetingId > 0 &&
            Number(meetingRoomWorkspaceId) === payload.workspaceId &&
            Number(meetingRoomId) > 0
          ) {
            getSttResultsRef.current(
              payload.workspaceId,
              payload.meetingId,
              Number(meetingRoomId)
            );
          }
          break;
        }

        case "STT_RESULT_UPDATED": {
          const payload = normalizeSttResult(message.payload);

          console.log("[STT_RESULT_UPDATED:RECEIVED]", message.payload);

          if (!Number.isFinite(payload.id) || payload.id <= 0) {
            break;
          }

          applySttResultUpdated(payload);
          console.log("[STT_RESULT_UPDATED:APPLIED]", {
            id: payload.id,
            updatedRawText: payload.rawText,
          });
          break;
        }

        case "STT_RESULT_DELETED": {
          const payload = message.payload as SttResultDeletedPayload;
          const sttResultId = Number(payload.sttResultId);

          console.log("[STT_RESULT_DELETED:RECEIVED]", payload);

          if (!payload.deleted || !Number.isFinite(sttResultId) || sttResultId <= 0) {
            break;
          }

          applySttResultDeleted(sttResultId);
          console.log("[STT_RESULT_DELETED:APPLIED]", {
            sttResultId,
          });
          break;
        }

        case "GET_DOCUMENTS_ACK": {
          const pendingDocuments = pendingGetDocumentsRef.current;

          if (
            pendingDocuments &&
            message.requestId !== pendingDocuments.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingDocuments.requestId,
            });
            break;
          }

          if (!pendingDocuments) {
            console.warn("[GET_DOCUMENTS_ACK:SKIPPED] pending request not found", {
              requestId: message.requestId,
            });
            break;
          }

          pendingGetDocumentsRef.current = null;
          replaceDocumentsForMeeting(
            pendingDocuments.meetingId,
            Array.isArray(message.payload.data) ? message.payload.data : []
          );
          console.log("[GET_DOCUMENTS_ACK:SAVED]", {
            meetingId: pendingDocuments.meetingId,
            count: message.payload.data?.length ?? 0,
          });
          break;
        }

        case "GET_WORKSPACE_DOCUMENTS_ACK": {
          const pendingDocuments = pendingGetWorkspaceDocumentsRef.current;

          if (
            pendingDocuments &&
            message.requestId !== pendingDocuments.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingDocuments.requestId,
            });
            break;
          }

          if (!pendingDocuments) {
            console.warn("[GET_WORKSPACE_DOCUMENTS_ACK:SKIPPED] pending request not found", {
              requestId: message.requestId,
            });
            break;
          }

          pendingGetWorkspaceDocumentsRef.current = null;
          replaceDocumentsForWorkspace(
            pendingDocuments.workspaceId,
            Array.isArray(message.payload.data) ? message.payload.data : []
          );
          console.log("[GET_WORKSPACE_DOCUMENTS_ACK:SAVED]", {
            workspaceId: pendingDocuments.workspaceId,
            count: message.payload.data?.length ?? 0,
          });
          break;
        }

        case "GET_DOCUMENT_ACK": {
          const pendingDocument = pendingGetDocumentRef.current;

          if (
            pendingDocument &&
            message.requestId !== pendingDocument.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingDocument.requestId,
            });
            break;
          }

          if (!pendingDocument) {
            console.warn("[GET_DOCUMENT_ACK:SKIPPED] pending request not found", {
              requestId: message.requestId,
            });
            break;
          }

          if (!message.success) {
            pendingGetDocumentRef.current = null;
            console.warn("[GET_DOCUMENT_ACK:FAILED]", {
              requestId: message.requestId,
              workspaceId: pendingDocument.workspaceId,
              documentId: pendingDocument.documentId,
            });
            break;
          }

          const normalizedDocument = normalizeDocumentPayload(message.payload);

          if (
            normalizedDocument.workspaceId == null ||
            Number(normalizedDocument.workspaceId) !== Number(pendingDocument.workspaceId)
          ) {
            pendingGetDocumentRef.current = null;
            console.warn("[GET_DOCUMENT_ACK:SKIPPED] workspace mismatch", {
              requestId: message.requestId,
              expectedWorkspaceId: pendingDocument.workspaceId,
              payloadWorkspaceId: normalizedDocument.workspaceId,
              documentId: normalizedDocument.id,
            });
            break;
          }

          pendingGetDocumentRef.current = null;
          setSelectedDocument(normalizedDocument);
          console.log("[GET_DOCUMENT_ACK:SAVED]", {
            documentId: normalizedDocument.id,
            workspaceId: normalizedDocument.workspaceId,
            meetingId: normalizedDocument.meetingId,
          });
          break;
        }

        case "GET_STT_RESULTS_ACK": {
          const pendingSttResults = pendingGetSttResultsRef.current;

          if (
            pendingSttResults &&
            message.requestId !== pendingSttResults.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingSttResults.requestId,
            });
            break;
          }

          console.log("[GET_STT_RESULTS_ACK:RECEIVED]", message.payload);
          pendingGetSttResultsRef.current = null;

          const payload = message.payload as {
            sttResults?: RawSttResult[];
            stt_results?: RawSttResult[];
          };
          const results = payload.sttResults ?? payload.stt_results ?? [];
          const normalizedResults = Array.isArray(results)
            ? results.map(normalizeSttResult)
            : [];

          if (message.success === false) {
            setSttResults([]);
            break;
          }

          setSttResults(normalizedResults);
          console.log("[GET_STT_RESULTS_ACK:SAVED]", {
            success: message.success,
            count: normalizedResults.length,
            sttResults: normalizedResults,
          });
          console.log(
            "[GET_STT_RESULTS_ACK:ITEM_MEETING_IDS]",
            normalizedResults.map((item) => ({
              id: item.id,
              meetingId: item.meetingId,
              rawText: item.rawText,
            }))
          );
          break;
        }

        case "GET_STT_RESULT_ACK": {
          console.log("[GET_STT_RESULT_ACK:RECEIVED]", message.payload);

          if (message.success === false || !message.payload) {
            setSelectedSttResult(null);
            break;
          }

          const normalizedResult = normalizeSttResult(
            message.payload as RawSttResult
          );
          setSelectedSttResult(normalizedResult);
          console.log("[GET_STT_RESULT_ACK:SAVED]", normalizedResult);
          break;
        }

        case "DELETE_STT_RESULT_ACK": {
          console.log("[DELETE_STT_RESULT_ACK:RECEIVED]", message.payload);

          if (!message.success || !message.payload?.deleted) {
            console.error("[DELETE_STT_RESULT_ACK:FAILED]", message.payload);
            break;
          }

          const sttResultId = Number(message.payload.sttResultId);
          if (!Number.isFinite(sttResultId) || sttResultId <= 0) {
            console.error("[DELETE_STT_RESULT_ACK:FAILED]", message.payload);
            break;
          }

          applySttResultDeleted(sttResultId);
          console.log("[DELETE_STT_RESULT_ACK:APPLIED]", {
            sttResultId,
          });
          break;
        }

        case "DELETE_DOCUMENT_ACK": {
          const pendingDocument = pendingDeleteDocumentRef.current;

          if (
            pendingDocument &&
            message.requestId !== pendingDocument.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              requestId: message.requestId,
              pendingRequestId: pendingDocument.requestId,
            });
            break;
          }

          if (!pendingDocument) {
            console.warn("[DELETE_DOCUMENT_ACK:SKIPPED] pending request not found", {
              requestId: message.requestId,
            });
            break;
          }

          if (!message.success || !message.payload.deleted) {
            pendingDeleteDocumentRef.current = null;
            console.warn("[DELETE_DOCUMENT_ACK:FAILED]", {
              requestId: message.requestId,
              workspaceId: pendingDocument.workspaceId,
              documentId: pendingDocument.documentId,
            });
            break;
          }

          const deletedDocumentId = Number(message.payload.documentId);

          pendingDeleteDocumentRef.current = null;
          removeDocument(deletedDocumentId);
          console.log("[DELETE_DOCUMENT_ACK:REMOVED]", {
            documentId: deletedDocumentId,
          });
          break;
        }

        case "DOCUMENT_DELETED": {
          const deletedDocument = normalizeDeletedDocumentPayload(
            message.payload as unknown as Record<string, unknown>
          );
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;
          const currentMeetingRoom = useMeetingRoomPresenceStore.getState();
          const currentMeetingContext = currentIssueContextRef.current;
          const isMeetingLiveContext =
            currentMeetingRoom.status === "joined" ||
            currentMeetingRoom.status === "joining";

          if (
            !deletedDocument.deleted ||
            !currentWorkspaceId ||
            deletedDocument.workspaceId !== Number(currentWorkspaceId)
          ) {
            console.log("[DOCUMENT_DELETED:SKIP]", {
              currentWorkspaceId,
              payloadWorkspaceId: deletedDocument.workspaceId,
              documentId: deletedDocument.documentId,
              meetingId: deletedDocument.meetingId,
            });
            break;
          }

          if (isMeetingLiveContext) {
            if (
              deletedDocument.meetingId == null ||
              Number(deletedDocument.meetingId) !==
                Number(currentMeetingContext?.meetingId)
            ) {
              console.log("[DOCUMENT_DELETED:SKIP_MEETING_SCOPE]", {
                currentMeetingId: currentMeetingContext?.meetingId ?? null,
                payloadMeetingId: deletedDocument.meetingId,
                documentId: deletedDocument.documentId,
              });
              break;
            }
          }

          removeDocument(deletedDocument.documentId);
          console.log("[DOCUMENT_DELETED:REMOVED]", {
            documentId: deletedDocument.documentId,
            workspaceId: deletedDocument.workspaceId,
            meetingId: deletedDocument.meetingId,
          });
          break;
        }

        case "DOCUMENT_UPLOADED": {
          const normalizedDocument = normalizeDocumentPayload(message.payload);
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;

          if (
            !currentWorkspaceId ||
            normalizedDocument.workspaceId == null ||
            Number(normalizedDocument.workspaceId) !== Number(currentWorkspaceId)
          ) {
            console.log("[DOCUMENT_UPLOADED:SKIP]", {
              currentWorkspaceId,
              payloadWorkspaceId: normalizedDocument.workspaceId,
              documentId: normalizedDocument.id,
              meetingId: normalizedDocument.meetingId,
            });
            break;
          }

          addDocument(normalizedDocument);
          console.log("[DOCUMENT_UPLOADED:SAVED]", {
            documentId: normalizedDocument.id,
            workspaceId: normalizedDocument.workspaceId,
            meetingId: normalizedDocument.meetingId,
          });
          break;
        }

        case "DOCUMENT_PROCESSED": {
          const payload = (message.payload ?? {}) as Record<string, unknown>;
          const documentId = Number(payload.documentId ?? payload.document_id);
          const payloadWorkspaceId = Number(
            payload.workspaceId ?? payload.workspace_id
          );
          const currentWorkspaceId =
            useWorkspacePresenceStore.getState().workspaceId;

          if (
            !Number.isInteger(documentId) ||
            documentId <= 0 ||
            !currentWorkspaceId ||
            payloadWorkspaceId !== Number(currentWorkspaceId)
          ) {
            break;
          }

          const meetingId = toNullableNumber(
            payload.meetingId ?? payload.meeting_id
          );
          const currentMeetingRoom = useMeetingRoomPresenceStore.getState();
          const currentMeetingContext = currentIssueContextRef.current;
          const isMeetingLiveContext =
            currentMeetingRoom.status === "joined" ||
            currentMeetingRoom.status === "joining";

          if (
            isMeetingLiveContext &&
            meetingId != null &&
            Number(meetingId) !== Number(currentMeetingContext?.meetingId)
          ) {
            break;
          }

          const status = String(payload.status ?? "").trim();
          if (status) {
            updateDocument(documentId, { status });
          }
          break;
        }

        case "JOIN_MEETING_ROOM_ACK": {
          console.log("[RECEIVE] JOIN_MEETING_ROOM_ACK");

          setMeetingRoomWorkspaceId(Number(message.payload.workspaceId));
          setMeetingRoomId(Number(message.payload.meetingRoomId));
          setMeetingRoomStatus("joined");
          setMeetingRoomJoinedAt(message.payload.joinedAt);
          setMeetingRoomErrorMessage(null);

          // 이전 회의의 발화/안건이 섞이지 않도록 입장 시 비운다.
          useTranscriptStore.getState().resetTranscript();

          break;
        }

        case "LEAVE_MEETING_ROOM_ACK": {
          console.log("[RECEIVE] LEAVE_MEETING_ROOM_ACK");

          setMeetingRoomWorkspaceId(Number(message.payload.workspaceId));
          setMeetingRoomId(Number(message.payload.meetingRoomId));
          setMeetingRoomStatus("left");
          setMeetingRoomLeftAt(message.payload.leftAt);
          setMeetingRoomErrorMessage(null);
          break;
        }

        case "MEETING_ROOM_USERS_UPDATED": {
          console.log("[BROADCAST] MEETING_ROOM_USERS_UPDATED");

          const incomingWorkspaceId = Number(message.payload.workspaceId);
          const incomingMeetingRoomId = Number(message.payload.meetingRoomId);


          const currentMeetingRoom = useMeetingRoomPresenceStore.getState();
          const currentWorkspaceId = currentMeetingRoom.workspaceId ?? null;
          const currentMeetingRoomId = currentMeetingRoom.meetingRoomId ?? null;

          if (
            currentWorkspaceId &&
            currentMeetingRoomId &&
            (incomingWorkspaceId !== currentWorkspaceId ||
              incomingMeetingRoomId !== currentMeetingRoomId)
          ) {
            break;
          }

          setMeetingRoomWorkspaceId(incomingWorkspaceId);
          setMeetingRoomId(incomingMeetingRoomId);
          setMeetingRoomUsers(normalizeMeetingRoomUsers(message.payload.users));
          setMeetingRoomUpdatedAt(message.payload.updatedAt);
          setMeetingRoomErrorMessage(null);

          break;
        }

        // ----------------------------------------------------------
        // 실시간 발화 (화자 포함)
        // ----------------------------------------------------------
        case "TRANSCRIPT": {
          useTranscriptStore.getState().appendTranscript(message.payload);
          break;
        }

        case "TRANSCRIPT_PARTIAL": {
          useTranscriptStore.getState().appendPartialTranscript(message.payload);
          break;
        }

        case "TRANSCRIPT_CHUNK_ACK": {
          if (!message.success) {
            console.warn("[TRANSCRIPT_CHUNK_ACK] 실패", message.payload);
          }
          break;
        }

        // ----------------------------------------------------------
        // Phase 4 안건 / 재논의 / AI 분석
        // ----------------------------------------------------------
        case "TOPIC_CREATED":
        case "TOPIC_DECIDED":
        case "TOPIC_REVISITED":
        case "TOPIC_REDECIDED":
        case "TOPIC_UPDATED": {
          console.log(`[BROADCAST] ${message.type}`, message.payload);
          useTranscriptStore
            .getState()
            .applyTopicEvent(message.type, message.payload);
          break;
        }

        case "ANALYSIS_COMPLETED": {
          useTranscriptStore.getState().setLastAnalysis(message.payload);
          break;
        }

        case "AI_ANALYSIS_UPDATED": {
          // 분석 본문은 이벤트에 실려 오지 않는다.
          // 서버의 워크스페이스 권한 검사를 그대로 통과하도록 직접 조회한다.
          const { workspaceId, meetingId } = message.payload;

          if (!workspaceId || !meetingId) {
            break;
          }

          const transcriptStore = useTranscriptStore.getState();
          transcriptStore.setAiAnalysisLoading(true);

          void getAiAnalysis(Number(workspaceId), Number(meetingId))
            .then((analysis) => {
              useTranscriptStore.getState().setAiAnalysis(analysis);
            })
            .catch((error: unknown) => {
              const detail =
                error instanceof Error ? error.message : "AI 분석 결과 조회에 실패했습니다.";
              useTranscriptStore.getState().setAiAnalysisErrorMessage(detail);
            })
            .finally(() => {
              useTranscriptStore.getState().setAiAnalysisLoading(false);
            });

          break;
        }

        //회의 시작
        case "START_MEETING_ACK": {
          console.log("[RECEIVE] START_MEETING_ACK");
          isStartMeetingPendingRef.current = false;

          if (!message.success) {
            break;
          }

          const nextMeeting = mapMeetingSession(message.payload);

          setMeetings((prev) => {
            const exists = prev.some(
              (meeting) => Number(meeting.id) === Number(message.payload.meetingId)
            );

            if (!exists) {
              return [...prev, nextMeeting];
            }

            return prev.map((meeting) =>
              Number(meeting.id) === Number(message.payload.meetingId)
                ? mergeMeetingSession(meeting, message.payload)
                : meeting
            );
          });

          setLastCreatedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : prev
          );
          setLastFetchedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : nextMeeting
          );

          break;
        }

        //회의 종료
        case "END_MEETING_ACK": {
          console.log("[RECEIVE] END_MEETING_ACK");
          isEndMeetingPendingRef.current = false;

          if (!message.success) {
            break;
          }

          const nextMeeting = mapMeetingSession(message.payload);

          setMeetings((prev) => {
            const exists = prev.some(
              (meeting) => Number(meeting.id) === Number(message.payload.meetingId)
            );

            if (!exists) {
              return [...prev, nextMeeting];
            }

            return prev.map((meeting) =>
              Number(meeting.id) === Number(message.payload.meetingId)
                ? mergeMeetingSession(meeting, message.payload)
                : meeting
            );
          });

          setLastCreatedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : prev
          );
          setLastFetchedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : nextMeeting
          );

          break;
        }

        //회의 상태
        case "MEETING_STATUS_CHANGED": {
          console.log("[BROADCAST] MEETING_STATUS_CHANGED");
          const currentWorkspaceId = useWorkspacePresenceStore.getState().workspaceId;

          if (
            currentWorkspaceId &&
            Number(message.payload.workspaceId) !== Number(currentWorkspaceId)
          ) {
            break;
          }

          const nextMeeting = mapMeetingSession(message.payload);

          setMeetings((prev) => {
            const exists = prev.some(
              (meeting) => Number(meeting.id) === Number(message.payload.meetingId)
            );

            if (!exists) {
              return [...prev, nextMeeting];
            }

            return prev.map((meeting) =>
              Number(meeting.id) === Number(message.payload.meetingId)
                ? mergeMeetingSession(meeting, message.payload)
                : meeting
            );
          });
          setLastCreatedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : prev
          );
          setLastFetchedMeeting((prev) =>
            prev && Number(prev.id) === Number(message.payload.meetingId)
              ? mergeMeetingSession(prev, message.payload)
              : prev
          );

          break;
        }

        

        

        case "SESSION_EXPIRED": {
          handleSessionExpired();
          break;
        }

        case "ERROR": {
          console.error("[SOCKET_ERROR:RECEIVED]", message);
          isStartMeetingPendingRef.current = false;
          isEndMeetingPendingRef.current = false;
          isCreateIssuePendingRef.current = false;
          isUpdateIssuePendingRef.current = false;
          isDeleteIssuePendingRef.current = false;
          const requestId = String(message.requestId ?? "");
          const pendingWorkspace = pendingJoinWorkspaceRef.current;
          const isJoinWorkspaceError = requestId.includes("join-workspace");
          const pendingAllIssues = pendingGetAllIssuesRef.current;
          const isGetAllIssuesError =
            requestId.includes("get-all-issues") ||
            Boolean(pendingAllIssues && message.requestId === pendingAllIssues.requestId);
          const pendingUpdateAlert = pendingUpdateAlertRef.current;
          const pendingDeleteAlert = pendingDeleteAlertRef.current;

          if (pendingUpdateAlert && message.requestId === pendingUpdateAlert.requestId) {
            clearUpdateAlertTimeout();
            pendingUpdateAlertRef.current = null;
            setUpdateAlertLoading(false);
            setUpdateAlertErrorMessage(message.payload.message ?? "알림 수정에 실패했습니다.");
          }

          if (pendingDeleteAlert && message.requestId === pendingDeleteAlert.requestId) {
            clearDeleteAlertTimeout();
            pendingDeleteAlertRef.current = null;
            setDeleteAlertLoading(false);
            setDeleteAlertErrorMessage(message.payload.message ?? "알림 삭제에 실패했습니다.");
          }

          if (isJoinWorkspaceError) {
            console.log("[JOIN_WORKSPACE_ERROR]", {
              workspaceId: pendingWorkspace?.workspaceId ?? null,
              requestId,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              payload: message.payload,
            });
          }

          if (
            isJoinWorkspaceError &&
            pendingWorkspace &&
            requestId !== pendingWorkspace.requestId
          ) {
            console.warn("[SOCKET:STALE_IGNORED]", {
              eventType: message.type,
              responseWorkspaceId: null,
              currentWorkspaceId: useWorkspacePresenceStore.getState().workspaceId,
              pendingWorkspaceId: pendingWorkspace.workspaceId,
            });
            break;
          }

          setStatus("error");
          setError(message.payload);
          if (
            message.payload.errorCode === "SESSION_EXPIRED" ||
            message.payload.message.includes("SESSION_EXPIRED")
          ) {
            handleSessionExpired();
            break;
          }
          if (isGetAllIssuesError) {
            pendingGetAllIssuesRef.current = null;
            setMeetingErrorMessage(
              message.payload.message || "전체 안건 조회에 실패했습니다."
            );
          }
          if (isJoinWorkspaceError) {
            if (pendingWorkspace) {
              pendingJoinWorkspaceRef.current = null;
              setWorkspaceId(pendingWorkspace.workspaceId);
            }
            setWorkspaceStatus("error");
            setWorkspaceErrorMessage(message.payload.message);
          }
          if (requestId.includes("join-meeting-room")) {
            setMeetingRoomStatus("error");
            setMeetingRoomErrorMessage(message.payload.message);
          }
          if (!isGetAllIssuesError) {
            setMeetingErrorMessage(message.payload.message);
          }
          setIsMeetingLoading(false);
          break;
        }

        default:
          break;
      }
    },
    [
      setCurrentUser,
      setError,
      handleSessionExpired,
      setLastServerTime,
      setMeetingRoomErrorMessage,
      setMeetingRoomId,
      setMeetingRoomJoinedAt,
      setMeetingRoomLeftAt,
      setMeetingRoomStatus,
      setMeetingRoomUpdatedAt,
      setMeetingRoomUsers,
      setMeetingRoomWorkspaceId,
      setStatus,
      setWorkspaceErrorMessage,
      setWorkspaceId,
      setWorkspaceJoinedAt,
      setWorkspaceLeftAt,
      setWorkspaceStatus,
      setWorkspaceUpdatedAt,
      setWorkspaceUsers,
      addAlert,
      clearAcknowledgeAlertTimeout,
      clearDismissAlertTimeout,
      clearResolveAlertTimeout,
      clearUpdateAlertTimeout,
      clearDeleteAlertTimeout,
      clearGetAlertTimeout,
      clearGetAlertsTimeout,
      setAcknowledgeAlertErrorMessage,
      setAcknowledgeAlertLoading,
      setAlertDetail,
      setAlertDetailErrorMessage,
      setAlertDetailLoading,
      setAlertErrorMessage,
      setAlertLoading,
      setAlerts,
      setDismissAlertErrorMessage,
      setDismissAlertLoading,
      setResolveAlertErrorMessage,
      setResolveAlertLoading,
      setUpdateAlertErrorMessage,
      setUpdateAlertLoading,
      setDeleteAlertErrorMessage,
      setDeleteAlertLoading,
      setPopupAlert,
      setSelectedAlertId,
      replaceDocumentsForMeeting,
      replaceDocumentsForWorkspace,
      setSelectedDocument,
      addDocument,
      updateDocument,
      removeDocument,
      mergeAlert,
      removeAlert,
      getReconnectWorkspaceId,
      selectedIssueDetail,
      sendJoinWorkspaceMessage,
      sendGetIssueEventsMessage,
      stopHeartbeat,
      applySttResultDeleted,
      applySttResultUpdated,
      meetingRoomId,
      meetingRoomWorkspaceId,
    ]
  );

  //회의 안건
  const createIssue = useCallback(
    (payload: CreateIssuePayload) => {
      const finalPayload: CreateIssuePayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        title: payload.title.trim(),
        description: payload.description ?? null,
        status: "OPEN",
        priority: payload.priority ?? null,
        dueDate: payload.dueDate ?? null,
        assigneeId: payload.assigneeId ?? null,
      };

      if (isCreateIssuePendingRef.current) {
        console.error("[CREATE_ISSUE:SEND_BLOCKED] pending request");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.error("[CREATE_ISSUE:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !finalPayload.title
      ) {
        console.error("[CREATE_ISSUE:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      const message: CreateIssueRequest = {
        type: "CREATE_ISSUE",
        requestId: createRequestId("create-issue"),
        payload: finalPayload,
      };

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };
      isCreateIssuePendingRef.current = true;
      console.log("[CREATE_ISSUE:BEFORE_SEND]", {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
        title: finalPayload.title,
        status: finalPayload.status,
      });
      console.log("[SEND] CREATE_ISSUE");

      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getIssues = useCallback(
    (workspaceId: number, meetingId: number, meetingRoomId: number) => {
      const finalPayload = {
        workspaceId: Number(workspaceId),
        meetingId: Number(meetingId),
        meetingRoomId: Number(meetingRoomId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ISSUES:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0
      ) {
        console.warn("[GET_ISSUES:SEND_BLOCKED] missing meetingRoomId", finalPayload);
        return;
      }

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };

      const requestId = createRequestId("get-issues");
      pendingGetIssuesRef.current = {
        requestId,
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };

      const message: GetIssuesRequest = {
        type: "GET_ISSUES",
        requestId,
        payload: finalPayload,
      };

      console.log("[GET_ISSUES:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ISSUES");
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getAllIssues = useCallback(
    (workspaceId: number) => {
      const finalPayload: GetAllIssuesPayload = {
        workspaceId: Number(workspaceId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ALL_ISSUES:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0
      ) {
        console.warn("[GET_ALL_ISSUES:SEND_BLOCKED] invalid workspaceId", finalPayload);
        return;
      }

      const requestId = createRequestId("get-all-issues");
      pendingGetAllIssuesRef.current = {
        requestId,
        workspaceId: finalPayload.workspaceId,
      };

      const message: GetAllIssuesRequest = {
        type: "GET_ALL_ISSUES",
        requestId,
        payload: finalPayload,
      };

      console.log("[GET_ALL_ISSUES:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ALL_ISSUES");
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getIssue = useCallback(
    (payload: GetIssuePayload) => {
      const finalPayload: GetIssuePayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        issueId: Number(payload.issueId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ISSUE:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !Number.isFinite(finalPayload.issueId) ||
        finalPayload.issueId <= 0
      ) {
        console.warn("[GET_ISSUE:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };

      const message: GetIssueRequest = {
        type: "GET_ISSUE",
        requestId: createRequestId("get-issue"),
        payload: finalPayload,
      };

      setIsIssueDetailLoading(true);
      console.log("[GET_ISSUE:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ISSUE");
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getIssueEvents = useCallback(
    (payload: GetIssueEventsPayload) => {
      sendGetIssueEventsMessage(payload);
    },
    [sendGetIssueEventsMessage]
  );

  const getDocuments = useCallback(
    (workspaceId: number, meetingId: number, meetingRoomId: number) => {
      const finalPayload = {
        workspaceId: Number(workspaceId),
        meetingId: Number(meetingId),
        meetingRoomId: Number(meetingRoomId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_DOCUMENTS:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0
      ) {
        console.warn("[GET_DOCUMENTS:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      if (
        pendingGetDocumentsRef.current?.workspaceId === finalPayload.workspaceId &&
        pendingGetDocumentsRef.current?.meetingId === finalPayload.meetingId &&
        pendingGetDocumentsRef.current?.meetingRoomId === finalPayload.meetingRoomId
      ) {
        console.warn("[GET_DOCUMENTS:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      const requestId = createRequestId("get-documents");
      pendingGetDocumentsRef.current = {
        requestId,
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };

      const message: GetDocumentsRequest = {
        type: "GET_DOCUMENTS",
        requestId,
        payload: finalPayload,
      };

      console.log("[GET_DOCUMENTS:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_DOCUMENTS");
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getSttResults = useCallback(
    (workspaceId: number, meetingId: number, meetingRoomId: number) => {
      const payload: GetSttResultsPayload = {
        workspaceId: Number(workspaceId),
        meetingId: Number(meetingId),
        meetingRoomId: Number(meetingRoomId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_STT_RESULTS:BLOCKED]", "socket not open");
        return;
      }

      if (
        !Number.isFinite(payload.workspaceId) ||
        payload.workspaceId <= 0 ||
        !Number.isFinite(payload.meetingId) ||
        payload.meetingId <= 0 ||
        !Number.isFinite(payload.meetingRoomId) ||
        payload.meetingRoomId <= 0
      ) {
        console.warn("[GET_STT_RESULTS:BLOCKED]", "invalid payload");
        return;
      }

      const requestId = createRequestId("get-stt-results");
      pendingGetSttResultsRef.current = {
        requestId,
        workspaceId: payload.workspaceId,
        meetingId: payload.meetingId,
        meetingRoomId: payload.meetingRoomId,
      };

      const message: GetSttResultsRequest = {
        type: "GET_STT_RESULTS",
        requestId,
        payload,
      };

      console.log("[GET_STT_RESULTS:BEFORE_SEND]", payload);
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  // The server-message callback is declared before the request helper below.
  // Keep a stable ref so an incoming Pub/Sub event can always trigger the
  // latest request implementation without creating a declaration cycle.
  useEffect(() => {
    getSttResultsRef.current = getSttResults;
  }, [getSttResults]);

  const getSttResult = useCallback(
    (
      workspaceId: number,
      meetingId: number,
      meetingRoomId: number,
      sttResultId: number
    ) => {
      const payload: GetSttResultPayload = {
        workspaceId: Number(workspaceId),
        meetingId: Number(meetingId),
        meetingRoomId: Number(meetingRoomId),
        sttResultId: Number(sttResultId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_STT_RESULT:BLOCKED]", "socket not open");
        return;
      }

      if (
        !Number.isFinite(payload.workspaceId) ||
        payload.workspaceId <= 0 ||
        !Number.isFinite(payload.meetingId) ||
        payload.meetingId <= 0 ||
        !Number.isFinite(payload.meetingRoomId) ||
        payload.meetingRoomId <= 0 ||
        !Number.isFinite(payload.sttResultId) ||
        payload.sttResultId <= 0
      ) {
        console.warn("[GET_STT_RESULT:BLOCKED]", "invalid payload");
        return;
      }

      const requestId = createRequestId("get-stt-result");
      const message: GetSttResultRequest = {
        type: "GET_STT_RESULT",
        requestId,
        payload,
      };

      console.log("[GET_STT_RESULT:BEFORE_SEND]", payload);
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const deleteSttResult = useCallback(
    (
      workspaceId: number,
      meetingId: number,
      meetingRoomId: number,
      sttResultId: number
    ) => {
      const payload: DeleteSttResultPayload = {
        workspaceId: Number(workspaceId),
        meetingId: Number(meetingId),
        meetingRoomId: Number(meetingRoomId),
        sttResultId: Number(sttResultId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[DELETE_STT_RESULT:BLOCKED]", "socket not open");
        return;
      }

      if (
        !Number.isFinite(payload.workspaceId) ||
        payload.workspaceId <= 0 ||
        !Number.isFinite(payload.meetingId) ||
        payload.meetingId <= 0 ||
        !Number.isFinite(payload.meetingRoomId) ||
        payload.meetingRoomId <= 0 ||
        !Number.isFinite(payload.sttResultId) ||
        payload.sttResultId <= 0
      ) {
        console.warn("[DELETE_STT_RESULT:BLOCKED]", "invalid payload");
        return;
      }

      const requestId = createRequestId("delete-stt-result");
      const message: DeleteSttResultRequest = {
        type: "DELETE_STT_RESULT",
        requestId,
        payload,
      };

      console.log("[DELETE_STT_RESULT:BEFORE_SEND]", payload);
      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const getWorkspaceDocuments = useCallback((workspaceId: number) => {
    const finalPayload = {
      workspaceId: Number(workspaceId),
    };

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[GET_WORKSPACE_DOCUMENTS:SEND_BLOCKED] socket not open");
      return;
    }

    if (
      !Number.isFinite(finalPayload.workspaceId) ||
      finalPayload.workspaceId <= 0
    ) {
      console.warn("[GET_WORKSPACE_DOCUMENTS:SEND_BLOCKED] invalid payload", finalPayload);
      return;
    }

    if (
      pendingGetWorkspaceDocumentsRef.current?.workspaceId ===
      finalPayload.workspaceId
    ) {
      console.warn("[GET_WORKSPACE_DOCUMENTS:SEND_BLOCKED] duplicate pending request", finalPayload);
      return;
    }

    const requestId = createRequestId("get-workspace-documents");
    pendingGetWorkspaceDocumentsRef.current = {
      requestId,
      workspaceId: finalPayload.workspaceId,
    };

    const message: GetWorkspaceDocumentsRequest = {
      type: "GET_WORKSPACE_DOCUMENTS",
      requestId,
      payload: finalPayload,
    };

    console.log("[GET_WORKSPACE_DOCUMENTS:BEFORE_SEND]", finalPayload);
    console.log("[SEND] GET_WORKSPACE_DOCUMENTS");
    sendSocketMessage(socketRef.current, message);
  }, []);

  const getDocument = useCallback((payload: {
    workspaceId: number;
    documentId: number;
    meetingId?: number;
    meetingRoomId?: number;
  }) => {
    const finalPayload = {
      workspaceId: Number(payload.workspaceId),
      documentId: Number(payload.documentId),
      ...(payload.meetingId !== undefined
        ? { meetingId: Number(payload.meetingId) }
        : {}),
      ...(payload.meetingRoomId !== undefined
        ? { meetingRoomId: Number(payload.meetingRoomId) }
        : {}),
    };

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[GET_DOCUMENT:SEND_BLOCKED] socket not open");
      return;
    }

    if (
      !Number.isFinite(finalPayload.workspaceId) ||
      finalPayload.workspaceId <= 0 ||
      !Number.isFinite(finalPayload.documentId) ||
      finalPayload.documentId <= 0 ||
      (finalPayload.meetingId !== undefined &&
        (!Number.isFinite(finalPayload.meetingId) || finalPayload.meetingId <= 0)) ||
      (finalPayload.meetingRoomId !== undefined &&
        (!Number.isFinite(finalPayload.meetingRoomId) || finalPayload.meetingRoomId <= 0))
    ) {
      console.warn("[GET_DOCUMENT:SEND_BLOCKED] invalid payload", finalPayload);
      return;
    }

    if (
      pendingGetDocumentRef.current?.workspaceId === finalPayload.workspaceId &&
      pendingGetDocumentRef.current?.documentId === finalPayload.documentId
    ) {
      console.warn("[GET_DOCUMENT:SEND_BLOCKED] duplicate pending request", finalPayload);
      return;
    }

    const requestId = createRequestId("get-document");
    pendingGetDocumentRef.current = {
      requestId,
      workspaceId: finalPayload.workspaceId,
      documentId: finalPayload.documentId,
    };

    const message: GetDocumentRequest = {
      type: "GET_DOCUMENT",
      requestId,
      payload: finalPayload,
    };

    console.log("[GET_DOCUMENT:BEFORE_SEND]", finalPayload);
    console.log("[SEND] GET_DOCUMENT");
    sendSocketMessage(socketRef.current, message);
  }, []);

  const deleteDocument = useCallback((payload: {
    workspaceId: number;
    documentId: number;
    meetingId?: number;
    meetingRoomId?: number;
  }) => {
    const finalPayload = {
      workspaceId: Number(payload.workspaceId),
      documentId: Number(payload.documentId),
      ...(payload.meetingId !== undefined && payload.meetingId !== null
        ? { meetingId: Number(payload.meetingId) }
        : {}),
      ...(payload.meetingRoomId !== undefined && payload.meetingRoomId !== null
        ? { meetingRoomId: Number(payload.meetingRoomId) }
        : {}),
    };

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn("[DELETE_DOCUMENT:SEND_BLOCKED] socket not open");
      return;
    }

    if (
      !Number.isFinite(finalPayload.workspaceId) ||
      finalPayload.workspaceId <= 0 ||
      !Number.isFinite(finalPayload.documentId) ||
      finalPayload.documentId <= 0 ||
      (finalPayload.meetingId !== undefined &&
        (!Number.isFinite(finalPayload.meetingId) || finalPayload.meetingId <= 0)) ||
      (finalPayload.meetingRoomId !== undefined &&
        (!Number.isFinite(finalPayload.meetingRoomId) || finalPayload.meetingRoomId <= 0))
    ) {
      console.warn("[DELETE_DOCUMENT:SEND_BLOCKED] invalid payload", finalPayload);
      return;
    }

    if (
      pendingDeleteDocumentRef.current?.workspaceId === finalPayload.workspaceId &&
      pendingDeleteDocumentRef.current?.documentId === finalPayload.documentId
    ) {
      console.warn("[DELETE_DOCUMENT:SEND_BLOCKED] duplicate pending request", finalPayload);
      return;
    }

    const requestId = createRequestId("delete-document");
    pendingDeleteDocumentRef.current = {
      requestId,
      workspaceId: finalPayload.workspaceId,
      documentId: finalPayload.documentId,
      ...(finalPayload.meetingId !== undefined
        ? { meetingId: finalPayload.meetingId }
        : {}),
      ...(finalPayload.meetingRoomId !== undefined
        ? { meetingRoomId: finalPayload.meetingRoomId }
        : {}),
    };

    const message: DeleteDocumentRequest = {
      type: "DELETE_DOCUMENT",
      requestId,
      payload: finalPayload,
    };

    console.log("[DELETE_DOCUMENT:BEFORE_SEND]", finalPayload);
    console.log("[SEND] DELETE_DOCUMENT");
    sendSocketMessage(socketRef.current, message);
  }, []);

  const getAlerts = useCallback(
    (payload: GetAlertsPayload) => {
      const finalPayload: GetAlertsPayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        ...(payload.status ? { status: payload.status } : {}),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ALERTS:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0
      ) {
        console.warn("[GET_ALERTS:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      const requestKey = `${finalPayload.workspaceId}-${finalPayload.meetingId}-${finalPayload.meetingRoomId}-${finalPayload.status ?? "ALL"}`;

      if (pendingGetAlertsKeyRef.current === requestKey) {
        console.warn("[GET_ALERTS:SEND_BLOCKED] duplicate pending request", {
          requestKey,
        });
        return;
      }

      clearGetAlertsTimeout();
      const requestId = createRequestId("get-alerts");
      pendingGetAlertsKeyRef.current = requestKey;
      pendingGetAlertsRef.current = {
        requestId,
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
        ...(finalPayload.status ? { status: finalPayload.status } : {}),
      };

      const message: GetAlertsRequest = {
        type: "GET_ALERTS",
        requestId,
        payload: finalPayload,
      };

      setAlertLoading(true);
      setAlertErrorMessage(null);
      getAlertsTimeoutRef.current = window.setTimeout(() => {
        if (pendingGetAlertsRef.current?.requestId !== requestId) return;

        pendingGetAlertsRef.current = null;
        pendingGetAlertsKeyRef.current = null;
        getAlertsTimeoutRef.current = null;
        setAlertLoading(false);
        setAlertErrorMessage("재논의 알림 목록 조회 응답이 지연되고 있습니다.");
      }, GET_ALERTS_TIMEOUT_MS);

      console.log("[GET_ALERTS:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ALERTS");
      sendSocketMessage(socketRef.current, message);
    },
    [clearGetAlertsTimeout, setAlertErrorMessage, setAlertLoading]
  );

  const getAlert = useCallback(
    (payload: GetAlertPayload) => {
      const finalPayload: GetAlertPayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        alertId: Number(payload.alertId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[GET_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0
      ) {
        console.warn("[GET_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      clearGetAlertTimeout();
      const requestId = createRequestId("get-alert");
      pendingGetAlertRef.current = {
        requestId,
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
        alertId: finalPayload.alertId,
      };

      const message: GetAlertRequest = {
        type: "GET_ALERT",
        requestId,
        payload: finalPayload,
      };

      setSelectedAlertId(finalPayload.alertId);
      setAlertDetail(null);
      setAlertDetailLoading(true);
      setAlertDetailErrorMessage(null);
      getAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingGetAlertRef.current?.requestId !== requestId) return;

        pendingGetAlertRef.current = null;
        getAlertTimeoutRef.current = null;
        setAlertDetailLoading(false);
        setAlertDetailErrorMessage("재논의 알림 상세 조회 응답이 지연되고 있습니다.");
      }, GET_ALERT_TIMEOUT_MS);

      console.log("[GET_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] GET_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearGetAlertTimeout,
      setAlertDetail,
      setAlertDetailErrorMessage,
      setAlertDetailLoading,
      setSelectedAlertId,
    ]
  );

  const acknowledgeAlert = useCallback(
    (alertId: number) => {
      const finalPayload: AcknowledgeAlertPayload = {
        alertId: Number(alertId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[ACKNOWLEDGE_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0
      ) {
        console.warn("[ACKNOWLEDGE_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      if (pendingAcknowledgeAlertRef.current?.alertId === finalPayload.alertId) {
        console.warn("[ACKNOWLEDGE_ALERT:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      clearAcknowledgeAlertTimeout();
      const requestId = createRequestId("ack-alert");
      pendingAcknowledgeAlertRef.current = {
        requestId,
        alertId: finalPayload.alertId,
      };

      const message: AcknowledgeAlertRequest = {
        type: "ACKNOWLEDGE_ALERT",
        requestId,
        payload: finalPayload,
      };

      setAcknowledgeAlertLoading(true);
      setAcknowledgeAlertErrorMessage(null);
      acknowledgeAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingAcknowledgeAlertRef.current?.requestId !== requestId) return;

        pendingAcknowledgeAlertRef.current = null;
        acknowledgeAlertTimeoutRef.current = null;
        setAcknowledgeAlertLoading(false);
        setAcknowledgeAlertErrorMessage("알림 확인 완료 변경 응답이 지연되고 있습니다.");
      }, ACKNOWLEDGE_ALERT_TIMEOUT_MS);

      console.log("[ACKNOWLEDGE_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] ACKNOWLEDGE_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearAcknowledgeAlertTimeout,
      setAcknowledgeAlertErrorMessage,
      setAcknowledgeAlertLoading,
    ]
  );

  const dismissAlert = useCallback(
    (alertId: number) => {
      const finalPayload: DismissAlertPayload = {
        alertId: Number(alertId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[DISMISS_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0
      ) {
        console.warn("[DISMISS_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      if (pendingDismissAlertRef.current?.alertId === finalPayload.alertId) {
        console.warn("[DISMISS_ALERT:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      clearDismissAlertTimeout();
      const requestId = createRequestId("dismiss-alert");
      pendingDismissAlertRef.current = {
        requestId,
        alertId: finalPayload.alertId,
      };

      const message: DismissAlertRequest = {
        type: "DISMISS_ALERT",
        requestId,
        payload: finalPayload,
      };

      setDismissAlertLoading(true);
      setDismissAlertErrorMessage(null);
      dismissAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingDismissAlertRef.current?.requestId !== requestId) return;

        pendingDismissAlertRef.current = null;
        dismissAlertTimeoutRef.current = null;
        setDismissAlertLoading(false);
        setDismissAlertErrorMessage("알림 무시 처리 응답이 지연되고 있습니다.");
      }, DISMISS_ALERT_TIMEOUT_MS);

      console.log("[DISMISS_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] DISMISS_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearDismissAlertTimeout,
      setDismissAlertErrorMessage,
      setDismissAlertLoading,
    ]
  );

  const resolveAlert = useCallback(
    (alertId: number) => {
      const finalPayload: ResolveAlertPayload = {
        alertId: Number(alertId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[RESOLVE_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0
      ) {
        console.warn("[RESOLVE_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      if (pendingResolveAlertRef.current?.alertId === finalPayload.alertId) {
        console.warn("[RESOLVE_ALERT:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      clearResolveAlertTimeout();
      const requestId = createRequestId("resolve-alert");
      pendingResolveAlertRef.current = {
        requestId,
        alertId: finalPayload.alertId,
      };

      const message: ResolveAlertRequest = {
        type: "RESOLVE_ALERT",
        requestId,
        payload: finalPayload,
      };

      setResolveAlertLoading(true);
      setResolveAlertErrorMessage(null);
      resolveAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingResolveAlertRef.current?.requestId !== requestId) return;

        pendingResolveAlertRef.current = null;
        resolveAlertTimeoutRef.current = null;
        setResolveAlertLoading(false);
        setResolveAlertErrorMessage("알림 해결 처리 응답이 지연되고 있습니다.");
      }, RESOLVE_ALERT_TIMEOUT_MS);

      console.log("[RESOLVE_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] RESOLVE_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearResolveAlertTimeout,
      setResolveAlertErrorMessage,
      setResolveAlertLoading,
    ]
  );

  const updateAlert = useCallback(
    (payload: UpdateAlertPayload) => {
      const finalPayload: UpdateAlertPayload = {
        workspaceId: Number(payload.workspaceId),
        alertId: Number(payload.alertId),
        ...(payload.meetingId !== undefined ? { meetingId: Number(payload.meetingId) } : {}),
        ...(payload.issueId !== undefined ? { issueId: Number(payload.issueId) } : {}),
        ...(payload.message !== undefined ? { message: payload.message.trim() } : {}),
        ...(payload.level ? { level: payload.level } : {}),
        ...(payload.status ? { status: payload.status } : {}),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[UPDATE_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0 ||
        (finalPayload.meetingId !== undefined &&
          (!Number.isFinite(finalPayload.meetingId) || finalPayload.meetingId <= 0)) ||
        (finalPayload.issueId !== undefined &&
          (!Number.isFinite(finalPayload.issueId) || finalPayload.issueId <= 0)) ||
        finalPayload.message === ""
      ) {
        console.warn("[UPDATE_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        setUpdateAlertErrorMessage("알림 수정값을 확인해주세요.");
        return;
      }

      if (pendingUpdateAlertRef.current?.alertId === finalPayload.alertId) {
        console.warn("[UPDATE_ALERT:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      clearUpdateAlertTimeout();
      const requestId = createRequestId("update-alert");
      pendingUpdateAlertRef.current = {
        requestId,
        alertId: finalPayload.alertId,
      };

      const message: UpdateAlertRequest = {
        type: "UPDATE_ALERT",
        requestId,
        payload: finalPayload,
      };

      setUpdateAlertLoading(true);
      setUpdateAlertErrorMessage(null);
      updateAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingUpdateAlertRef.current?.requestId !== requestId) return;

        pendingUpdateAlertRef.current = null;
        updateAlertTimeoutRef.current = null;
        setUpdateAlertLoading(false);
        setUpdateAlertErrorMessage("알림 수정 응답이 지연되고 있습니다.");
      }, UPDATE_ALERT_TIMEOUT_MS);

      console.log("[UPDATE_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] UPDATE_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearUpdateAlertTimeout,
      setUpdateAlertErrorMessage,
      setUpdateAlertLoading,
    ]
  );

  const deleteAlert = useCallback(
    (alertId: number) => {
      const finalPayload: DeleteAlertPayload = {
        alertId: Number(alertId),
      };

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[DELETE_ALERT:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.alertId) ||
        finalPayload.alertId <= 0
      ) {
        console.warn("[DELETE_ALERT:SEND_BLOCKED] invalid payload", finalPayload);
        setDeleteAlertErrorMessage("삭제할 알림을 확인해주세요.");
        return;
      }

      if (pendingDeleteAlertRef.current?.alertId === finalPayload.alertId) {
        console.warn("[DELETE_ALERT:SEND_BLOCKED] duplicate pending request", finalPayload);
        return;
      }

      clearDeleteAlertTimeout();
      const requestId = createRequestId("delete-alert");
      pendingDeleteAlertRef.current = {
        requestId,
        alertId: finalPayload.alertId,
      };

      const message: DeleteAlertRequest = {
        type: "DELETE_ALERT",
        requestId,
        payload: finalPayload,
      };

      setDeleteAlertLoading(true);
      setDeleteAlertErrorMessage(null);
      deleteAlertTimeoutRef.current = window.setTimeout(() => {
        if (pendingDeleteAlertRef.current?.requestId !== requestId) return;

        pendingDeleteAlertRef.current = null;
        deleteAlertTimeoutRef.current = null;
        setDeleteAlertLoading(false);
        setDeleteAlertErrorMessage("알림 삭제 응답이 지연되고 있습니다.");
      }, DELETE_ALERT_TIMEOUT_MS);

      console.log("[DELETE_ALERT:BEFORE_SEND]", finalPayload);
      console.log("[SEND] DELETE_ALERT");
      sendSocketMessage(socketRef.current, message);
    },
    [
      clearDeleteAlertTimeout,
      setDeleteAlertErrorMessage,
      setDeleteAlertLoading,
    ]
  );

  const updateIssue = useCallback(
    (payload: UpdateIssuePayload) => {
      const finalPayload: UpdateIssuePayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        issueId: Number(payload.issueId),
        title: payload.title.trim(),
        description: payload.description ?? null,
        priority: payload.priority ?? null,
        dueDate: payload.dueDate ?? null,
        assigneeId: payload.assigneeId ?? null,
      };

      if (isUpdateIssuePendingRef.current) {
        console.warn("[UPDATE_ISSUE:SEND_BLOCKED] pending request");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[UPDATE_ISSUE:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !Number.isFinite(finalPayload.issueId) ||
        finalPayload.issueId <= 0 ||
        !finalPayload.title
      ) {
        console.warn("[UPDATE_ISSUE:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      const message: UpdateIssueRequest = {
        type: "UPDATE_ISSUE",
        requestId: createRequestId("update-issue"),
        payload: finalPayload,
      };

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };
      isUpdateIssuePendingRef.current = true;
      console.log("[UPDATE_ISSUE:BEFORE_SEND]", finalPayload);
      console.log("[SEND] UPDATE_ISSUE");

      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const changeIssueState = useCallback(
    (payload: ChangeIssueStatePayload) => {
      const finalPayload: ChangeIssueStatePayload = {
        workspaceId: Number(payload.workspaceId),
        meetingId: Number(payload.meetingId),
        meetingRoomId: Number(payload.meetingRoomId),
        issueId: Number(payload.issueId),
        toState: payload.toState,
        reason: payload.reason.trim() || "안건 상태 변경",
        evidence: payload.evidence.trim() || "회의 요약 화면에서 사용자가 상태 변경 버튼을 클릭함",
      };

      if (isUpdateIssuePendingRef.current) {
        console.warn("[CHANGE_ISSUE_STATE:SEND_BLOCKED] pending request");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[CHANGE_ISSUE_STATE:SEND_BLOCKED] socket not open");
        return;
      }

      if (
        !Number.isFinite(finalPayload.workspaceId) ||
        finalPayload.workspaceId <= 0 ||
        !Number.isFinite(finalPayload.meetingId) ||
        finalPayload.meetingId <= 0 ||
        !Number.isFinite(finalPayload.meetingRoomId) ||
        finalPayload.meetingRoomId <= 0 ||
        !Number.isFinite(finalPayload.issueId) ||
        finalPayload.issueId <= 0 ||
        !["OPEN", "IN_PROGRESS", "CLOSED"].includes(finalPayload.toState) ||
        !finalPayload.reason
      ) {
        console.warn("[CHANGE_ISSUE_STATE:SEND_BLOCKED] invalid payload", finalPayload);
        return;
      }

      const message: ChangeIssueStateRequest = {
        type: "CHANGE_ISSUE_STATE",
        requestId: createRequestId("change-issue-state"),
        payload: finalPayload,
      };

      currentIssueContextRef.current = {
        workspaceId: finalPayload.workspaceId,
        meetingId: finalPayload.meetingId,
        meetingRoomId: finalPayload.meetingRoomId,
      };
      isUpdateIssuePendingRef.current = true;
      console.log("[CHANGE_ISSUE_STATE:BEFORE_SEND]", finalPayload);
      console.log("[SEND] CHANGE_ISSUE_STATE");

      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const deleteIssue = useCallback(
    (payload: DeleteIssuePayload) => {
      if (isDeleteIssuePendingRef.current) {
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      const message: DeleteIssueRequest = {
        type: "DELETE_ISSUE",
        requestId: createRequestId("delete-issue"),
        payload,
      };

      isDeleteIssuePendingRef.current = true;
      console.log("[SEND] DELETE_ISSUE");

      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  const registerUser = useCallback(() => {
    const socket = socketRef.current;

    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    console.log("[SEND] CONNECT_USER");

    sendSocketMessage(socket, {
      type: CLIENT_SOCKET_EVENTS.CONNECT_USER,
      requestId: createRequestId("connect-user"),
      payload: {
        ...(user.name ? { name: user.name } : {}),
      },
    });
  }, [user.name]);

  const sendPing = useCallback(() => {
    const socket = socketRef.current;

    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const activeSocket: WebSocket = socket;
    const message = {
      type: CLIENT_SOCKET_EVENTS.PING,
      requestId: createRequestId("ping"),
      payload: {},
    };

    console.log("[Socket] PING send");
    sendSocketMessage(activeSocket, message);
  }, []);

  const joinWorkspace = useCallback(
    (targetWorkspaceId: number) => {
      sendJoinWorkspaceMessage(targetWorkspaceId, "manual");
    },
    [sendJoinWorkspaceMessage]
  );

  const leaveWorkspace = useCallback(
    (targetWorkspaceId?: number) => {
      const rawWorkspaceId = targetWorkspaceId ?? workspaceId;
      const finalWorkspaceId = Number(rawWorkspaceId);

      if (!Number.isInteger(finalWorkspaceId) || finalWorkspaceId <= 0) return;

      setWorkspaceStatus("leaving");
      setWorkspaceErrorMessage(null);

      console.log("[SEND] LEAVE_WORKSPACE");

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.LEAVE_WORKSPACE,
        requestId: createRequestId("leave-workspace"),
        payload: {
          workspaceId: finalWorkspaceId,
        },
      });
    },
    [setWorkspaceErrorMessage, setWorkspaceStatus, workspaceId]
    );

  const getMeetings = useCallback(
    (targetWorkspaceId?: string | number) => {
      const finalWorkspaceId = Number(targetWorkspaceId ?? workspaceId);

      if (!Number.isInteger(finalWorkspaceId) || finalWorkspaceId <= 0) {
        setMeetingErrorMessage("workspaceId는 숫자여야 합니다.");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setMeetingErrorMessage("WebSocket이 연결되지 않아 회의 목록을 조회할 수 없습니다.");
        return;
      }

      setIsMeetingLoading(true);
      setMeetingErrorMessage(null);

      console.log("[SEND] GET_MEETINGS");

      const requestId = createRequestId("get-meetings");
      pendingGetMeetingsRef.current = {
        requestId,
        workspaceId: finalWorkspaceId,
      };

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.GET_MEETINGS,
        requestId,
        payload: {
          workspaceId: finalWorkspaceId,
          page: 1,
          size: 20,
        }
      });
    },
    [workspaceId]
  );
  const getMeeting = useCallback(
    (targetWorkspaceId: number, targetMeetingId: number) => {
      const finalWorkspaceId = Number(targetWorkspaceId);
      const finalMeetingId = Number(targetMeetingId);

      if (
        !Number.isFinite(finalWorkspaceId) ||
        finalWorkspaceId <= 0 ||
        !Number.isFinite(finalMeetingId) ||
        finalMeetingId <= 0
      ) {
        setMeetingErrorMessage("workspaceId 또는 meetingId가 올바르지 않습니다.");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setMeetingErrorMessage("WebSocket이 연결되지 않아 회의 상세를 조회할 수 없습니다.");
        return;
      }

      setIsMeetingLoading(true);
      setMeetingErrorMessage(null);

      console.log("[GET_MEETING:REQUEST]", {
        workspaceId: finalWorkspaceId,
        meetingId: finalMeetingId,
      });

      const requestId = createRequestId("get-meeting");
      pendingGetMeetingRef.current = {
        requestId,
        workspaceId: finalWorkspaceId,
        meetingId: finalMeetingId,
      };

      const message: GetMeetingRequest = {
        type: CLIENT_SOCKET_EVENTS.GET_MEETING,
        requestId,
        payload: {
          workspaceId: finalWorkspaceId,
          meetingId: finalMeetingId,
        },
      };

      sendSocketMessage(socketRef.current, message);
    },
    []
  );

  //미팅 페이지 생성
  const createMeeting = useCallback(
    (params: {
      workspaceId?: string | number;
      title: string;
      status?: "READY";
    }) => {
      const finalWorkspaceId = Number(params.workspaceId ?? workspaceId);
      const title = params.title.trim();

      if (!Number.isInteger(finalWorkspaceId) || finalWorkspaceId <= 0) {
        setMeetingErrorMessage("workspaceId는 숫자여야 합니다.");
        return;
      }

      if (!title) {
        setMeetingErrorMessage("회의 제목을 입력해야 합니다.");
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setMeetingErrorMessage("WebSocket이 연결되지 않아 회의를 생성할 수 없습니다.");
        return;
      }

      setIsMeetingLoading(true);
      setMeetingErrorMessage(null);
      const message: CreateMeetingRequest = {
        type: "CREATE_MEETING",
        requestId: createRequestId("create-meeting"),
        payload: {
          workspaceId: finalWorkspaceId,
          title,
          status: "READY",
        },
      };

      createMeetingPendingRef.current = true;
      createMeetingAckReceivedRef.current = false;
      console.log("[SEND] CREATE_MEETING");

      sendSocketMessage(socketRef.current, message);
    },
    [workspaceId]
  );

  //회의 시작
  const startMeeting = useCallback(
    (workspaceId: number, meetingId: number) => {
      if (isStartMeetingPendingRef.current) {
        return;
      }

      const socket = socketRef.current;

      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const createdMeeting = lastCreatedMeeting;
      const fetchedMeeting = lastFetchedMeeting;
      const title =
        meetings.find((meeting) => Number(meeting.id) === Number(meetingId))?.title?.trim() ||
        (createdMeeting && Number(createdMeeting.id) === Number(meetingId)
          ? createdMeeting.title.trim()
          : "") ||
        (fetchedMeeting && Number(fetchedMeeting.id) === Number(meetingId)
          ? fetchedMeeting.title.trim()
          : "") ||
        getMeetingTitleFallback(meetingId, meetings);

      const message: StartMeetingRequest = {
        type: "START_MEETING",
        requestId: createRequestId("start-meeting"),
        payload: {
          workspaceId,
          meetingId,
          title,
        },
      };

      isStartMeetingPendingRef.current = true;
      console.log("[SEND] START_MEETING");

      sendSocketMessage(socket, message);
    },
    [lastCreatedMeeting, lastFetchedMeeting, meetings]
  );

  //회의 종료
  const endMeeting = useCallback(
    (workspaceId: number, meetingId: number) => {
      if (isEndMeetingPendingRef.current) {
        return;
      }

      const socket = socketRef.current;

      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const createdMeeting = lastCreatedMeeting;
      const fetchedMeeting = lastFetchedMeeting;
      const title =
        meetings.find((meeting) => Number(meeting.id) === Number(meetingId))?.title?.trim() ||
        (createdMeeting && Number(createdMeeting.id) === Number(meetingId)
          ? createdMeeting.title.trim()
          : "") ||
        (fetchedMeeting && Number(fetchedMeeting.id) === Number(meetingId)
          ? fetchedMeeting.title.trim()
          : "") ||
        getMeetingTitleFallback(meetingId, meetings);

      const message: EndMeetingRequest = {
        type: "END_MEETING",
        requestId: createRequestId("end-meeting"),
        payload: {
          workspaceId,
          meetingId,
          title,
        },
      };

      isEndMeetingPendingRef.current = true;
      console.log("[SEND] END_MEETING");

      sendSocketMessage(socket, message);
    },
    [lastCreatedMeeting, lastFetchedMeeting, meetings]
  );

  const deleteMeeting = useCallback(
    (
      targetWorkspaceId: number,
      targetMeetingId: number,
      role?: WorkspaceRole | null
    )  => {
      if (!canDeleteMeeting(role)) {
        console.warn("[DELETE_MEETING:SEND_BLOCKED] permission denied", {
          role,
        });
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setMeetingErrorMessage(
          "WebSocket이 연결되지 않아 회의를 삭제할 수 없습니다."
        );
        return;
      }

      setIsMeetingLoading(true);
      setMeetingErrorMessage(null);

      console.log("[SEND] DELETE_MEETING");

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.DELETE_MEETING,
        requestId: createRequestId("delete-meeting"),
        payload: {
          workspaceId: Number(targetWorkspaceId),
          meetingId: Number(targetMeetingId),
        },
      });
    },
    []
  );

  const joinMeetingRoom = useCallback(
    (
      targetWorkspaceId: number,
      targetMeetingId: number,
      targetMeetingRoomId: number
    ) => {
      const currentMeetingRoom = useMeetingRoomPresenceStore.getState();

      if (
        currentMeetingRoom.workspaceId === targetWorkspaceId &&
        currentMeetingRoom.meetingRoomId === targetMeetingRoomId &&
        (currentMeetingRoom.status === "joining" ||
          currentMeetingRoom.status === "joined")
      ) {
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        setMeetingRoomStatus("error");
        setMeetingRoomErrorMessage(
          "WebSocket이 연결되지 않아 회의방에 입장할 수 없습니다."
        );
        return;
      }

      setMeetingRoomStatus("joining");
      setMeetingRoomWorkspaceId(targetWorkspaceId);
      setMeetingRoomId(targetMeetingRoomId);
      setMeetingRoomErrorMessage(null);
      currentIssueContextRef.current = {
        workspaceId: Number(targetWorkspaceId),
        meetingId: Number(targetMeetingId),
        meetingRoomId: Number(targetMeetingRoomId),
      };

      console.log("[SEND] JOIN_MEETING_ROOM");

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.JOIN_MEETING_ROOM,
        requestId: createRequestId("join-meeting-room"),
        payload: {
          workspaceId: targetWorkspaceId,
          meetingId: targetMeetingId,
          meetingRoomId: targetMeetingRoomId,
        },
      });
    },
    [
      setMeetingRoomErrorMessage,
      setMeetingRoomId,
      setMeetingRoomStatus,
      setMeetingRoomWorkspaceId,
    ]
  );

  /**
   * STT text chunk 전송
   *
   * 흐름:
   *   Audio → STT → text chunk → 이 함수
   *   → Node.js → FastAPI (utterance 저장 + 화자 클러스터링 + 재논의 판단)
   *   → TRANSCRIPT / TOPIC_* 이벤트로 되돌아온다.
   *
   * speakerEmbedding을 함께 보내면 서버가 같은 화자를 하나로 묶어
   * Speaker 1 / Speaker 2 / Unknown 라벨을 부여한다.
   */
  const sendTranscriptChunk = useCallback(
    (payload: TranscriptChunkPayload) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[SEND] TRANSCRIPT_CHUNK 실패: WebSocket 미연결");
        return;
      }

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.TRANSCRIPT_CHUNK,
        requestId: createRequestId("transcript-chunk"),
        payload: {
          ...payload,
          meetingRoomId: payload.meetingRoomId ?? meetingRoomId ?? null,
        },
      });
    },
    [meetingRoomId]
  );

  const leaveMeetingRoom = useCallback(
    (
      targetWorkspaceId?: number,
      targetMeetingId?: number,
      targetMeetingRoomId?: number
    ) => {
      const rawWorkspaceId =
        targetWorkspaceId ?? meetingRoomWorkspaceId ?? workspaceId;

      const finalWorkspaceId = Number(rawWorkspaceId);

      const finalMeetingRoomId = targetMeetingRoomId ?? meetingRoomId;

      if (!finalWorkspaceId || !targetMeetingId || !finalMeetingRoomId) {
        return;
      }

      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      setMeetingRoomStatus("leaving");
      setMeetingRoomErrorMessage(null);

      console.log("[SEND] LEAVE_MEETING_ROOM");

      sendSocketMessage(socketRef.current, {
        type: CLIENT_SOCKET_EVENTS.LEAVE_MEETING_ROOM,
        requestId: createRequestId("leave-meeting-room"),
        payload: {
          workspaceId: finalWorkspaceId,
          meetingId: targetMeetingId,
          meetingRoomId: finalMeetingRoomId,
        },
      });
    },
    [
      meetingRoomId,
      meetingRoomWorkspaceId,
      setMeetingRoomErrorMessage,
      setMeetingRoomStatus,
      workspaceId,
    ]
  );

  const clearWorkspaceData = useCallback(() => {
    pendingGetMeetingsRef.current = null;
    pendingGetIssuesRef.current = null;
    pendingGetAllIssuesRef.current = null;
    pendingGetDocumentsRef.current = null;
    pendingGetSttResultsRef.current = null;
    pendingGetWorkspaceDocumentsRef.current = null;
    pendingGetDocumentRef.current = null;
    pendingDeleteDocumentRef.current = null;
    pendingGetAlertsRef.current = null;
    pendingGetAlertsKeyRef.current = null;
    pendingGetAlertRef.current = null;
    pendingAcknowledgeAlertRef.current = null;
    pendingDismissAlertRef.current = null;
    pendingResolveAlertRef.current = null;
    pendingUpdateAlertRef.current = null;
    pendingDeleteAlertRef.current = null;
    currentIssueContextRef.current = null;
    clearGetAlertsTimeout();
    clearGetAlertTimeout();
    clearAcknowledgeAlertTimeout();
    clearDismissAlertTimeout();
    clearResolveAlertTimeout();
    clearUpdateAlertTimeout();
    clearDeleteAlertTimeout();

    setMeetings([]);
    setLoadedMeetingsWorkspaceId(null);
    setIssues([]);
    setAllIssues([]);
    setSttResults([]);
    setSelectedSttResult(null);
    setLastCreatedSttResult(null);
    setSelectedIssueDetail(null);
    setSelectedIssueEvents([]);
    setLastCreatedMeeting(null);
    setLastFetchedMeeting(null);
    setMeetingErrorMessage(null);
    setIsMeetingLoading(false);
    setIsIssueDetailLoading(false);
    setIsIssueEventsLoading(false);
    resetAlerts();
    resetDocuments();
  }, [clearAcknowledgeAlertTimeout, clearDeleteAlertTimeout, clearDismissAlertTimeout, clearGetAlertTimeout, clearGetAlertsTimeout, clearResolveAlertTimeout, clearUpdateAlertTimeout, resetAlerts, resetDocuments]);

  const disconnectUser = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setStatus("disconnecting");

    sendSocketMessage(socketRef.current, {
      type: CLIENT_SOCKET_EVENTS.DISCONNECT_USER,
      requestId: createRequestId("disconnect-user"),
      payload: {
      },
    });
  }, [setStatus]);

  const closeSocket = useCallback(() => {
    stopHeartbeat();
    clearReconnectTimer();

    const socket = socketRef.current;
    socketRef.current = null;

    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close();
    }

    socketAccessTokenRef.current = null;
    setSocketUserId(null);
    pendingJoinWorkspaceRef.current = null;
    pendingGetMeetingRef.current = null;
    isStartMeetingPendingRef.current = false;
    isEndMeetingPendingRef.current = false;
    isCreateIssuePendingRef.current = false;
    isUpdateIssuePendingRef.current = false;
    isDeleteIssuePendingRef.current = false;
    clearWorkspaceData();
    setCurrentUser(null);
    setStatus("disconnected");
    setWorkspaceId(null);
    setWorkspaceStatus("left");
    setWorkspaceUsers([]);
    setWorkspaceJoinedAt(null);
    setWorkspaceLeftAt(null);
    setWorkspaceUpdatedAt(null);
    setWorkspaceErrorMessage(null);
    setMeetingRoomWorkspaceId(null);
    setMeetingRoomId(null);
    setMeetingRoomStatus("left");
    setMeetingRoomUsers([]);
    setMeetingRoomJoinedAt(null);
    setMeetingRoomLeftAt(null);
    setMeetingRoomUpdatedAt(null);
    setMeetingRoomErrorMessage(null);
  }, [
    clearWorkspaceData,
    setCurrentUser,
    setMeetingRoomErrorMessage,
    setMeetingRoomId,
    setMeetingRoomJoinedAt,
    setMeetingRoomLeftAt,
    setMeetingRoomStatus,
    setMeetingRoomUpdatedAt,
    setMeetingRoomUsers,
    setMeetingRoomWorkspaceId,
    setStatus,
    setWorkspaceErrorMessage,
    setWorkspaceId,
    setWorkspaceJoinedAt,
    setWorkspaceLeftAt,
    setWorkspaceStatus,
    setWorkspaceUpdatedAt,
    setWorkspaceUsers,
    clearReconnectTimer,
    stopHeartbeat,
  ]);

  const connectSocket = useCallback(() => {
    console.log("[Socket] connectSocket called");

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setStatus("connecting");
    setError(null);

    const nextAccessToken = normalizeAccessToken(accessToken);

    if (!nextAccessToken) {
      setStatus("error");
      setError({
        errorCode: "CLIENT_AUTH_ERROR",
        message: "accessToken이 없어 WebSocket에 연결할 수 없습니다.",
      });
      return;
    }

    const nextSocketUserId = getJwtSubject(nextAccessToken);

    socketAccessTokenRef.current = nextAccessToken;
    setSocketUserId(nextSocketUserId);
    console.log("[Socket] connect", {
      tokenSub: nextSocketUserId ?? "unknown",
    });

    const socket = createSocket(socketUrl, nextAccessToken);
    console.log("[Socket] WebSocket created");
    socketRef.current = socket;
    socketConnectionIdRef.current += 1;

    socket.onopen = () => undefined;

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      const message = parseSocketMessage(event);

      // 서버에서 받은 WebSocket 메시지 확인용
      // F12 콘솔에서 모든 이벤트 흐름 추적 가능

      if (!message) {
        setStatus("error");

        setError({
          errorCode: "CLIENT_PARSE_ERROR",
          message: "WebSocket 응답 파싱에 실패했습니다.",
        });

        return;
      }

      handleServerMessage(message);

      // 서버가 최초 연결 완료 메시지를 보내면
      // 그 다음 클라이언트가 로그인 유저 정보를 WebSocket 서버에 등록해야 함
      if (message.type === "CONNECTED") {
        registerUser();

        // 연결 유지용 PING/PONG 시작
        stopHeartbeat();

        console.log("[Socket] heartbeat start", {
          intervalMs: heartbeatIntervalMs,
        });
        sendPing();
        heartbeatRef.current = window.setInterval(() => {
          sendPing();
        }, heartbeatIntervalMs);
      }
    };

    socket.onerror = () => {
      setStatus("error");
      setError({
        errorCode: "CLIENT_SOCKET_ERROR",
        message: "WebSocket 연결 중 오류가 발생했습니다.",
      });
    };

    socket.onclose = (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      isStartMeetingPendingRef.current = false;
      isEndMeetingPendingRef.current = false;
      isCreateIssuePendingRef.current = false;
      isUpdateIssuePendingRef.current = false;
      isDeleteIssuePendingRef.current = false;
      pendingGetAlertsRef.current = null;
      pendingGetAlertsKeyRef.current = null;
      pendingGetAlertRef.current = null;
      pendingAcknowledgeAlertRef.current = null;
      pendingDismissAlertRef.current = null;
      pendingResolveAlertRef.current = null;
      pendingUpdateAlertRef.current = null;
      pendingDeleteAlertRef.current = null;
      clearGetAlertsTimeout();
      clearGetAlertTimeout();
      clearAcknowledgeAlertTimeout();
      clearDismissAlertTimeout();
      clearResolveAlertTimeout();
      clearUpdateAlertTimeout();
      clearDeleteAlertTimeout();
      setAlertLoading(false);
      setAlertDetailLoading(false);
      setAcknowledgeAlertLoading(false);
      setDismissAlertLoading(false);
      setResolveAlertLoading(false);
      setUpdateAlertLoading(false);
      setDeleteAlertLoading(false);
      stopHeartbeat();
      setCurrentUser(null);
      setStatus("disconnected");
      setWorkspaceStatus("left");
      setMeetingRoomStatus("left");
      socketAccessTokenRef.current = null;
      setSocketUserId(null);
      socketRef.current = null;

      if (event.code === 4003) {
        handleSessionExpired();
      }
    };
  }, [
    accessToken,
    socketUrl,
    heartbeatIntervalMs,
    handleSessionExpired,
    handleServerMessage,
    registerUser,
    sendPing,
    setCurrentUser,
    setError,
    setMeetingRoomStatus,
    setStatus,
    setWorkspaceStatus,
    clearAcknowledgeAlertTimeout,
    clearDismissAlertTimeout,
    clearGetAlertTimeout,
    clearGetAlertsTimeout,
    clearResolveAlertTimeout,
    clearUpdateAlertTimeout,
    clearDeleteAlertTimeout,
    setAcknowledgeAlertLoading,
    setAlertDetailLoading,
    setAlertLoading,
    setDismissAlertLoading,
    setResolveAlertLoading,
    setUpdateAlertLoading,
    setDeleteAlertLoading,
    stopHeartbeat,
  ]);

  useEffect(() => {
    reconnectSocketRef.current = connectSocket;
  }, [connectSocket]);

  useEffect(() => {
    const leaveWorkspaceBeforeClose = () => {
      if (!workspaceId) {
        return;
      }

      leaveWorkspace(workspaceId);
    };

    window.addEventListener("beforeunload", leaveWorkspaceBeforeClose);

    return () => {
      window.removeEventListener("beforeunload", leaveWorkspaceBeforeClose);
    };
  }, [leaveWorkspace, workspaceId]);

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Defer the initial connection one tick so React can finish committing
    // the provider before the socket callback updates connection state.
    const connectTimer = window.setTimeout(connectSocket, 0);

    // 중요:
    // 여기서 closeSocket을 cleanup으로 부르면
    // connectSocket 함수 참조가 바뀔 때마다 기존 WebSocket을 닫아버림.
    // 그래서 socketRef 기준으로 직접 정리한다.
    return () => {
      window.clearTimeout(connectTimer);
      stopHeartbeat();
      clearReconnectTimer();

      const socket = socketRef.current;
      socketRef.current = null;

      if (
        socket &&
        (socket.readyState === WebSocket.OPEN ||
          socket.readyState === WebSocket.CONNECTING)
      ) {
        socket.close();
      }

      socketAccessTokenRef.current = null;
      setSocketUserId(null);
    };

    // 의도적으로 mount/unmount 기준으로만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect]);

  return {
    socketStatus,
    currentUser,
    lastServerTime,
    error,

    workspace: {
      workspaceId,
      status: workspaceStatus,
      users: workspaceUsers,
      updatedAt: workspaceUpdatedAt,
      errorMessage: workspaceErrorMessage,
    },

    meeting: {
      meetings,
      isLoading: isMeetingLoading,
      errorMessage: meetingErrorMessage,
      loadedWorkspaceId: loadedMeetingsWorkspaceId,
      lastCreatedMeeting,
      lastFetchedMeeting,
    },

    meetingRoom: {
      workspaceId: meetingRoomWorkspaceId,
      meetingRoomId,
      status: meetingRoomStatus,
      users: meetingRoomUsers,
      updatedAt: meetingRoomUpdatedAt,
      errorMessage: meetingRoomErrorMessage,
    },
    issues,
    allIssues,
    issue: {
      selectedIssueDetail,
      selectedIssueEvents,
      isLoading: isIssueDetailLoading,
      isEventsLoading: isIssueEventsLoading,
      errorMessage: meetingErrorMessage,
    },
    sttResult: {
      items: sttResults,
      selected: selectedSttResult,
      lastCreated: lastCreatedSttResult,
    },
    alerts: {
      items: alerts,
      selectedAlertId,
      detail: alertDetail,
      popupAlert,
      isLoading: isAlertLoading,
      isDetailLoading: isAlertDetailLoading,
      isAcknowledgeLoading: isAcknowledgeAlertLoading,
      isDismissLoading: isDismissAlertLoading,
      isResolveLoading: isResolveAlertLoading,
      isUpdateLoading: isUpdateAlertLoading,
      isDeleteLoading: isDeleteAlertLoading,
      errorMessage: alertErrorMessage,
      detailErrorMessage: alertDetailErrorMessage,
      acknowledgeErrorMessage: acknowledgeAlertErrorMessage,
      dismissErrorMessage: dismissAlertErrorMessage,
      resolveErrorMessage: resolveAlertErrorMessage,
      updateErrorMessage: updateAlertErrorMessage,
      deleteErrorMessage: deleteAlertErrorMessage,
    },

    connectSocket,
    registerUser,
    disconnectUser,
    sendPing,
    closeSocket,
    clearWorkspaceData,

    joinWorkspace,
    leaveWorkspace,

    getMeetings,
    getMeeting,
    deleteMeeting,
    createMeeting,
    startMeeting,
    endMeeting,

    joinMeetingRoom,
    leaveMeetingRoom,

    sendTranscriptChunk,

    createIssue,
    getIssues,
    getAllIssues,
    getIssue,
    getIssueEvents,
    getDocuments,
    getSttResults,
    getSttResult,
    deleteSttResult,
    getWorkspaceDocuments,
    getDocument,
    deleteDocument,
    getAlerts,
    getAlert,
    acknowledgeAlert,
    dismissAlert,
    resolveAlert,
    updateAlert,
    deleteAlert,
    closeRediscussPopup: () => setPopupAlert(null),
    updateIssue,
    changeIssueState,
    deleteIssue,
  };
}
