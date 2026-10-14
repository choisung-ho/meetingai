// ============================================================
// server/websocket/websocketServer.js
// ============================================================
// 역할:
//   ws 라이브러리의 WebSocketServer를 생성하고,
//   HTTP upgrade 단계에서 IP Rate Limit 검사를 수행한 뒤,
//   새 연결을 ConnectionHandler에 위임한다.
//
// SRP:
//   - WebSocket 서버 생성
//   - upgrade 단계 보안 검사
//   - connection 이벤트 등록
//   - heartbeat timeout monitor 관리
//
// Input/Output 흐름:
//   WebSocketServer.create(port, host) → WebSocketServer 인스턴스 반환
//   HTTP upgrade 요청 발생 → IP Rate Limit 검사
//   통과 시 connection 이벤트 발생 → ConnectionHandler.handle(wss, ws, req)
// ============================================================

const http = require('http');
const { WebSocketServer: WsServer, WebSocket } = require('ws');

const {
  getClientIp,
  checkWebSocketRateLimit
} = require('../utils/websocketRateLimiter');

// 클라이언트가 새로 접속했을 때 처리할 객체 가져옴
const { connectionHandler } = require('./connectionHandler');
const logger = require('../utils/logger');

const HEARTBEAT_CHECK_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;

// 래퍼 클래스: 기존 기능을 직접 쓰지 않고, 한 겹 감싸서 프로젝트 방식에 맞게 쓰도록 만든 클래스
class WebSocketServer {
  constructor() {
    // HTTP upgrade 요청을 직접 받기 위한 서버
    /** @private @type {import('http').Server|null} */
    this._httpServer = null;

    // 실제 ws 서버 인스턴스를 저장하는 변수
    /** @private @type {WsServer|null} */
    this._wss = null;

    /** @private heartbeat timeout 검사 타이머 */
    this._heartbeatTimer = null;
  }

  // ----------------------------------------------------------
  // create
  // Input  : port — 수신 포트 번호
  //          host — 바인딩 주소 (기본값 '0.0.0.0')
  // Output : WsServer — 생성된 WebSocketServer 인스턴스
  // 실제 WebSocket 서버를 생성
  // ----------------------------------------------------------
  create(port, host = '0.0.0.0') {
    this._httpServer = http.createServer();

    // noServer: true
    // - ws가 직접 port를 열지 않음
    // - HTTP upgrade 요청을 우리가 직접 검사한 뒤 WebSocket으로 승격시킴
    this._wss = new WsServer({
      noServer: true
    });

    // --------------------------------------------------------
    // HTTP upgrade 단계에서 WebSocket Handshake 요청 검사
    // --------------------------------------------------------
    this._httpServer.on('upgrade', (req, socket, head) => {
      const clientIp = getClientIp(req);

      if (!checkWebSocketRateLimit(clientIp)) {
        socket.write(
          'HTTP/1.1 429 Too Many Requests\r\n' +
          'Content-Type: application/json; charset=utf-8\r\n' +
          'Connection: close\r\n' +
          '\r\n' +
          JSON.stringify({
            type: 'ERROR',
            payload: {
              message: '단시간에 너무 많은 연결을 시도했습니다. 잠시 후 다시 시도하세요.'
            }
          })
        );

        socket.destroy();
        return;
      }

      this._wss.handleUpgrade(req, socket, head, (ws) => {
        this._wss.emit('connection', ws, req);
      });
    });

    // WebSocket 클라이언트가 서버에 접속하면 connection 이벤트가 발생
    // upgrade 검사를 통과한 연결만 이쪽으로 들어옴
    this._wss.on('connection', (ws, req) => {
      connectionHandler.handle(this._wss, ws, req);
    });

    // WebSocket 서버 자체에서 에러가 발생했을 때 로그
    this._wss.on('error', (error) => {
      logger.error(`WebSocketServer 오류: ${error.message}`);
    });

    // HTTP 서버 자체에서 에러가 발생했을 때 로그
    this._httpServer.on('error', (error) => {
      logger.error(`HTTP 서버 오류: ${error.message}`);
    });

    this._startHeartbeatTimeoutMonitor();

    // 기존에는 new WsServer({ port, host })가 직접 listen 했지만,
    // 이제는 http.createServer()를 사용하므로 직접 listen 해야 한다.
    this._httpServer.listen(port, host, () => {
      logger.info(`WebSocket 서버 생성: ws://${host}:${port}`);
    });

    return this._wss;
  }

  _closeHeartbeatTimeoutConnection(ws, reason, extra = {}) {
    logger.warn(
      `Heartbeat 연결 종료 요청 — userId=${ws.userId ?? 'unknown'}, reason=${reason}, diffMs=${extra.diffMs ?? 'unknown'}`
    );

    if (ws.readyState === WebSocket.OPEN) {
      ws.close(4005, reason);
    }
  }

  _startHeartbeatTimeoutMonitor() {
    if (this._heartbeatTimer) {
      return;
    }

    this._heartbeatTimer = setInterval(() => {
      if (!this._wss) {
        return;
      }

      const now = Date.now();

      this._wss.clients.forEach((ws) => {
        if (!ws.isAuthenticated || !ws.userId) {
          return;
        }

        if (!ws.lastPingAt) {
          this._closeHeartbeatTimeoutConnection(
            ws,
            'HEARTBEAT_LAST_PING_MISSING'
          );
          return;
        }

        const diffMs = now - ws.lastPingAt;

        if (diffMs > HEARTBEAT_TIMEOUT_MS) {
          this._closeHeartbeatTimeoutConnection(
            ws,
            'HEARTBEAT_TIMEOUT',
            { diffMs }
          );
        }
      });
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    this._heartbeatTimer.unref();

    logger.info(
      `Heartbeat timeout monitor 시작: interval=${HEARTBEAT_CHECK_INTERVAL_MS}ms, timeout=${HEARTBEAT_TIMEOUT_MS}ms`
    );
  }

  // ----------------------------------------------------------
  // close
  // Input  : 없음
  // Output : Promise<void>
  // WebSocket 서버를 종료하는 메서드
  // ----------------------------------------------------------
  close() {
    return new Promise((resolve, reject) => {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
        logger.info('Heartbeat timeout monitor 종료');
      }

      if (!this._wss && !this._httpServer) {
        return resolve();
      }

      const closeHttpServer = () => {
        if (!this._httpServer) {
          this._wss = null;
          logger.info('WebSocket 서버 종료됨');
          return resolve();
        }

        this._httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          this._httpServer = null;
          this._wss = null;

          logger.info('WebSocket 서버 종료됨');
          resolve();
        });
      };

      if (this._wss) {
        this._wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          closeHttpServer();
        });

        return;
      }

      closeHttpServer();
    });
  }

  // ----------------------------------------------------------
  // getServer
  // Input  : 없음
  // Output : WsServer | null
  // 실제 WebSocket 서버 객체를 반환
  // ----------------------------------------------------------
  getServer() {
    return this._wss;
  }
}

const webSocketServer = new WebSocketServer();

// 하위 호환: createWebSocketServer 함수 형태도 노출
// 예전 코드와의 호환성
function createWebSocketServer(port, host) {
  return webSocketServer.create(port, host);
}

module.exports = { WebSocketServer, webSocketServer, createWebSocketServer };
