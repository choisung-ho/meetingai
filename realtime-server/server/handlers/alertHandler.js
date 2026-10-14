// ============================================================
// server/handlers/alertHandler.js
// ============================================================
// 역할:
//   Alert 계층 WebSocket 이벤트를 처리한다.
//   클라이언트 요청을 검증한 뒤 alertService를 호출하고,
//   요청한 클라이언트에게만 ACK를 반환한다.
//
// 현재 범위:
//   - GET_ALERTS
//   - GET_ALERT
//   - ACKNOWLEDGE_ALERT
//   - DISMISS_ALERT
//   - RESOLVE_ALERT
//
// 원칙:
//   - Alert 생성은 클라이언트 직접 요청으로 처리하지 않는다.
//   - Alert 실시간 수신/전송은 Pub/Sub 전용 스키마와 서비스에서 따로 처리한다.
//   - 따라서 이 Handler에서는 broadcastService를 호출하지 않는다.
//   - FastAPI 실패 응답의 statusCode/message는 임의 변환하지 않고 그대로 내려보낸다.
// ============================================================

const BaseHandler = require('./BaseHandler');
const alertService = require('../services/alertService');

const {
    GET_ALERTS_SCHEMA,
    GET_ALERT_SCHEMA,
    ACKNOWLEDGE_ALERT_SCHEMA,
    DISMISS_ALERT_SCHEMA,
    RESOLVE_ALERT_SCHEMA,
    UPDATE_ALERT_SCHEMA,
    DELETE_ALERT_SCHEMA,

    getAlertsAck,
    getAlertAck,
    acknowledgeAlertAck,
    dismissAlertAck,
    resolveAlertAck,
    updateAlertAck,
    deleteAlertAck
} = require('../schemas/alertSchema');

class AlertHandler extends BaseHandler {
    // ----------------------------------------------------------
    // GET_ALERTS
    // Client → WebSocket Server
    // Alert 목록 조회
    // ----------------------------------------------------------
    async handleGetAlerts(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ALERTS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const status = message.payload.status ?? null;

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
                '회의방 안에서 Alert 목록을 조회하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        try {
            const alerts = await alertService.getAlerts({
                meetingId,
                status
            });

            this.sendAck(
                ws,
                getAlertsAck(message.requestId ?? null, alerts)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_ALERT
    // Client → WebSocket Server
    // 단일 Alert 조회
    // ----------------------------------------------------------
    async handleGetAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_ALERT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;
        const alertId = message.payload.alertId;

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
                '회의방 안에서 Alert를 조회하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            const alert = await alertService.getAlert({
                alertId
            });

            if (!alert?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    404,
                    '요청한 Alert를 찾을 수 없습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                getAlertAck(message.requestId ?? null, alert)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // ACKNOWLEDGE_ALERT
    // Client → WebSocket Server
    // Alert 확인/읽음 처리
    // ----------------------------------------------------------
    async handleAcknowledgeAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, ACKNOWLEDGE_ALERT_SCHEMA)) return;

        const alertId = message.payload.alertId;

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            const result = await alertService.acknowledgeAlert({
                alertId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    500,
                    'Alert 확인 처리에 실패했습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                acknowledgeAlertAck(message.requestId ?? null, result.data)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 확인 처리에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // DISMISS_ALERT
    // Client → WebSocket Server
    // Alert 숨김/무시 처리
    // ----------------------------------------------------------
    async handleDismissAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, DISMISS_ALERT_SCHEMA)) return;

        const alertId = message.payload.alertId;

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            const result = await alertService.dismissAlert({
                alertId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    500,
                    'Alert 숨김 처리에 실패했습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                dismissAlertAck(message.requestId ?? null, result.data)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 숨김 처리에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // RESOLVE_ALERT
    // Client → WebSocket Server
    // Alert 해결 처리
    // ----------------------------------------------------------
    async handleResolveAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, RESOLVE_ALERT_SCHEMA)) return;

        const alertId = message.payload.alertId;

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            const result = await alertService.resolveAlert({
                alertId
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    500,
                    'Alert 해결 처리에 실패했습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                resolveAlertAck(message.requestId ?? null, result.data)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 해결 처리에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

        // ----------------------------------------------------------
    // UPDATE_ALERT
    // Client → WebSocket Server
    // Alert 일반 필드 수정
    // ----------------------------------------------------------
    async handleUpdateAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, UPDATE_ALERT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const alertId = message.payload.alertId;

        const meetingId = message.payload.meetingId ?? undefined;
        const issueId = message.payload.issueId ?? undefined;
        const alertMessage = message.payload.message ?? undefined;
        const level = message.payload.level ?? undefined;
        const status = message.payload.status ?? undefined;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            const result = await alertService.updateAlert({
                alertId,
                meetingId,
                issueId,
                message: alertMessage,
                level,
                status
            });

            if (result?.status !== 'success' || !result?.data?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    500,
                    'Alert 수정에 실패했습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                updateAlertAck(message.requestId ?? null, result.data)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 수정에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

        // ----------------------------------------------------------
    // DELETE_ALERT
    // Client → WebSocket Server
    // Alert 삭제
    // ----------------------------------------------------------
    async handleDeleteAlert(wss, ws, message) {
        if (!this.validateOrReject(ws, message, DELETE_ALERT_SCHEMA)) return;

        const alertId = message.payload.alertId;

        if (alertId === undefined || alertId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_ALERT_ID',
                'payload.alertId가 필요합니다.'
            );
            return;
        }

        try {
            await alertService.deleteAlert({
                alertId
            });

            this.sendAck(
                ws,
                deleteAlertAck(message.requestId ?? null, alertId)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Alert 삭제에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }
}

const alertHandler = new AlertHandler();

module.exports = {
    handleGetAlerts: (wss, ws, msg) =>
        alertHandler.handleGetAlerts(wss, ws, msg),

    handleGetAlert: (wss, ws, msg) =>
        alertHandler.handleGetAlert(wss, ws, msg),

    handleAcknowledgeAlert: (wss, ws, msg) =>
        alertHandler.handleAcknowledgeAlert(wss, ws, msg),

    handleDismissAlert: (wss, ws, msg) =>
        alertHandler.handleDismissAlert(wss, ws, msg),

    handleResolveAlert: (wss, ws, msg) =>
        alertHandler.handleResolveAlert(wss, ws, msg),

    handleUpdateAlert: (wss, ws, msg) =>
        alertHandler.handleUpdateAlert(wss, ws, msg),

    handleDeleteAlert: (wss, ws, msg) =>
        alertHandler.handleDeleteAlert(wss, ws, msg),

    AlertHandler
};