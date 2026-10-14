// ============================================================
// server/services/transcriptService.js
// ============================================================
// 역할:
//   실시간 발화(STT text chunk) 처리 흐름을 담당한다.
//   WebSocket Handler에서 받은 chunk를 FastAPI 실시간 API 호출로 연결한다.
//
// 흐름:
//   Client TRANSCRIPT_CHUNK
//   → Node (이 서비스)
//   → FastAPI POST /realtime/meetings/{id}/chunks
//   → utterance 저장 + 화자 클러스터링 + 안건/재논의 판단
//   → 결과를 Handler로 반환
//
// 원칙:
//   - FastAPI 실패 응답의 statusCode/message는 임의 변환하지 않고 Handler로 올려보낸다.
//   - broadcast는 이 서비스가 아니라 Handler/broadcastService가 담당한다.
// ============================================================

const { realtimeApi } = require('../fastapi');
const { toFastApiChunk } = require('../schemas/transcriptSchema');
const logger = require('../utils/logger');

class TranscriptService {
  // ----------------------------------------------------------
  // sendChunk
  // Input  : { workspaceId, meetingId, payload }
  // Output : Promise<object> — FastAPI data 객체
  //
  // 역할:
  //   1. WebSocket payload를 FastAPI 요청 body로 변환한다.
  //   2. FastAPI에 chunk를 전달한다.
  //   3. 응답 data를 그대로 반환한다.
  // ----------------------------------------------------------
  async sendChunk({ workspaceId, meetingId, payload }) {
    const chunk = toFastApiChunk(payload);

    logger.info(
      `STT chunk 전달: workspaceId=${workspaceId}, meetingId=${meetingId}, chunkId=${chunk.chunk_id}, isFinal=${chunk.is_final}`
    );

    const result = await realtimeApi.sendSttChunk({
      meeting_id: meetingId,
      ...chunk
    });

    if (result?.status !== 'success') {
      logger.warn(
        `STT chunk 전달 실패 응답: meetingId=${meetingId}, chunkId=${chunk.chunk_id}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
      );

      const error = new Error(result?.message || 'STT chunk 전달에 실패했습니다.');
      error.statusCode = result?.statusCode ?? 500;
      throw error;
    }

    return result.data ?? {};
  }

  // ----------------------------------------------------------
  // getMeetingTopics
  // Input  : { meetingId, status }
  // Output : Promise<Array>
  //
  // 역할:
  //   회의의 안건(Topic) 목록을 조회한다. 재입장 시 상태 동기화에 사용한다.
  // ----------------------------------------------------------
  async getMeetingTopics({ meetingId, status = null }) {
    const result = await realtimeApi.getMeetingTopics({
      meeting_id: meetingId,
      status
    });

    if (result?.status !== 'success') {
      const error = new Error(result?.message || '안건 목록 조회에 실패했습니다.');
      error.statusCode = result?.statusCode ?? 500;
      throw error;
    }

    return result.data ?? [];
  }
}

module.exports = new TranscriptService();
module.exports.TranscriptService = TranscriptService;
