// ============================================================
// server/handlers/HandlerRegistry.js
// ============================================================
// 역할:
//   WebSocket 이벤트 type 문자열과 handler 함수를 매핑하는 레지스트리 클래스.
//   MessageRouter가 이 클래스를 통해 type에 맞는 handler를 조회한다.
//
// SRP: 이벤트 → 핸들러 매핑 관리와 미구현 핸들러 응답만 담당.
//
// Input/Output 흐름:
//   getHandler(type) → handler 함수 또는 null
//   resolve(type)    → handler 함수 (없으면 notImplementedHandler)
// ============================================================

const { CLIENT_EVENTS } = require('../websocket/eventTypes');
const MessageSender = require('../utils/MessageSender');
const { handleConnectUser, handleDisconnectUser, handlePingUser } = require('./userHandler');
const { handleJoinWorkspace, handleLeaveWorkspace } = require('./workspaceHandler');
const { handleCreateMeeting, handleGetMeetings, handleGetMeeting, handleDeleteMeeting } = require('./meetingHandler');
const { handleJoinMeetingRoom, handleLeaveMeetingRoom } = require('./meetingRoomHandler');
const { handleStartMeeting, handleEndMeeting } = require('./meetingSessionHandler');
const { handleCreateIssue, handleGetIssues, handleUpdateIssue, handleDeleteIssue, handleChangeIssueState, handleGetIssue, handleGetAllIssues, handleGetIssueEvents } = require('./issueHandler');
const { handleGetAlerts, handleGetAlert, handleAcknowledgeAlert, handleDismissAlert, handleResolveAlert, handleUpdateAlert, handleDeleteAlert } = require('./alertHandler');
const { handleGetDocuments, handleGetWorkspaceDocuments, handleGetDocument, handleDeleteDocument } = require('./documentHandler');
const { handleGetSttResults, handleGetSttResult, handleDeleteSttResult } = require('./sttResultHandler');
const { handleTranscriptChunk } = require('./transcriptHandler');

// ----------------------------------------------------------
// notImplementedHandler
// Input  : wss, ws, message — 표준 핸들러 시그니처
// Output : void — NOT_IMPLEMENTED 에러 응답 전송
// ----------------------------------------------------------
function notImplementedHandler(wss, ws, message) {
  MessageSender.sendError(
    ws,
    message.requestId,
    'NOT_IMPLEMENTED',
    `아직 처리되지 않은 메시지 type입니다: ${message.type}`
  );
}

class HandlerRegistry {
  constructor() {
    /**
     * @private
     * @type {Map<string, Function>}
     */
    this._map = new Map([
      // User 계층
      [CLIENT_EVENTS.CONNECT_USER, handleConnectUser],
      [CLIENT_EVENTS.DISCONNECT_USER, handleDisconnectUser],
      [CLIENT_EVENTS.PING, handlePingUser],

      // Workspace 계층
      [CLIENT_EVENTS.JOIN_WORKSPACE, handleJoinWorkspace],
      [CLIENT_EVENTS.LEAVE_WORKSPACE, handleLeaveWorkspace],

      // Meeting 계층
      [CLIENT_EVENTS.CREATE_MEETING, handleCreateMeeting],
      [CLIENT_EVENTS.GET_MEETINGS, handleGetMeetings],
      [CLIENT_EVENTS.GET_MEETING, handleGetMeeting],
      [CLIENT_EVENTS.DELETE_MEETING, handleDeleteMeeting],

      // Issue 계층
      [CLIENT_EVENTS.CREATE_ISSUE, handleCreateIssue],
      [CLIENT_EVENTS.GET_ISSUES, handleGetIssues],
      [CLIENT_EVENTS.GET_ISSUE, handleGetIssue],
      [CLIENT_EVENTS.GET_ISSUE_EVENTS, handleGetIssueEvents],
      [CLIENT_EVENTS.UPDATE_ISSUE, handleUpdateIssue],
      [CLIENT_EVENTS.CHANGE_ISSUE_STATE, handleChangeIssueState],
      [CLIENT_EVENTS.DELETE_ISSUE, handleDeleteIssue],
      [CLIENT_EVENTS.GET_ALL_ISSUES, handleGetAllIssues],

      // Alert 계층
      [CLIENT_EVENTS.GET_ALERTS, handleGetAlerts],
      [CLIENT_EVENTS.GET_ALERT, handleGetAlert],
      [CLIENT_EVENTS.ACKNOWLEDGE_ALERT, handleAcknowledgeAlert],
      [CLIENT_EVENTS.DISMISS_ALERT, handleDismissAlert],
      [CLIENT_EVENTS.RESOLVE_ALERT, handleResolveAlert],
      [CLIENT_EVENTS.UPDATE_ALERT, handleUpdateAlert],
      [CLIENT_EVENTS.DELETE_ALERT, handleDeleteAlert],

      // Document 계층
      [CLIENT_EVENTS.GET_DOCUMENTS, handleGetDocuments],
      [CLIENT_EVENTS.GET_WORKSPACE_DOCUMENTS, handleGetWorkspaceDocuments],
      [CLIENT_EVENTS.GET_DOCUMENT, handleGetDocument],
      [CLIENT_EVENTS.DELETE_DOCUMENT, handleDeleteDocument],

      // MeetingRoom 계층
      [CLIENT_EVENTS.JOIN_MEETING_ROOM, handleJoinMeetingRoom],
      [CLIENT_EVENTS.LEAVE_MEETING_ROOM, handleLeaveMeetingRoom],

      // MeetingSession 계층
      [CLIENT_EVENTS.START_MEETING, handleStartMeeting],
      [CLIENT_EVENTS.END_MEETING, handleEndMeeting],

      // STT Result 계층
      [CLIENT_EVENTS.GET_STT_RESULTS, handleGetSttResults],
      [CLIENT_EVENTS.GET_STT_RESULT, handleGetSttResult],
      [CLIENT_EVENTS.DELETE_STT_RESULT, handleDeleteSttResult],

      // 실시간 발화(Transcript) 계층
      [CLIENT_EVENTS.TRANSCRIPT_CHUNK, handleTranscriptChunk]
    ]);
  }

  // ----------------------------------------------------------
  // getHandler
  // Input  : type — 이벤트 type 문자열
  // Output : Function | null
  // ----------------------------------------------------------
  getHandler(type) {
    return this._map.get(type) ?? null;
  }

  // ----------------------------------------------------------
  // resolve
  // Input  : type — 이벤트 type 문자열
  // Output : Function — 등록된 핸들러 또는 null (미등록 type)
  // ----------------------------------------------------------
  resolve(type) {
    return this._map.get(type) ?? null;
  }

  // ----------------------------------------------------------
  // register  (확장용)
  // Input  : type    — 이벤트 type 문자열
  //          handler — (wss, ws, message) => Promise<void>
  // Output : void
  // ----------------------------------------------------------
  register(type, handler) {
    this._map.set(type, handler);
  }
}

const registry = new HandlerRegistry();

// 하위 호환: handlerMap 객체 형태로도 노출
const handlerMap = new Proxy({}, {
  get(_t, prop) { return registry.getHandler(prop); },
  has(_t, prop) { return registry.getHandler(prop) !== null; }
});

module.exports = { HandlerRegistry, handlerMap, registry };