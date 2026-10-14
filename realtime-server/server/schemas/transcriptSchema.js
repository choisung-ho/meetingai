// ============================================================
// server/schemas/transcriptSchema.js
// ============================================================
// 역할:
//   실시간 발화(Transcript) 및 Phase 4 AI 분석 이벤트의
//   요청 검증 스키마와 서버 → 클라이언트 응답/브로드캐스트 생성 함수를 정의한다.
//
// 대상 이벤트:
//   - TRANSCRIPT_CHUNK        (Client → Server)
//   - TRANSCRIPT_CHUNK_ACK    (Server → 요청 Client)
//   - TRANSCRIPT / TRANSCRIPT_PARTIAL          (Server → 회의방 broadcast)
//   - TOPIC_CREATED / DECIDED / REVISITED / REDECIDED / UPDATED
//   - ANALYSIS_COMPLETED, AI_ANALYSIS_UPDATED
//
// 규칙:
//   - WebSocket payload는 camelCase를 사용한다.
//   - FastAPI 요청/응답 필드는 snake_case이므로 이 파일에서 변환한다.
//   - 화자 라벨은 FastAPI가 정규화한 canonical 값(Speaker 1 / Speaker 2 / Unknown)을 그대로 쓴다.
// ============================================================

const {
  TRANSCRIPT_SERVER_EVENTS
} = require('../websocket/events/transcriptEvents');

const UNKNOWN_SPEAKER = 'Unknown';

// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// TRANSCRIPT_CHUNK
// Client → WebSocket Server
//
// FastAPI:
//   POST /realtime/meetings/{meeting_id}/chunks
//
// payload:
//   chunkId   — STT 엔진이 부여한 chunk 식별자 (중복 방지 키)
//   text      — 인식된 발화 텍스트
//   isFinal   — false면 저장하지 않고 partial broadcast만 수행
//   speakerEmbedding — STT/Diarization 엔진이 만든 화자 embedding (선택)
// ------------------------------------------------------------
const TRANSCRIPT_CHUNK_SCHEMA = {
  type: 'object',
  required: ['type', 'requestId', 'payload'],
  additionalProperties: false,
  properties: {
    type: { type: 'string' },
    requestId: { type: 'string' },
    payload: {
      type: 'object',
      required: ['workspaceId', 'meetingId', 'chunkId', 'text'],
      additionalProperties: false,
      properties: {
        workspaceId: { type: 'number' },
        meetingId: { type: 'number' },
        meetingRoomId: { type: ['number', 'null'] },
        sttResultId: { type: ['number', 'null'] },
        chunkId: { type: 'string', minLength: 1, maxLength: 100 },
        text: { type: 'string', minLength: 1 },
        sequence: { type: ['number', 'null'] },
        speakerLabel: { type: ['string', 'null'] },
        speakerEmbedding: {
          type: ['array', 'null'],
          items: { type: 'number' },
          maxItems: 2048
        },
        startMs: { type: ['number', 'null'] },
        endMs: { type: ['number', 'null'] },
        language: { type: ['string', 'null'] },
        isFinal: { type: 'boolean' }
      }
    }
  }
};

// ============================================================
// 변환 함수
// ============================================================

// ------------------------------------------------------------
// toFastApiChunk
// Input  : WebSocket payload (camelCase)
// Output : FastAPI 요청 body (snake_case)
//
// 설명:
//   null/undefined 필드는 제거해 FastAPI 검증 오류를 피한다.
// ------------------------------------------------------------
function toFastApiChunk(payload) {
  const chunk = {
    chunk_id: payload.chunkId,
    text: payload.text,
    is_final: payload.isFinal !== false
  };

  if (payload.sttResultId != null) chunk.stt_result_id = payload.sttResultId;
  if (payload.sequence != null) chunk.sequence = payload.sequence;
  if (payload.speakerLabel != null) chunk.speaker_label = payload.speakerLabel;
  if (payload.speakerEmbedding != null) chunk.speaker_embedding = payload.speakerEmbedding;
  if (payload.startMs != null) chunk.start_ms = payload.startMs;
  if (payload.endMs != null) chunk.end_ms = payload.endMs;
  if (payload.language != null) chunk.language = payload.language;

  return chunk;
}

// ------------------------------------------------------------
// normalizeUtterance
// Input  : FastAPI utterance 객체 (snake_case 또는 camelCase)
// Output : WebSocket payload용 발화 객체 (camelCase)
// ------------------------------------------------------------
function normalizeUtterance(utterance = {}) {
  return {
    utteranceId: utterance.id ?? utterance.utterance_id ?? utterance.utteranceId ?? null,
    sttResultId: utterance.stt_result_id ?? utterance.sttResultId ?? null,
    sequence: utterance.sequence ?? null,
    speaker: utterance.speaker_label ?? utterance.speakerLabel ?? UNKNOWN_SPEAKER,
    text: utterance.text ?? '',
    startMs: utterance.start_ms ?? utterance.startMs ?? null,
    endMs: utterance.end_ms ?? utterance.endMs ?? null,
    isFinal: utterance.is_final ?? utterance.isFinal ?? true
  };
}

// ============================================================
// ACK 응답 (Server → 요청 Client)
// ============================================================

