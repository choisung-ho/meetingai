// ============================================================
// server/core/AppLifecycle.js
// ============================================================
// 역할:
//   프로세스 생명주기와 고가용성 전략을 관리한다.
//   SIGTERM/SIGINT 시그널 처리, 그레이스풀 셧다운 시퀀스,
//   cluster 기반 프로세스 풀, 헬스체크 타이머를 담당한다.
//
// SRP: 프로세스 수준 생명주기 관리만 담당.
//      비즈니스 로직은 각 서비스에 위임.
//
// Input/Output 흐름:
//   AppLifecycle.start(config)   → 서버 초기화 및 시그널 등록
//   AppLifecycle.shutdown()      → 그레이스풀 셧다운 시퀀스 실행
//   AppLifecycle.isHealthy()     → boolean
// ============================================================

const cluster = require('cluster');
const os = require('os');
const logger = require('../utils/logger');

/** 그레이스풀 셧다운 최대 대기 시간 (ms) */
//서버를 안전하게 종료하는 절차
const SHUTDOWN_TIMEOUT_MS = 15_000;

/** 헬스체크 간격 (ms) */
//서버가 정상인지 주기적으로 검사하는 절차
const HEALTH_CHECK_INTERVAL_MS = 30_000;

/** 워커 재시작 최대 횟수 (단위 시간 내) */
//cluster 모드에서 worker가 계속 죽을 때 무한 재시작을 막기 위한 제한값
//60초 안에 같은 worker 재시작을 최대 5번까지만 허용한다.
const MAX_WORKER_RESTARTS = 5;

/** 워커 재시작 횟수 초기화 윈도우 (ms) */
const RESTART_WINDOW_MS = 60_000;

class AppLifecycle {
  //생성자
  //AppLifecycle 클래스가 서버 생명주기 관리를 위해 내부적으로 기억해둘 상태값들을 초기화하는 부분
  //constructor()는 AppLifecycle 객체가 처음 만들어질 때 자동으로 실행되는 초기 설정 함수
  constructor() {
    //HTTP 서버 객체를 저장하려고 만든 변수
    //예) WebSocket 서버가 내부적으로 HTTP 서버 위에서 돌아가면, 나중에 서버 종료할 때 HTTP 서버도 닫아야 함
    ///** */는 JSDoc이라는 주석 형식
    ///** @private @type {import('http').Server|null} */
    //이건 "이 변수는 private(내부용)이고, 타입은 http 모듈의 Server 객체 또는 null이다" 라고 알려주는 것임
    /** @private @type {import('http').Server|null} */
    this._httpServer = null;

    //WebSocket 서버 객체를 저장하는 변수
    //mainServer.js에서 서버를 만들면 AppLifecycle에서 저장, 서버 종료할 때 WebSocket 서버를 닫기 위함
    /** @private @type {import('ws').WebSocketServer|null} */
    this._wss = null;

    //현재 서버가 종료 중인지 표시하는 값
    //종료 로직이 여러 번 실행되는 걸 막기 위함
    /** @private 셧다운 진행 여부 */
    this._isShuttingDown = false;

    //헬스체크를 주기적으로 실행하는 타이머를 저장하는 변수
    //서버 종료할 때 이 타이머도 정리해야 함
    /** @private 헬스체크 타이머 */
    this._healthTimer = null;

    //cluster 모드에서 worker가 죽었다가 다시 시작된 기록을 저장하는 곳
    /** @private 워커별 재시작 기록 { workerId: [timestamp, ...] } */
    this._workerRestarts = new Map();
  }

  // ----------------------------------------------------------
  // start
  // Input  : config.port         — WebSocket 포트
  //          config.host         — 바인딩 주소
  //          config.clusterMode  — cluster 모드 활성화 여부
  //          config.workerCount  — cluster 워커 수 (기본: CPU 코어 수)
  //          config.initFn       — async () => { wss } — 실제 서버 초기화 콜백
  // Output : Promise<void>
  // ----------------------------------------------------------
  async start(config = {}) {
    //config 객체에서 필요한 값을 꺼내는 문법, =뒤에는 기본값
    const {
      clusterMode = false,
      workerCount = os.cpus().length,
      //JavaScript에서는 함수 자체를 다른 함수의 매개변수로 넘길 수 있음, 콜백 함수(callback)
      //서버를 실제로 초기화하는 함수(WebSocket 서버 생성)
      initFn,
    } = config;

    if (clusterMode && cluster.isPrimary) {
      this._startClusterPrimary(workerCount);
      return;
    }

    // 단일 프로세스 또는 cluster 워커로 실행
    await this._startWorker(initFn);
  }

