// ============================================================
// server/websocket/events/alertEvents.js
// ============================================================
// 역할:
//   Alert 계층에서 사용하는 이벤트 타입을 정의한다.
//   클라이언트 요청 이벤트, 서버 응답 이벤트, Redis Pub/Sub 채널명을 분리해 관리한다.
//
// 원칙:
//   Alert 생성은 클라이언트 직접 요청이 아니라 FastAPI 내부 생성 흐름으로 본다.
//   따라서 CREATE_ALERT 계열 클라이언트 이벤트는 정의하지 않는다.
//   서버에서 생성된 Alert는 Redis Pub/Sub alert.created를 통해 수신하고,
//   WebSocket ALERT_CREATED 이벤트로 클라이언트에게 전달한다.
// ============================================================

// Alert 계층: 클라이언트가 서버로 보내는 이벤트
const ALERT_CLIENT_EVENTS = {
  GET_ALERTS: 'GET_ALERTS',                         // Alert 목록 조회 요청
  GET_ALERT: 'GET_ALERT',                           // 단일 Alert 조회 요청
  ACKNOWLEDGE_ALERT: 'ACKNOWLEDGE_ALERT',           // Alert 확인/읽음 처리 요청
  DISMISS_ALERT: 'DISMISS_ALERT',                   // Alert 숨김/무시 처리 요청
  RESOLVE_ALERT: 'RESOLVE_ALERT',                   // Alert 해결 처리 요청
  UPDATE_ALERT: 'UPDATE_ALERT',                     // Alert 일반 필드 수정 요청
  DELETE_ALERT: 'DELETE_ALERT'                      // Alert 삭제 요청
};

// Alert 계층: 서버가 클라이언트로 보내는 이벤트
const ALERT_SERVER_EVENTS = {
  GET_ALERTS_ACK: 'GET_ALERTS_ACK',                         // Alert 목록 조회 결과 응답
  GET_ALERT_ACK: 'GET_ALERT_ACK',                           // 단일 Alert 조회 결과 응답
  ACKNOWLEDGE_ALERT_ACK: 'ACKNOWLEDGE_ALERT_ACK',           // Alert 확인/읽음 처리 결과 응답
  DISMISS_ALERT_ACK: 'DISMISS_ALERT_ACK',                   // Alert 숨김/무시 처리 결과 응답
  RESOLVE_ALERT_ACK: 'RESOLVE_ALERT_ACK',                   // Alert 해결 처리 결과 응답
  UPDATE_ALERT_ACK: 'UPDATE_ALERT_ACK',                     // Alert 일반 필드 수정 결과 응답
  DELETE_ALERT_ACK: 'DELETE_ALERT_ACK',                     // Alert 삭제 결과 응답

  // Redis Pub/Sub 기반 서버 발생 이벤트
  ALERT_CREATED: 'ALERT_CREATED'
};

// Alert 계층: Redis Pub/Sub 채널명
const ALERT_PUBSUB_CHANNELS = {
  ALERT_CREATED: 'alert.created'
};

module.exports = {
  ALERT_CLIENT_EVENTS,
  ALERT_SERVER_EVENTS,
  ALERT_PUBSUB_CHANNELS
};