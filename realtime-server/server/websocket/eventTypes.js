// WebSocket 이벤트 타입 통합 진입점
// 계층별 이벤트 정의는 ./events 폴더에서 관리하고, 이 파일에서 합쳐서 내보낸다.

//다른 파일에서 만든 이벤트 객체들을 import
const {
  USER_CLIENT_EVENTS,//1. User 계층
  USER_SERVER_EVENTS
} = require("./events/userEvents");

const {
  WORKSPACE_CLIENT_EVENTS,//2. Workspace 계층
  WORKSPACE_SERVER_EVENTS
} = require("./events/workspaceEvents");

const {
  MEETING_CLIENT_EVENTS, //3. Meeting 클라이언트 요청
  MEETING_SERVER_EVENTS
} = require("./events/meetingEvents");

const {
  MEETING_ROOM_CLIENT_EVENTS,//4. MeetingRoom 계층
  MEETING_ROOM_SERVER_EVENTS
} = require("./events/meetingRoomEvents");

const {
  MEETING_SESSION_CLIENT_EVENTS,//5. MeetingSession 계층
  MEETING_SESSION_SERVER_EVENTS
} = require("./events/meetingSessionEvents");

const {
  ISSUE_CLIENT_EVENTS, //6. Issue 클라이언트 요청
  ISSUE_SERVER_EVENTS
} = require("./events/issueEvents");

const {
  ALERT_CLIENT_EVENTS, 
  ALERT_SERVER_EVENTS 
} = require("./events/alertEvents");

const {
  DOCUMENT_CLIENT_EVENTS,
  DOCUMENT_SERVER_EVENTS
} = require("./events/documentEvents");

const {
  STT_RESULT_CLIENT_EVENTS,
  STT_RESULT_SERVER_EVENTS
} = require("./events/sttResultEvents");

const {
  TRANSCRIPT_CLIENT_EVENTS,//10. 실시간 발화/AI 분석 계층
  TRANSCRIPT_SERVER_EVENTS
} = require("./events/transcriptEvents");



//통신 방향별 분리
const CLIENT_EVENTS = {
  ...USER_CLIENT_EVENTS,
  ...WORKSPACE_CLIENT_EVENTS,
  ...MEETING_ROOM_CLIENT_EVENTS,
  ...MEETING_SESSION_CLIENT_EVENTS,
  ...ISSUE_CLIENT_EVENTS,
  ...MEETING_CLIENT_EVENTS,
  ...ALERT_CLIENT_EVENTS,
  ...DOCUMENT_CLIENT_EVENTS,
  ...STT_RESULT_CLIENT_EVENTS,
  ...TRANSCRIPT_CLIENT_EVENTS
};

const SERVER_EVENTS = {
  ...USER_SERVER_EVENTS,
  ...WORKSPACE_SERVER_EVENTS,
  ...MEETING_ROOM_SERVER_EVENTS,
  ...MEETING_SESSION_SERVER_EVENTS,
  ...ISSUE_SERVER_EVENTS,
  ...MEETING_SERVER_EVENTS,
  ...ALERT_SERVER_EVENTS,
  ...DOCUMENT_SERVER_EVENTS,
  ...STT_RESULT_SERVER_EVENTS,
  ...TRANSCRIPT_SERVER_EVENTS,
  ERROR: "ERROR", //공통 에러 이벤트
  CONNECTED: "CONNECTED"
};

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS
};
