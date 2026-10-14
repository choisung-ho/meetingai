// ============================================================
// server/handlers/issueHandler.js
// ============================================================

const BaseHandler = require('./BaseHandler');
const issueService = require('../services/issueService');
const broadcastService = require('../services/broadcastService');
const { auditLogger } = require('../utils/slogger');

const {
    CREATE_ISSUE_SCHEMA,
    GET_ISSUES_SCHEMA,
    GET_ALL_ISSUES_SCHEMA,
    GET_ISSUE_SCHEMA,
    GET_ISSUE_EVENTS_SCHEMA,
    UPDATE_ISSUE_SCHEMA,
    CHANGE_ISSUE_STATE_SCHEMA,
    DELETE_ISSUE_SCHEMA,

    createIssueAck,
    getIssuesAck,
    getIssueAck,
    getAllIssuesAck,
    createGetIssueEventsAck,
    updateIssueAck,
    changeIssueStateAck,
    deleteIssueAck
} = require('../schemas/issueSchema');


class IssueHandler extends BaseHandler {

    // ----------------------------------------------------------
    // CREATE_ISSUE
    // ----------------------------------------------------------
    async handleCreateIssue(wss, ws, message) {
        if (!this.validateOrReject(ws, message, CREATE_ISSUE_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const title = this.extractTrimmed(message.payload, 'title');

        const description = message.payload.description ?? null;
        const status = message.payload.status ?? 'OPEN';
        const priority = message.payload.priority ?? null;
        const dueDate = message.payload.dueDate ?? null;
        const assigneeId = message.payload.assigneeId ?? null;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 안건을 생성하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (!title) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_TITLE', 'payload.title이 필요합니다.');
            return;
        }

        if (!['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(status)) {
            this.sendError(ws, message.requestId, 'INVALID_ISSUE_STATUS', 'payload.status는 OPEN, IN_PROGRESS, CLOSED만 가능합니다.');
            return;
        }

        if (
            priority !== null &&
            priority !== undefined &&
            !['LOW', 'MEDIUM', 'HIGH'].includes(priority)
        ) {
            this.sendError(ws, message.requestId, 'INVALID_ISSUE_PRIORITY', 'payload.priority는 LOW, MEDIUM, HIGH 또는 null만 가능합니다.');
            return;
        }

        try {
            const result = await issueService.createIssue({
                meetingId,
                title,
                description,
                status,
                priority,
                dueDate,
                assigneeId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(ws, message.requestId, 500, '안건 생성에 실패했습니다.');
                return;
            }

            this.sendAck(ws, createIssueAck(message.requestId ?? null, result.data));

            await auditLogger({
                action: 'CREATE_ISSUE',
                userId: ws.userId,
                status: 'SUCCESS',
                metadata: {
                    workspaceId: result.data.workspaceId ?? workspaceId,
                    meetingId: result.data.meeting_id ?? meetingId,
                    meetingRoomId,
                    issueId: result.data.id,
                    title
                }
            });

            await broadcastService.broadcastIssueCreated(ws, result.data, {
                workspaceId: result.data.workspaceId ?? workspaceId,
                meetingId: result.data.meeting_id ?? meetingId,
                meetingRoomId
            });

        } catch (error) {
            await auditLogger({
                action: 'CREATE_ISSUE',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    meetingId,
                    title,
                    errorCode: error?.statusCode ?? 500,
                    reason: error?.message ?? null
                }
            });

            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 생성에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_ISSUES
    // ----------------------------------------------------------
    async handleGetIssues(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ISSUES_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안건 목록을 조회하려면 meetingRoomId가 필요합니다.');
            return;
        }

        try {
            const issues = await issueService.getIssues({
                meetingId
            });

            this.sendAck(
                ws,
                getIssuesAck(message.requestId ?? null, issues)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    //추가된 이슈 전체조회
    // ----------------------------------------------------------
    // GET_ALL_ISSUES
    // Client → Server
    //
    // 의미:
    //   접근 가능한 전체 Issue 목록을 조회한다.
    //   FastAPI 변경 명세 기준:
    //   GET /issues/
    //   meeting_id query 없이 호출한다.
    //
    // 주의:
    //   기존 GET_ISSUES는 meetingId 기준 회의별 조회용으로 유지한다.
    //   GET_ALL_ISSUES는 meetingId, meetingRoomId를 요구하지 않는다.
    // ----------------------------------------------------------
    async handleGetAllIssues(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ALL_ISSUES_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        try {
            const issues = await issueService.getAllIssues(workspaceId);

            this.sendAck(
                ws,
                getAllIssuesAck(message.requestId ?? null, issues)
            );
        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '전체 안건 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_ISSUE
    // Client → WebSocket Server
    // 단일 issue 조회
    // ----------------------------------------------------------
    async handleGetIssue(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ISSUE_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const issueId = message.payload.issueId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 안건을 조회하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (issueId === undefined || issueId === null) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_ID', 'payload.issueId가 필요합니다.');
            return;
        }

        try {
            const issue = await issueService.getIssue({
                issueId
            });

            if (!issue?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    404,
                    '요청한 issue를 찾을 수 없습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                getIssueAck(message.requestId ?? null, issue)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_ISSUE_EVENTS
    // Client → WebSocket Server
    // 특정 issue의 상태 변경 이벤트 목록 조회
    // ----------------------------------------------------------
    async handleGetIssueEvents(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ISSUE_EVENTS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const issueId = message.payload.issueId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 issue 이벤트를 조회하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (issueId === undefined || issueId === null) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_ID', 'payload.issueId가 필요합니다.');
            return;
        }

        try {
            const events = await issueService.getIssueEvents({
                issueId,
                meetingId
            });

            this.sendAck(
                ws,
                createGetIssueEventsAck(message.requestId ?? null, events)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 이벤트 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // UPDATE_ISSUE
    // ----------------------------------------------------------
    async handleUpdateIssue(wss, ws, message) {
        if (!this.validateOrReject(ws, message, UPDATE_ISSUE_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const issueId = message.payload.issueId;

        const title = this.extractTrimmed(message.payload, 'title');
        const description = message.payload.description;
        const priority = message.payload.priority;
        const dueDate = message.payload.dueDate;
        const assigneeId = message.payload.assigneeId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 안건을 수정하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (issueId === undefined || issueId === null) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_ID', 'payload.issueId가 필요합니다.');
            return;
        }

        try {
            const result = await issueService.updateIssue({
                issueId,
                title,
                description,
                priority,
                dueDate,
                assigneeId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(ws, message.requestId, 500, '안건 수정에 실패했습니다.');
                return;
            }

            this.sendAck(
                ws,
                updateIssueAck(message.requestId ?? null, result.data)
            );

            await auditLogger({
                action: 'UPDATE_ISSUE',
                userId: ws.userId,
                status: 'SUCCESS',
                metadata: {
                    workspaceId: result.data.workspaceId ?? workspaceId,
                    meetingId: result.data.meeting_id ?? meetingId,
                    meetingRoomId,
                    issueId: result.data.id,
                    updatedFields: {
                        title,
                        description,
                        priority,
                        dueDate,
                        assigneeId
                    }
                }
            });

            await broadcastService.broadcastIssueUpdated(ws, result.data, {
                workspaceId: result.data.workspaceId ?? workspaceId,
                meetingId: result.data.meeting_id ?? meetingId,
                meetingRoomId
            });

        } catch (error) {
            await auditLogger({
                action: 'UPDATE_ISSUE',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    meetingId,
                    meetingRoomId,
                    issueId,
                    errorCode: error?.statusCode ?? 500,
                    reason: error?.message ?? null
                }
            });

            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 수정에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // CHANGE_ISSUE_STATE
    // ----------------------------------------------------------
    async handleChangeIssueState(wss, ws, message) {
        if (!this.validateOrReject(ws, message, CHANGE_ISSUE_STATE_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const issueId = message.payload.issueId;
        const toState = this.extractTrimmed(message.payload, 'toState');
        const reason = message.payload.reason;
        const evidence = message.payload.evidence;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 안건 상태를 변경하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (issueId === undefined || issueId === null) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_ID', 'payload.issueId가 필요합니다.');
            return;
        }

        if (!toState) {
            this.sendError(ws, message.requestId, 'MISSING_TO_STATE', 'payload.toState가 필요합니다.');
            return;
        }

        if (!['OPEN', 'IN_PROGRESS', 'CLOSED'].includes(toState)) {
            this.sendError(ws, message.requestId, 'INVALID_TO_STATE', 'payload.toState는 OPEN, IN_PROGRESS, CLOSED 중 하나여야 합니다.');
            return;
        }

        try {
            const result = await issueService.changeIssueState({
                issueId,
                meetingId,
                toState,
                reason,
                evidence
            });

            if (result?.status !== 'success' || !result?.data?.issue_id) {
                this.sendError(ws, message.requestId, 500, '안건 상태 변경에 실패했습니다.');
                return;
            }

            this.sendAck(
                ws,
                changeIssueStateAck(message.requestId ?? null, result.data)
            );

            await auditLogger({
                action: 'CHANGE_ISSUE_STATE',
                userId: ws.userId,
                status: 'SUCCESS',
                metadata: {
                    workspaceId,
                    meetingId,
                    meetingRoomId,
                    issueId: result.data.issue_id,
                    fromState: result.data.from_state,
                    toState: result.data.to_state,
                    eventType: result.data.event_type,
                    changedAt: result.data.changed_at,
                    reason,
                    evidence
                }
            });

            await broadcastService.broadcastIssueStateChanged(ws, result.data, {
                workspaceId,
                meetingId,
                meetingRoomId
            });

        } catch (error) {
            await auditLogger({
                action: 'CHANGE_ISSUE_STATE',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    meetingId,
                    meetingRoomId,
                    issueId,
                    toState,
                    reason,
                    evidence,
                    errorCode: error?.statusCode ?? 500,
                    reason: error?.message ?? null
                }
            });

            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 상태 변경에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // DELETE_ISSUE
    // ----------------------------------------------------------
    async handleDeleteIssue(wss, ws, message) {
        if (!this.validateOrReject(ws, message, DELETE_ISSUE_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const issueId = message.payload.issueId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ID', 'payload.meetingId가 필요합니다.');
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(ws, message.requestId, 'MISSING_MEETING_ROOM_ID', '회의방 안에서 안건을 삭제하려면 meetingRoomId가 필요합니다.');
            return;
        }

        if (issueId === undefined || issueId === null) {
            this.sendError(ws, message.requestId, 'MISSING_ISSUE_ID', 'payload.issueId가 필요합니다.');
            return;
        }

        try {
            const result = await issueService.deleteIssue({
                issueId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(ws, message.requestId, 500, '안건 삭제에 실패했습니다.');
                return;
            }

            this.sendAck(
                ws,
                deleteIssueAck(message.requestId ?? null, result.data)
            );

            await auditLogger({
                action: 'DELETE_ISSUE',
                userId: ws.userId,
                status: 'SUCCESS',
                metadata: {
                    workspaceId: result.data.workspaceId ?? workspaceId,
                    meetingId: result.data.meeting_id ?? meetingId,
                    meetingRoomId,
                    issueId: result.data.id
                }
            });

            await broadcastService.broadcastIssueDeleted(ws, result.data, {
                workspaceId: result.data.workspaceId ?? workspaceId,
                meetingId: result.data.meeting_id ?? meetingId,
                meetingRoomId
            });

        } catch (error) {
            await auditLogger({
                action: 'DELETE_ISSUE',
                userId: ws.userId,
                status: 'FAILURE',
                metadata: {
                    workspaceId,
                    meetingId,
                    issueId,
                    errorCode: error?.statusCode ?? 500,
                    reason: error?.message ?? null
                }
            });

            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || '안건 삭제에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }
}


const issueHandler = new IssueHandler();

module.exports = {
    handleCreateIssue: (wss, ws, msg) =>
        issueHandler.handleCreateIssue(wss, ws, msg),

    handleGetIssues: (wss, ws, msg) =>
        issueHandler.handleGetIssues(wss, ws, msg),

    handleGetIssue: (wss, ws, msg) =>
        issueHandler.handleGetIssue(wss, ws, msg),

    handleGetIssueEvents: (wss, ws, msg) =>
        issueHandler.handleGetIssueEvents(wss, ws, msg),

    handleUpdateIssue: (wss, ws, msg) =>
        issueHandler.handleUpdateIssue(wss, ws, msg),

    handleChangeIssueState: (wss, ws, msg) =>
        issueHandler.handleChangeIssueState(wss, ws, msg),

    handleDeleteIssue: (wss, ws, msg) =>
        issueHandler.handleDeleteIssue(wss, ws, msg),

    handleGetAllIssues: (wss, ws, msg) =>
        issueHandler.handleGetAllIssues(wss, ws, msg),

    IssueHandler
};