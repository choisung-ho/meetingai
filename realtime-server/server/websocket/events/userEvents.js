// User 계층: 클라이언트가 서버로 보내는 이벤트
const USER_CLIENT_EVENTS = {
  CONNECT_USER: "CONNECT_USER",                 //사용자가 WebSocket 서버에 최초 연결될 때 사용자 정보를 등록 
  DISCONNECT_USER: "DISCONNECT_USER",           //사용자가 명시적으로 연결 종료를 요청할 때
  PING: "PING"                                  //사용자가 서버에 핑 요청
};

// User 계층: 서버가 클라이언트로 보내는 이벤트
const USER_SERVER_EVENTS = {
  CONNECT_USER_ACK: "CONNECT_USER_ACK",         //사용자 연결 등록 성공 응답
  DISCONNECT_USER_ACK: "DISCONNECT_USER_ACK",   //사용자 연결 종료 처리 성공 응답
  PONG: "PONG"                                  //사용자 핑 요청 응답
};

module.exports = {
  USER_CLIENT_EVENTS,
  USER_SERVER_EVENTS
};
