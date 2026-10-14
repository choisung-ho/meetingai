// ============================================================
// server/redis/pubsubService.js
// ============================================================
// 역할:
//   Redis Pub/Sub 구독 전용 subscriber client를 관리한다.
//   일반 Redis 명령용 client와 분리해서 사용한다.
//
// 이유:
//   Redis client가 subscribe 모드에 들어가면 일반 명령 처리에 제약이 생길 수 있으므로,
//   Pub/Sub 전용 client를 별도로 생성한다.
// ============================================================

const { redisManager } = require('./RedisManager');
const logger = require('../utils/logger');

class PubSubService {
  constructor() {
    this.subscriber = null;
    this.isConnected = false;
    this.subscriptions = new Map();
  }

  // ----------------------------------------------------------
  // connect
  // Input  : 없음
  // Output : Promise<void>
  // 설명  : Redis subscriber 전용 client 생성 및 연결
  // ----------------------------------------------------------
  async connect() {
    if (this.subscriber && this.isConnected) {
      logger.info('[PubSubService] Redis subscriber already connected');
      return;
    }

    // subscriber 객체는 남아 있는데 연결 상태가 아닌 경우 정리 후 재생성
    if (this.subscriber && !this.isConnected) {
      try {
        await this.subscriber.disconnect();
      } catch (error) {
        logger.warn('[PubSubService] stale subscriber disconnect failed', error);
      }

      this.subscriber = null;
    }

    try {
      const baseClient = redisManager.getClient();

      if (!baseClient) {
        throw new Error('Redis base client is not initialized');
      }

      // 일반 Redis client를 복제해서 Pub/Sub 전용 client 생성
      this.subscriber = baseClient.duplicate();

      this.subscriber.on('error', (error) => {
        logger.error('[PubSubService] Redis subscriber error', error);
      });

      this.subscriber.on('connect', () => {
        logger.info('[PubSubService] Redis subscriber connected');
      });

      this.subscriber.on('end', () => {
        logger.warn('[PubSubService] Redis subscriber connection ended');
        this.isConnected = false;
      });

      await this.subscriber.connect();

      this.isConnected = true;
      logger.info('[PubSubService] Redis subscriber ready');
    } catch (error) {
      this.isConnected = false;
      logger.error('[PubSubService] Redis subscriber connect failed', error);
      throw error;
    }
  }

  // ----------------------------------------------------------
  // subscribe
  // Input  : channel — 구독할 Redis channel 이름
  //          handler — 메시지 수신 시 실행할 함수
  // Output : Promise<void>
  // 설명  : 특정 channel을 구독하고 메시지를 handler로 넘긴다.
  // ----------------------------------------------------------
  async subscribe(channel, handler) {
    if (!channel) {
      throw new Error('channel is required');
    }

    if (typeof handler !== 'function') {
      throw new Error('handler must be a function');
    }

    if (!this.subscriber || !this.isConnected) {
      await this.connect();
    }

    if (this.subscriptions.has(channel)) {
      logger.warn(`[PubSubService] Already subscribed channel: ${channel}`);
      return;
    }

    await this.subscriber.subscribe(channel, async (message) => {
      try {
        await handler(message, channel);
      } catch (error) {
        logger.error(
          `[PubSubService] Handler error on channel=${channel}`,
          error
        );
      }
    });

    this.subscriptions.set(channel, handler);
    logger.info(`[PubSubService] Subscribed channel: ${channel}`);
  }

  // ----------------------------------------------------------
  // unsubscribe
  // Input  : channel — 구독 해제할 Redis channel 이름
  // Output : Promise<void>
  // 설명  : 특정 channel 구독 해제
  // ----------------------------------------------------------
  async unsubscribe(channel) {
    if (!this.subscriber || !this.isConnected) {
      return;
    }

    if (!this.subscriptions.has(channel)) {
      return;
    }

    await this.subscriber.unsubscribe(channel);
    this.subscriptions.delete(channel);

    logger.info(`[PubSubService] Unsubscribed channel: ${channel}`);
  }

  // ----------------------------------------------------------
  // disconnect
  // Input  : 없음
  // Output : Promise<void>
  // 설명  : 서버 종료 시 subscriber 연결 종료
  // ----------------------------------------------------------
  async disconnect() {
    if (!this.subscriber) {
      return;
    }

    try {
      for (const channel of this.subscriptions.keys()) {
        await this.subscriber.unsubscribe(channel);
      }

      this.subscriptions.clear();

      if (this.isConnected) {
        try {
          await this.subscriber.quit();
        } catch (error) {
          logger.warn(
            '[PubSubService] Redis subscriber quit failed, force disconnect',
            error
          );

          await this.subscriber.disconnect();
        }
      }

      this.subscriber = null;
      this.isConnected = false;

      logger.info('[PubSubService] Redis subscriber disconnected');
    } catch (error) {
      logger.error('[PubSubService] Redis subscriber disconnect failed', error);
      this.subscriber = null;
      this.isConnected = false;
    }
  }
}

const pubSubService = new PubSubService();

module.exports = {
  pubSubService
};