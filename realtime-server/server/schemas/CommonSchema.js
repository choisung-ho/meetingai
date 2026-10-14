// ============================================================
// server/schemas/CommonSchema.js  (구 messageSchemas.js 대체)
// ============================================================
// 역할:
//   여러 계층에서 공통으로 사용하는 WebSocket 응답 객체 생성 함수를 정의한다.
//   CONNECTED(물리 연결 성공) 및 ERROR(공통 에러) 두 가지를 제공한다.
//
// SRP: 공통 응답 객체 생성만 담당.
// ============================================================

const { SERVER_EVENTS } = require('../websocket/eventTypes');

// ----------------------------------------------------------
// createConnectedResponse
// Input  : 없음
// Output : WsResponse — CONNECTED 응답 객체
// ----------------------------------------------------------
function createConnectedResponse() {
  return {
    type: SERVER_EVENTS.CONNECTED,
    requestId: null,
    success: true,
    payload: {
      message: 'WebSocket 서버에 연결되었습니다.',
      connectedAt: new Date().toISOString()
    }
  };
}

// ----------------------------------------------------------
// createErrorResponse
// Input  : requestId  — 요청 추적 ID (null 허용)
//          errorCode  — 에러 코드 (예: MISSING_PAYLOAD)
//          message    — 사람이 읽는 에러 설명
// Output : WsResponse — success:false 응답 객체
// ----------------------------------------------------------
function createErrorResponse(requestId = null, errorCode, message) {
  return {
    type: SERVER_EVENTS.ERROR,
    requestId,
    success: false,
    payload: { errorCode, message }
  };
}

module.exports = { createConnectedResponse, createErrorResponse };
