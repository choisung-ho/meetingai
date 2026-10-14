// ============================================================
// server/handlers/meetingRoomHandler.js
// ============================================================
// 역할:
//   MeetingRoom 계층 WebSocket 이벤트(JOIN_MEETING_ROOM, LEAVE_MEETING_ROOM)를 처리한다.
//   스키마 검증 → 서비스 호출 → ACK 응답 전송 → 브로드캐스트 흐름을 담당한다.
//
// SRP: MeetingRoom 이벤트 검증/응답 흐름만 담당.
//      참여자 변경은 meetingRoomService, 브로드캐스트는 broadcastService에 위임.
//
// 매개변수 순서 기준:
//   workspaceId → meetingId → meetingRoomId → userId
//
// 패킷 흐름:
//   Client → JOIN_MEETING_ROOM  → handleJoinMeetingRoom
//                                → MeetingRoomService.joinMeetingRoom
//                                → ACK 전송
//                                → BroadcastService.broadcastMeetingRoomUsersUpdated
//   Client → LEAVE_MEETING_ROOM → handleLeaveMeetingRoom
//                                → MeetingRoomService.leaveMeetingRoom
//                                → ACK 전송
//                                → BroadcastService.broadcastMeetingRoomUsersUpdated
// ============================================================

const BaseHandler = require('./BaseHandler');
const meetingRoomService = require('../services/meetingRoomService');
const broadcastService = require('../services/broadcastService');
const MessageSender = require('../utils/MessageSender');
const { auditLogger } = require('../utils/slogger');
const { createSessionExpiredResponse } = require('../schemas/authSchema');

const {
  JOIN_MEETING_ROOM_SCHEMA,
  LEAVE_MEETING_ROOM_SCHEMA,
  createJoinMeetingRoomAck,
  createLeaveMeetingRoomAck
} = require('../schemas/meetingRoomSchema');

