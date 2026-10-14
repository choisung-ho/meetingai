// ============================================================
// server/websocket/messageRouter.js
// ============================================================
// 역할:
//   클라이언트가 보낸 원본 WebSocket 메시지를 JSON으로 파싱하고,
//   공통 형식을 검증한 뒤 type에 맞는 handler를 실행한다.
//
// SRP: 메시지 파싱, 공통 검증, handler 라우팅만 담당한다.
//      이벤트별 비즈니스 로직은 각 handler에 위임한다.
// ============================================================

const MessageSender = require('../utils/MessageSender');
const MessageValidator = require('../utils/MessageValidator');
const { registry } = require('../handlers/HandlerRegistry');
const logger = require('../utils/logger');
const { redact } = require('../utils/logRedaction');

class MessageRouter {
  static _logIncomingMessage(ws, message) {
    // 회의 내용/토큰/화자 embedding은 로그에 평문으로 남기지 않는다.
    const prettyMessage = JSON.stringify(redact(message), null, 2);
    const lines = [
      'WebSocket request received',
      `  source.userId : ${ws.userId ?? 'unknown'}`,
      `  event.type    : ${message?.type ?? 'unknown'}`,
      `  requestId     : ${message?.requestId ?? 'null'}`,
      '  request       :',
      prettyMessage
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    ];

    logger.info(lines.join('\n'));
  }

  // ----------------------------------------------------------
  // route
  // Input  : wss        - WebSocketServer 인스턴스
  //          ws         - 메시지를 보낸 WebSocket 객체
  //          rawMessage - Buffer | string
  // Output : Promise<void>
  // ----------------------------------------------------------
  async route(wss, ws, rawMessage) {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      logger.warn(`WebSocket invalid JSON received: ${rawMessage.toString()}`);
      MessageSender.sendError(ws, null, 'INVALID_JSON', 'JSON 형식이 올바르지 않습니다.');
      return;
    }

    MessageRouter._logIncomingMessage(ws, message);

    const validation = MessageValidator.validate(message);
    if (!validation.valid) {
      MessageSender.sendError(ws, message.requestId, validation.errorCode, validation.message);
      return;
    }

    // ----------------------------------------------------------
    // WebSocket 인증 컨텍스트 검증
    // connectionHandler에서 JWT 검증 후 ws에 저장한 값이 있는지 확인한다.
    // 이 값이 없으면 handler/service/broadcast까지 내려가지 않도록 차단한다.
    // ----------------------------------------------------------
    if (!ws.isAuthenticated || !ws.userId) {
      logger.warn(
        `WebSocket 인증 컨텍스트 없음: userId=${ws.userId ?? 'unknown'}, type=${message.type}`
      );

      MessageSender.sendError(
        ws,
        message.requestId,
        'UNAUTHORIZED',
        '인증되지 않은 WebSocket 연결입니다.'
      );
      return;
    }

    const handler = registry.resolve(message.type);
    if (!handler) {
      MessageSender.sendError(
        ws,
        message.requestId,
        'UNKNOWN_TYPE',
        `알 수 없는 메시지 type입니다: ${message.type}`
      );
      return;
    }

    try {
      await handler(wss, ws, message);
    } catch (error) {
      logger.error(`핸들러 실행 오류 [${message.type}]:`, error);
      MessageSender.sendError(
        ws,
        message.requestId,
        'HANDLER_ERROR',
        '메시지 처리 중 서버 오류가 발생했습니다.'
      );
    }
  }
}

const messageRouter = new MessageRouter();

function routeMessage(wss, ws, rawMessage) {
  return messageRouter.route(wss, ws, rawMessage);
}

module.exports = { MessageRouter, messageRouter, routeMessage };
