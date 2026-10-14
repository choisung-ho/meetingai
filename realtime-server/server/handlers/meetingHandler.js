// ============================================================
// server/handlers/meetingHandler.js
// ============================================================

// BaseHandler를 가져온다.
// validateOrReject, sendAck, sendError, extractTrimmed 같은 공통 기능을 사용하기 위해 필요하다.
const BaseHandler = require('./BaseHandler');

// meetingService를 가져온다.
// 실제 Meeting 생성/조회 흐름은 Handler가 직접 하지 않고 Service에 위임한다.
const meetingService = require('../services/meetingService');

const broadcastService = require('../services/broadcastService');
const { auditLogger } = require('../utils/slogger');

const {
    // CREATE_MEETING 요청이 올바른 형식인지 검사하는 JSON Schema
    CREATE_MEETING_SCHEMA,

    // GET_MEETINGS 요청이 올바른 형식인지 검사하는 JSON Schema
    GET_MEETINGS_SCHEMA,

    // DELETE_MEETING 요청이 올바른 형식인지 검사하는 JSON Schema
    DELETE_MEETING_SCHEMA,

    GET_MEETING_SCHEMA,

    createGetMeetingAck,

    // CREATE_MEETING 성공 응답 메시지를 만들어주는 함수
    createCreateMeetingAck,

    // GET_MEETINGS 성공 응답 메시지를 만들어주는 함수
    createGetMeetingsAck,

    // DELETE_MEETING 성공 응답 메시지를 만들어주는 함수
    createDeleteMeetingAck
} = require('../schemas/meetingSchema');

// MeetingHandler 클래스는 BaseHandler를 상속한다.
// 그래서 공통 검증/응답 메서드를 그대로 사용할 수 있다.
class MeetingHandler extends BaseHandler {

