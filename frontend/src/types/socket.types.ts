// socket.types.ts

import {
    CLIENT_SOCKET_EVENTS,
    SERVER_SOCKET_EVENTS,
} from "../constants/socketEvents";

import type { CollaborationUserStatus } from "./collaborationUser.types";

import type {
    JoinWorkspaceAckPayload,
    JoinWorkspacePayload,
    LeaveWorkspaceAckPayload,
    LeaveWorkspacePayload,
    WorkspaceUsersUpdatedPayload,
} from "./workspace.types";

import type {
    TopicEventPayload,
    TranscriptChunkPayload,
    TranscriptPayload,
    UtteranceAnalysis,
} from "./transcript.types";

import type {
    JoinMeetingRoomAckPayload,
    JoinMeetingRoomPayload,
    LeaveMeetingRoomAckPayload,
    LeaveMeetingRoomPayload,
    MeetingRoomUsersUpdatedPayload,
    
} from "./meetingRoom.types";

// Meeting 계층 WebSocket payload 타입
// CREATE_MEETING / GET_MEETINGS / MEETING_CREATED에서 사용
import type {
  CreateMeetingAckPayload,
  CreateMeetingPayload,
  GetMeetingsAckPayload,
  GetMeetingsPayload,
  MeetingCreatedPayload,

    // 추가
    DeleteMeetingPayload,
    DeleteMeetingAckPayload,
    MeetingDeletedPayload,
    GetMeetingPayload,
    GetMeetingAckPayload,
    StartMeetingPayload,
    EndMeetingPayload,
    StartMeetingAckPayload,
    EndMeetingAckPayload,
    MeetingStatusChangedPayload,
    Issue,
    CreateIssuePayload,
    GetAllIssuesPayload,
    GetIssuesPayload,
    GetIssuePayload,
    GetIssueAckPayload,
    GetIssueEventsPayload,
    IssueEvent,
    UpdateIssuePayload,
    ChangeIssueStatePayload,
    ChangeIssueStateAckPayload,
    IssueStateChangedPayload,
    DeleteIssuePayload,
} from "./meeting.types";

import type {
    GetAlertAckPayload,
    GetAlertPayload,
    GetAlertsAckPayload,
    GetAlertsPayload,
    AcknowledgeAlertAckPayload,
    AcknowledgeAlertPayload,
    DismissAlertAckPayload,
    DismissAlertPayload,
    ResolveAlertAckPayload,
    ResolveAlertPayload,
    UpdateAlertAckPayload,
    UpdateAlertPayload,
    DeleteAlertAckPayload,
    DeleteAlertPayload,
    AlertItem,
} from "./alert.types";

import type {
    DeleteDocumentAckPayload,
    DeleteDocumentPayload,
    DocumentDeletedPayload,
    DocumentMeta,
    GetDocumentPayload,
    GetDocumentsAckPayload,
    GetDocumentsPayload,
    GetWorkspaceDocumentsAckPayload,
    GetWorkspaceDocumentsPayload,
    DocumentProcessedPayload,
} from "./document.types";

import type {
    DeleteSttResultAckPayload,
    DeleteSttResultPayload,
    GetSttResultsAckPayload,
    GetSttResultsPayload,
    GetSttResultAckPayload,
    GetSttResultPayload,
    SttResultCreatedPayload,
    SttResultDeletedPayload,
    SttResultUpdatedPayload,
} from "./sttResult.types";




/**
 * 클라이언트 → 서버 소켓 이벤트 이름 타입
 * ex) CONNECT_USER, PING, JOIN_WORKSPACE, JOIN_MEETING_ROOM
 */
export type ClientSocketEvent =
    (typeof CLIENT_SOCKET_EVENTS)[keyof typeof CLIENT_SOCKET_EVENTS];

/**
 * 서버 → 클라이언트 소켓 이벤트 이름 타입
 * ex) CONNECTED, PONG, WORKSPACE_USERS_UPDATED, MEETING_ROOM_USERS_UPDATED
 */
