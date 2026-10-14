// ============================================================
// server/redis/RedisManager.js
// ============================================================
// 역할:
//   Redis 클라이언트 생성, 연결/해제, 재연결 전략, 헬스 체크를 담당한다.
//   다른 Store 클래스가 getClient()로 동일한 클라이언트 인스턴스를 공유한다.
//
// SRP: Redis 연결 생애주기만 담당.
//
// 고가용성 전략:
//   - socket_keepalive: TCP keepalive로 silent disconnect 감지
//   - connectTimeout: 연결 시도 제한 시간
//   - reconnectStrategy: 지수 백오프 기반 재연결 (최대 30초)
//   - error 이벤트: 연결 오류를 로그로 남기되 프로세스를 종료하지 않음
// ============================================================

const { createClient } = require('redis');
const logger = require('../utils/logger');

/** 재연결 시도 간격 초기값 (ms) */
const RECONNECT_BASE_MS = 500;
/** 재연결 최대 대기 시간 (ms) */
const RECONNECT_MAX_MS = 30_000;

class RedisManager {
  constructor() {
    //Redis 서버와 통신하는 실제 객체를 저장하는 변수
    /** @private @type {import('redis').RedisClientType|null} */
    this._client = null;
    //Redis에 연결 시도 중인지 아닌지를 표시하는 값
    //동시에 연결 요청이 여러 번 들어가면 Redis client가 중복 생성 -> 방지
    /** @private */
    this._isConnecting = false;
  }

  // ----------------------------------------------------------
  // _createClient  (private)
  // Input  : 없음 (process.env.REDIS_URL 참조)
  // Output : RedisClientType — 이벤트 리스너가 등록된 새 클라이언트
  // ----------------------------------------------------------
  _createClient() {
    //Redis client 객체를 생성
    const client = createClient({
      //Redis 서버 주소를 설정
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      //Redis와 연결되는 네트워크 소켓 설정
      socket: {
        //연결이 살아있는지 주기적으로 확인하는 설정
        keepAlive: 5000,
        //Redis 서버에 연결을 시도할 때 최대 몇 ms까지 기다릴지
        connectTimeout: 10_000,
        // 지수 백오프 재연결 전략
        // 지수 백오프: 재시도 간격을 점점 2배씩 늘리는 방식
        // Redis 연결이 끊겼을 때 몇 ms 뒤에 다시 연결을 시도할지
        // 발생하는 시점: Redis 연결이 실패했거나, 연결되어 있다가 끊겼을 때
        reconnectStrategy: (retries) => {
          //지수 백오프 계산, 재연결 간격을 점점 늘리는 공식
          const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, retries), RECONNECT_MAX_MS);
          logger.warn(`Redis 재연결 시도 #${retries + 1} — ${delay}ms 후 재시도`);
          return delay;
        }
      }
    });

    //Redis client에서 특정 이벤트가 발생했을 때 실행할 함수를 등록
    client.on('connect', () => logger.info('Redis 연결 시도 중...'));
    client.on('ready', () => logger.info('Redis 연결 완료'));
    client.on('reconnecting', () => logger.warn('Redis 재연결 중...'));
    client.on('error', (err) => logger.error(`Redis 오류: ${err.message}`));
    client.on('end', () => logger.warn('Redis 연결 종료됨'));

    return client;
  }

  // ----------------------------------------------------------
  // connect
  // Input  : 없음
  // Output : Promise<void> — 연결 완료 시 resolve
  // Redis 서버와 실제 연결을 시작
  // ----------------------------------------------------------
  async connect() {
    //중복 연결 방지 코드
    if (this._client?.isOpen || this._isConnecting) return;

    //Redis 연결을 시작할 거니까 상태를 true로 변경
    this._isConnecting = true;
    //Redis client 객체를 생성해서 _client에 저장(연결용 객체 생성)
    this._client = this._createClient();

    try {
      //실제 Redis 연결
      await this._client.connect();
    } finally {
      //finally로 초기화
      this._isConnecting = false;
    }
  }

  // ----------------------------------------------------------
  // disconnect
  // Input  : 없음
  // Output : Promise<void>
  // ----------------------------------------------------------
  async disconnect() {
    if (this._client?.isOpen) {
      await this._client.quit();
      logger.info('Redis 연결 정상 종료');
    }
  }

  // ----------------------------------------------------------
  // getClient
  // Input  : 없음
  // Output : RedisClientType — 현재 활성 Redis 클라이언트
  // ----------------------------------------------------------
  getClient() {
    if (!this._client) {
      throw new Error('RedisManager: connect()를 먼저 호출해야 합니다.');
    }
    return this._client;
  }

  // ----------------------------------------------------------
  // healthCheck
  // Input  : 없음
  // Output : Promise<boolean> — PING 응답 성공 여부
  // ----------------------------------------------------------
  async healthCheck() {
    try {
      if (!this._client) {
        logger.warn('Redis healthCheck 실패: client 없음');
        return false;
      }

      logger.debug(
        `Redis healthCheck 상태: isOpen=${this._client.isOpen}, isReady=${this._client.isReady}`
      );

      if (!this._client.isOpen || !this._client.isReady) {
        logger.warn(
          `Redis healthCheck 실패: 연결 준비 안 됨 isOpen=${this._client.isOpen}, isReady=${this._client.isReady}`
        );
        return false;
      }

      const result = await this._client.ping();
      logger.debug(`Redis PING 결과: ${result}`);

      return result === 'PONG';
    } catch (err) {
      logger.warn(`Redis healthCheck 예외: ${err.message}`);
      return false;
    }
  }
}

// 싱글톤: 서버 전역에서 동일한 Redis 연결 공유
const redisManager = new RedisManager();
module.exports = redisManager;
module.exports.redisManager = redisManager;
module.exports.RedisManager = RedisManager;
