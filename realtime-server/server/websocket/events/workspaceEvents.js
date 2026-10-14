// Workspace 계층: 클라이언트가 서버로 보내는 이벤트
const WORKSPACE_CLIENT_EVENTS = {
  JOIN_WORKSPACE: "JOIN_WORKSPACE",           //사용자가 워크스페이스에 참여
  LEAVE_WORKSPACE: "LEAVE_WORKSPACE"          //사용자가 워크스페이스에서 퇴장
};

// Workspace 계층: 서버가 클라이언트로 보내는 이벤트
const WORKSPACE_SERVER_EVENTS = {
  JOIN_WORKSPACE_ACK: "JOIN_WORKSPACE_ACK",     //워크스페이스 참여 성공 응답
  LEAVE_WORKSPACE_ACK: "LEAVE_WORKSPACE_ACK",   //워크스페이스 퇴장 성공 응답
  WORKSPACE_USERS_UPDATED: "WORKSPACE_USERS_UPDATED" //워크스페이스 참여자 목록 업데이트 알림
};

module.exports = {
  WORKSPACE_CLIENT_EVENTS,
  WORKSPACE_SERVER_EVENTS
};
