// ============================================================
// server/handlers/BaseHandler.js
// ============================================================
// 역할:
//   모든 이벤트 핸들러가 공통으로 사용하는 메서드를 제공하는 추상 기반 클래스.
//   검증 실패 시 에러 전송, ACK 응답 전송 등 반복 코드를 중앙화한다.
//
// SRP: 핸들러 공통 로직(검증 + 에러 전송 + ACK 전송)만 담당.
//
// 사용법:
//   class UserHandler extends BaseHandler {
//     async handleConnectUser(wss, ws, message) { ... }
//   }
// ============================================================

const MessageSender = require('../utils/MessageSender');
const SchemaValidator = require('../utils/SchemaValidator');

class BaseHandler {
  // ----------------------------------------------------------
  // validateOrReject
  // Input  : ws      — 대상 WebSocket 객체
  //          message — 검증 대상 메시지 (WsMessage)
  //          schema  — JSON Schema 객체
  // Output : boolean — true면 검증 통과, false면 에러 응답 전송 후 false 반환
  // ----------------------------------------------------------
  validateOrReject(ws, message, schema) {
    const result = SchemaValidator.validate(message, schema);
    if (!result.valid) {
      MessageSender.sendError(ws, message.requestId, result.errorCode, result.message);
      return false;
    }
    return true;
  }

  // ----------------------------------------------------------
  // sendAck
  // Input  : ws       — 대상 WebSocket 객체
  //          response — 전송할 ACK 응답 객체 (WsResponse)
  // Output : void
  // ----------------------------------------------------------
  sendAck(ws, response) {
    MessageSender.sendJson(ws, response);
  }

  // ----------------------------------------------------------
  // sendError
  // Input  : ws        — 대상 WebSocket 객체
  //          requestId — 요청 추적 ID
  //          errorCode — 에러 코드
  //          message   — 에러 설명
  // Output : void
  // ----------------------------------------------------------
  sendError(ws, requestId, errorCode, message) {
    MessageSender.sendError(ws, requestId, errorCode, message);
  }

  // ----------------------------------------------------------
  // extractTrimmed  (private helper)
  // Input  : source — 값을 꺼낼 객체
  //          key    — 필드 키
  // Output : string — trim된 값 또는 undefined
  // ----------------------------------------------------------
  extractTrimmed(source, key) {
    const value = source?.[key];
    return typeof value === 'string' ? value.trim() : value;
  }
}

module.exports = BaseHandler;
