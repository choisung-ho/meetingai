/**
 * 파일 역할: WebSocket Presence 상태를 React Context로 전역 공유하는 Provider입니다.
 * - usePresence 결과를 하위 컴포넌트에서 useSocketContext로 꺼내 쓸 수 있게 합니다.
 * - 앱 전체에서 동일한 소켓 상태를 공유할 때 사용합니다.
 */

import { createContext, useCallback, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { usePresence } from "../../hooks/usePresence";
import {
    runLogoutOnce,
    runRefreshOnce,
} from "../../services/auth/authRefreshLock";
import { silentRefreshWithAccessToken } from "../../services/auth/authService";
import { getCurrentUser } from "../../services/auth/authService";
import { useAuthStore } from "../../store/authStore";
import type { CollaborationUser } from "../../types/collaborationUser.types";
import type { SocketErrorPayload } from "../../types/socket.types";
import type { TranscriptChunkPayload } from "../../types/transcript.types";
import type {
    MeetingRoomConnectionStatus,
    MeetingRoomUser,
} from "../../types/meetingRoom.types";
import type {
    WorkspaceConnectionStatus,
    WorkspaceRole,
    WorkspaceUser,
} from "../../types/workspace.types";
import type {
    WebSocketMeeting,
    Issue,
    IssueEvent,
    CreateIssuePayload,
    GetIssuePayload,
    GetIssueEventsPayload,
    UpdateIssuePayload,
    ChangeIssueStatePayload,
    DeleteIssuePayload,
} from "../../types/meeting.types";
import type {
    AlertItem,
    GetAlertPayload,
    GetAlertsPayload,
    UpdateAlertPayload,
} from "../../types/alert.types";
import type { DeleteDocumentPayload, GetDocumentPayload } from "../../types/document.types";
import type { SttResult, SttResultCreatedPayload } from "../../types/sttResult.types";

type SocketContextValue = {
    status: string;
    currentUser: {
        userId: string;
        name: string | null;
        status: "online" | "offline";
        connectedAt: string;
    } | null;
    lastServerTime: string | null;
    error: SocketErrorPayload | null;
    isSocketConnected: boolean;
    isUserRegistered: boolean;
    workspace: {
        workspaceId: number | null;
        status: WorkspaceConnectionStatus;
        users: WorkspaceUser[];
        updatedAt: string | null;
        errorMessage: string | null;
        isWorkspaceJoined: boolean;
    };
    meeting: {
        meetings: WebSocketMeeting[];
        isLoading: boolean;
        errorMessage: string | null;
        loadedWorkspaceId: number | null;
        lastCreatedMeeting: WebSocketMeeting | null;
        lastFetchedMeeting: WebSocketMeeting | null;
    };
    issues: Issue[];
    allIssues: Issue[];
    issue: {
        selectedIssueDetail: Issue | null;
        selectedIssueEvents: IssueEvent[];
        isLoading: boolean;
        isEventsLoading: boolean;
        errorMessage: string | null;
    };
    sttResult: {
        items: SttResult[];
        selected: SttResult | null;
        lastCreated: SttResultCreatedPayload | null;
    };
    alerts: {
        items: AlertItem[];
        selectedAlertId: number | null;
        detail: AlertItem | null;
        popupAlert: AlertItem | null;
        isLoading: boolean;
        isDetailLoading: boolean;
        isAcknowledgeLoading: boolean;
        isDismissLoading: boolean;
        isResolveLoading: boolean;
        isUpdateLoading: boolean;
        isDeleteLoading: boolean;
        errorMessage: string | null;
        detailErrorMessage: string | null;
        acknowledgeErrorMessage: string | null;
        dismissErrorMessage: string | null;
        resolveErrorMessage: string | null;
        updateErrorMessage: string | null;
        deleteErrorMessage: string | null;
    };
    meetingRoom: {
        workspaceId: number | null;
        meetingRoomId: number | null;
        status: MeetingRoomConnectionStatus;
        users: MeetingRoomUser[];
        updatedAt: string | null;
        errorMessage: string | null;
        isMeetingRoomJoined: boolean;
    };
    actions: {
        connect: () => void;
        disconnect: () => void;
        ping: () => void;
        close: () => void;
        clearWorkspaceData: () => void;

        joinWorkspace: (workspaceId: number) => void;
        leaveWorkspace: (workspaceId?: number) => void;

        joinMeetingRoom: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number
        ) => void;

        leaveMeetingRoom: (
            workspaceId?: number,
            meetingId?: number,
            meetingRoomId?: number
        ) => void;

        /** STT text chunk 전송 (실시간 발화 → FastAPI 분석) */
        sendTranscriptChunk: (payload: TranscriptChunkPayload) => void;

        getMeetings: (workspaceId?: number) => void;

        getMeeting: (
            workspaceId: number,
            meetingId: number
        ) => void;

        createMeeting: (params: {
            workspaceId?: number;
            title: string;
            status?: "READY";
        }) => void;

        deleteMeeting: (
            workspaceId: number,
            meetingId: number,
            role?: WorkspaceRole | null
        ) => void;
        startMeeting: (
            workspaceId: number,
            meetingId: number
        ) => void;

        endMeeting: (
            workspaceId: number,
            meetingId: number
        ) => void;

        createIssue: (payload: CreateIssuePayload) => void;

        getIssues: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number
        ) => void;

        getDocuments: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number
        ) => void;

        getSttResults: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number
        ) => void;

        getSttResult: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number,
            sttResultId: number
        ) => void;

        deleteSttResult: (
            workspaceId: number,
            meetingId: number,
            meetingRoomId: number,
            sttResultId: number
        ) => void;

        getWorkspaceDocuments: (
            workspaceId: number
        ) => void;

        getDocument: (
            payload: GetDocumentPayload
        ) => void;

        deleteDocument: (
            payload: DeleteDocumentPayload
        ) => void;

        getAllIssues: (
            workspaceId: number
        ) => void;

        getIssue: (
            payload: GetIssuePayload
        ) => void;

        getIssueEvents: (
            payload: GetIssueEventsPayload
        ) => void;

        getAlerts: (
            payload: GetAlertsPayload
        ) => void;

        getAlert: (
            payload: GetAlertPayload
        ) => void;

        acknowledgeAlert: (alertId: number) => void;

        dismissAlert: (alertId: number) => void;

        resolveAlert: (alertId: number) => void;

        updateAlert: (payload: UpdateAlertPayload) => void;

        deleteAlert: (alertId: number) => void;

        closeRediscussPopup: () => void;

        updateIssue: (
            payload: UpdateIssuePayload
        ) => void;

        changeIssueState: (
            payload: ChangeIssueStatePayload
        ) => void;

        deleteIssue: (
            payload: DeleteIssuePayload
        ) => void;
    };
};

