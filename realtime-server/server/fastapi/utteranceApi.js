// ============================================================
// server/services/fastapi/utteranceApi.js
// ============================================================
// 역할:
//   FastAPI의 Utterance 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - GET    /utterances/
//   - GET    /utterances/{utterance_id}
//   - PATCH  /utterances/{utterance_id}
//   - DELETE /utterances/{utterance_id}
//
// 제외 endpoint:
//   - POST   /utterances/
//
// SRP:
//   이 파일은 Utterance API 경로와 요청 body/query 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
//
// 필드 기준:
//   - FastAPI 요청/응답 필드는 snake_case를 사용한다.
//   - Node WebSocket payload의 camelCase 변환은 handler/service/schema 계층에서 처리한다.
//
// 주의:
//   - 발화 생성은 STT 처리 파이프라인 또는 FastAPI 내부 흐름에서 수행한다.
//   - 이 파일에서는 클라이언트 요청 기반 생성 POST를 제외한다.
//   - sttResultId가 아니라 FastAPI 기준 stt_result_id를 사용한다.
//   - utteranceId가 아니라 FastAPI 기준 utterance_id를 사용한다.
//   - 삭제 응답은 204 No Content로 body가 없을 수 있으므로
//     Node 내부에서 success 형태로 정규화한다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class UtteranceApi {
  // ----------------------------------------------------------
  // getUtterances
  //
  // Input:
  // {
  //   stt_result_id = null
  // }
  //
  // FastAPI:
  //   GET /utterances/
  //   GET /utterances/?stt_result_id={stt_result_id}
  //
  // 설명:
  //   발화 목록 조회 API이다.
  //   stt_result_id가 있으면 특정 STT 결과에 속한 발화만 조회한다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: [
  //     {
  //       stt_result_id,
  //       sequence,
  //       start_ms,
  //       end_ms,
  //       speaker_label,
  //       text,
  //       id,
  //       created_at
  //     }
  //   ]
  // }
  // ----------------------------------------------------------
  async getUtterances({ stt_result_id = null } = {}) {
    if (stt_result_id !== null && stt_result_id !== undefined) {
        return fastApiClient.get(`/utterances/?stt_result_id=${stt_result_id}`);
    }

    return fastApiClient.get('/utterances/');
    }

  // ----------------------------------------------------------
  // getUtterance
  //
  // Input:
  // {
  //   utterance_id
  // }
  //
  // FastAPI:
  //   GET /utterances/{utterance_id}
  //
  // 설명:
  //   특정 발화 상세 조회 API이다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: {
  //     stt_result_id,
  //     sequence,
  //     start_ms,
  //     end_ms,
  //     speaker_label,
  //     text,
  //     id,
  //     created_at
  //   }
  // }
  // ----------------------------------------------------------
  async getUtterance({ utterance_id }) {
    return fastApiClient.get(`/utterances/${utterance_id}`);
  }

  // ----------------------------------------------------------
  // updateUtterance
  //
  // Input:
  // {
  //   utterance_id,
  //   stt_result_id,
  //   sequence,
  //   start_ms,
  //   end_ms,
  //   speaker_label,
  //   text
  // }
  //
  // FastAPI:
  //   PATCH /utterances/{utterance_id}
  //
  // 설명:
  //   특정 발화 수정 API이다.
  //
  // Request Body:
  // {
  //   stt_result_id,
  //   sequence,
  //   start_ms,
  //   end_ms,
  //   speaker_label,
  //   text
  // }
  //
  // Response:
  // {
  //   status: "success",
  //   data: {
  //     stt_result_id,
  //     sequence,
  //     start_ms,
  //     end_ms,
  //     speaker_label,
  //     text,
  //     id,
  //     created_at
  //   }
  // }
  // ----------------------------------------------------------
  async updateUtterance({
    utterance_id,
    stt_result_id,
    sequence,
    start_ms,
    end_ms,
    speaker_label,
    text
  }) {
    return fastApiClient.patch(`/utterances/${utterance_id}`, {
      stt_result_id,
      sequence,
      start_ms,
      end_ms,
      speaker_label,
      text
    });
  }

  // ----------------------------------------------------------
  // deleteUtterance
  //
  // Input:
  // {
  //   utterance_id
  // }
  //
  // FastAPI:
  //   DELETE /utterances/{utterance_id}
  //
  // Response:
  //   204 No Content
  //
  // 설명:
  //   특정 발화 삭제 API이다.
  //   삭제 응답은 body가 없을 수 있다.
  // ----------------------------------------------------------
  async deleteUtterance({ utterance_id }) {
    const response = await fastApiClient.delete(`/utterances/${utterance_id}`);

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

module.exports = new UtteranceApi();
module.exports.UtteranceApi = UtteranceApi;