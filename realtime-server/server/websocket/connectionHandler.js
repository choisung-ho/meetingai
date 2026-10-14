// ============================================================
// server/websocket/connectionHandler.js
// ============================================================
// 역할:
//   개별 WebSocket 연결의 생애주기를 관리한다.
//   연결 수립 → 메시지 수신 → 연결 종료 → 에러 처리 각 단계를 담당한다.
//   연결 관리 담당자
//
// SRP: 단일 연결의 이벤트 바인딩과 정리 로직만 담당.
//      메시지 처리는 MessageRouter, 데이터 정리는 각 Store/Service에 위임.
//
// 생애주기:
//   [연결 수립] → CONNECTED 전송
//   [message]  → MessageRouter.route()
//   [close]    → session/socket/meetingRoom/presence/authTimer 정리
//   [error]    → 에러 로그
/*
close 때 삭제:
- socketStore
- meetingRoom participants
- meetingRoom presence
- session:user:{userId}
- authTimer

close 때 유지:
- workspace participants
- workspace presence
- meeting status
- meeting cache
- issue cache
*/
// ============================================================

// 클라이언트가 보낸 메시지를 이벤트 타입별로 분기하는 라우터
const { messageRouter } = require('./messageRouter');
// 메시지 전송 공통 함수
const MessageSender = require('../utils/MessageSender');
// 세션 관리
const sessionStore = require('../sessions/sessionStore');
// userId와 실제 WebSocket 객체 연결
const socketStore = require('../sessions/socketStore');
// 워크스페이스 참여자 목록 관리
const workspaceStore = require('../sessions/workspaceStore');
// 회의방 참여자 목록 관리
const meetingRoomStore = require('../sessions/meetingRoomStore');

// 남은 사용자들에게 변경된 상태 알림
const broadcastService = require('../services/broadcastService');
// 사용자의 현재 접속 상태 관리
const presenceService = require('../services/presenceService');
const { createConnectedResponse } = require('../schemas/CommonSchema');
const logger = require('../utils/logger');
// jwt 보안
const { verifyToken } = require('../utils/jwtUtils');
const { auditLogger } = require('../utils/slogger');
const tokenStore = require('../fastapi/tokenStore');

// [추가] JWT exp 기반 WebSocket 만료 타이머 관리
const { scheduleAuthTimer, clearAuthTimer } = require('../handlers/authHandler');

