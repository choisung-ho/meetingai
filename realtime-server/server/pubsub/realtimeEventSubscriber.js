// ============================================================
// server/pubsub/realtimeEventSubscriber.js
// ============================================================
// 역할:
//   FastAPI가 발행하는 realtime.events 채널을 구독한다.
//   Phase 4 AI/RAG 판단 결과(안건 추출, 재논의 탐지)와 실시간 발화 이벤트를
//   WebSocket 이벤트로 변환해 회의방 참여자에게 전달한다.
//
// 수신 이벤트 (FastAPI type 기준):
//   - utterance.created   → TRANSCRIPT
//   - utterance.partial   → TRANSCRIPT_PARTIAL
//   - analysis.completed  → ANALYSIS_COMPLETED
//   - topic.created       → TOPIC_CREATED
//   - topic.decided       → TOPIC_DECIDED
//   - topic.revisited     → TOPIC_REVISITED  (+ ALERT_CREATED)
//   - topic.redecided     → TOPIC_REDECIDED
//   - topic.updated       → TOPIC_UPDATED
//   - ai_analysis.updated → AI_ANALYSIS_UPDATED
//
// 재논의 Alert:
//   topic.revisited에는 FastAPI가 생성한 alertId와 재논의한 화자가 실려 있다.
//   이를 ALERT_CREATED 포맷으로 변환해 함께 전달한다.
//
//   {
//     type: "ALERT_CREATED",
//     alert: {
//       level: "warning",
//       message: "이전에 결정된 안건이 다시 논의되고 있습니다.",
//       topicId: 12,
//       speaker: "Speaker 1"
//     }
//   }
//
// 주의:
//   alert.created 채널은 alertSubscriber가 별도로 담당한다.
//   여기서는 재논의 맥락(안건/화자)이 포함된 알림만 추가로 전달한다.
// ============================================================

const { pubSubService } = require('../redis/pubsubService');
const logger = require('../utils/logger');
const broadcastService = require('../services/broadcastService');

const {
  TRANSCRIPT_PUBSUB_CHANNELS,
  TRANSCRIPT_SERVER_EVENTS,
  FASTAPI_EVENT_TO_SERVER_EVENT
} = require('../websocket/events/transcriptEvents');

const { ALERT_SERVER_EVENTS } = require('../websocket/events/alertEvents');
const { DOCUMENT_SERVER_EVENTS } = require('../websocket/events/documentEvents');

const REDISCUSSION_ALERT_MESSAGE = '이전에 결정된 안건이 다시 논의되고 있습니다.';

class RealtimeEventSubscriber {
  constructor() {
    this.wss = null;
    this.isStarted = false;
    this.channel = TRANSCRIPT_PUBSUB_CHANNELS.REALTIME_EVENTS;
  }

  // ----------------------------------------------------------
  // start
  // Input  : wss — WebSocketServer 인스턴스
  // Output : Promise<void>
  // ----------------------------------------------------------
  async start(wss) {
    if (!wss) {
      throw new Error('[RealtimeEventSubscriber] wss is required');
    }

    if (this.isStarted) {
      logger.warn('[RealtimeEventSubscriber] already started');
      return;
    }

    this.wss = wss;

    await pubSubService.subscribe(this.channel, this.handleEvent.bind(this));

    this.isStarted = true;
    logger.info(`[RealtimeEventSubscriber] Subscribed Redis channel: ${this.channel}`);
  }

  // ----------------------------------------------------------
  // handleEvent
  // Input  : rawMessage — Redis에서 수신한 원본 문자열
  //          channel    — 수신 channel 이름
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleEvent(rawMessage, channel) {
    let event;

    try {
      event = JSON.parse(rawMessage);
    } catch (error) {
      logger.error(
        '[RealtimeEventSubscriber] JSON 형식이 아닌 Pub/Sub 메시지를 수신했습니다.',
        error
      );
      return;
    }

    if (!event || typeof event !== 'object' || typeof event.type !== 'string' || !event.type) {
      logger.warn('[RealtimeEventSubscriber] type이 없는 이벤트를 무시합니다.');
      return;
    }

    const serverEventType = FASTAPI_EVENT_TO_SERVER_EVENT[event.type];

    if (!serverEventType) {
      // 지원하지 않는 이벤트는 무시한다. 문서/STT도 이 단일 subscriber가
      // 처리하므로 별도 채널 subscriber에 의존하지 않는다.
      logger.info(
        `[RealtimeEventSubscriber] 처리 대상이 아닌 이벤트 무시: channel=${channel}, type=${event.type}`
      );
      return;
    }

    // workspace 문서는 meeting_id=null이다. 모든 document.* 이벤트는
    // workspace 범위에서도 정상적으로 전달되어야 한다.
    const isDocumentEvent = event.type.startsWith('document.');
    const workspaceId = Number(event.workspace_id);
    const meetingId = event.meeting_id == null ? null : Number(event.meeting_id);
    if (!Number.isInteger(workspaceId) || workspaceId <= 0 ||
        (!isDocumentEvent && (!Number.isInteger(meetingId) || meetingId <= 0))) {
      logger.warn(
        `[RealtimeEventSubscriber] workspace_id/meeting_id 없는 이벤트 무시: type=${event.type}`
      );
      return;
    }
    // 이후 dispatch에서 항상 정규화된 숫자 ID를 사용한다.
    event.workspace_id = workspaceId;
    event.meeting_id = meetingId;

    try {
      await this.dispatch(serverEventType, event);
    } catch (error) {
      logger.error(
        `[RealtimeEventSubscriber] 이벤트 처리 실패: type=${event.type}, reason=${error.message}`
      );
    }
  }