  // ----------------------------------------------------------
  // _startClusterPrimary  (private)
  // Input  : workerCount — 생성할 워커 프로세스 수
  // Output : void — 워커 포크 및 이벤트 등록
  // cluster 모드에서 Primary 프로세스가 worker 프로세스들을 만들고 관리하는 함수
  // 앞에 _가 붙어 있으니까 관례상 클래스 내부에서만 쓰는 private 성격의 함수
  // ----------------------------------------------------------
  _startClusterPrimary(workerCount) {
    logger.info(`클러스터 Primary 시작: PID=${process.pid}, workers=${workerCount}`);

    for (let i = 0; i < workerCount; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      if (this._isShuttingDown) return;

      logger.warn(`워커 종료: PID=${worker.process.pid}, code=${code}, signal=${signal}`);

      if (this._shouldRestartWorker(worker.id)) {
        logger.info(`워커 재시작: id=${worker.id}`);
        cluster.fork();
      } else {
        logger.error(`워커 id=${worker.id} 재시작 한도 초과 — 재시작 중단`);
      }
    });

    this._registerSignalHandlers(() => this._shutdownPrimary());
  }

  // ----------------------------------------------------------
  // _shouldRestartWorker  (private)
  // Input  : workerId — cluster 워커 ID
  // Output : boolean — 재시작 허용 여부
  // ----------------------------------------------------------
  _shouldRestartWorker(workerId) {
    const now = Date.now();
    const timestamps = this._workerRestarts.get(workerId) ?? [];

    // 윈도우 밖 기록 제거
    const recent = timestamps.filter((t) => now - t < RESTART_WINDOW_MS);
    recent.push(now);
    this._workerRestarts.set(workerId, recent);

    return recent.length <= MAX_WORKER_RESTARTS;
  }

  // ----------------------------------------------------------
  // _startWorker  (private)
  // Input  : initFn — async 초기화 콜백, { wss } 반환 기대
  // Output : Promise<void>
  // 실제 서버를 실행할 프로세스가 호출하는 함수
  // 앞에 _가 붙어 있으니까 관례상 클래스 내부에서만 쓰는 private 성격의 함수
  // ----------------------------------------------------------
  async _startWorker(initFn) {
    if (typeof initFn !== 'function') {
      throw new Error('AppLifecycle.start()에 initFn 콜백이 필요합니다.');
    }

    try {
      //initFn()을 실제로 실행하는 부분
      //1. Redis 연결
      //2. WebSocket 서버 생성
      //3. { wss } 반환
      const result = await initFn();
      //initFn()이 반환한 결과 안에 wss가 있으면 저장하겠다는 뜻, 이렇게 저장해두면 shutdown에서 종료
      if (result?.wss) this._wss = result.wss;
    } catch (err) {
      logger.error(`서버 초기화 실패: ${err.message}`);
      process.exit(1);
    }

    //서버 종료 신호를 받을 때 실행할 함수를 등록
    this._registerSignalHandlers(() => this.shutdown());
    this._startHealthCheck();

    logger.info(`AppLifecycle: 워커 준비 완료 (PID=${process.pid})`);
  }

  // ----------------------------------------------------------
  // _registerSignalHandlers  (private)
  // Input  : shutdownFn — 시그널 수신 시 호출할 함수
  // Output : void
  // 서버 프로세스에 종료 신호나 치명적인 오류가 발생했을 때, 어떤 함수를 실행할지 등록하는 코드
  // 핸들러(handler) - 어떤 상황(event)이 발생했을 때 처리해주는 함수
  // ----------------------------------------------------------
  _registerSignalHandlers(shutdownFn) {
    const handle = (signal) => {
      logger.info(`시그널 수신: ${signal}`);
      shutdownFn();
    };

    process.once('SIGTERM', () => handle('SIGTERM'));
    process.once('SIGINT', () => handle('SIGINT'));

    process.on('uncaughtException', (err) => {
      logger.error(`uncaughtException: ${err.message}\n${err.stack}`);
      shutdownFn();
    });

    //개심각한 에러 탐지 코드
    process.on('unhandledRejection', (reason) => {
      logger.error(`unhandledRejection: ${reason}`);
    });
  }

  // ----------------------------------------------------------
  // shutdown
  // Input  : 없음
  // Output : Promise<void> — 모든 리소스 해제 후 process.exit(0)
  // ----------------------------------------------------------
  async shutdown() {
    if (this._isShuttingDown) return;
    this._isShuttingDown = true;

    logger.info('그레이스풀 셧다운 시작...');

    // 셧다운 타임아웃 보장
    const forceExit = setTimeout(() => {
      logger.error('셧다운 타임아웃 초과 — 강제 종료');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExit.unref(); // 타이머가 프로세스를 붙잡지 않도록

    try {
      // 1. 헬스체크 타이머 정지
      this._stopHealthCheck();

      // 2. 새 WebSocket 연결 거부
      if (this._wss) {
        await this._closeWebSocketServer();
      }

      // 3. Redis 연결 해제
      await this._disconnectRedis();

      clearTimeout(forceExit);
      logger.info('그레이스풀 셧다운 완료');
      process.exit(0);
    } catch (err) {
      logger.error(`셧다운 중 오류: ${err.message}`);
      process.exit(1);
    }
  }

  // ----------------------------------------------------------
  // _shutdownPrimary  (private)
  // Input  : 없음
  // Output : void — 모든 cluster 워커에 SIGTERM 전송
  // ----------------------------------------------------------
  _shutdownPrimary() {
    if (this._isShuttingDown) return;
    this._isShuttingDown = true;

    logger.info('Primary 셧다운: 모든 워커에 SIGTERM 전송');

    for (const worker of Object.values(cluster.workers ?? {})) {
      worker.process.kill('SIGTERM');
    }

    setTimeout(() => {
      logger.info('Primary 종료');
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS).unref();
  }

  // ----------------------------------------------------------
  // _closeWebSocketServer  (private)
  // Input  : 없음
  // Output : Promise<void>
  // ----------------------------------------------------------
  _closeWebSocketServer() {
    return new Promise((resolve) => {
      logger.info('WebSocket 서버 종료 중...');
      this._wss.close(() => {
        logger.info('WebSocket 서버 종료 완료');
        resolve();
      });
    });
  }

  // ----------------------------------------------------------
  // _disconnectRedis  (private)
  // Input  : 없음
  // Output : Promise<void>
  // ----------------------------------------------------------
  async _disconnectRedis() {
    try {
      const { pubSubInitializer } = require('../pubsub/initializer');
      const { pubSubService } = require('../redis/pubsubService');
      const { redisManager } = require('../redis/RedisManager');

      // 1. Pub/Sub 구독 해제
      await pubSubInitializer.stop();
      logger.info('Pub/Sub 구독 해제 완료');

      // 2. Redis Pub/Sub subscriber 연결 종료
      await pubSubService.disconnect();
      logger.info('Redis Pub/Sub subscriber 연결 해제 완료');

      // 3. 일반 Redis 연결 종료
      await redisManager.disconnect();
      logger.info('Redis 연결 해제 완료');
    } catch (err) {
      logger.warn(`Redis 해제 중 오류 (무시): ${err.message}`);
    }
  }

  // ----------------------------------------------------------
  // _startHealthCheck  (private)
  // Input  : 없음
  // Output : void — HEALTH_CHECK_INTERVAL_MS마다 헬스 로그 출력
  // ----------------------------------------------------------
  _startHealthCheck() {
    this._healthTimer = setInterval(async () => {
      const healthy = await this.isHealthy();
      if (healthy) {
        logger.debug(`헬스체크 OK (PID=${process.pid})`);
      } else {
        logger.warn(`헬스체크 실패 (PID=${process.pid})`);
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    this._healthTimer.unref();
  }

  // ----------------------------------------------------------
  // _stopHealthCheck  (private)
  // Input  : 없음
  // Output : void
  // ----------------------------------------------------------
  _stopHealthCheck() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  // ----------------------------------------------------------
  // isHealthy
  // Input  : 없음
  // Output : Promise<boolean> — Redis PING + 메모리 사용량 검사
  // ----------------------------------------------------------
  async isHealthy() {
    try {
      const { redisManager } = require('../redis/RedisManager');

      const redisPing = await redisManager.healthCheck();

      const memory = process.memoryUsage();

      const heapUsedMB = memory.heapUsed / 1024 / 1024;
      const memOk = heapUsedMB < 512;

      if (!redisPing) {
        logger.warn('헬스체크 실패 원인: Redis healthCheck 실패');
      }

      if (!memOk) {
        logger.warn(
          `헬스체크 실패 원인: 메모리 사용량 높음 heapUsedMB=${heapUsedMB.toFixed(2)}MB`
        );

        logger.warn(
          `memory rss=${memory.rss} heapUsed=${memory.heapUsed} heapTotal=${memory.heapTotal} heapUsedMB=${heapUsedMB.toFixed(2)}MB`
        );
      }

      return redisPing && memOk;
    } catch (err) {
      logger.warn(`헬스체크 실패 원인: ${err.message}`);
      return false;
    }
  }

  // ----------------------------------------------------------
  // setWss
  // Input  : wss — WebSocketServer 인스턴스 (shutdown 시 종료 대상)
  // Output : void
  // ----------------------------------------------------------
  setWss(wss) {
    this._wss = wss;
  }
}

//require('./core/AppLifecycle')가 실행되면 Node.js가 AppLifecycle.js 파일을 읽고 실행
//객체가 여기서 생성됨
const appLifecycle = new AppLifecycle();
module.exports = { AppLifecycle, appLifecycle };
