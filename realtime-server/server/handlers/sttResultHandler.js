// ============================================================
// server/handlers/sttResultHandler.js
// ============================================================
// 역할:
//   STT Result 계층 WebSocket 이벤트를 처리한다.
//   클라이언트 요청을 검증한 뒤 sttResultService를 호출하고,
//   요청한 클라이언트에게 ACK를 반환한다.
//
// 현재 범위:
//   - GET_STT_RESULTS
//   - GET_STT_RESULT
//   - DELETE_STT_RESULT
//
// 원칙:
//   - STT Result 생성/수정은 이 Handler에서 처리하지 않는다.
//   - GET_STT_RESULTS, GET_STT_RESULT는 조회 요청이므로 broadcast 하지 않는다.
//   - DELETE_STT_RESULT는 삭제 성공 후 FastAPI realtime.events canonical 이벤트를 통해
//     관련 사용자에게 STT_RESULT_DELETED가 전달된다.
//   - FastAPI 실패 응답의 statusCode/message는 임의 변환하지 않고 그대로 내려보낸다.
//
// FastAPI 기준:
//   GET    /stt-results/
//   GET    /stt-results/{stt_result_id}
//   DELETE /stt-results/{stt_result_id}
// ============================================================

const BaseHandler = require('./BaseHandler');
const sttResultService = require('../services/sttResultService');

const {
    GET_STT_RESULTS_SCHEMA,
    GET_STT_RESULT_SCHEMA,
    DELETE_STT_RESULT_SCHEMA,

    getSttResultsAck,
    getSttResultAck,
    deleteSttResultAck
} = require('../schemas/sttResultSchema');

class SttResultHandler extends BaseHandler {
    // ----------------------------------------------------------
    // GET_STT_RESULTS
    // Client → WebSocket Server
    // STT Result 목록 조회
    //
    // FastAPI:
    //   GET /stt-results/
    //
    // 기준:
    //   - FastAPI 명세상 필수 query parameter는 없다.
    //   - workspaceId, meetingId, meetingRoomId는 Node 내부 context 확인용이다.
    // ----------------------------------------------------------
    async handleGetSttResults(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_STT_RESULTS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ID',
                'payload.meetingId가 필요합니다.'
            );
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                'STT Result 목록을 조회하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        try {
            const sttResults = await sttResultService.getSttResults({
                workspaceId,
                meetingId,
                meetingRoomId
            });

            this.sendAck(
                ws,
                getSttResultsAck(message.requestId ?? null, sttResults)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'STT Result 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_STT_RESULT
    // Client → WebSocket Server
    // STT Result 단건 조회
    //
    // FastAPI:
    //   GET /stt-results/{stt_result_id}
    //
    // 기준:
    //   - FastAPI 호출에는 sttResultId만 사용한다.
    //   - workspaceId, meetingId, meetingRoomId는 WebSocket context 확인용이다.
    // ----------------------------------------------------------
    async handleGetSttResult(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_STT_RESULT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const sttResultId = message.payload.sttResultId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ID',
                'payload.meetingId가 필요합니다.'
            );
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                'STT Result를 조회하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        if (sttResultId === undefined || sttResultId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_STT_RESULT_ID',
                'payload.sttResultId가 필요합니다.'
            );
            return;
        }

        try {
            const sttResult = await sttResultService.getSttResult({
                workspaceId,
                meetingId,
                meetingRoomId,
                sttResultId
            });

            if (!sttResult?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    404,
                    '요청한 STT Result를 찾을 수 없습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                getSttResultAck(message.requestId ?? null, sttResult)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'STT Result 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // DELETE_STT_RESULT
    // Client → WebSocket Server
    // STT Result 삭제
    //
    // FastAPI:
    //   DELETE /stt-results/{stt_result_id}
    //
    // 기준:
    //   - FastAPI 호출에는 sttResultId만 사용한다.
    //   - workspaceId, meetingId, meetingRoomId는 context 확인 및 broadcast 대상 계산용이다.
    //   - 삭제 성공 후 요청자에게 DELETE_STT_RESULT_ACK를 보낸다.
    //   - FastAPI가 realtime.events에 stt.deleted를 발행하고 canonical subscriber가
    //     관련 사용자에게 STT_RESULT_DELETED를 broadcast 한다.
    // ----------------------------------------------------------
    async handleDeleteSttResult(wss, ws, message) {
        if (!this.validateOrReject(ws, message, DELETE_STT_RESULT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const sttResultId = message.payload.sttResultId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ID',
                'payload.meetingId가 필요합니다.'
            );
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                'STT Result를 삭제하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        if (sttResultId === undefined || sttResultId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_STT_RESULT_ID',
                'payload.sttResultId가 필요합니다.'
            );
            return;
        }

        try {
            await sttResultService.deleteSttResult({
                workspaceId,
                meetingId,
                meetingRoomId,
                sttResultId
            });

            this.sendAck(
                ws,
                deleteSttResultAck(message.requestId ?? null, sttResultId)
            );

            // FastAPI가 stt.deleted를 realtime.events에 발행하고
            // RealtimeEventSubscriber가 회의 전체에 canonical 전파한다.

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'STT Result 삭제에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }
}

const sttResultHandler = new SttResultHandler();

module.exports = {
    handleGetSttResults: (wss, ws, msg) =>
        sttResultHandler.handleGetSttResults(wss, ws, msg),

    handleGetSttResult: (wss, ws, msg) =>
        sttResultHandler.handleGetSttResult(wss, ws, msg),

    handleDeleteSttResult: (wss, ws, msg) =>
        sttResultHandler.handleDeleteSttResult(wss, ws, msg),

    SttResultHandler
};
