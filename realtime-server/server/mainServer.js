// ============================================================
// server/mainServer.js
// ============================================================
// 역할:
//   서버 진입점. 환경변수를 읽어 초기화 순서를 조율하고,
//   cluster 모드 여부에 따라 AppLifecycle에 실행을 위임한다.
//
// SRP: 환경변수 파싱 + 초기화 순서 조율만 담당.
//      비즈니스 로직은 각 모듈에 위임.
//
// 실행 흐름:
//   1. .env 로드
//   2. cluster 모드 여부 판단
//   3. AppLifecycle.start({ clusterMode, initFn })
//   4. initFn: Redis 연결 → WebSocket 서버 생성 → Pub/Sub 구독 초기화 → wss 반환
// ============================================================

require('dotenv').config();

const { appLifecycle } = require('./core/AppLifecycle');
const { redisManager }  = require('./redis/RedisManager');
const { webSocketServer } = require('./websocket/websocketServer');
const { pubSubInitializer } = require('./pubsub/initializer');
const logger = require('./utils/logger');

/** 수신 포트 */
const PORT = Number(process.env.PORT) || 8080;

/** 바인딩 주소 */
const HOST = process.env.HOST || '0.0.0.0';

/** cluster 모드 활성화 여부 (환경변수 CLUSTER_MODE=true) */
const CLUSTER_MODE = process.env.CLUSTER_MODE === 'true';

/** cluster 워커 수 (환경변수 WORKER_COUNT, 기본: CPU 코어 수) */
const WORKER_COUNT = Number(process.env.WORKER_COUNT) || require('os').cpus().length;

// ----------------------------------------------------------
// initFn
// Input  : 없음
// Output : Promise<{ wss }> — 초기화된 WebSocketServer 반환
// ----------------------------------------------------------
async function initFn() {
  // 1. Redis 연결
  await redisManager.connect();
  logger.info('Redis 연결 완료');

  // 2. WebSocket 서버 생성
  const wss = webSocketServer.create(PORT, HOST);
  logger.info(`WebSocket 서버 실행 중: ws://${HOST}:${PORT}`);

  // 3. Alert Redis Pub/Sub 구독 시작
  await pubSubInitializer.start(wss);
  logger.info('Pub/Sub 구독 초기화 완료');

  return { wss };
}

// ----------------------------------------------------------
// 진입점
// ----------------------------------------------------------
appLifecycle.start({
  clusterMode: CLUSTER_MODE,
  workerCount: WORKER_COUNT,
  initFn,
}).catch((err) => {
  logger.error(`서버 시작 실패: ${err.message}`);
  process.exit(1);
});
