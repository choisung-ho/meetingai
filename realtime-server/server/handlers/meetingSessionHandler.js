// ============================================================
// server/handlers/meetingSessionHandler.js
// ============================================================
// 역할:
//   MeetingSession 계층 WebSocket 이벤트를 처리한다.
//
// 대상 이벤트:
//   - START_MEETING
//   - END_MEETING
//
// 흐름:
//   Client 요청
//   → Schema 검증
//   → meetingSessionService 호출
//   → 요청한 Client에게 ACK 응답
//   → 같은 Workspace 접속자에게 MEETING_STATUS_CHANGED 브로드캐스트
// ============================================================

const BaseHandler = require('./BaseHandler');
const meetingSessionService = require('../services/meetingSessionService');
const broadcastService = require('../services/broadcastService');

const {
    START_MEETING_SCHEMA,
    END_MEETING_SCHEMA,
    createStartMeetingAck,
    createEndMeetingAck
} = require('../schemas/meetingSessionSchema');

class MeetingSessionHandler extends BaseHandler {
    // ----------------------------------------------------------
    // START_MEETING
    // Client → Server
    // ----------------------------------------------------------
    async handleStartMeeting(wss, ws, message) {
        if (!this.validateOrReject(ws, message, START_MEETING_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const title = message.payload.title;

        try {
            const result = await meetingSessionService.startMeeting({
                workspaceId,
                meetingId,
                title
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    'START_MEETING_FAILED',
                    '회의 시작에 실패했습니다.'
                );
                return;
            }

            const meeting = {
                workspaceId,
                ...result.data
            };

            // 요청한 클라이언트에게 START_MEETING_ACK 응답
            this.sendAck(
                ws,
                createStartMeetingAck(message.requestId, meeting)
            );

            // 같은 workspace 접속자 전체에게 MEETING_STATUS_CHANGED 브로드캐스트
            await broadcastService.broadcastMeetingStatusChanged(ws, {
                workspaceId,
                meeting
            });
        } catch (error) {
            this.sendError(
                ws,
                message.requestId,
                'START_MEETING_ERROR',
                error.message || '회의 시작 처리 중 오류가 발생했습니다.'
            );
        }
    }

    // ----------------------------------------------------------
    // END_MEETING
    // Client → Server
    // ----------------------------------------------------------
    async handleEndMeeting(wss, ws, message) {
        if (!this.validateOrReject(ws, message, END_MEETING_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const title = message.payload.title;

        try {
            const result = await meetingSessionService.endMeeting({
                workspaceId,
                meetingId,
                title
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    'END_MEETING_FAILED',
                    '회의 종료에 실패했습니다.'
                );
                return;
            }

            const meeting = {
                workspaceId,
                ...result.data
            };

            // 요청한 클라이언트에게 END_MEETING_ACK 응답
            this.sendAck(
                ws,
                createEndMeetingAck(message.requestId, meeting)
            );

            // 같은 workspace 접속자 전체에게 MEETING_STATUS_CHANGED 브로드캐스트
            await broadcastService.broadcastMeetingStatusChanged(ws, {
                workspaceId,
                meeting
            });
        } catch (error) {
            this.sendError(
                ws,
                message.requestId,
                'END_MEETING_ERROR',
                error.message || '회의 종료 처리 중 오류가 발생했습니다.'
            );
        }
    }
}

const meetingSessionHandler = new MeetingSessionHandler();

module.exports = {
    handleStartMeeting: meetingSessionHandler.handleStartMeeting.bind(meetingSessionHandler),
    handleEndMeeting: meetingSessionHandler.handleEndMeeting.bind(meetingSessionHandler)
};