class ConnectionHandler {
  // ----------------------------------------------------------
  // handle
  // Input  : wss — WebSocketServer 인스턴스
  //          ws  — 새로 연결된 WebSocket 객체
  //          req — WebSocket upgrade request
  // Output : void — ws 이벤트 리스너 등록
  // ----------------------------------------------------------
  // 클라이언트가 새로 접속할 때 실행
  async handle(wss, ws, req) {
    logger.info('클라이언트 연결 요청 수신');

    // ----------------------------------------------------------
    // 0. JWT 인증 처리
    // ----------------------------------------------------------
    // WebSocket 연결 URL에서 token 추출
    // 예: ws://localhost:8080?token=accessToken
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    // 토큰이 없으면 연결 차단
    if (!token) {
      logger.warn('WebSocket 인증 실패 — 토큰 없음');
      await auditLogger({
        action: 'WS_AUTH_FAILURE',
        userId: 'unknown',
        status: 'FAILURE',
        metadata: { reason: '토큰 누락', code: 4001 }
      });
      ws.close(4001, '인증 토큰이 누락되었습니다.');
      return;
    }

    // JWT 검증
    const decoded = verifyToken(token);

    // 토큰이 만료되었거나 위조되었으면 연결 차단
    if (!decoded) {
      logger.warn('WebSocket 인증 실패 — 유효하지 않거나 만료된 토큰');
      await auditLogger({
        action: 'WS_AUTH_FAILURE',
        userId: 'unknown',
        status: 'FAILURE',
        metadata: { reason: '유효하지 않거나 만료된 토큰', code: 4002 }
      });
      ws.close(4002, '유효하지 않거나 만료된 토큰입니다.');
      return;
    }

    // JWT 안에 사용자 ID가 없으면 연결 차단
    if (!decoded.sub) {
      logger.warn('WebSocket 인증 실패 — sub 누락');
      await auditLogger({
        action: 'WS_AUTH_FAILURE',
        userId: decoded.sub || 'unknown',
        status: 'FAILURE',
        metadata: { reason: 'sub 누락', code: 4003 }
      });
      ws.close(4003, '토큰에 사용자 정보가 없습니다.');
      return;
    }

    // 인증 성공 시 소켓 객체에 사용자/권한/토큰 정보 저장
    // 이후 모든 이벤트에서는 message.payload.userId 대신 ws.userId를 사용한다.
    ws.userId = decoded.sub;
    ws.role = decoded.role || 'member';
    ws.isAuthenticated = true;
    ws.token = token; // FastAPI 호출 시 Bearer 헤더에 사용
    ws.lastPingAt = Date.now();

    // ----------------------------------------------------------
    // [추가] Phase 3: Access Token 만료 자동 종료 타이머 설정
    // ----------------------------------------------------------
    // decoded.exp 기준으로 남은 시간을 계산하고,
    // 만료 시 SESSION_EXPIRED 전송 후 WebSocket 연결을 종료한다.
    const authTimerScheduled = scheduleAuthTimer(ws, decoded);

    if (!authTimerScheduled) {
      MessageSender.sendError(
        ws,
        null,
        'TOKEN_REFRESH_FAILED',
        '토큰 갱신 타이머 설정에 실패했습니다.'
      );

      ws.close(4006, 'TOKEN_REFRESH_FAILED');
      return;
    }

    logger.info(
      `WebSocket 인증 성공 — userId=${ws.userId}, role=${ws.role}`
    );

    await auditLogger({
      action: 'WS_AUTH_SUCCESS',
      userId: ws.userId,
      status: 'SUCCESS',
      metadata: { role: ws.role }
    });

    if (!ws.isAuthenticated || !ws.userId) {
      logger.warn('인증되지 않은 WebSocket 메시지 차단');

      MessageSender.sendError(
        ws,
        null,
        'UNAUTHORIZED',
        '인증되지 않은 WebSocket 연결입니다.'
      );

      ws.close(4004, 'UNAUTHORIZED');
      return;
    }

    logger.info('클라이언트 연결됨');

    // 클라이언트가 WebSocket 서버에 접속하자마자 서버가 CONNECTED 응답
    MessageSender.sendJson(ws, createConnectedResponse());

    // message 이벤트: 클라이언트 메시지 수신
    // 클라이언트가 서버로 메시지를 보낼 때마다 실행
    ws.on('message', async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage);

        const isTokenUpdateMessage = await this._handleUpdateToken(ws, message);

        if (isTokenUpdateMessage) {
          return;
        }

        // 메시지 단위 인증 컨텍스트 2차 검증
        if (!ws.isAuthenticated || !ws.userId || !ws.token) {
          logger.warn(
            `인증되지 않은 WebSocket 메시지 차단: userId=${ws.userId ?? 'unknown'}, type=${message?.type ?? 'unknown'}`
          );

          MessageSender.sendError(
            ws,
            message?.requestId || null,
            'UNAUTHORIZED',
            '인증되지 않은 WebSocket 연결입니다.'
          );

          ws.close(4004, 'UNAUTHORIZED');
          return;
        }

        await tokenStore.run(ws.token, () =>
          messageRouter.route(wss, ws, rawMessage)
        );
      } catch (error) {
        logger.error(`메시지 처리 중 예외 발생: ${error.message}`);
        MessageSender.sendError(
          ws,
          null,
          'MESSAGE_PROCESSING_ERROR',
          '메시지 처리 중 오류가 발생했습니다.'
        );
      }
    });

    // close 이벤트: 연결 종료 — 세션/참여자/Presence/AuthTimer 정리
    ws.on('close', async () => {
      // close 이전에 상태값 캡처
      // 연결이 끊기면 이 사용자가 어디에 있었는지 알아야 정리
      const closedUserId = ws.userId;
      const closedWorkspaceId = ws.workspaceId;
      const closedMeetingRoomId = ws.meetingRoomId;
      const closedMeetingId = ws.meetingId;

      logger.info(
        `클라이언트 연결 종료 — userId=${closedUserId ?? '없음'}, workspaceId=${closedWorkspaceId ?? '없음'}, meetingRoomId=${closedMeetingRoomId ?? '없음'}`
      );

      try {
        // 실제 정리 작업은 _cleanupConnection
        await this._cleanupConnection(ws, {
          userId: closedUserId,
          workspaceId: closedWorkspaceId,
          meetingRoomId: closedMeetingRoomId,
          meetingId: closedMeetingId
        });
      } catch (error) {
        logger.error(`연결 종료 정리 중 오류: ${error.message}`);
      } finally {
        // ------------------------------------------------------
        // [추가] WebSocket 종료 시 인증 타이머 제거
        // ------------------------------------------------------
        clearAuthTimer(ws);

        // ws 상태값 초기화
        ws.userId = null;
        ws.name = null;
        ws.workspaceId = null;
        ws.meetingRoomId = null;
        ws.meetingId = null;

        // 인증 정보 초기화
        ws.role = null;
        ws.isAuthenticated = false;
        ws.token = null;
        ws.tokenExpiresAt = null;
      }
    });

    // error 이벤트: WebSocket 통신 에러
    ws.on('error', (error) => {
      logger.error('WebSocket 에러:', error.message);
    });
  }

  // ----------------------------------------------------------
  // _cleanupConnection  (private)
  // Input  : ws            — WebSocket 객체
  //          userId        — 종료된 연결의 사용자 ID
  //          workspaceId   — 마지막 참여 워크스페이스 ID
  //          meetingRoomId — 마지막 참여 회의방 ID
  //          meetingId     — 마지막 참여 회의 ID
  // Output : Promise<void>
  // 연결 종료 시 실제 데이터를 정리하는 함수
  // ----------------------------------------------------------
  async _cleanupConnection(ws, { userId, workspaceId, meetingRoomId, meetingId }) {
    // 1. 소켓 정리
    // WebSocket 연결이 닫혔으므로 실제 ws 객체 매핑을 제거한다.
    if (userId) {
      socketStore.removeClient(userId, ws);
      logger.info(`사용자 소켓 정리: userId=${userId}`);
    }

    // 2. 회의방 정리
    // close는 회의 종료나 워크스페이스 퇴장이 아니라 연결 종료이므로,
    // 사용자가 실제로 들어가 있던 회의방 입장 상태만 제거한다.
    if (workspaceId && meetingRoomId && userId && meetingId !== undefined && meetingId !== null) {
      await meetingRoomStore.removeUserFromMeetingRoom(
        workspaceId,
        meetingId,
        meetingRoomId,
        userId
      );

      await presenceService.removeMeetingRoomPresence(
        workspaceId,
        meetingId,
        meetingRoomId,
        userId
      );

      logger.info(
        `회의방 정리: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${userId}`
      );

      await broadcastService.broadcastMeetingRoomUsersUpdated(ws, {
        workspaceId,
        meetingRoomId,
        meetingId
      });
    }

    // 3. 사용자 WebSocket 세션 정리
    // 다음 WebSocket 연결 시 CONNECT_USER로 다시 등록하므로 close 때 삭제한다.
    if (userId) {
      const currentClient = socketStore.getClient(userId);

      if (!currentClient || currentClient === ws) {
        await sessionStore.removeUserSession(userId);
        logger.info(`사용자 세션 정리: userId=${userId}`);
      } else {
        logger.info(
          `사용자 세션 정리 생략: 동일 userId의 다른 활성 소켓 존재, userId=${userId}`
        );
      }
    }
  }

  // ----------------------------------------------------------
  // _handleUpdateToken  (private)
  // Input  : ws      — WebSocket 객체
  //          message  — 클라이언트가 보낸 UPDATE_TOKEN 메시지
  // Output : boolean — UPDATE_TOKEN 처리 여부
  // ----------------------------------------------------------
  async _handleUpdateToken(ws, message) {
    if (message.type !== 'UPDATE_TOKEN') {
      return false;
    }

    const accessToken = message.payload?.accessToken;

    if (!accessToken) {
      MessageSender.sendError(
        ws,
        message.requestId || null,
        'TOKEN_MISSING',
        'accessToken이 누락되었습니다.'
      );
      return true;
    }

    const decoded = verifyToken(accessToken);

    if (!decoded) {
      MessageSender.sendError(
        ws,
        message.requestId || null,
        'UNAUTHORIZED',
        '유효하지 않거나 만료된 토큰입니다.'
      );
      return true;
    }

    if (!decoded.sub) {
      MessageSender.sendError(
        ws,
        message.requestId || null,
        'INVALID_TOKEN',
        '토큰에 사용자 정보가 없습니다.'
      );
      return true;
    }

    // 기존 연결 사용자와 새 토큰의 사용자가 다르면 차단
    if (ws.userId && String(ws.userId) !== String(decoded.sub)) {
      MessageSender.sendError(
        ws,
        message.requestId || null,
        'TOKEN_USER_MISMATCH',
        '현재 WebSocket 사용자와 갱신 토큰의 사용자가 일치하지 않습니다.'
      );
      return true;
    }

    // 새 토큰 기준으로 소켓 인증 정보 갱신
    ws.userId = decoded.sub;
    ws.role = decoded.role || 'member';
    ws.isAuthenticated = true;
    ws.token = accessToken;

    // 새 exp 기준으로 인증 타이머 재설정
    const authTimerScheduled = scheduleAuthTimer(ws, decoded);

    if (!authTimerScheduled) {
      return true;
    }

    MessageSender.sendJson(ws, {
      type: 'UPDATE_TOKEN_SUCCESS',
      requestId: message.requestId || null,
      success: true,
      payload: {
        message: 'WebSocket 세션 토큰이 갱신되었습니다.'
      }
    });

    logger.info(`WebSocket 토큰 갱신 완료 — userId=${ws.userId}`);

    return true;
  }
}

const connectionHandler = new ConnectionHandler();

// 하위 호환: handleConnection 함수 형태도 노출
function handleConnection(wss, ws, req) {
  return connectionHandler.handle(wss, ws, req);
}

module.exports = { ConnectionHandler, connectionHandler, handleConnection };
