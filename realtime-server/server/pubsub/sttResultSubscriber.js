// Redis Pub/Sub stt.created / stt.updated를 회의방 WebSocket 이벤트로 변환한다.
// STT 결과는 multipart 오디오 처리나 FastAPI REST 요청에서 생성되므로
// WebSocket 서버가 생성 자체를 수행하지 않고, 완료 이벤트만 전달한다.

const { pubSubService } = require('../redis/pubsubService');
const logger = require('../utils/logger');
const broadcastService = require('../services/broadcastService');
const { STT_RESULT_PUBSUB_CHANNELS } = require('../websocket/events/sttResultEvents');

function normalizeEvent(event) {
  if (event && typeof event === 'object' && event.type && event.payload) {
    return event;
  }

  if (event && typeof event === 'object' && event.type) {
    return { type: event.type, payload: event };
  }

  return null;
}

function hasMeetingContext(payload) {
  return Boolean(
    payload &&
      Number.isFinite(Number(payload.workspace_id ?? payload.workspaceId)) &&
      Number(payload.workspace_id ?? payload.workspaceId) > 0 &&
      Number.isFinite(Number(payload.meeting_id ?? payload.meetingId)) &&
      Number(payload.meeting_id ?? payload.meetingId) > 0
  );
}

class SttResultSubscriber {
  constructor() {
    this.isStarted = false;
  }

  async start(wss) {
    if (!wss) throw new Error('[SttResultSubscriber] wss is required');
    if (this.isStarted) return;

    await Promise.all([
      pubSubService.subscribe(
        STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_CREATED,
        this.handleMessage.bind(this)
      ),
      pubSubService.subscribe(
        STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_UPDATED,
        this.handleMessage.bind(this)
      ),
    ]);
    this.isStarted = true;
    logger.info('[SttResultSubscriber] Subscribed Redis channels stt.created, stt.updated');
  }

  async handleMessage(rawMessage, channel) {
    let event;
    try {
      event = normalizeEvent(JSON.parse(rawMessage));
    } catch (error) {
      logger.warn(`[SttResultSubscriber] invalid JSON channel=${channel}`, error);
      return;
    }

    if (!event || !hasMeetingContext(event.payload)) {
      logger.warn(`[SttResultSubscriber] invalid meeting context channel=${channel}`);
      return;
    }

    const payload = event.payload;
    const workspaceId = Number(payload.workspace_id ?? payload.workspaceId);
    const meetingId = Number(payload.meeting_id ?? payload.meetingId);

    try {
      if (event.type === STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_CREATED) {
        await broadcastService.broadcastSttResultCreated({
          workspaceId,
          meetingId,
          sttResultId: Number(payload.stt_result_id ?? payload.sttResultId),
          status: payload.status ?? null,
          utteranceCount: payload.utterance_count ?? payload.utteranceCount ?? 0,
        });
      } else if (event.type === STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_UPDATED) {
        await broadcastService.broadcastSttResultUpdated({
          workspaceId,
          meetingId,
          sttResultId: Number(payload.stt_result_id ?? payload.sttResultId),
          status: payload.status ?? null,
          changedFields: payload.changed_fields ?? payload.changedFields ?? [],
        });
      }
    } catch (error) {
      logger.error(`[SttResultSubscriber] event processing failed type=${event.type}`, error);
    }
  }

  async stop() {
    if (!this.isStarted) return;
    await Promise.all([
      pubSubService.unsubscribe(STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_CREATED),
      pubSubService.unsubscribe(STT_RESULT_PUBSUB_CHANNELS.STT_RESULT_UPDATED),
    ]);
    this.isStarted = false;
  }
}

const sttResultSubscriber = new SttResultSubscriber();

module.exports = { sttResultSubscriber };