export type ServerSocketEvent =
    (typeof SERVER_SOCKET_EVENTS)[keyof typeof SERVER_SOCKET_EVENTS];

/**
 * 요청 추적용 request ID 타입
 * 요청/응답 매칭용
 */
export type RequestId = string | null;

/**
 * 클라이언트 요청 기본 구조 타입
 * 모든 클라이언트 WebSocket 요청 공통 형태
 */
export type SocketRequest<TType extends ClientSocketEvent, TPayload> = {
    type: TType; // 이벤트 이름
    requestId?: RequestId; // 요청 추적 ID
    payload: TPayload; // 실제 전달 데이터
};

/**
 * 서버 응답 기본 구조 타입
 * 모든 서버 WebSocket 응답 공통 형태
 */
export type SocketResponse<TType extends ServerSocketEvent, TPayload> = {
    type: TType; // 이벤트 이름
    requestId: RequestId; // 요청 추적 ID
    success: boolean; // 요청 성공 여부
    payload: TPayload; // 응답 데이터
};

/**
 * 최초 소켓 연결 완료 payload
 */
export type ConnectedPayload = {
    message: string; // 연결 성공 메시지
    connectedAt: string; // 연결 완료 시간
};

/**
 * 사용자 연결 요청 payload
 * 클라이언트 최초 접속 시 사용
 */
export type ConnectUserPayload = {
    name?: string;
};

/**
 * 사용자 연결 성공 응답 payload
 */
export type ConnectUserAckPayload = {
    userId: string; // 사용자 고유 ID
    name: string | null; // 사용자 이름
    status: CollaborationUserStatus; // 현재 접속 상태
    connectedAt: string; // 연결 완료 시간
};

/**
 * 사용자 연결 종료 요청 payload
 */
export type DisconnectUserPayload = Record<string, never>;
/**
 * 사용자 연결 종료 응답 payload
 */
export type DisconnectUserAckPayload = {
    userId: string; // 연결 종료된 사용자 ID
    disconnectedAt: string; // 연결 종료 시간
};

/**
 * Ping 요청 payload
 * 연결 유지 확인용 heartbeat
 */
export type PingPayload = Record<string, never>;
/**
 * Pong 응답 payload
 * 서버 상태 응답
 */
export type PongPayload = {
    serverTime: string; // 서버 현재 시간
};

/**
 * 소켓 오류 응답 payload
 */
export type SocketErrorPayload = {
    errorCode: string; // 오류 코드
    message: string; // 오류 메시지
};

/**
 * 사용자 연결 요청 메시지 타입
 */
export type ConnectUserRequest = SocketRequest<
    "CONNECT_USER",
    ConnectUserPayload
>;

/**
 * 사용자 연결 종료 요청 메시지 타입
 */
export type DisconnectUserRequest = SocketRequest<
    "DISCONNECT_USER",
    DisconnectUserPayload
>;

/**
 * Ping 요청 메시지 타입
 */
export type PingRequest = SocketRequest<"PING", PingPayload>;

/**
 * 워크스페이스 참가 요청 메시지 타입
 */
export type JoinWorkspaceRequest = SocketRequest<
    "JOIN_WORKSPACE",
    JoinWorkspacePayload
>;

/**
 * 워크스페이스 퇴장 요청 메시지 타입
 */
export type LeaveWorkspaceRequest = SocketRequest<
    "LEAVE_WORKSPACE",
    LeaveWorkspacePayload
>;
// 클라이언트 → 서버
// 새 회의 페이지 생성 요청
export type CreateMeetingRequest = SocketRequest<
  "CREATE_MEETING",
  CreateMeetingPayload
>;

// 클라이언트 → 서버
// 특정 workspace의 회의 목록 조회 요청
export type GetMeetingsRequest = SocketRequest<
  "GET_MEETINGS",
  GetMeetingsPayload
>;
export type GetMeetingRequest = SocketRequest<
    "GET_MEETING",
    GetMeetingPayload
>;

