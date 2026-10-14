// ============================================================
// server/services/fastapi/sttResultApi.js
// ============================================================
// 역할:
//   FastAPI의 STT Result 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - GET    /stt-results/
//   - GET    /stt-results/{stt_result_id}
//   - DELETE /stt-results/{stt_result_id}
//
// 제외 endpoint:
//   - POST  /stt-results/
//   - PATCH /stt-results/{stt_result_id}
//
// SRP:
//   이 파일은 STT Result API 경로와 요청 body/query 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
//
// 필드 기준:
//   - FastAPI 요청/응답 필드는 snake_case를 사용한다.
//   - Node WebSocket payload의 camelCase 변환은 handler/service/schema 계층에서 처리한다.
//
// 주의:
//   - STT 결과 생성/수정은 POST, PATCH endpoint에서 처리하지만
//     현재 파일에서는 제외한다.
//   - 삭제 응답은 204 No Content로 body가 없을 수 있으므로
//     Node 내부에서 success 형태로 정규화한다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class SttResultApi {
  // ----------------------------------------------------------
  // getSttResults
  //
  // Input:
  // 없음
  //
  // FastAPI:
  //   GET /stt-results/
  //
  // 설명:
  //   STT 결과 전체 목록 조회 API이다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: [
  //     {
  //       id,
  //       meeting_id,
  //       document_id,
  //       language,
  //       raw_text,
  //       status,
  //       created_at
  //     }
  //   ]
  // }
  // ----------------------------------------------------------
  // meeting_id는 FastAPI에서 필수 query parameter이다.
  // (빠뜨리면 422 Unprocessable Entity로 목록 조회가 실패한다)
  async getSttResults({ meeting_id } = {}) {
    if (meeting_id === undefined || meeting_id === null) {
      const error = new Error('STT Result 목록 조회에는 meeting_id가 필요합니다.');
      error.statusCode = 400;
      throw error;
    }

    return fastApiClient.get(`/stt-results/?meeting_id=${encodeURIComponent(meeting_id)}`);
  }

  // ----------------------------------------------------------
  // getSttTranscript
  //
  // FastAPI:
  //   GET /stt-results/{stt_result_id}/transcript
  //
  // 설명:
  //   화자 라벨이 결합된 대화록을 조회한다.
  //   ("[Speaker 1]: 이 기능 다음 분기에 적용하죠" 형태)
  // ----------------------------------------------------------
  async getSttTranscript({ stt_result_id }) {
    return fastApiClient.get(`/stt-results/${stt_result_id}/transcript`);
  }

  // ----------------------------------------------------------
  // getSttResult
  //
  // Input:
  // {
  //   stt_result_id
  // }
  //
  // FastAPI:
  //   GET /stt-results/{stt_result_id}
  //
  // 설명:
  //   특정 STT 결과 상세 조회 API이다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: {
  //     id,
  //     meeting_id,
  //     document_id,
  //     language,
  //     raw_text,
  //     status,
  //     created_at
  //   }
  // }
  // ----------------------------------------------------------
  async getSttResult({ stt_result_id }) {
    return fastApiClient.get(`/stt-results/${stt_result_id}`);
  }

  // ----------------------------------------------------------
  // deleteSttResult
  //
  // Input:
  // {
  //   stt_result_id
  // }
  //
  // FastAPI:
  //   DELETE /stt-results/{stt_result_id}
  //
  // Response:
  //   204 No Content
  //
  // 설명:
  //   특정 STT 결과 삭제 API이다.
  //   삭제 응답은 body가 없을 수 있다.
  // ----------------------------------------------------------
  async deleteSttResult({ stt_result_id }) {
    const response = await fastApiClient.delete(`/stt-results/${stt_result_id}`);

    const isEmptyObject =
      response &&
      typeof response === 'object' &&
      !Array.isArray(response) &&
      Object.keys(response).length === 0;

    if (
      response?.status === 204 ||
      response?.statusCode === 204 ||
      isEmptyObject
    ) {
      return {
        status: 'success',
        statusCode: 204,
        data: null
      };
    }

    return response;
  }
}

module.exports = new SttResultApi();
module.exports.SttResultApi = SttResultApi;