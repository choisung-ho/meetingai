// ============================================================
// server/handlers/userHandler.js
// ============================================================
// 역할:
//   User 계층 WebSocket 이벤트(CONNECT_USER, DISCONNECT_USER, PING)를 처리한다.
//   스키마 검증 → 서비스 호출 → ACK 응답 전송 흐름을 담당한다.
//
// SRP: User 이벤트 검증/응답 흐름만 담당. 세션 처리는 userService에 위임.
//
// 패킷 흐름:
//   Client → CONNECT_USER    → handleConnectUser    → UserService.connectUser
//   Client → DISCONNECT_USER → handleDisconnectUser → UserService.disconnectUser
//   Client → PING            → handlePingUser       → UserService.pingUser
// ============================================================

const BaseHandler = require('./BaseHandler');
const userService = require('../services/userService');
const { auditLogger } = require('../utils/slogger');
const {
  CONNECT_USER_SCHEMA,
  DISCONNECT_USER_SCHEMA,
  PING_USER_SCHEMA,
  createConnectUserAck,
  createDisconnectUserAck,
  createPongAck
} = require('../schemas/userSchema');

class UserHandler extends BaseHandler {
  // ----------------------------------------------------------
  // handleConnectUser
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId, ws.name이 저장된 WebSocket 객체
  //          message — { type: 'CONNECT_USER', payload: {} }
  //                    (userId/name은 payload가 아닌 ws에서 읽음)
  // Output : Promise<void> — ACK 전송 또는 에러 전송
  // ----------------------------------------------------------
  async handleConnectUser(wss, ws, message) {
    if (!this.validateOrReject(ws, message, CONNECT_USER_SCHEMA)) return;

    // userId JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

    if (!userId) {
      this.sendError(ws, message.requestId, 'MISSING_USER_ID', 'ws.userId가 없습니다. JWT 인증이 필요합니다.');
      return;
    }

    // name은 JWT에 없으므로 클라이언트 payload에서 받아 ws에 저장한다
    ws.name = message.payload?.name ?? null;

    const session = await userService.connectUser(ws);

    this.sendAck(ws, createConnectUserAck(message.requestId ?? null, {
      userId: session.userId,
      name: session.name,
      status: session.status,
      connectedAt: session.connectedAt
    }));

    await auditLogger({
      action: 'CONNECT_USER',
      userId: session.userId,
      status: 'SUCCESS',
      metadata: { name: session.name, connectedAt: session.connectedAt }
    });
  }

  // ----------------------------------------------------------
  // handleDisconnectUser
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId가 저장된 WebSocket 객체
  //          message — { type: 'DISCONNECT_USER', payload: {} }
  //                    (userId는 payload가 아닌 ws에서 읽음)
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleDisconnectUser(wss, ws, message) {
    if (!this.validateOrReject(ws, message, DISCONNECT_USER_SCHEMA)) return;

    // userId는 JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

    if (!userId) {
      this.sendError(ws, message.requestId, 'MISSING_USER_ID', '연결 종료할 userId를 확인할 수 없습니다.');
      return;
    }

    await userService.disconnectUser(ws);

    this.sendAck(ws, createDisconnectUserAck(message.requestId ?? null, { userId }));

    await auditLogger({
      action: 'DISCONNECT_USER',
      userId,
      status: 'SUCCESS',
      metadata: { disconnectedAt: new Date().toISOString() }
    });
  }

  // ----------------------------------------------------------
  // handlePingUser
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — 대상 WebSocket 객체
  //          message — { type: 'PING', payload: {} }
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handlePingUser(wss, ws, message) {
    if (!this.validateOrReject(ws, message, PING_USER_SCHEMA)) return;

    ws.lastPingAt = Date.now();

    await userService.pingUser(ws);

    this.sendAck(ws, createPongAck(message.requestId ?? null));
  }
}

// 싱글톤 — 핸들러 인스턴스 공유
const userHandler = new UserHandler();

module.exports = {
  handleConnectUser:    (wss, ws, msg) => userHandler.handleConnectUser(wss, ws, msg),
  handleDisconnectUser: (wss, ws, msg) => userHandler.handleDisconnectUser(wss, ws, msg),
  handlePingUser:       (wss, ws, msg) => userHandler.handlePingUser(wss, ws, msg),
  UserHandler
};