// 클라이언트 → 서버
// 회의 페이지 삭제 요청
export type DeleteMeetingRequest = SocketRequest<
    "DELETE_MEETING",
    DeleteMeetingPayload
>;

//회의 안건
export type CreateIssueRequest = SocketRequest<
    "CREATE_ISSUE",
    CreateIssuePayload
>;

export type GetIssuesRequest = SocketRequest<
    "GET_ISSUES",
    GetIssuesPayload
>;

export type GetAllIssuesRequest = SocketRequest<
    "GET_ALL_ISSUES",
    GetAllIssuesPayload
>;

export type GetIssueRequest = SocketRequest<
    "GET_ISSUE",
    GetIssuePayload
>;

export type GetIssueEventsRequest = SocketRequest<
    "GET_ISSUE_EVENTS",
    GetIssueEventsPayload
>;

export type GetDocumentsRequest = SocketRequest<
    "GET_DOCUMENTS",
    GetDocumentsPayload
>;

export type GetWorkspaceDocumentsRequest = SocketRequest<
    "GET_WORKSPACE_DOCUMENTS",
    GetWorkspaceDocumentsPayload
>;

export type GetDocumentRequest = SocketRequest<
    "GET_DOCUMENT",
    GetDocumentPayload
>;

export type GetSttResultsRequest = SocketRequest<
    "GET_STT_RESULTS",
    GetSttResultsPayload
>;

export type GetSttResultRequest = SocketRequest<
    "GET_STT_RESULT",
    GetSttResultPayload
>;

export type DeleteSttResultRequest = SocketRequest<
    "DELETE_STT_RESULT",
    DeleteSttResultPayload
>;

export type DeleteDocumentRequest = SocketRequest<
    "DELETE_DOCUMENT",
    DeleteDocumentPayload
>;

export type GetAlertsRequest = SocketRequest<
    "GET_ALERTS",
    GetAlertsPayload
>;

export type GetAlertRequest = SocketRequest<
    "GET_ALERT",
    GetAlertPayload
>;

export type AcknowledgeAlertRequest = SocketRequest<
    "ACKNOWLEDGE_ALERT",
    AcknowledgeAlertPayload
>;

export type DismissAlertRequest = SocketRequest<
    "DISMISS_ALERT",
    DismissAlertPayload
>;

export type ResolveAlertRequest = SocketRequest<
    "RESOLVE_ALERT",
    ResolveAlertPayload
>;

export type UpdateAlertRequest = SocketRequest<
    "UPDATE_ALERT",
    UpdateAlertPayload
>;

export type DeleteAlertRequest = SocketRequest<
    "DELETE_ALERT",
    DeleteAlertPayload
>;

export type UpdateIssueRequest = SocketRequest<
    "UPDATE_ISSUE",
    UpdateIssuePayload
>;

export type ChangeIssueStateRequest = SocketRequest<
    "CHANGE_ISSUE_STATE",
    ChangeIssueStatePayload
>;

export type DeleteIssueRequest = SocketRequest<
    "DELETE_ISSUE",
    DeleteIssuePayload
>;

/**
 * 회의실 참가 요청 메시지 타입
 */
export type JoinMeetingRoomRequest = SocketRequest<
    "JOIN_MEETING_ROOM",
    JoinMeetingRoomPayload
>;

/**
 * 회의실 퇴장 요청 메시지 타입
 */
export type LeaveMeetingRoomRequest = SocketRequest<
    "LEAVE_MEETING_ROOM",
    LeaveMeetingRoomPayload
>;
//회의 시작
export type StartMeetingRequest = SocketRequest<
    "START_MEETING",
    StartMeetingPayload
>;
//회의 종료
export type EndMeetingRequest = SocketRequest<
    "END_MEETING",
    EndMeetingPayload
>;

/**
 * 클라이언트에서 서버로 보내는 전체 메시지 타입
 */
