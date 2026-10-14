// ============================================================
// server/services/documentService.js
// ============================================================
// 역할:
//   Document 계층의 클라이언트 요청 처리용 서비스 흐름을 담당한다.
//   WebSocket Handler에서 받은 요청을 FastAPI Document API 호출로 연결한다.
//
// 현재 범위:
//   - GET_DOCUMENTS
//   - GET_WORKSPACE_DOCUMENTS
//   - GET_DOCUMENT
//   - DELETE_DOCUMENT
//
// 원칙:
//   - Document 업로드는 multipart/form-data 흐름이므로 여기서 처리하지 않는다.
//   - Pub/Sub 기반 실시간 Document 전송은 여기서 처리하지 않는다.
//   - Redis 캐시도 현재 단계에서는 사용하지 않는다.
//   - 실제 원본 데이터는 FastAPI/DB이다.
//
// 주의:
//   - WebSocket payload는 camelCase를 사용한다.
//   - FastAPI 요청 필드는 snake_case를 사용한다.
//   - FastAPI 실패 응답의 statusCode와 message는 임의 변환하지 않고 Handler로 올려보낸다.
// ============================================================

const { documentApi } = require('../fastapi');
const logger = require('../utils/logger');

class DocumentService {
    // ----------------------------------------------------------
    // getDocuments
    // Input  : { meetingId }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 특정 meeting에 연결된 Document 목록을 조회한다.
    //   2. 조회 결과 data 배열을 그대로 반환한다.
    //
    // FastAPI:
    //   GET /documents/?meeting_id={meetingId}
    // ----------------------------------------------------------
    async getDocuments({ meetingId }) {
        logger.info(`Document 목록 조회 요청: meetingId=${meetingId}`);

        const result = await documentApi.getDocuments({
            meeting_id: meetingId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Document 목록 조회 실패 응답: meetingId=${meetingId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'Document 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const documents = Array.isArray(result.data) ? result.data : [];

        logger.info(
            `Document 목록 조회 완료: meetingId=${meetingId}, count=${documents.length}`
        );

        return documents;
    }

    // ----------------------------------------------------------
    // getWorkspaceDocuments
    // Input  : { workspaceId }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 특정 workspace에 소속된 전체 Document 목록을 조회한다.
    //   2. meeting_id가 있는 회의 문서와 meeting_id가 null인 workspace 단위 문서가
    //      함께 반환될 수 있다.
    //   3. 조회 결과 data 배열을 그대로 반환한다.
    //
    // FastAPI:
    //   GET /documents/?workspace_id={workspaceId}
    // ----------------------------------------------------------
    async getWorkspaceDocuments({ workspaceId }) {
        logger.info(`Workspace Document 목록 조회 요청: workspaceId=${workspaceId}`);

        const result = await documentApi.getWorkspaceDocuments({
            workspace_id: workspaceId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Workspace Document 목록 조회 실패 응답: workspaceId=${workspaceId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'Workspace Document 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const documents = Array.isArray(result.data) ? result.data : [];

        logger.info(
            `Workspace Document 목록 조회 완료: workspaceId=${workspaceId}, count=${documents.length}`
        );

        return documents;
    }

    // ----------------------------------------------------------
    // getDocument
    // Input  : { documentId }
    // Output : Promise<Object>
    // 역할  :
    //   1. FastAPI에서 특정 Document 상세 정보를 조회한다.
    //   2. 조회 성공 시 Document 객체를 그대로 반환한다.
    //
    // FastAPI:
    //   GET /documents/{documentId}
    // ----------------------------------------------------------
    async getDocument({ documentId }) {
        logger.info(`Document 단일 조회 요청: documentId=${documentId}`);

        const result = await documentApi.getDocument({
            document_id: documentId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Document 단일 조회 실패 응답: documentId=${documentId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'Document 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        if (!result?.data?.id) {
            const error = new Error('조회된 Document 데이터가 없습니다.');
            error.statusCode = 404;
            error.response = result;

            throw error;
        }

        logger.info(`Document 단일 조회 완료: documentId=${result.data.id}`);

        return result.data;
    }

    // ----------------------------------------------------------
    // deleteDocument
    // Input  : { documentId }
    // Output : Promise<{ deleted: true }>
    //
    // FastAPI:
    //   DELETE /documents/{document_id}
    //
    // 응답:
    //   204 No Content
    //
    // 설명:
    //   FastAPI DELETE 응답은 body가 없으므로 data를 검사하지 않는다.
    //   fastApiClient가 204 응답을 success 형태로 감싼 결과만 확인한다.
    // ----------------------------------------------------------
    async deleteDocument({ documentId }) {
        logger.info(`Document 삭제 요청: documentId=${documentId}`);

        const response = await documentApi.deleteDocument({
            document_id: documentId
        });

        const isSuccess =
            response?.status === 'success' ||
            response?.status === 204 ||
            response?.statusCode === 204;

        if (!isSuccess) {
            logger.warn(
                `Document 삭제 실패 응답: documentId=${documentId}, status=${response?.status ?? 'UNKNOWN'}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Document 삭제에 실패했습니다.');
            error.statusCode = response?.statusCode || response?.status || 500;
            error.response = response;

            throw error;
        }

        logger.info(`Document 삭제 완료: documentId=${documentId}`);

        return {
            deleted: true
        };
    }
}

module.exports = new DocumentService();
