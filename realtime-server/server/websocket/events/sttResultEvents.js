// ============================================================
// server/websocket/events/sttResultEvents.js
// ============================================================
// 역할:
//   STT Result 계층에서 사용하는 이벤트 타입을 정의한다.
//   클라이언트 요청 이벤트, 서버 응답 이벤트, Redis Pub/Sub 채널명을 분리해 관리한다.
//
// 원칙:
//   STT Result 생성/수정은 FastAPI 또는 STT 처리 흐름에서 발생한다.
//   WebSocket JSON 이벤트로 직접 생성/수정하지 않는다.
//
//   클라이언트에서 발생하는 STT Result 요청은
//   목록 조회, 단건 조회, 삭제만 우선 정의한다.
//
//   STT Result 생성/수정 이벤트는 Redis Pub/Sub stt.created/stt.updated를 통해
//   수신하고, WebSocket STT_RESULT_* 이벤트로 클라이언트에게 전달한다.
// ============================================================

// STT Result 계층: 클라이언트가 서버로 보내는 이벤트
const STT_RESULT_CLIENT_EVENTS = {
  GET_STT_RESULTS: 'GET_STT_RESULTS',             // STT 결과 목록 조회 요청
  GET_STT_RESULT: 'GET_STT_RESULT',               // 단일 STT 결과 조회 요청
  DELETE_STT_RESULT: 'DELETE_STT_RESULT'          // STT 결과 삭제 요청
};

// STT Result 계층: 서버가 클라이언트로 보내는 이벤트
const STT_RESULT_SERVER_EVENTS = {
  GET_STT_RESULTS_ACK: 'GET_STT_RESULTS_ACK',     // STT 결과 목록 조회 결과 응답
  GET_STT_RESULT_ACK: 'GET_STT_RESULT_ACK',       // 단일 STT 결과 조회 결과 응답
  DELETE_STT_RESULT_ACK: 'DELETE_STT_RESULT_ACK', // STT 결과 삭제 결과 응답

  // Redis Pub/Sub 기반 서버 발생 이벤트
  STT_RESULT_CREATED: 'STT_RESULT_CREATED',
  STT_RESULT_UPDATED: 'STT_RESULT_UPDATED',
  STT_RESULT_DELETED: 'STT_RESULT_DELETED'
};

// STT Result 계층: Redis Pub/Sub 채널명
const STT_RESULT_PUBSUB_CHANNELS = {
  STT_RESULT_CREATED: 'stt.created',
  STT_RESULT_UPDATED: 'stt.updated',
  STT_RESULT_DELETED: 'stt.deleted'
};

module.exports = {
  STT_RESULT_CLIENT_EVENTS,
  STT_RESULT_SERVER_EVENTS,
  STT_RESULT_PUBSUB_CHANNELS
};