export type ClientSocketMessage =
    | ConnectUserRequest
    | DisconnectUserRequest
    | PingRequest
    | JoinWorkspaceRequest
    | LeaveWorkspaceRequest
    | CreateMeetingRequest
    | GetMeetingsRequest
    | GetMeetingRequest
    | DeleteMeetingRequest
    | JoinMeetingRoomRequest
    | LeaveMeetingRoomRequest
    | StartMeetingRequest
    | EndMeetingRequest
    | CreateIssueRequest
    | GetIssuesRequest
    | GetAllIssuesRequest
    | GetIssueRequest
    | GetIssueEventsRequest
    | GetDocumentsRequest
    | GetWorkspaceDocumentsRequest
    | GetDocumentRequest
    | GetSttResultsRequest
    | GetSttResultRequest
    | DeleteSttResultRequest
    | DeleteDocumentRequest
    | GetAlertsRequest
    | GetAlertRequest
    | AcknowledgeAlertRequest
    | DismissAlertRequest
    | ResolveAlertRequest
    | UpdateAlertRequest
    | DeleteAlertRequest
    | UpdateIssueRequest
    | ChangeIssueStateRequest
    | DeleteIssueRequest
    | TranscriptChunkRequest;

/**
 * 최초 연결 성공 응답 타입
 */
export type ConnectedResponse = SocketResponse<
    "CONNECTED",
    ConnectedPayload
>;

/**
 * 사용자 연결 성공 응답 타입
 */
export type ConnectUserAckResponse = SocketResponse<
    "CONNECT_USER_ACK",
    ConnectUserAckPayload
>;

/**
 * 사용자 연결 종료 응답 타입
 */
export type DisconnectUserAckResponse = SocketResponse<
    "DISCONNECT_USER_ACK",
    DisconnectUserAckPayload
>;

/**
 * Pong 응답 타입
 */
export type PongResponse = SocketResponse<"PONG", PongPayload>;

/**
 * 소켓 오류 응답 타입
 */
export type SocketErrorResponse = SocketResponse<
    "ERROR",
    SocketErrorPayload
>;

export type SessionExpiredResponse = SocketResponse<
    "SESSION_EXPIRED",
    SocketErrorPayload
>;

/**
 * 워크스페이스 참가 성공 응답 타입
 */
export type JoinWorkspaceAckResponse = SocketResponse<
    "JOIN_WORKSPACE_ACK",
    JoinWorkspaceAckPayload
>;

/**
 * 워크스페이스 퇴장 성공 응답 타입
 */
export type LeaveWorkspaceAckResponse = SocketResponse<
    "LEAVE_WORKSPACE_ACK",
    LeaveWorkspaceAckPayload
>;

/**
 * 워크스페이스 사용자 목록 갱신 응답 타입
 * Presence 실시간 동기화용
 */
export type WorkspaceUsersUpdatedResponse = SocketResponse<
    "WORKSPACE_USERS_UPDATED",
    WorkspaceUsersUpdatedPayload
>;
// 서버 → 요청한 클라이언트
// CREATE_MEETING 요청 성공/실패 확인용 ACK
// 화면 목록 갱신은 이걸로 하지 말고 MEETING_CREATED 기준으로 하는 게 안전함
export type CreateMeetingAckResponse = SocketResponse<
  "CREATE_MEETING_ACK",
  CreateMeetingAckPayload
>;

// 서버 → 요청한 클라이언트
// GET_MEETINGS 요청 결과
// 이 응답을 받으면 회의 목록을 전체 교체하면 됨
export type GetMeetingsAckResponse = SocketResponse<
  "GET_MEETINGS_ACK",
  GetMeetingsAckPayload
>;
export type GetMeetingAckResponse = SocketResponse<
    "GET_MEETING_ACK",
    GetMeetingAckPayload
>;

// 서버 → 요청한 클라이언트
// DELETE_MEETING 요청 성공/실패 확인용 ACK
export type DeleteMeetingAckResponse = SocketResponse<
    "DELETE_MEETING_ACK",
    DeleteMeetingAckPayload
>;

