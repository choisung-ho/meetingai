// MeetingSession 계층: 클라이언트가 서버로 보내는 이벤트
const MEETING_SESSION_CLIENT_EVENTS = {
  START_MEETING: "START_MEETING",   //사용자가 회의 시작 요청
  END_MEETING: "END_MEETING"        //사용자가 회의 종료 요청
};

// MeetingSession 계층: 서버가 클라이언트로 보내는 이벤트
const MEETING_SESSION_SERVER_EVENTS = {
  START_MEETING_ACK: "START_MEETING_ACK",       //회의 시작 성공 응답
  END_MEETING_ACK: "END_MEETING_ACK",           //회의 종료 성공 응답
  MEETING_STATUS_CHANGED: "MEETING_STATUS_CHANGED" //회의 상태 변경 알림
};

module.exports = {
  MEETING_SESSION_CLIENT_EVENTS,
  MEETING_SESSION_SERVER_EVENTS
};
