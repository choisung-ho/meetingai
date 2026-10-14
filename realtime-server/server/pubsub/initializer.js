// ============================================================
// server/pubsub/initializer.js
// ============================================================
// 역할:
//   서버 시작 시 필요한 Redis Pub/Sub 구독들을 한 곳에서 등록한다.
//
// 이유:
//   mainServer.js가 Alert, Document, Issue, Transcript 같은
//   개별 Pub/Sub 구독자를 직접 알지 않도록 분리한다.
// ============================================================

const { alertSubscriber } = require('./alertSubscriber');
const { realtimeEventSubscriber } = require('./realtimeEventSubscriber');
const logger = require('../utils/logger');

class PubSubInitializer {
  constructor() {
    this.isStarted = false;
  }

  // ----------------------------------------------------------
  // start
  // Input  : wss — WebSocketServer 인스턴스
  // Output : Promise<void>
  // 설명  : 전체 Pub/Sub 구독 초기화
  // ----------------------------------------------------------
  async start(wss) {
    if (!wss) {
      throw new Error('[PubSubInitializer] wss is required');
    }

    if (this.isStarted) {
      logger.warn('[PubSubInitializer] already started');
      return;
    }

    await alertSubscriber.start(wss);
    // FastAPI는 realtime.events 단일 채널에 문서/STT/분석 이벤트를
    // 발행한다. 전용 채널 subscriber를 함께 시작하면 중복/유실이
    // 발생하므로 RealtimeEventSubscriber 하나만 canonical consumer로 사용한다.
    await realtimeEventSubscriber.start(wss);

    this.isStarted = true;
    logger.info('[PubSubInitializer] Pub/Sub subscriptions started');
  }

  // ----------------------------------------------------------
  // stop
  // Input  : 없음
  // Output : Promise<void>
  // 설명  : 전체 Pub/Sub 구독 해제
  // ----------------------------------------------------------
  async stop() {
    if (!this.isStarted) {
      logger.warn('[PubSubInitializer] already stopped');
      return;
    }

    await realtimeEventSubscriber.stop();
    await alertSubscriber.stop();

    this.isStarted = false;
    logger.info('[PubSubInitializer] Pub/Sub subscriptions stopped');
  }
}

const pubSubInitializer = new PubSubInitializer();

module.exports = {
  pubSubInitializer
};
