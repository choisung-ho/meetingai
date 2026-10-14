// ============================================================
// server/services/userService.js
// ============================================================
// 역할:
//   User 계층 비즈니스 로직을 담당한다.
//   CONNECT_USER, DISCONNECT_USER, PING 이벤트에서 handler가 호출한다.
//
// SRP:
//   사용자 세션 등록/해제/활동시간 갱신 로직만 담당.
//
// 보안 적용 후 원칙:
//   - userId는 클라이언트 payload에서 받지 않는다.
//   - JWT 검증 후 ws.userId에 저장된 값을 사용한다.
//   - name은 JWT에 없으므로 payload에서 받아 ws.name에 저장한다.
//   - Redis sessionStore와 socketStore도 ws.userId 기준으로 저장한다.
//
// Input/Output 흐름:
//   connectUser(ws)        → UserSession
//   disconnectUser(ws)     → { userId }
//   pingUser(ws)           → { userId }
// ============================================================

const sessionStore = require('../sessions/sessionStore');
const socketStore = require('../sessions/socketStore');
const logger = require('../utils/logger');

class UserService {
  // ----------------------------------------------------------
  // connectUser
  // Input  : ws — JWT 검증 후 사용자 정보가 저장된 WebSocket 객체
  //              ws.userId
  //              ws.name
  // Output : Promise<UserSession>
  // ----------------------------------------------------------
  async connectUser(ws) {
    const userId = ws.userId;
    const name = ws.name ?? null;

    if (!userId) {
      throw new Error('connectUser 실패: ws.userId가 없습니다.');
    }


    const now = new Date().toISOString();

    const session = await sessionStore.addUserSession(userId, {
      userId,
      name,
      status: 'online',
      connectedAt: now,
      lastSeenAt: now
    });

    socketStore.addClient(userId, ws);

    logger.info(
      `사용자 연결 등록: userId=${userId}, name=${name ?? '없음'}`
    );

    return session;
  }

  // ----------------------------------------------------------
  // disconnectUser
  // Input  : ws — WebSocket 객체
  // Output : Promise<{ userId: string }>
  // ----------------------------------------------------------
  async disconnectUser(ws) {
    const userId = ws.userId;

    if (!userId) {
      throw new Error('disconnectUser 실패: ws.userId가 없습니다.');
    }

    const currentClient = socketStore.getClient(userId);

    if (!currentClient || currentClient === ws) {
      await sessionStore.removeUserSession(userId);
    }
    
    socketStore.removeClient(userId);

    ws.userId = null;
    ws.name = null;
    ws.isAuthenticated = false;

    logger.info(`사용자 연결 해제: userId=${userId}`);

    return { userId };
  }

  // ----------------------------------------------------------
  // pingUser
  // Input  : ws — WebSocket 객체
  // Output : Promise<{ userId: string }>
  // ----------------------------------------------------------
  async pingUser(ws) {
    const userId = ws.userId;

    if (!userId) {
      throw new Error('pingUser 실패: ws.userId가 없습니다.');
    }

    await sessionStore.updateLastSeen(userId);

    return { userId };
  }
}

module.exports = new UserService();
