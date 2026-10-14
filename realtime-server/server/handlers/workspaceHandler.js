// ============================================================
// server/handlers/workspaceHandler.js
// ============================================================
// 역할:
//   Workspace 계층 WebSocket 이벤트(JOIN_WORKSPACE, LEAVE_WORKSPACE)를 처리한다.
//   스키마 검증 → 서비스 호출 → ACK 응답 전송 → 브로드캐스트 흐름을 담당한다.
//
// SRP: Workspace 이벤트 검증/응답 흐름만 담당.
//      참여자 변경은 workspaceService, 브로드캐스트는 broadcastService에 위임.
//
// 패킷 흐름:
//   Client → JOIN_WORKSPACE  → handleJoinWorkspace  → WorkspaceService.joinWorkspace
//                             → ACK 전송 → BroadcastService.broadcastWorkspaceUsersUpdated
//   Client → LEAVE_WORKSPACE → handleLeaveWorkspace → WorkspaceService.leaveWorkspace
//                             → ACK 전송 → BroadcastService.broadcastWorkspaceUsersUpdated
// ============================================================

const BaseHandler = require('./BaseHandler');
const workspaceService = require('../services/workspaceService');
const broadcastService = require('../services/broadcastService');
const { auditLogger } = require('../utils/slogger');
const {
  JOIN_WORKSPACE_SCHEMA,
  LEAVE_WORKSPACE_SCHEMA,
  createJoinWorkspaceAck,
  createLeaveWorkspaceAck
} = require('../schemas/workspaceSchema');

class WorkspaceHandler extends BaseHandler {

  // ----------------------------------------------------------
  // handleJoinWorkspace
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId가 저장된 WebSocket 객체
  //          message — { type: 'JOIN_WORKSPACE', payload: { workspaceId } }
  //                    (userId는 payload가 아닌 ws.userId에서 읽음)
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleJoinWorkspace(wss, ws, message) {
    if (!this.validateOrReject(ws, message, JOIN_WORKSPACE_SCHEMA)) return;

    const workspaceId = message.payload.workspaceId;
    // userId는 JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

    if (workspaceId === undefined || workspaceId === null) {
      this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', 'payload.workspaceId가 필요합니다.');
      return;
    }

    if (!userId) {
      this.sendError(ws, message.requestId, 'MISSING_USER_ID', 'ws.userId가 없습니다. JWT 인증이 필요합니다.');
      return;
    }

    try {
      const result = await workspaceService.joinWorkspace(ws, { workspaceId, userId });

      this.sendAck(ws, createJoinWorkspaceAck(message.requestId ?? null, {
        workspaceId: result.workspaceId,
        userId: result.userId
      }));

      await auditLogger({
        action: 'JOIN_WORKSPACE',
        userId: result.userId,
        status: 'SUCCESS',
        metadata: { workspaceId: result.workspaceId }
      });

      await broadcastService.broadcastWorkspaceUsersUpdated(ws, workspaceId);
    } catch (error) {
      const errorCode = error?.statusCode ?? 500;
      const errorMessage = error?.message || '워크스페이스 입장에 실패했습니다.';

      this.sendError(
        ws,
        message.requestId,
        errorCode,
        errorMessage
      );

      await auditLogger({
        action: 'JOIN_WORKSPACE',
        userId,
        status: 'FAILURE',
        metadata: {
          workspaceId,
          errorCode,
          statusCode: error?.statusCode ?? null,
          reason: error?.message ?? null
        }
      });
    }
  }

  // ----------------------------------------------------------
  // handleLeaveWorkspace
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId, ws.workspaceId가 저장된 WebSocket 객체
  //          message — { type: 'LEAVE_WORKSPACE', payload: { workspaceId } }
  //                    (userId는 payload가 아닌 ws.userId에서 읽음)
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleLeaveWorkspace(wss, ws, message) {
    if (!this.validateOrReject(ws, message, LEAVE_WORKSPACE_SCHEMA)) return;

    const workspaceId = message.payload.workspaceId ?? ws.workspaceId;
    // userId는 JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

    if (workspaceId === undefined || workspaceId === null) {
      this.sendError(ws, message.requestId, 'MISSING_WORKSPACE_ID', '퇴장할 workspaceId를 확인할 수 없습니다.');
      return;
    }

    if (!userId) {
      this.sendError(ws, message.requestId, 'MISSING_USER_ID', '퇴장할 userId를 확인할 수 없습니다.');
      return;
    }

    try {
      const result = await workspaceService.leaveWorkspace(ws, { workspaceId, userId });

      this.sendAck(ws, createLeaveWorkspaceAck(message.requestId ?? null, {
        workspaceId: result.workspaceId,
        userId: result.userId
      }));

      await auditLogger({
        action: 'LEAVE_WORKSPACE',
        userId: result.userId,
        status: 'SUCCESS',
        metadata: { workspaceId: result.workspaceId }
      });

      await broadcastService.broadcastWorkspaceUsersUpdated(ws, workspaceId);
    } catch (error) {
      const errorCode = error?.statusCode ?? 500;
      const errorMessage = error?.message || '워크스페이스 퇴장에 실패했습니다.';

      this.sendError(
        ws,
        message.requestId,
        errorCode,
        errorMessage
      );

      await auditLogger({
        action: 'LEAVE_WORKSPACE',
        userId,
        status: 'FAILURE',
        metadata: {
          workspaceId,
          errorCode,
          statusCode: error?.statusCode ?? null,
          reason: error?.message ?? null
        }
      });
    }
  }
}

const workspaceHandler = new WorkspaceHandler();

module.exports = {
  handleJoinWorkspace: (wss, ws, msg) => workspaceHandler.handleJoinWorkspace(wss, ws, msg),
  handleLeaveWorkspace: (wss, ws, msg) => workspaceHandler.handleLeaveWorkspace(wss, ws, msg),
  WorkspaceHandler
};