// ============================================================
// server/pubsub/alertSubscriber.js
// ============================================================
// 역할:
//   Redis Pub/Sub의 alert.created 채널을 구독한다.
//   FastAPI에서 발행한 Alert 서버 이벤트를 Node.js가 수신하는 진입점이다.
//
// 현재 단계:
//   1. alert.created 구독
//   2. rawMessage 수신
//   3. JSON.parse
//   4. FastAPI 응답 구조를 Pub/Sub 내부 이벤트 구조로 변환
//   5. Pub/Sub 이벤트 공통/세부 검증
//   6. alertRealtimeService로 실시간 브로드캐스트 처리 위임
// ============================================================

const { pubSubService } = require('../redis/pubsubService');
const logger = require('../utils/logger');

const {
  ALERT_PUBSUB_CHANNELS
} = require('../websocket/events/alertEvents');

const {
  validatePubSubEvent
} = require('./schemas/pubSubEventValidator');

const alertRealtimeService = require('../services/alertRealtimeService');

// ----------------------------------------------------------
// normalizeAlertCreatedEvent
// Input  : event — Redis Pub/Sub에서 JSON.parse한 이벤트 객체
// Output : object
//
// 역할:
//   FastAPI 응답 구조 또는 Pub/Sub 표준 구조를
//   Node 내부 Pub/Sub 검증 구조로 정규화한다.
//
// 지원 구조:
//   1) FastAPI 응답 구조
//      {
//        status: 'success',
//        data: { ...alert }
//      }
//
//   2) Pub/Sub 표준 구조
//      {
//        type: 'alert.created',
//        payload: { ...alert }
//      }
// ----------------------------------------------------------
function normalizeAlertCreatedEvent(event) {
  // 이미 Node Pub/Sub 표준 구조면 그대로 사용
  if (
    event &&
    typeof event === 'object' &&
    event.type &&
    event.payload
  ) {
    return event;
  }

  // FastAPI success 응답 구조를 Pub/Sub 내부 구조로 변환
  if (
    event &&
    typeof event === 'object' &&
    event.status === 'success' &&
    event.data &&
    typeof event.data === 'object' &&
    !Array.isArray(event.data)
  ) {
    return {
      type: ALERT_PUBSUB_CHANNELS.ALERT_CREATED,
      payload: event.data
    };
  }

  // 그 외 구조는 그대로 넘겨서 validator에서 실패 처리
  return event;
}

class AlertSubscriber {
  constructor() {
    this.wss = null;
    this.isStarted = false;
  }

  // ----------------------------------------------------------
  // start
  // Input  : wss — WebSocketServer 인스턴스
  // Output : Promise<void>
  // 설명  : alert.created Redis channel 구독 시작
  // ----------------------------------------------------------
  async start(wss) {
    if (!wss) {
      throw new Error('[AlertSubscriber] wss is required');
    }

    if (this.isStarted) {
      logger.warn('[AlertSubscriber] already started');
      return;
    }

    this.wss = wss;

    await pubSubService.subscribe(
      ALERT_PUBSUB_CHANNELS.ALERT_CREATED,
      this.handleAlertCreated.bind(this)
    );

    this.isStarted = true;

    logger.info(
      `[AlertSubscriber] Subscribed Redis channel: ${ALERT_PUBSUB_CHANNELS.ALERT_CREATED}`
    );
  }

  // ----------------------------------------------------------
  // handleAlertCreated
  // Input  : rawMessage — Redis에서 수신한 원본 문자열
  //          channel    — 수신 channel 이름
  // Output : Promise<void>
  // 설명  : alert.created 메시지 수신 처리
  // ----------------------------------------------------------
  async handleAlertCreated(rawMessage, channel) {
    logger.info(`[AlertSubscriber] Message received: channel=${channel}`);

    let event;

    try {
      event = JSON.parse(rawMessage);
    } catch (error) {
      logger.error(
        '[AlertSubscriber] JSON 형식이 아닌 Pub/Sub 메시지를 수신했습니다.',
        error
      );
      return;
    }

    // FastAPI 응답 구조 { status, data }를
    // Node Pub/Sub 내부 구조 { type, payload }로 변환
    event = normalizeAlertCreatedEvent(event);

    const validation = validatePubSubEvent(event);

    if (!validation.valid) {
      logger.warn(`[AlertSubscriber] Pub/Sub 이벤트 검증 실패: ${validation.message}`);
      return;
    }

    logger.info('[AlertSubscriber] alert.created payload received', {
      payload: event.payload
    });

    try {
      await alertRealtimeService.processAlertCreated(event.payload);
    } catch (error) {
      logger.error('[AlertSubscriber] alert.created 실시간 처리 실패', error);
    }
  }

  // ----------------------------------------------------------
  // stop
  // Input  : 없음
  // Output : Promise<void>
  // 설명  : alert.created Redis channel 구독 해제
  // ----------------------------------------------------------
  async stop() {
    if (!this.isStarted) {
      logger.warn('[AlertSubscriber] already stopped');
      return;
    }

    await pubSubService.unsubscribe(ALERT_PUBSUB_CHANNELS.ALERT_CREATED);

    this.wss = null;
    this.isStarted = false;

    logger.info(
      `[AlertSubscriber] Unsubscribed Redis channel: ${ALERT_PUBSUB_CHANNELS.ALERT_CREATED}`
    );
  }
}

const alertSubscriber = new AlertSubscriber();

module.exports = {
  alertSubscriber
};