class MeetingRoomHandler extends BaseHandler {
  // ----------------------------------------------------------
  // handleJoinMeetingRoom
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId가 저장된 WebSocket 객체
  //          message — {
  //            type: 'JOIN_MEETING_ROOM',
  //            payload: { workspaceId, meetingId, meetingRoomId }
  //          }
  //          (userId는 payload가 아닌 ws.userId에서 읽음)
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleJoinMeetingRoom(wss, ws, message) {
    // --------------------------------------------------------
    // 1. WebSocket 인증 상태 확인
    // --------------------------------------------------------
    if (!ws.isAuthenticated || !ws.userId) {
      this.sendError(
        ws,
        message.requestId,
        'UNAUTHORIZED',
        '인증되지 않은 사용자입니다.'
      );

      ws.close(4001, '인증되지 않은 사용자입니다.');
      return;
    }

    // --------------------------------------------------------
    // 2. Access Token 만료 여부 2차 확인
    // connectionHandler에서 ws.tokenExpiresAt을 저장한 경우에만 검사한다.
    // --------------------------------------------------------
    if (ws.tokenExpiresAt && Date.now() >= ws.tokenExpiresAt) {
      MessageSender.sendJson(ws, createSessionExpiredResponse());
      ws.close(4003, 'Access Token이 만료되었습니다.');
      return;
    }

    // --------------------------------------------------------
    // 3. 기존 JOIN_MEETING_ROOM 스키마 검증
    // --------------------------------------------------------
    if (!this.validateOrReject(ws, message, JOIN_MEETING_ROOM_SCHEMA)) return;

    const workspaceId = message.payload.workspaceId;
    const meetingId = message.payload.meetingId;
    const meetingRoomId = message.payload.meetingRoomId;

    // userId는 JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

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
        'payload.meetingRoomId가 필요합니다.'
      );
      return;
    }

    if (!userId) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_USER_ID',
        'ws.userId가 없습니다. JWT 인증이 필요합니다.'
      );
      return;
    }

    try {
      const result = await meetingRoomService.joinMeetingRoom(ws, {
        workspaceId,
        meetingId,
        meetingRoomId,
        userId
      });

      this.sendAck(
        ws,
        createJoinMeetingRoomAck(message.requestId ?? null, {
          workspaceId: result.workspaceId,
          meetingId: result.meetingId,
          meetingRoomId: result.meetingRoomId,
          userId: result.userId
        })
      );

      await auditLogger({
        action: 'JOIN_MEETING_ROOM',
        userId: result.userId,
        status: 'SUCCESS',
        metadata: {
          workspaceId: result.workspaceId,
          meetingId: result.meetingId,
          meetingRoomId: result.meetingRoomId
        }
      });

      await broadcastService.broadcastMeetingRoomUsersUpdated(ws, {
        workspaceId: result.workspaceId,
        meetingId: result.meetingId,
        meetingRoomId: result.meetingRoomId
      });
    } catch (error) {
      const errorCode = error?.statusCode ?? 500;
      const errorMessage = error?.message || '회의방 입장에 실패했습니다.';

      this.sendError(
        ws,
        message.requestId,
        errorCode,
        errorMessage
      );

      await auditLogger({
        action: 'JOIN_MEETING_ROOM',
        userId,
        status: 'FAILURE',
        metadata: {
          workspaceId,
          meetingId,
          meetingRoomId,
          errorCode,
          statusCode: error?.statusCode ?? null,
          reason: error?.message ?? null
        }
      });
    }
  }

  // ----------------------------------------------------------
  // handleLeaveMeetingRoom
  // Input  : wss     — WebSocketServer 인스턴스
  //          ws      — JWT 검증 후 ws.userId, ws.workspaceId 등이 저장된 WebSocket 객체
  //          message — {
  //            type: 'LEAVE_MEETING_ROOM',
  //            payload: { workspaceId?, meetingId?, meetingRoomId? }
  //          }
  //          (userId는 payload가 아닌 ws.userId에서 읽음)
  // Output : Promise<void>
  // ----------------------------------------------------------
  async handleLeaveMeetingRoom(wss, ws, message) {
    if (!this.validateOrReject(ws, message, LEAVE_MEETING_ROOM_SCHEMA)) return;

    const workspaceId = message.payload.workspaceId ?? ws.workspaceId;
    const meetingId = message.payload.meetingId ?? ws.meetingId;
    const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId;

    // userId는 JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용)
    const userId = ws.userId;

    if (workspaceId === undefined || workspaceId === null) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_WORKSPACE_ID',
        '퇴장할 workspaceId를 확인할 수 없습니다.'
      );
      return;
    }

    if (meetingId === undefined || meetingId === null) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_MEETING_ID',
        '퇴장할 meetingId를 확인할 수 없습니다.'
      );
      return;
    }

    if (meetingRoomId === undefined || meetingRoomId === null) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_MEETING_ROOM_ID',
        '퇴장할 meetingRoomId를 확인할 수 없습니다.'
      );
      return;
    }

    if (!userId) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_USER_ID',
        '퇴장할 userId를 확인할 수 없습니다.'
      );
      return;
    }

    try {
      const result = await meetingRoomService.leaveMeetingRoom(ws, {
        workspaceId,
        meetingId,
        meetingRoomId,
        userId
      });

      this.sendAck(
        ws,
        createLeaveMeetingRoomAck(message.requestId ?? null, {
          workspaceId: result.workspaceId,
          meetingId: result.meetingId,
          meetingRoomId: result.meetingRoomId,
          userId: result.userId
        })
      );

      await auditLogger({
        action: 'LEAVE_MEETING_ROOM',
        userId: result.userId,
        status: 'SUCCESS',
        metadata: {
          workspaceId: result.workspaceId,
          meetingId: result.meetingId,
          meetingRoomId: result.meetingRoomId
        }
      });

      await broadcastService.broadcastMeetingRoomUsersUpdated(ws, {
        workspaceId: result.workspaceId,
        meetingId: result.meetingId,
        meetingRoomId: result.meetingRoomId
      });
    } catch (error) {
      const errorCode = error?.statusCode ?? 500;
      const errorMessage = error?.message || '회의방 퇴장에 실패했습니다.';

      this.sendError(
        ws,
        message.requestId,
        errorCode,
        errorMessage
      );

      await auditLogger({
        action: 'LEAVE_MEETING_ROOM',
        userId,
        status: 'FAILURE',
        metadata: {
          workspaceId,
          meetingId,
          meetingRoomId,
          errorCode,
          statusCode: error?.statusCode ?? null,
          reason: error?.message ?? null
        }
      });
    }
  }
}

const meetingRoomHandler = new MeetingRoomHandler();

module.exports = {
  handleJoinMeetingRoom: (wss, ws, msg) =>
    meetingRoomHandler.handleJoinMeetingRoom(wss, ws, msg),

  handleLeaveMeetingRoom: (wss, ws, msg) =>
    meetingRoomHandler.handleLeaveMeetingRoom(wss, ws, msg),

  MeetingRoomHandler
};