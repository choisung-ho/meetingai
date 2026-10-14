// ============================================================
// server/utils/websocketRateLimiter.js
// ============================================================
// 역할:
//   WebSocket Handshake(upgrade) 단계에서 IP별 연결 시도 횟수를 제한한다.
//
// 정책:
//   - IP별 1분 동안 최대 5회까지 WebSocket 연결 시도 허용
//   - 5회 초과 시 upgrade 단계에서 429 Too Many Requests로 차단
//
// 사용 위치:
//   server/websocket/websocketServer.js
// ============================================================

const logger = require('./logger');

// IP별 연결 시도 횟수 저장소
const connectionAttempts = new Map();

// 제한 기준
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

// ------------------------------------------------------------
// 1분마다 카운터 정리
// ------------------------------------------------------------
setInterval(() => {
  connectionAttempts.clear();
  logger.info('[웹소켓 보안] Rate Limit IP 카운터 데이터 정화 완료');
}, WINDOW_MS).unref();

// ------------------------------------------------------------
// normalizeIp
//
// Input:
//   ip: string
//
// Output:
//   string
//
// 설명:
//   IPv6 형태로 들어온 IPv4 주소를 일반 IPv4 주소로 정리한다.
//   예: ::ffff:127.0.0.1 -> 127.0.0.1
// ------------------------------------------------------------
function normalizeIp(ip) {
  if (!ip) {
    return 'unknown';
  }

  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }

  return ip;
}

// ------------------------------------------------------------
// getClientIp
//
// Input:
//   req: http.IncomingMessage
//
// Output:
//   string
//
// 설명:
//   upgrade 요청에서 클라이언트 IP를 추출한다.
//   프록시 환경에서는 x-forwarded-for를 우선 사용한다.
// ------------------------------------------------------------
function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    return normalizeIp(firstIp);
  }

  return normalizeIp(req.socket?.remoteAddress);
}

// ------------------------------------------------------------
// checkWebSocketRateLimit
//
// Input:
//   ip: string
//
// Output:
//   boolean
//
// 설명:
//   IP별 WebSocket Handshake 시도 횟수를 검사한다.
//   1분 내 5회를 초과하면 false를 반환한다.
// ------------------------------------------------------------
function checkWebSocketRateLimit(ip) {
  const clientIp = normalizeIp(ip);
  const currentAttempts = connectionAttempts.get(clientIp) || 0;

  if (currentAttempts >= MAX_ATTEMPTS_PER_WINDOW) {
    logger.warn(`[웹소켓 방어] 무차별 소켓 연결 요청 차단 - IP: ${clientIp}`);
    return false;
  }

  connectionAttempts.set(clientIp, currentAttempts + 1);

  logger.info(
    `[웹소켓 보안] Handshake 시도 허용: IP=${clientIp}, count=${currentAttempts + 1}/${MAX_ATTEMPTS_PER_WINDOW}`
  );

  return true;
}

module.exports = {
  getClientIp,
  checkWebSocketRateLimit
};