// 서버 → 같은 workspace 접속자 전체
// 삭제된 회의를 목록에서 제거하기 위한 브로드캐스트
export type MeetingDeletedResponse = SocketResponse<
    "MEETING_DELETED",
    MeetingDeletedPayload
>;

// 서버 → 같은 workspace 접속자 전체
// 새 회의가 생성됐다는 브로드캐스트
// 이걸 받으면 현재 workspace와 같은지 확인 후 목록에 추가
export type MeetingCreatedResponse = SocketResponse<
  "MEETING_CREATED",
  MeetingCreatedPayload
>;


export type CreateIssueAckResponse = SocketResponse<
    "CREATE_ISSUE_ACK",
    Issue
>;

export type GetIssuesAckResponse = SocketResponse<
    "GET_ISSUES_ACK",
    {
        issues: Issue[];
    }
>;

//회의 안건 
export type GetAllIssuesAckResponse = SocketResponse<
    "GET_ALL_ISSUES_ACK",
    {
        issues: Issue[];
    }
>;

export type GetIssueAckResponse = SocketResponse<
    "GET_ISSUE_ACK",
    GetIssueAckPayload
>;

export type GetIssueEventsAckResponse = SocketResponse<
    "GET_ISSUE_EVENTS_ACK",
    {
        events: IssueEvent[];
    }
>;

export type GetDocumentsAckResponse = SocketResponse<
    "GET_DOCUMENTS_ACK",
    GetDocumentsAckPayload
>;

export type GetWorkspaceDocumentsAckResponse = SocketResponse<
    "GET_WORKSPACE_DOCUMENTS_ACK",
    GetWorkspaceDocumentsAckPayload
>;

export type GetDocumentAckResponse = SocketResponse<
    "GET_DOCUMENT_ACK",
    DocumentMeta
>;

export type GetSttResultsAckResponse = SocketResponse<
    "GET_STT_RESULTS_ACK",
    GetSttResultsAckPayload
>;

export type GetSttResultAckResponse = SocketResponse<
    "GET_STT_RESULT_ACK",
    GetSttResultAckPayload
>;

export type DeleteSttResultAckResponse = SocketResponse<
    "DELETE_STT_RESULT_ACK",
    DeleteSttResultAckPayload
>;

export type DeleteDocumentAckResponse = SocketResponse<
    "DELETE_DOCUMENT_ACK",
    DeleteDocumentAckPayload
>;

export type GetAlertsAckResponse = SocketResponse<
    "GET_ALERTS_ACK",
    GetAlertsAckPayload
>;

export type GetAlertAckResponse = SocketResponse<
    "GET_ALERT_ACK",
    GetAlertAckPayload
>;

export type AcknowledgeAlertAckResponse = SocketResponse<
    "ACKNOWLEDGE_ALERT_ACK",
    AcknowledgeAlertAckPayload
>;

export type DismissAlertAckResponse = SocketResponse<
    "DISMISS_ALERT_ACK",
    DismissAlertAckPayload
>;

export type ResolveAlertAckResponse = SocketResponse<
    "RESOLVE_ALERT_ACK",
    ResolveAlertAckPayload
>;

export type UpdateAlertAckResponse = SocketResponse<
    "UPDATE_ALERT_ACK",
    UpdateAlertAckPayload
>;

export type DeleteAlertAckResponse = SocketResponse<
    "DELETE_ALERT_ACK",
    DeleteAlertAckPayload
>;

export type AlertCreatedResponse = {
    type: "ALERT_CREATED";
    payload: AlertItem;
};

export type UpdateIssueAckResponse = SocketResponse<
    "UPDATE_ISSUE_ACK",
    Issue
>;

export type ChangeIssueStateAckResponse = SocketResponse<
    "CHANGE_ISSUE_STATE_ACK",
    ChangeIssueStateAckPayload
>;

export type DeleteIssueAckResponse = SocketResponse<
    "DELETE_ISSUE_ACK",
    Issue
>;

export type IssueCreatedResponse = SocketResponse<
    "ISSUE_CREATED",
    Issue