    // ----------------------------------------------------------
    // CREATE_MEETING 이벤트 처리 함수
    // 클라이언트가 회의 생성을 요청했을 때 실행된다.
    // ----------------------------------------------------------
    async handleCreateMeeting(wss, ws, message) {

        // 요청 message가 CREATE_MEETING_SCHEMA 형식에 맞는지 검사한다.
        // 틀리면 에러 응답을 보내고 false를 반환하므로 여기서 종료한다.
        if (!this.validateOrReject(ws, message, CREATE_MEETING_SCHEMA)) return;

        // payload에서 workspaceId를 꺼낸다.
        // 이 값은 Redis에 workspace별 meeting을 저장할 때 필요하다.
        const workspaceId = message.payload.workspaceId;

        // payload.title을 꺼내고 앞뒤 공백을 제거한다.
        const title = this.extractTrimmed(message.payload, 'title');

        // payload.status를 꺼내고 앞뒤 공백을 제거한다.
        const status = this.extractTrimmed(message.payload, 'status');

        // workspaceId가 없으면 회의를 어느 워크스페이스에 저장할지 모르므로 에러를 보낸다.
        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        // title이 빈 문자열이면 회의 제목이 없으므로 에러를 보낸다.
        if (!title) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_TITLE',
                'payload.title이 필요합니다.'
            );
            return;
        }

        // status가 없으면 회의 상태를 알 수 없으므로 에러를 보낸다.
        if (!status) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_STATUS',
                'payload.status가 필요합니다.'
            );
            return;
        }

        // status는 READY만 허용한다.
        if (!['READY'].includes(status)) {
            this.sendError(
                ws,
                message.requestId,
                'INVALID_MEETING_STATUS',
                'READY만 가능합니다.'
            );
            return;
        }

        try {
            // meetingService에 회의 생성을 요청한다.
            // 내부에서 FastAPI POST /meetings/ 호출 후 성공하면 Redis에 캐시 저장한다.
            const result = await meetingService.createMeeting({
                workspaceId,
                title,
                status
            });

            // FastAPI 응답의 data만 꺼내고,
            // WebSocket 범위 구분용 workspaceId를 같이 붙여 ACK 생성 함수에 넘긴다.
            this.sendAck(
                ws,
                createCreateMeetingAck(message.requestId ?? null, {
                    workspaceId,
                    ...result.data
                })
            );

            // 미팅 생성이 성공한 경우에만
            // 같은 workspace에 접속 중인 다른 클라이언트들에게 MEETING_CREATED를 브로드캐스트한다.
            if (result?.status === 'success' && result?.data?.id) {
                await auditLogger({
                    action: 'CREATE_MEETING',
                    userId: ws.userId,
                    status: 'SUCCESS',
                    metadata: { workspaceId, meetingId: result.data.id, title, meetingStatus: status }
                });

                await broadcastService.broadcastMeetingCreated(ws, {
                    workspaceId,
                    meeting: result.data
                });
            }

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '미팅 생성에 실패했습니다.';

            await auditLogger({
                action: 'CREATE_MEETING',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    title,
                    errorCode,
                    statusCode: error?.statusCode ?? null,
                    reason: error?.message ?? null
                }
            });

            // FastAPI 요청 실패, Redis 저장 실패 등 예외가 발생하면 에러 응답을 보낸다.
            // FastAPI에서 넘어온 HTTP statusCode가 있으면 그대로 클라이언트에 전달한다.
            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_MEETINGS 이벤트 처리 함수
    // 클라이언트가 회의 목록 조회를 요청했을 때 실행된다.
    // ----------------------------------------------------------
    async handleGetMeetings(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_MEETINGS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const page = message.payload.page;
        const size = message.payload.size;

        try {
            // meetingService.getMeetings()는 FastAPI 응답 전체를 반환한다.
            // 실제 목록 데이터는 result.data 안에 있다.
            const result = await meetingService.getMeetings({
                workspaceId,
                page,
                size
            });

            const data = result ?? {};

            this.sendAck(
                ws,
                createGetMeetingsAck(
                    message.requestId ?? null,
                    workspaceId,
                    {
                        page: data.page,
                        size: data.size,
                        meetings: data.meetings ?? []
                    }
                )
            );
        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '미팅 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_MEETING 이벤트 처리 함수
    // 클라이언트가 회의 상세 조회를 요청했을 때 실행된다.
    // ----------------------------------------------------------
    async handleGetMeeting(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_MEETING_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;

        try {
            // meetingService.getMeeting()은 상세 회의 객체 또는 null을 반환한다.
            // 예: { id: 7, title: "회의", status: "ACTIVE" }
            const meeting = await meetingService.getMeeting({
                workspaceId,
                meetingId
            });

            if (!meeting) {
                this.sendError(
                    ws,
                    message.requestId,
                    'GET_MEETING_FAILED',
                    '미팅 상세 조회에 실패했습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                createGetMeetingAck(
                    message.requestId ?? null,
                    workspaceId,
                    meeting
                )
            );
        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '미팅 상세 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // DELETE_MEETING 이벤트 처리 함수
    // 클라이언트가 회의 삭제를 요청했을 때 실행된다.
    // ----------------------------------------------------------
    async handleDeleteMeeting(wss, ws, message) {

        // 요청 message가 DELETE_MEETING_SCHEMA 형식에 맞는지 검사한다.
        // 틀리면 에러 응답을 보내고 false를 반환하므로 여기서 종료한다.
        if (!this.validateOrReject(ws, message, DELETE_MEETING_SCHEMA)) return;

        // payload에서 workspaceId를 꺼낸다.
        // 이 값은 어떤 워크스페이스의 회의를 삭제하는지 구분할 때 필요하다.
        const workspaceId = message.payload.workspaceId;

        // payload에서 meetingId를 꺼낸다.
        // 이 값은 삭제할 회의 데이터를 식별하는 데 필요하다.
        const meetingId = message.payload.meetingId;

        // workspaceId가 없으면 어느 워크스페이스의 회의를 삭제할지 모르므로 에러를 보낸다.
        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        // meetingId가 없으면 어떤 회의를 삭제할지 모르므로 에러를 보낸다.
        if (meetingId === undefined || meetingId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ID',
                'payload.meetingId가 필요합니다.'
            );
            return;
        }

        try {
            // meetingService에 회의 삭제를 요청한다.
            // 내부에서 FastAPI DELETE 요청 후 성공하면 Redis meeting 캐시도 삭제한다.
            const result = await meetingService.deleteMeeting({
                workspaceId,
                meetingId
            });

            // FastAPI + Redis 처리 결과를 바탕으로
            // 요청한 클라이언트에게 DELETE_MEETING_ACK 응답을 보낸다.
            const deletedMeetingId = result?.data?.id ?? meetingId;

            this.sendAck(
                ws,
                createDeleteMeetingAck(message.requestId ?? null, {
                    workspaceId,
                    deletedMeetingId
                })
            );

            // 미팅 삭제가 성공한 경우에만
            // 같은 workspace에 접속 중인 클라이언트들에게 MEETING_DELETED를 브로드캐스트한다.
            if (result?.status === 'success') {
                await auditLogger({
                    action: 'DELETE_MEETING',
                    userId: ws.userId,
                    status: 'SUCCESS',
                    metadata: { workspaceId, meetingId: deletedMeetingId }
                });

                await broadcastService.broadcastMeetingDeleted(ws, {
                    workspaceId,
                    id: deletedMeetingId
                });
            }

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '미팅 삭제에 실패했습니다.';

            await auditLogger({
                action: 'DELETE_MEETING',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    meetingId,
                    errorCode,
                    statusCode: error?.statusCode ?? null,
                    reason: error?.message ?? null
                }
            });

            // FastAPI 요청 실패, Redis 삭제 실패 등 예외가 발생하면 에러 응답을 보낸다.
            // FastAPI에서 넘어온 HTTP statusCode가 있으면 그대로 클라이언트에 전달한다.
            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }
}



// MeetingHandler 인스턴스를 하나 생성한다.
// 다른 파일에서는 이 인스턴스의 메서드를 간접적으로 호출하게 된다.
const meetingHandler = new MeetingHandler();

// 외부에서 사용할 함수를 export한다.
module.exports = {
    // CREATE_MEETING 이벤트가 들어오면 이 함수가 호출된다.
    handleCreateMeeting: (wss, ws, msg) =>
        meetingHandler.handleCreateMeeting(wss, ws, msg),

    // GET_MEETINGS 이벤트가 들어오면 이 함수가 호출된다.
    handleGetMeetings: (wss, ws, msg) =>
        meetingHandler.handleGetMeetings(wss, ws, msg),

    // GET_MEETING 이벤트가 들어오면 이 함수가 호출된다.
    handleGetMeeting: (wss, ws, msg) =>
        meetingHandler.handleGetMeeting(wss, ws, msg),

    // DELETE_MEETING 이벤트가 들어오면 이 함수가 호출된다.
    handleDeleteMeeting: (wss, ws, msg) =>
        meetingHandler.handleDeleteMeeting(wss, ws, msg),

    // 테스트나 확장이 필요할 때 MeetingHandler 클래스 자체도 사용할 수 있게 export한다.
    MeetingHandler
};