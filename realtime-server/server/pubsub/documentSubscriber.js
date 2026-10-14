// ============================================================
// server/pubsub/documentSubscriber.js
// ============================================================
// 역할:
//   Redis Pub/Sub의 document.uploaded 채널을 구독한다.
//   FastAPI에서 발행한 Document 서버 이벤트를 Node.js가 수신하는 진입점이다.
//
// 현재 단계:
//   1. document.uploaded 구독
//   2. rawMessage 수신
//   3. JSON.parse
//   4. FastAPI 응답 구조를 Pub/Sub 내부 이벤트 구조로 변환
//   5. Pub/Sub 이벤트 공통/세부 검증
//   6. documentRealtimeService로 실시간 브로드캐스트 처리 위임
//
// 기준:
//   - meeting_id가 number이면 회의 내부 문서이다.
//   - meeting_id가 null이면 workspace/대시보드 문서이다.
//   - 이 파일은 meeting_id 기준으로 직접 브로드캐스트 대상을 나누지 않는다.
//   - meeting_id 분기 처리는 documentRealtimeService 또는 broadcastService에서 한다.
// ============================================================

const { pubSubService } = require('../redis/pubsubService');
const logger = require('../utils/logger');

const {
  DOCUMENT_PUBSUB_CHANNELS
} = require('../websocket/events/documentEvents');

const {
  validatePubSubEvent
} = require('./schemas/pubSubEventValidator');

const documentRealtimeService = require('../services/documentRealtimeService');

// ----------------------------------------------------------
// normalizeDocumentUploadedEvent
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
//        data: { ...document }
//      }
//
//   2) Pub/Sub 표준 구조
//      {
//        type: 'document.uploaded',
//        payload: { ...document }
//      }
//
// 기준:
//   - payload.meeting_id가 null이어도 정상 payload로 유지한다.
//   - workspace 문서와 meeting 문서 구분은 meeting_id 값으로 한다.
// ----------------------------------------------------------
function normalizeDocumentUploadedEvent(event) {
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
      type: DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED,
      payload: event.data
    };
  }

  // 그 외 구조는 그대로 넘겨서 validator에서 실패 처리
  return event;
}

class DocumentSubscriber {
  constructor() {
    this.wss = null;
    this.isStarted = false;
  }

  // ----------------------------------------------------------
  // start
  // Input  : wss — WebSocketServer 인스턴스
  // Output : Promise<void>
  // 설명  : document.uploaded Redis channel 구독 시작
  // ----------------------------------------------------------
  async start(wss) {
    if (!wss) {
      throw new Error('[DocumentSubscriber] wss is required');
    }

    if (this.isStarted) {
      logger.warn('[DocumentSubscriber] already started');
      return;
    }

    this.wss = wss;

    await pubSubService.subscribe(
      DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED,
      this.handleDocumentUploaded.bind(this)
    );

    this.isStarted = true;

    logger.info(
      `[DocumentSubscriber] Subscribed Redis channel: ${DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED}`
    );
  }

  // ----------------------------------------------------------
  // handleDocumentUploaded
  // Input  : rawMessage — Redis에서 수신한 원본 문자열
  //          channel    — 수신 channel 이름
  // Output : Promise<void>
  //
  // 설명:
  //   document.uploaded 메시지 수신 처리
  //
  // 기준:
  //   - payload.meeting_id가 number이면 회의 내부 문서 업로드 이벤트이다.
  //   - payload.meeting_id가 null이면 workspace 문서 업로드 이벤트이다.
  //   - 여기서는 분기하지 않고 payload를 그대로 documentRealtimeService로 넘긴다.
  // ----------------------------------------------------------
  async handleDocumentUploaded(rawMessage, channel) {
    logger.info(`[DocumentSubscriber] Message received: channel=${channel}`);

    let event;

    try {
      event = JSON.parse(rawMessage);
    } catch (error) {
      logger.error(
        '[DocumentSubscriber] JSON 형식이 아닌 Pub/Sub 메시지를 수신했습니다.',
        error
      );
      return;
    }

    // FastAPI 응답 구조 { status, data }를
    // Node Pub/Sub 내부 구조 { type, payload }로 변환
    event = normalizeDocumentUploadedEvent(event);

    const validation = validatePubSubEvent(event);

    if (!validation.valid) {
      logger.warn(`[DocumentSubscriber] Pub/Sub 이벤트 검증 실패: ${validation.message}`);
      return;
    }

    const payload = event.payload;
    const documentScope =
      payload.meeting_id === undefined || payload.meeting_id === null
        ? 'workspace'
        : 'meeting';

    logger.info('[DocumentSubscriber] document.uploaded payload received', {
      scope: documentScope,
      documentId: payload.id,
      workspaceId: payload.workspace_id,
      meetingId: payload.meeting_id ?? null
    });

    try {
      await documentRealtimeService.processDocumentUploaded(payload);
    } catch (error) {
      logger.error('[DocumentSubscriber] document.uploaded 실시간 처리 실패', error);
    }
  }

  // ----------------------------------------------------------
  // stop
  // Input  : 없음
  // Output : Promise<void>
  // 설명  : document.uploaded Redis channel 구독 해제
  // ----------------------------------------------------------
  async stop() {
    if (!this.isStarted) {
      logger.warn('[DocumentSubscriber] already stopped');
      return;
    }

    await pubSubService.unsubscribe(DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED);

    this.wss = null;
    this.isStarted = false;

    logger.info(
      `[DocumentSubscriber] Unsubscribed Redis channel: ${DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED}`
    );
  }
}

const documentSubscriber = new DocumentSubscriber();

module.exports = {
  documentSubscriber
};