// 초기 WebSocket 연결 및 채팅 테스트용 이벤트이며,
// 실제 회의록 서비스 이벤트 구조가 안정화되면 제거 가능하다.
const LEGACY_EVENTS = {
  CONNECTED: "CONNECTED",
  CHAT_MESSAGE: "CHAT_MESSAGE",
  CHAT_MESSAGE_ACK: "CHAT_MESSAGE_ACK",
  CHAT_MESSAGE_BROADCAST: "CHAT_MESSAGE_BROADCAST"
};

module.exports = {
  LEGACY_EVENTS
};