>;

export type IssueUpdatedResponse = SocketResponse<
    "ISSUE_UPDATED",
    Issue
>;

export type IssueStateChangedResponse = SocketResponse<
    "ISSUE_STATE_CHANGED",
    IssueStateChangedPayload
>;

export type IssueDeletedResponse = SocketResponse<
    "ISSUE_DELETED",
    Issue
>;

export type SttResultCreatedResponse = {
    type: "STT_RESULT_CREATED";
    payload: SttResultCreatedPayload;
};

export type SttResultUpdatedResponse = {
    type: "STT_RESULT_UPDATED";
    payload: SttResultUpdatedPayload;
};

export type SttResultDeletedResponse = {
    type: "STT_RESULT_DELETED";
    payload: SttResultDeletedPayload;
};

/**
 * DOCUMENT_UPLOADED
 *
 * Trigger:
 * FastAPI document upload completes, publishes Redis Pub/Sub `document.created`,
 * and the Node WebSocket server broadcasts this event.
 *
 * Client -> Server:
 * None. Clients never send DOCUMENT_UPLOADED directly.
 *
 * Broadcast target:
 * All clients connected to the same workspaceId.
 * The server does not split dashboard/document-tab clients from meeting-live clients.
 *
 * Payload:
 * - workspaceId is the document workspace id.
 * - meetingId is a number for meeting documents.
 * - meetingId is null for workspace documents and must not be converted to 0.
 *
 * Client display rules:
 * - Dashboard / Document tab handles documents where payload.workspaceId matches
 *   currentWorkspaceId. Both workspace documents and meeting documents may be shown.
 * - MeetingLive shows only documents where payload.meetingId matches currentMeetingId.
 *   Workspace documents with meetingId null and documents for other meetings are hidden.
 */
export type DocumentUploadedResponse = {
    type: "DOCUMENT_UPLOADED";
    payload: DocumentMeta;
};

export type DocumentDeletedResponse = {
    type: "DOCUMENT_DELETED";
    payload: DocumentDeletedPayload;
};

export type DocumentProcessedResponse = SocketResponse<
    "DOCUMENT_PROCESSED",
    DocumentProcessedPayload
>;
/**
 * 회의실 참가 성공 ACK 응답 타입
 */
export type JoinMeetingRoomAckResponse = SocketResponse<
    "JOIN_MEETING_ROOM_ACK",
    JoinMeetingRoomAckPayload
>;

/**
 * 회의실 퇴장 성공 ACK 응답 타입
 */
export type LeaveMeetingRoomAckResponse = SocketResponse<
    "LEAVE_MEETING_ROOM_ACK",
    LeaveMeetingRoomAckPayload
>;

/**
 * 회의실 참가자 목록 갱신 브로드캐스트 응답 타입
 */
export type MeetingRoomUsersUpdatedResponse = SocketResponse<
    "MEETING_ROOM_USERS_UPDATED",
    MeetingRoomUsersUpdatedPayload
>;

//회의 시작 종료
export type StartMeetingAckResponse = SocketResponse<
    "START_MEETING_ACK",
    StartMeetingAckPayload
>;

export type EndMeetingAckResponse = SocketResponse<
    "END_MEETING_ACK",
    EndMeetingAckPayload
>;

export type MeetingStatusChangedResponse = SocketResponse<
    "MEETING_STATUS_CHANGED",
    MeetingStatusChangedPayload
>;

/**
 * 서버에서 내려오는 전체 소켓 메시지 타입
 */
