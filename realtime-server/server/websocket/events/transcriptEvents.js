// ============================================================
// server/websocket/events/transcriptEvents.js
// ============================================================
// 역할:
//   실시간 발화(Transcript) 및 Phase 4 AI 분석 계층 이벤트 타입을 정의한다.
//
// 흐름:
//   Audio → STT → text chunk → Client
//   → (WebSocket TRANSCRIPT_CHUNK) → Node.js
//   → (HTTP POST /realtime/meetings/{id}/chunks) → FastAPI
//   → utterance 저장 + 화자 클러스터링 + 안건/재논의 판단
//   → Node.js가 회의방 참여자에게 TRANSCRIPT / TOPIC_* / ALERT_CREATED broadcast
//   → Client 실시간 반영
//
// 원칙:
//   - TRANSCRIPT_CHUNK만 클라이언트가 보낸다.
//   - TRANSCRIPT, TOPIC_*, AI_ANALYSIS_UPDATED는 서버가 발생시킨다.
//   - 서버 발생 이벤트는 FastAPI가 Redis realtime.events 채널로 발행한 것을 변환한 것이다.
// ============================================================

// 클라이언트 → 서버
const TRANSCRIPT_CLIENT_EVENTS = {
  TRANSCRIPT_CHUNK: 'TRANSCRIPT_CHUNK'   // STT text chunk 전달
};

// 서버 → 클라이언트
const TRANSCRIPT_SERVER_EVENTS = {
  TRANSCRIPT_CHUNK_ACK: 'TRANSCRIPT_CHUNK_ACK', // chunk 수신/전달 결과 응답

  TRANSCRIPT: 'TRANSCRIPT',                     // 확정 발화 (speaker 포함)
  TRANSCRIPT_PARTIAL: 'TRANSCRIPT_PARTIAL',     // 중간 발화 (저장하지 않음)

  ANALYSIS_COMPLETED: 'ANALYSIS_COMPLETED',     // 발화 단위 분석 결과

  TOPIC_CREATED: 'TOPIC_CREATED',               // 안건 추출
  TOPIC_DECIDED: 'TOPIC_DECIDED',               // 안건 확정
  TOPIC_REVISITED: 'TOPIC_REVISITED',           // 재논의 감지
  TOPIC_REDECIDED: 'TOPIC_REDECIDED',           // 재논의 후 재확정
  TOPIC_UPDATED: 'TOPIC_UPDATED',               // 안건 상태 수동 변경

  AI_ANALYSIS_UPDATED: 'AI_ANALYSIS_UPDATED'    // 회의 단위 AI 분석 갱신
};

// FastAPI가 발행하는 Redis Pub/Sub 채널
const TRANSCRIPT_PUBSUB_CHANNELS = {
  REALTIME_EVENTS: process.env.REALTIME_EVENT_CHANNEL || 'realtime.events'
};

// FastAPI realtime.events payload의 type → WebSocket 서버 이벤트 매핑
const FASTAPI_EVENT_TO_SERVER_EVENT = {
  'utterance.created': TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT,
  'utterance.partial': TRANSCRIPT_SERVER_EVENTS.TRANSCRIPT_PARTIAL,
  'analysis.completed': TRANSCRIPT_SERVER_EVENTS.ANALYSIS_COMPLETED,
  'topic.created': TRANSCRIPT_SERVER_EVENTS.TOPIC_CREATED,
  'topic.decided': TRANSCRIPT_SERVER_EVENTS.TOPIC_DECIDED,
  'topic.revisited': TRANSCRIPT_SERVER_EVENTS.TOPIC_REVISITED,
  'topic.redecided': TRANSCRIPT_SERVER_EVENTS.TOPIC_REDECIDED,
  'topic.updated': TRANSCRIPT_SERVER_EVENTS.TOPIC_UPDATED,
  'ai.analysis.completed': TRANSCRIPT_SERVER_EVENTS.AI_ANALYSIS_UPDATED,
  // FastAPI의 모든 realtime 이벤트는 단일 채널(realtime.events)로 전달한다.
  // 문서/STT 전용 채널을 별도로 구독하면 이벤트가 유실되므로 여기서
  // WebSocket 이벤트로 변환한다. document.*는 meeting_id가 null일 수 있다.
  'document.created': 'DOCUMENT_UPLOADED',
  'document.processed': 'DOCUMENT_PROCESSED',
  'document.deleted': 'DOCUMENT_DELETED',
  'stt.created': 'STT_RESULT_CREATED',
  'stt.updated': 'STT_RESULT_UPDATED',
  'stt.deleted': 'STT_RESULT_DELETED'
};

module.exports = {
  TRANSCRIPT_CLIENT_EVENTS,
  TRANSCRIPT_SERVER_EVENTS,
  TRANSCRIPT_PUBSUB_CHANNELS,
  FASTAPI_EVENT_TO_SERVER_EVENT
};
