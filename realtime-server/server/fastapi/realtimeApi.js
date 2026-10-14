// ============================================================
// server/fastapi/realtimeApi.js
// ============================================================
// 역할:
//   FastAPI의 실시간(Realtime) 관련 HTTP API 호출을 담당한다.
//   STT text chunk 전달과 Phase 4 분석 결과(안건/재논의) 조회를 처리한다.
//
// 담당 endpoint:
//   - POST /realtime/meetings/{meeting_id}/chunks
//   - GET  /realtime/meetings/{meeting_id}/access
//   - GET  /meetings/{meeting_id}/topics
//   - GET  /ai-analysis?workspace_id=&meeting_id=
//
// SRP:
//   이 파일은 경로와 요청 body 구조만 안다.
//   WebSocket 메시지 구조나 broadcast는 담당하지 않는다.
//
// 필드 기준:
//   - FastAPI 요청/응답 필드는 snake_case를 사용한다.
//   - camelCase 변환은 schema/service 계층에서 처리한다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class RealtimeApi {
  // ----------------------------------------------------------
  // sendSttChunk
  //
  // Input:
  // {
  //   meeting_id,
  //   chunk_id,
  //   text,
  //   stt_result_id?,
  //   sequence?,
  //   speaker_label?,
  //   speaker_embedding?,   // 화자 분리용 embedding (선택)
  //   start_ms?,
  //   end_ms?,
  //   language?,
  //   is_final
  // }
  //
  // FastAPI:
  //   POST /realtime/meetings/{meeting_id}/chunks
  //
  // Response:
  // {
  //   status: "success",
  //   data: {
  //     chunk_id,
  //     stt_result_id,
  //     utterance_id,
  //     sequence,
  //     buffered_count,
  //     analysis_status,   // completed | unavailable | skipped | duplicate | partial
  //     analysis
  //   }
  // }
  //
  // 설명:
  //   is_final=false는 저장 없이 partial 처리되고,
  //   is_final=true는 utterance 저장 + 화자 클러스터링 + 안건/재논의 판단까지 수행된다.
  // ----------------------------------------------------------
  async sendSttChunk({ meeting_id, ...chunk }) {
    return fastApiClient.post(`/realtime/meetings/${meeting_id}/chunks`, chunk);
  }

  // ----------------------------------------------------------
  // verifyMeetingAccess
  //
  // FastAPI:
  //   GET /realtime/meetings/{meeting_id}/access
  //
  // 설명:
  //   현재 토큰 사용자가 해당 회의에 접근 가능한지 확인한다.
  // ----------------------------------------------------------
  async verifyMeetingAccess({ meeting_id }) {
    return fastApiClient.get(`/realtime/meetings/${meeting_id}/access`);
  }

  // ----------------------------------------------------------
  // getMeetingTopics
  //
  // FastAPI:
  //   GET /meetings/{meeting_id}/topics
  //
  // 설명:
  //   Phase 4 안건(Topic) 목록을 조회한다.
  //   status로 PROPOSED / DECIDED / REVISITED / DROPPED 필터가 가능하다.
  // ----------------------------------------------------------
  async getMeetingTopics({ meeting_id, status = null }) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return fastApiClient.get(`/meetings/${meeting_id}/topics${query}`);
  }

  // ----------------------------------------------------------
  // getTopicEvents
  //
  // FastAPI:
  //   GET /topics/{topic_id}/events
  //
  // 설명:
  //   누가 언제 재논의했는지 추적하는 안건 이력을 조회한다.
  // ----------------------------------------------------------
  async getTopicEvents({ topic_id }) {
    return fastApiClient.get(`/topics/${topic_id}/events`);
  }
}

module.exports = new RealtimeApi();
module.exports.RealtimeApi = RealtimeApi;
