// ============================================================
// server/websocket/events/documentEvents.js
// ============================================================
// 역할:
//   Document 계층에서 사용하는 이벤트 타입을 정의한다.
//   클라이언트 요청 이벤트, 서버 응답 이벤트, Redis Pub/Sub 채널명을 분리해 관리한다.
//
// 원칙:
//   Document 업로드는 multipart/form-data 흐름이므로
//   WebSocket JSON 이벤트로 직접 처리하지 않는다.
//   따라서 UPLOAD_DOCUMENT 계열 클라이언트 이벤트는 정의하지 않는다.
//
//   클라이언트에서 발생하는 Document 요청은
//   목록 조회, 단건 조회, 삭제만 우선 정의한다.
//
//   문서 업로드 완료 같은 서버 발생 이벤트는
//   Redis Pub/Sub document.created/document.processed를 통해 수신하고,
//   WebSocket DOCUMENT_UPLOADED/DOCUMENT_PROCESSED 이벤트로 클라이언트에게 전달한다.
// ============================================================

// Document 계층: 클라이언트가 서버로 보내는 이벤트
const DOCUMENT_CLIENT_EVENTS = {
  GET_DOCUMENTS: 'GET_DOCUMENTS',             // Document 목록 조회 요청
  GET_WORKSPACE_DOCUMENTS: 'GET_WORKSPACE_DOCUMENTS', // 특정 workspace의 Document 목록 조회 요청
  GET_DOCUMENT: 'GET_DOCUMENT',               // 단일 Document 조회 요청
  DELETE_DOCUMENT: 'DELETE_DOCUMENT'          // Document 삭제 요청
};

// Document 계층: 서버가 클라이언트로 보내는 이벤트
const DOCUMENT_SERVER_EVENTS = {
  GET_DOCUMENTS_ACK: 'GET_DOCUMENTS_ACK',     // Document 목록 조회 결과 응답
  GET_WORKSPACE_DOCUMENTS_ACK: 'GET_WORKSPACE_DOCUMENTS_ACK', // 특정 workspace의 Document 목록 조회 결과 응답
  GET_DOCUMENT_ACK: 'GET_DOCUMENT_ACK',       // 단일 Document 조회 결과 응답
  DELETE_DOCUMENT_ACK: 'DELETE_DOCUMENT_ACK', // Document 삭제 결과 응답

  // 서버 발생 이벤트
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_PROCESSED: 'DOCUMENT_PROCESSED',

  // Redis Pub/Sub 기반 서버 발생 이벤트
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED'
};

// Document 계층: Redis Pub/Sub 채널명
const DOCUMENT_PUBSUB_CHANNELS = {
  DOCUMENT_UPLOADED: 'document.created',
  DOCUMENT_PROCESSED: 'document.processed'
};

module.exports = {
  DOCUMENT_CLIENT_EVENTS,
  DOCUMENT_SERVER_EVENTS,
  DOCUMENT_PUBSUB_CHANNELS
};