const SocketContext = createContext<SocketContextValue | null>(null);
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

type SocketProviderProps = {
    children: React.ReactNode;
    user?: CollaborationUser;
};

export function SocketProvider({ user, children }: SocketProviderProps) {
    const navigate = useNavigate();
    const refreshTimerRef = useRef<number | null>(null);
    const lastSocketAccessTokenRef = useRef<string | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const accessToken = useAuthStore((state) => state.accessToken);
    const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
    const authUser = useAuthStore((state) => state.user);
    const setTokens = useAuthStore((state) => state.setTokens);
    const clearAuth = useAuthStore((state) => state.clearAuth);
    const setUser = useAuthStore((state) => state.setUser);

    const providerUser: CollaborationUser = user ?? {
        userId: authUser?.userId != null ? String(authUser.userId) : "token-auth-user",
        name: authUser?.userName ?? authUser?.name ?? "사용자",
    };

    const refreshSession = useCallback(async () => {
        if (!isLoggedIn || !accessToken) return;

        try {
            const result = await runRefreshOnce(() =>
                silentRefreshWithAccessToken(accessToken)
            );

            setTokens({
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                tokenType: result.tokenType,
                ...(result.user ? { user: result.user } : {}),
            });
        } catch (error) {
            console.error("[AUTH_REFRESH:FAILED]", error);
            runLogoutOnce(() => {
                clearAuth();
                navigate("/login", { replace: true });
            });
        }
    }, [
        accessToken,
        clearAuth,
        isLoggedIn,
        navigate,
        setTokens,
    ]);

    useEffect(() => {
        let ignore = false;

        const restoreUser = async () => {
            if (!isLoggedIn || !accessToken) return;

            try {
                const user = await getCurrentUser(accessToken);
                if (ignore) return;
                setUser(user);
            } catch (error) {
                console.warn("[AUTH_ME:FAILED]", error);
            }
        };

        restoreUser();

        return () => {
            ignore = true;
        };
    }, [accessToken, isLoggedIn, setUser]);

    useEffect(() => {
        if (refreshTimerRef.current) {
            window.clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        }

        if (!isLoggedIn || !accessToken) {
            return;
        }

        refreshTimerRef.current = window.setInterval(() => {
            refreshSession();
        }, REFRESH_INTERVAL_MS);

        return () => {
            if (refreshTimerRef.current) {
                window.clearInterval(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [accessToken, isLoggedIn, refreshSession]);

    const presence = usePresence({
        user: providerUser,
        accessToken,
        autoConnect: true,
    });
    const socketActionsRef = useRef(presence.actions);

    useEffect(() => {
        socketActionsRef.current = presence.actions;
    }, [presence.actions]);

    useEffect(() => {
        if (reconnectTimerRef.current) {
            console.log("[SocketProvider] reconnect timer clear");
            window.clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        const previousAccessToken = lastSocketAccessTokenRef.current;
        lastSocketAccessTokenRef.current = accessToken;

        if (!isLoggedIn || !accessToken) {
            socketActionsRef.current.close();
            return;
        }

        if (!previousAccessToken || previousAccessToken === accessToken) {
            return;
        }

        console.log("[Socket] reconnect with refreshed token");
        socketActionsRef.current.close();

        console.log("[SocketProvider] reconnect timer schedule");
        reconnectTimerRef.current = window.setTimeout(() => {
            socketActionsRef.current.connect();
            reconnectTimerRef.current = null;
        }, 0);

        return () => {
            if (reconnectTimerRef.current) {
                console.log("[SocketProvider] reconnect timer clear");
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
        };
    }, [accessToken, isLoggedIn]);

    return (
        <SocketContext.Provider value={presence}>
            {children}
        </SocketContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSocketContext() {
    const context = useContext(SocketContext);

    if (!context) {
        throw new Error("useSocketContext는 SocketProvider 내부에서 사용해야 합니다.");
    }

    return context;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDashboardSocketContext() {
    const socket = useSocketContext();

    return {
        ...socket,
        actions: {
            connect: socket.actions.connect,
            disconnect: socket.actions.disconnect,
            ping: socket.actions.ping,
            close: socket.actions.close,
            joinWorkspace: socket.actions.joinWorkspace,
            leaveWorkspace: socket.actions.leaveWorkspace,
            getMeetings: socket.actions.getMeetings,
            getMeeting: socket.actions.getMeeting,
            createMeeting: socket.actions.createMeeting,
            deleteMeeting: socket.actions.deleteMeeting,
        },
    };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMeetingLiveSocketContext() {
    const socket = useSocketContext();

    return {
        status: socket.status,
        currentUser: socket.currentUser,
        lastServerTime: socket.lastServerTime,
        error: socket.error,
        isSocketConnected: socket.isSocketConnected,
        isUserRegistered: socket.isUserRegistered,
        workspace: socket.workspace,
        meeting: socket.meeting,
        meetingRoom: socket.meetingRoom,
        issues: socket.issues,
        allIssues: socket.allIssues,
        sttResult: socket.sttResult,
        alerts: socket.alerts,
        actions: {
            joinMeetingRoom: socket.actions.joinMeetingRoom,
            leaveMeetingRoom: socket.actions.leaveMeetingRoom,
            sendTranscriptChunk: socket.actions.sendTranscriptChunk,
            startMeeting: socket.actions.startMeeting,
            endMeeting: socket.actions.endMeeting,
            createIssue: socket.actions.createIssue,
            closeRediscussPopup: socket.actions.closeRediscussPopup,
            getIssues: socket.actions.getIssues,
            getDocuments: socket.actions.getDocuments,
            getSttResults: socket.actions.getSttResults,
            getSttResult: socket.actions.getSttResult,
            deleteSttResult: socket.actions.deleteSttResult,
            deleteDocument: socket.actions.deleteDocument,
            getAllIssues: socket.actions.getAllIssues,
            updateIssue: socket.actions.updateIssue,
            deleteIssue: socket.actions.deleteIssue,
        },
    };
}
