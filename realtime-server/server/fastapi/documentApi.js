// ============================================================
// server/services/fastapi/documentApi.js
// ============================================================
// 역할:
//   FastAPI의 Document 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - GET    /documents/?meeting_id={meeting_id}
//   - GET    /documents/?workspace_id={workspace_id}
//   - GET    /documents/{document_id}
//   - DELETE /documents/{document_id}
//
// SRP:
//   이 파일은 Document API 경로와 요청 body/query 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
//
// 필드 기준:
//   - FastAPI 요청/응답 필드는 snake_case를 사용한다.
//   - Node WebSocket payload의 camelCase 변환은 handler/service/schema 계층에서 처리한다.
//
// 주의:
//   - 파일 업로드 POST /documents/upload?meeting_id={meeting_id}
//   - 파일 업로드 POST /documents/upload?workspace_id={workspace_id}
//     는 Client가 FastAPI 또는 업로드 API에 직접 HTTP multipart/form-data로 요청한다.
//   - Node는 Document 조회/상세/삭제 요청만 FastAPI로 중계한다.
//   - 업로드 완료 실시간 알림은 Redis Pub/Sub document.created 수신 후
//     WebSocket broadcast로 처리한다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class DocumentApi {
  // ----------------------------------------------------------
  // getDocuments
  //
  // Input:
  // {
  //   meeting_id
  // }
  //
  // FastAPI:
  //   GET /documents/?meeting_id={meeting_id}
  //
  // 설명:
  //   특정 meeting에 연결된 Document 목록 조회 API이다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: [
  //     {
  //       id,
  //       workspace_id,
  //       meeting_id,
  //       original_filename,
  //       stored_filename,
  //       content_type,
  //       file_size,
  //       storage_path,
  //       status,
  //       created_at
  //     }
  //   ]
  // }
  // ----------------------------------------------------------
  async getDocuments({ meeting_id }) {
    return fastApiClient.get(`/documents/?meeting_id=${meeting_id}`);
  }

  // ----------------------------------------------------------
  // getWorkspaceDocuments
  //
  // Input:
  // {
  //   workspace_id
  // }
  //
  // FastAPI:
  //   GET /documents/?workspace_id={workspace_id}
  //
  // 설명:
  //   특정 workspace에 소속된 전체 Document 목록 조회 API이다.
  //   meeting_id가 있는 회의 문서와
  //   meeting_id가 null인 workspace 단위 문서가 함께 반환될 수 있다.
  //
  // Response:
  // {
  //   status: "success",
  //   data: [
  //     {
  //       id,
  //       workspace_id,
  //       meeting_id,
  //       original_filename,
  //       stored_filename,
  //       content_type,
  //       file_size,
  //       storage_path,
  //       status,
  //       created_at
  //     }
  //   ]
  // }
  // ----------------------------------------------------------
  async getWorkspaceDocuments({ workspace_id }) {
    return fastApiClient.get(`/documents/?workspace_id=${workspace_id}`);
  }

  // ----------------------------------------------------------
  // getDocument
  //
  // Input:
  // {
  //   document_id
  // }
  //
  // FastAPI:
  //   GET /documents/{document_id}
  //
  // 설명:
  //   특정 Document 상세 조회 API이다.
  // ----------------------------------------------------------
  async getDocument({ document_id }) {
    return fastApiClient.get(`/documents/${document_id}`);
  }

  // ----------------------------------------------------------
  // deleteDocument
  //
  // Input:
  // {
  //   document_id
  // }
  //
  // FastAPI:
  //   DELETE /documents/{document_id}
  //
  // Response:
  //   204 No Content
  //
  // 설명:
  //   특정 Document 삭제 API이다.
  //   삭제 응답은 body가 없을 수 있다.
  // ----------------------------------------------------------
  async deleteDocument({ document_id }) {
    const response = await fastApiClient.delete(`/documents/${document_id}`);

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

module.exports = new DocumentApi();
module.exports.DocumentApi = DocumentApi;