  // ----------------------------------------------------------
  // dispatch
  // Input  : serverEventType — 변환된 WebSocket 서버 이벤트 타입
  //          event           — FastAPI 이벤트 payload
  // Output : Promise<void>
  // ----------------------------------------------------------
  async dispatch(serverEventType, event) {
    switch (serverEventType) {
      case TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT:
        await broadcastService.broadcastTranscript({
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id,
          chunkId: event.chunk_id ?? null,
          utterance: event.utterance ?? event
        });
        return;

      case TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT_PARTIAL: {
        const utterance = event.utterance ?? {};
        await broadcastService.broadcastTranscriptPartial({
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id,
          chunkId: event.chunk_id ?? null,
          speaker: utterance.speaker_label ?? null,
          text: utterance.text ?? ''
        });
        return;
      }

      case TRANSCRIPT_SERVER_EVENTS.ANALYSIS_COMPLETED:
        await broadcastService.broadcastAnalysisCompleted(event);
        return;

      case TRANSCRIPT_SERVER_EVENTS.AI_ANALYSIS_UPDATED:
        await broadcastService.broadcastAiAnalysisUpdated(event);
        return;

      case DOCUMENT_SERVER_EVENTS.DOCUMENT_PROCESSED:
        await broadcastService.broadcastDocumentProcessed({
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id ?? null,
          documentId: event.document_id,
          status: event.status,
          chunkCount: event.chunk_count ?? 0
        });
        return;

      case DOCUMENT_SERVER_EVENTS.DOCUMENT_UPLOADED:
        await broadcastService.broadcastDocumentUploaded(null, {
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id ?? null,
          document: {
            ...(event.document && typeof event.document === 'object' ? event.document : {}),
            id: event.document_id ?? event.id,
            workspace_id: event.workspace_id,
            meeting_id: event.meeting_id ?? null,
            original_filename: event.original_filename,
            content_type: event.content_type,
            file_size: event.file_size,
            status: event.status,
            created_at: event.created_at
          }
        });
        return;

      case DOCUMENT_SERVER_EVENTS.DOCUMENT_DELETED:
        await broadcastService.broadcastDocumentDeleted(
          null,
          {
            workspaceId: event.workspace_id,
            meetingId: event.meeting_id ?? null,
            documentId: event.document_id ?? event.id
          },
          { workspaceId: event.workspace_id, meetingId: event.meeting_id ?? null }
        );
        return;

      case 'STT_RESULT_CREATED':
        await broadcastService.broadcastSttResultCreated({
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id,
          sttResultId: event.stt_result_id ?? event.id,
          status: event.status,
          utteranceCount: event.utterance_count ?? 0
        });
        return;

      case 'STT_RESULT_UPDATED':
        await broadcastService.broadcastSttResultUpdated({
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id,
          sttResultId: event.stt_result_id ?? event.id,
          status: event.status,
          changedFields: event.changed_fields ?? []
        });
        return;

      case 'STT_RESULT_DELETED':
        await broadcastService.broadcastSttResultDeleted(
          null,
          {
            workspaceId: event.workspace_id,
            meetingId: event.meeting_id,
            sttResultId: event.stt_result_id ?? event.id,
          },
          { workspaceId: event.workspace_id, meetingId: event.meeting_id }
        );
        return;

      case TRANSCRIPT_SERVER_EVENTS.TOPIC_REVISITED:
        await broadcastService.broadcastTopicEvent(serverEventType, event);
        await this.broadcastRediscussionAlert(event);
        return;

      default:
        // TOPIC_CREATED / TOPIC_DECIDED / TOPIC_REDECIDED / TOPIC_UPDATED
        await broadcastService.broadcastTopicEvent(serverEventType, event);
    }
  }

  // ----------------------------------------------------------
  // broadcastRediscussionAlert
  // Input  : event — topic.revisited 이벤트 payload
  // Output : Promise<void>
  //
  // 역할:
  //   재논의 감지 시 speaker 정보를 포함한 ALERT_CREATED 이벤트를 전달한다.
  // ----------------------------------------------------------
  async broadcastRediscussionAlert(event) {
    const response = {
      type: ALERT_SERVER_EVENTS.ALERT_CREATED,
      requestId: null,
      success: true,
      payload: {
        alert: {
          id: event.alert_id ?? null,
          level: 'warning',
          status: 'PENDING',
          message: REDISCUSSION_ALERT_MESSAGE,
          workspaceId: event.workspace_id,
          meetingId: event.meeting_id,
          topicId: event.topic_id ?? null,
          topicLabel: event.topic_label ?? null,
          speaker: event.revisited_by ?? null,
          utteranceId: event.utterance_id ?? null,
          similarity: event.similarity ?? null
        }
      }
    };

    await broadcastService.broadcastToMeeting({
      workspaceId: event.workspace_id,
      meetingId: event.meeting_id,
      response,
      eventName: 'ALERT_CREATED(재논의)'
    });
  }

  // ----------------------------------------------------------
  // stop
  // Input  : 없음
  // Output : Promise<void>
  // ----------------------------------------------------------
  async stop() {
    if (!this.isStarted) {
      logger.warn('[RealtimeEventSubscriber] already stopped');
      return;
    }

    await pubSubService.unsubscribe(this.channel);

    this.wss = null;
    this.isStarted = false;

    logger.info(`[RealtimeEventSubscriber] Unsubscribed Redis channel: ${this.channel}`);
  }
}

const realtimeEventSubscriber = new RealtimeEventSubscriber();

module.exports = {
  realtimeEventSubscriber
};
