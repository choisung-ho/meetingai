// ============================================================
// server/core/ThreadPool.js
// ============================================================
// 역할:
//   worker_threads 기반 스레드 풀을 관리한다.
//   CPU 집약적 작업(대용량 JSON 처리, 음성 데이터 분석 등)을
//   메인 이벤트 루프에서 분리하여 서버 응답성을 유지한다.
//
// SRP: 워커 스레드 생명주기와 작업 큐 관리만 담당.
//
// 고가용성 전략:
//   - 워커 비정상 종료 시 자동 재생성
//   - 작업 타임아웃으로 hung 워커 감지
//   - 큐 기반 부하 분산
//
// Input/Output 흐름:
//   new ThreadPool(workerScript, size)
//   pool.runTask(data)  → Promise<result>
//   pool.shutdown()     → Promise<void>
// ============================================================

const { Worker, isMainThread } = require('worker_threads');
const logger = require('../utils/logger');

/** 작업 완료 대기 타임아웃 (ms) */
const TASK_TIMEOUT_MS = 30_000;

class ThreadPool {
  // ----------------------------------------------------------
  // constructor
  // Input  : workerScript — 워커로 실행할 JS 파일 경로
  //          poolSize     — 풀에 유지할 워커 수 (기본: CPU 코어 수)
  // ----------------------------------------------------------
  constructor(workerScript, poolSize = require('os').cpus().length) {
    if (!isMainThread) {
      throw new Error('ThreadPool은 메인 스레드에서만 생성 가능합니다.');
    }

    this._workerScript = workerScript;
    this._poolSize = poolSize;

    /** @private @type {Worker[]} 유휴 워커 목록 */
    this._idleWorkers = [];

    /** @private @type {Array<{data, resolve, reject, timer}>} 대기 중인 작업 큐 */
    this._taskQueue = [];

    /** @private 풀 종료 여부 */
    this._isShuttingDown = false;

    this._initialize();
  }

  // ----------------------------------------------------------
  // _initialize  (private)
  // Input  : 없음
  // Output : void — poolSize만큼 워커 생성
  // ----------------------------------------------------------
  _initialize() {
    for (let i = 0; i < this._poolSize; i++) {
      this._createWorker();
    }
    logger.info(`ThreadPool 초기화 완료: workerCount=${this._poolSize}`);
  }

  // ----------------------------------------------------------
  // _createWorker  (private)
  // Input  : 없음
  // Output : Worker — 생성 및 등록된 워커
  // ----------------------------------------------------------
  _createWorker() {
    const worker = new Worker(this._workerScript);

    worker.on('message', (result) => {
      const task = worker._currentTask;
      worker._currentTask = null;

      if (task) {
        clearTimeout(task.timer);
        if (result.error) {
          task.reject(new Error(result.error));
        } else {
          task.resolve(result.data);
        }
      }

      this._idleWorkers.push(worker);
      this._processQueue();
    });

    worker.on('error', (err) => {
      logger.error(`워커 오류: ${err.message}`);
      const task = worker._currentTask;
      worker._currentTask = null;

      if (task) {
        clearTimeout(task.timer);
        task.reject(err);
      }

      // 비정상 종료된 워커 자동 재생성
      if (!this._isShuttingDown) {
        logger.warn('워커 재생성 중...');
        this._createWorker();
      }
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !this._isShuttingDown) {
        logger.warn(`워커 비정상 종료 (code=${code}), 재생성 중...`);
        this._createWorker();
      }
    });

    worker._currentTask = null;
    this._idleWorkers.push(worker);
    return worker;
  }

  // ----------------------------------------------------------
  // _processQueue  (private)
  // Input  : 없음
  // Output : void — 유휴 워커가 있으면 큐에서 작업 꺼내 실행
  // ----------------------------------------------------------
  _processQueue() {
    if (this._taskQueue.length === 0 || this._idleWorkers.length === 0) return;

    const worker = this._idleWorkers.pop();
    const task = this._taskQueue.shift();

    worker._currentTask = task;

    // 작업 타임아웃 설정
    task.timer = setTimeout(() => {
      logger.error(`워커 작업 타임아웃 (${TASK_TIMEOUT_MS}ms) — 워커 재생성`);
      worker.terminate();
      task.reject(new Error('작업 타임아웃'));
    }, TASK_TIMEOUT_MS);

    worker.postMessage(task.data);
  }

  // ----------------------------------------------------------
  // runTask
  // Input  : data — 워커에 전달할 직렬화 가능한 데이터
  // Output : Promise<any> — 워커 처리 결과
  // ----------------------------------------------------------
  runTask(data) {
    if (this._isShuttingDown) {
      return Promise.reject(new Error('ThreadPool이 종료 중입니다.'));
    }

    return new Promise((resolve, reject) => {
      this._taskQueue.push({ data, resolve, reject, timer: null });
      this._processQueue();
    });
  }

  // ----------------------------------------------------------
  // shutdown
  // Input  : 없음
  // Output : Promise<void> — 모든 워커 종료 후 resolve
  // ----------------------------------------------------------
  async shutdown() {
    this._isShuttingDown = true;
    logger.info('ThreadPool 종료 중...');

    const terminatePromises = [
      ...this._idleWorkers,
      ...this._taskQueue.map((t) => t.resolve(null)) // 대기 중 작업 취소
    ];

    // 실제로는 idleWorkers만 terminate
    await Promise.all(
      this._idleWorkers.map((w) => w.terminate())
    );

    this._idleWorkers = [];
    this._taskQueue = [];
    logger.info('ThreadPool 종료 완료');
  }

  // ----------------------------------------------------------
  // getStats
  // Input  : 없음
  // Output : { idle: number, queued: number, total: number }
  // ----------------------------------------------------------
  getStats() {
    return {
      idle: this._idleWorkers.length,
      queued: this._taskQueue.length,
      total: this._poolSize
    };
  }
}

module.exports = ThreadPool;
