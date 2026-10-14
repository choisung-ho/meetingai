// ============================================================
// server/services/sttResultService.js
// ============================================================
// 역할:
//   STT Result 계층의 클라이언트 요청 처리용 서비스 흐름을 담당한다.
//   WebSocket Handler에서 받은 요청을 FastAPI STT Result API 호출로 연결한다.
//
// 현재 범위:
//   - GET_STT_RESULTS
//   - GET_STT_RESULT
//   - DELETE_STT_RESULT
//
// 원칙:
//   - STT Result 생성/수정은 WebSocket 요청으로 처리하지 않는다.
//   - POST /stt-results/
//   - PATCH /stt-results/{stt_result_id}
//   위 두 endpoint는 현재 서비스 범위에서 제외한다.
//   - Pub/Sub 기반 stt.created/stt.updated/stt.deleted 수신은
//     realtimeEventSubscriber가 realtime.events 단일 채널에서 담당한다.
//   - Redis 캐시도 현재 단계에서는 사용하지 않는다.
//   - 실제 원본 데이터는 FastAPI/DB이다.
//
// 주의:
//   - WebSocket payload는 camelCase를 사용한다.
//   - FastAPI 요청 필드는 snake_case를 사용한다.
//   - FastAPI 실패 응답의 statusCode와 message는 임의 변환하지 않고 Handler로 올려보낸다.
// ============================================================

const { sttResultApi } = require('../fastapi');
const logger = require('../utils/logger');

class SttResultService {
    // ----------------------------------------------------------
    // getSttResults
    // Input  : { workspaceId, meetingId, meetingRoomId }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 STT Result 목록을 조회한다.
    //   2. 조회 결과 data 배열을 그대로 반환한다.
    //
    // FastAPI:
    //   GET /stt-results/
    //
    // 설명:
    //   현재 FastAPI 명세상 meeting_id query parameter가 필수다.
    //   workspaceId, meetingId, meetingRoomId는 Node 내부 권한 검증,
    //   로그, 공간 context 확인 용도로 사용한다.
    // ----------------------------------------------------------
    async getSttResults({ workspaceId, meetingId, meetingRoomId }) {
        logger.info(
            `STT Result 목록 조회 요청: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}`
        );

        const result = await sttResultApi.getSttResults({ meeting_id: meetingId });

        if (result?.status !== 'success') {
            logger.warn(
                `STT Result 목록 조회 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'STT Result 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const sttResults = Array.isArray(result.data) ? result.data : [];

        logger.info(
            `STT Result 목록 조회 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, count=${sttResults.length}`
        );

        return sttResults;
    }

    // ----------------------------------------------------------
    // getSttResult
    // Input  : { workspaceId, meetingId, meetingRoomId, sttResultId }
    // Output : Promise<Object>
    // 역할  :
    //   1. FastAPI에서 특정 STT Result 상세 정보를 조회한다.
    //   2. 조회 성공 시 STT Result 객체를 그대로 반환한다.
    //
    // FastAPI:
    //   GET /stt-results/{stt_result_id}
    // ----------------------------------------------------------
    async getSttResult({ workspaceId, meetingId, meetingRoomId, sttResultId }) {
        logger.info(
            `STT Result 단일 조회 요청: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}`
        );

        const result = await sttResultApi.getSttResult({
            stt_result_id: sttResultId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `STT Result 단일 조회 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'STT Result 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        if (!result?.data?.id) {
            const error = new Error('조회된 STT Result 데이터가 없습니다.');
            error.statusCode = 404;
            error.response = result;

            throw error;
        }

        logger.info(
            `STT Result 단일 조회 완료: sttResultId=${result.data.id}, meetingId=${result.data.meeting_id ?? 'null'}, documentId=${result.data.document_id ?? 'null'}`
        );

        return result.data;
    }

    // ----------------------------------------------------------
    // deleteSttResult
    // Input  : { workspaceId, meetingId, meetingRoomId, sttResultId }
    // Output : Promise<{ deleted: true }>
    //
    // FastAPI:
    //   DELETE /stt-results/{stt_result_id}
    //
    // 응답:
    //   204 No Content
    //
    // 설명:
    //   FastAPI DELETE 응답은 body가 없으므로 data를 검사하지 않는다.
    //   fastApiClient가 204 응답을 success 형태로 감싼 결과만 확인한다.
    // ----------------------------------------------------------
    async deleteSttResult({ workspaceId, meetingId, meetingRoomId, sttResultId }) {
        logger.info(
            `STT Result 삭제 요청: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}`
        );

        const response = await sttResultApi.deleteSttResult({
            stt_result_id: sttResultId
        });

        const isSuccess =
            response?.status === 'success' ||
            response?.status === 204 ||
            response?.statusCode === 204;

        if (!isSuccess) {
            logger.warn(
                `STT Result 삭제 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}, status=${response?.status ?? 'UNKNOWN'}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'STT Result 삭제에 실패했습니다.');
            error.statusCode = response?.statusCode || response?.status || 500;
            error.response = response;

            throw error;
        }

        logger.info(
            `STT Result 삭제 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}`
        );

        return {
            deleted: true
        };
    }
}

module.exports = new SttResultService();