export type ServerSocketMessage =
    | ConnectedResponse
    | ConnectUserAckResponse
    | DisconnectUserAckResponse
    | PongResponse
    | SocketErrorResponse
    | SessionExpiredResponse
    | JoinWorkspaceAckResponse
    | LeaveWorkspaceAckResponse
    | WorkspaceUsersUpdatedResponse
    | CreateMeetingAckResponse
    | GetMeetingsAckResponse
    | GetMeetingAckResponse
    | MeetingCreatedResponse
    | DeleteMeetingAckResponse
    | MeetingDeletedResponse
    | JoinMeetingRoomAckResponse
    | LeaveMeetingRoomAckResponse
    | MeetingRoomUsersUpdatedResponse
    | StartMeetingAckResponse
    | EndMeetingAckResponse
    | MeetingStatusChangedResponse
    | CreateIssueAckResponse
    | GetIssuesAckResponse
    | GetAllIssuesAckResponse
    | GetIssueAckResponse
    | GetIssueEventsAckResponse
    | GetDocumentsAckResponse
    | GetWorkspaceDocumentsAckResponse
    | GetDocumentAckResponse
    | GetSttResultsAckResponse
    | GetSttResultAckResponse
    | DeleteSttResultAckResponse
    | DeleteDocumentAckResponse
    | GetAlertsAckResponse
    | GetAlertAckResponse
    | AcknowledgeAlertAckResponse
    | DismissAlertAckResponse
    | ResolveAlertAckResponse
    | UpdateAlertAckResponse
    | DeleteAlertAckResponse
    | AlertCreatedResponse
    | UpdateIssueAckResponse
    | ChangeIssueStateAckResponse
    | DeleteIssueAckResponse
    | IssueCreatedResponse
    | IssueUpdatedResponse
    | IssueStateChangedResponse
    | IssueDeletedResponse
    | SttResultCreatedResponse
    | SttResultUpdatedResponse
    | SttResultDeletedResponse
    | DocumentUploadedResponse
    | DocumentProcessedResponse
    | DocumentDeletedResponse
    | TranscriptChunkAckResponse
    | TranscriptResponse
    | TranscriptPartialResponse
    | AnalysisCompletedResponse
    | TopicEventResponse
    | AiAnalysisUpdatedResponse;

// ============================================================
// 실시간 발화(Transcript) 및 Phase 4 AI 분석 메시지 타입
// ============================================================

/**
 * STT text chunk 전송 요청
 */
export type TranscriptChunkRequest = SocketRequest<
    "TRANSCRIPT_CHUNK",
    TranscriptChunkPayload
>;

export type TranscriptChunkAckPayload = {
    chunkId: string | null;
    sttResultId: number | null;
    utteranceId: number | null;
    sequence: number | null;
    bufferedCount: number;
    analysisStatus: string;
};

export type TranscriptChunkAckResponse = SocketResponse<
    "TRANSCRIPT_CHUNK_ACK",
    TranscriptChunkAckPayload
>;

/**
 * 확정 발화 브로드캐스트 (화자 포함)
 */
export type TranscriptResponse = SocketResponse<"TRANSCRIPT", TranscriptPayload>;

/**
 * 중간 인식 결과 브로드캐스트 (저장되지 않음)
 */
export type TranscriptPartialResponse = SocketResponse<
    "TRANSCRIPT_PARTIAL",
    TranscriptPayload
>;

/**
 * 발화 단위 분석 결과
 */
export type AnalysisCompletedResponse = SocketResponse<
    "ANALYSIS_COMPLETED",
    UtteranceAnalysis
>;

/**
 * 안건 생성/확정/재논의/재확정/수동변경 브로드캐스트
 */
export type TopicEventResponse = SocketResponse<
    | "TOPIC_CREATED"
    | "TOPIC_DECIDED"
    | "TOPIC_REVISITED"
    | "TOPIC_REDECIDED"
    | "TOPIC_UPDATED",
    TopicEventPayload
>;

export type AiAnalysisUpdatedPayload = {
    workspaceId: number | null;
    meetingId: number | null;
    analysisId: number | null;
    shouldRefetch: boolean;
};

/**
 * 회의 단위 AI 분석 갱신 알림 (본문 없음 — 클라이언트가 권한으로 직접 조회)
 */
export type AiAnalysisUpdatedResponse = SocketResponse<
    "AI_ANALYSIS_UPDATED",
    AiAnalysisUpdatedPayload
>;
