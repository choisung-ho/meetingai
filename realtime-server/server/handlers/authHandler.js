// ============================================================
// server/handlers/authHandler.js
// ============================================================
// 역할:
//   WebSocket 인증 타이머를 관리한다.
//   - JWT exp 기준으로 WebSocket 만료 타이머 설정
//   - 토큰 만료 시 SESSION_EXPIRED 전송 후 연결 종료
//   - 연결 종료 시 authTimer 제거
// ============================================================

const MessageSender = require('../utils/MessageSender');
const logger = require('../utils/logger');
const { createSessionExpiredResponse } = require('../schemas/authSchema');

const SESSION_EXPIRED_CLOSE_CODE = 4003;

// ------------------------------------------------------------
// clearAuthTimer
// Input  : ws — WebSocket 객체
// Output : void
// 기존 인증 만료 타이머 제거
// ------------------------------------------------------------
function clearAuthTimer(ws) {
  if (ws.authTimer) {
    clearTimeout(ws.authTimer);
    ws.authTimer = null;
  }
}

// ------------------------------------------------------------
// scheduleAuthTimer
// Input  : ws      — WebSocket 객체
//          decoded — verifyToken(token) 결과
// Output : boolean — 타이머 설정 성공 여부
// JWT exp 기준으로 WebSocket 연결 만료 타이머 설정
// ------------------------------------------------------------
function scheduleAuthTimer(ws, decoded) {
  // 기존 타이머가 있다면 먼저 제거
  clearAuthTimer(ws);

  if (!decoded || !decoded.exp) {
    logger.warn(`토큰 만료 시간 없음 — userId=${ws.userId ?? 'unknown'}`);
    ws.close(SESSION_EXPIRED_CLOSE_CODE, '토큰 만료 시간이 없습니다.');
    return false;
  }

  // decoded.exp는 초(second) 단위이므로 ms로 변환
  const expirationTime = decoded.exp * 1000;
  const timeLeft = expirationTime - Date.now();

  ws.tokenExpiresAt = expirationTime;

  if (timeLeft <= 0) {
    logger.warn(`이미 만료된 토큰 — userId=${ws.userId ?? 'unknown'}`);

    try {
      MessageSender.sendJson(ws, createSessionExpiredResponse());
    } catch (error) {
      logger.error(`SESSION_EXPIRED 전송 실패: ${error.message}`);
    }

    ws.close(SESSION_EXPIRED_CLOSE_CODE, 'Access Token이 만료되었습니다.');
    return false;
  }

  ws.authTimer = setTimeout(() => {
    logger.warn(`토큰 만료 — userId=${ws.userId ?? 'unknown'} WebSocket 연결 종료`);

    try {
      MessageSender.sendJson(ws, createSessionExpiredResponse());
    } catch (error) {
      logger.error(`SESSION_EXPIRED 전송 실패: ${error.message}`);
    }

    // terminate보다 close를 사용해서 connectionHandler의 close 정리 로직이 실행되게 한다.
    ws.close(SESSION_EXPIRED_CLOSE_CODE, 'Access Token이 만료되었습니다.');
  }, timeLeft);

  logger.info(
    `인증 타이머 설정 완료 — userId=${ws.userId}, expiresAt=${new Date(expirationTime).toISOString()}`
  );

  return true;
}

module.exports = {
  scheduleAuthTimer,
  clearAuthTimer
};