const transcriptChunkAck = (requestId, result = {}) => ({
  type: TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT_CHUNK_ACK,
  requestId: requestId ?? null,
  success: true,
  payload: {
    chunkId: result.chunk_id ?? result.chunkId ?? null,
    sttResultId: result.stt_result_id ?? result.sttResultId ?? null,
    utteranceId: result.utterance_id ?? result.utteranceId ?? null,
    sequence: result.sequence ?? null,
    bufferedCount: result.buffered_count ?? result.bufferedCount ?? 0,
    analysisStatus: result.analysis_status ?? result.analysisStatus ?? 'unknown'
  }
});

// ============================================================
// Broadcast (Server → 회의방 참여자)
// ============================================================

// ------------------------------------------------------------
// transcriptBroadcast
//
// 이벤트 포맷 (Phase 4 명세):
//   {
//     type: "TRANSCRIPT",
//     speaker: "Speaker 1",
//     text: "이 기능 다음 분기에 적용하죠."
//   }
//
// 위 필수 3개 필드는 payload 최상단에 그대로 두고,
// 화면 동기화에 필요한 식별자를 함께 실어 보낸다.
// ------------------------------------------------------------
const transcriptBroadcast = ({ workspaceId, meetingId, chunkId, utterance }) => {
  const normalized = normalizeUtterance(utterance);

  return {
    type: TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT,
    requestId: null,
    success: true,
    payload: {
      speaker: normalized.speaker,
      text: normalized.text,
      workspaceId,
      meetingId,
      chunkId: chunkId ?? null,
      ...normalized
    }
  };
};

// ------------------------------------------------------------
// transcriptPartialBroadcast
//   is_final=false 인 중간 인식 결과. 저장되지 않는다.
// ------------------------------------------------------------
const transcriptPartialBroadcast = ({ workspaceId, meetingId, chunkId, speaker, text }) => ({
  type: TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT_PARTIAL,
  requestId: null,
  success: true,
  payload: {
    speaker: speaker || UNKNOWN_SPEAKER,
    text: text ?? '',
    workspaceId,
    meetingId,
    chunkId: chunkId ?? null,
    isFinal: false
  }
});

// ------------------------------------------------------------
// topicBroadcast
//   FastAPI realtime.events의 topic.* 이벤트를 WebSocket 이벤트로 변환한다.
//
//   재논의(topic.revisited)에는 누가 재논의했는지(revisitedBy)와
//   유사도(similarity)가 함께 실린다.
// ------------------------------------------------------------
const topicBroadcast = (serverEventType, event = {}) => ({
  type: serverEventType,
  requestId: null,
  success: true,
  payload: {
    workspaceId: event.workspace_id ?? null,
    meetingId: event.meeting_id ?? null,
    topicId: event.topic_id ?? null,
    topicLabel: event.topic_label ?? null,
    status: event.status ?? null,
    proposedBy: event.proposed_by ?? null,
    decidedBy: event.decided_by ?? null,
    revisitedBy: event.revisited_by ?? null,
    speaker: event.revisited_by ?? event.decided_by ?? event.proposed_by ?? null,
    utteranceId: event.utterance_id ?? null,
    similarity: event.similarity ?? null,
    alertId: event.alert_id ?? null,
    changedFields: event.changed_fields ?? null
  }
});

// ------------------------------------------------------------
// analysisCompletedBroadcast
//   발화 단위 분석 결과 전달
// ------------------------------------------------------------
const analysisCompletedBroadcast = (event = {}) => ({
  type: TRANSCRIPT_SERVER_EVENTS.ANALYSIS_COMPLETED,
  requestId: null,
  success: true,
  payload: {
    workspaceId: event.workspace_id ?? null,
    meetingId: event.meeting_id ?? null,
    sttResultId: event.stt_result_id ?? null,
    utteranceId: event.utterance_id ?? null,
    chunkId: event.chunk_id ?? null,
    result: event.result ?? null
  }
});

// ------------------------------------------------------------
// aiAnalysisUpdatedBroadcast
//   회의 단위 AI 분석(요약/액션아이템/재논의 리포트) 갱신 알림
//
// 보안:
//   AI 분석 본문은 이 이벤트에 싣지 않는다.
//   클라이언트가 GET /workspaces/{ws}/meetings/{id}/ai 로 직접 조회해
//   서버의 워크스페이스 권한 검사를 그대로 통과하도록 한다.
//   (본문을 broadcast하면 권한 검사를 우회하게 된다)
// ------------------------------------------------------------
const aiAnalysisUpdatedBroadcast = (event = {}) => ({
  type: TRANSCRIPT_SERVER_EVENTS.AI_ANALYSIS_UPDATED,
  requestId: null,
  success: true,
  payload: {
    workspaceId: event.workspace_id ?? null,
    meetingId: event.meeting_id ?? null,
    analysisId: event.analysis_id ?? null,
    // 클라이언트는 이 신호를 받고 권한이 있는 경우에만 상세를 조회한다.
    shouldRefetch: true
  }
});

module.exports = {
  UNKNOWN_SPEAKER,

  TRANSCRIPT_CHUNK_SCHEMA,

  toFastApiChunk,
  normalizeUtterance,

  transcriptChunkAck,

  transcriptBroadcast,
  transcriptPartialBroadcast,
  topicBroadcast,
  analysisCompletedBroadcast,
  aiAnalysisUpdatedBroadcast
};
