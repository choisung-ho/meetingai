// ============================================================
// server/services/meetingRoomService.js
// ============================================================
// 역할:
//   MeetingRoom 계층 비즈니스 로직을 담당한다.
//   JOIN_MEETING_ROOM, LEAVE_MEETING_ROOM 핸들러가 호출한다.
//
// SRP: 회의방 입장/퇴장 처리 로직만 담당.
//      응답 전송은 handler에서, 브로드캐스트는 broadcastService에서 담당.
//
// Input/Output 흐름:
//   joinMeetingRoom(ws, { workspaceId, meetingRoomId, meetingId, userId })  → MeetingRoomServiceResult
//   leaveMeetingRoom(ws, { workspaceId, meetingRoomId, meetingId, userId }) → MeetingRoomServiceResult
// ============================================================

const meetingRoomStore = require('../sessions/meetingRoomStore');
const presenceService = require('./presenceService');
const meetingApi = require('../fastapi/meetingApi');
const logger = require('../utils/logger');

class MeetingRoomService {
  // ----------------------------------------------------------
  // _validateMeetingRoomPayload  (private)
  // Input  : action, workspaceId, meetingId, meetingRoomId, userId
  // Output : void
  // ----------------------------------------------------------
  _validateMeetingRoomPayload(action, { workspaceId, meetingId, meetingRoomId, userId }) {
    if (workspaceId === undefined || workspaceId === null) {
      throw new Error(`${action} 실패: workspaceId 없음`);
    }

    if (meetingId === undefined || meetingId === null) {
      throw new Error(`${action} 실패: meetingId 없음`);
    }

    if (meetingRoomId === undefined || meetingRoomId === null) {
      throw new Error(`${action} 실패: meetingRoomId 없음`);
    }

    if (!userId) {
      throw new Error(`${action} 실패: userId 없음`);
    }
  }

  // ----------------------------------------------------------
  // joinMeetingRoom
  // Input  : ws            — JWT 검증 후 ws.userId가 이미 설정된 WebSocket 객체
  //                          (ws.workspaceId, ws.meetingId, ws.meetingRoomId 세팅)
  //          workspaceId   — 워크스페이스 고유 ID
  //          meetingRoomId — 회의방 접속 상태 고유 ID
  //          meetingId     — 실제 생성된 회의 고유 ID
  //          userId        — JWT에서 추출된 사용자 고유 ID (ws.userId와 동일)
  // Output : Promise<MeetingRoomServiceResult>
  //          { workspaceId, meetingRoomId, meetingId, userId, users: string[] }
  // ----------------------------------------------------------
  async joinMeetingRoom(ws, { workspaceId, meetingRoomId, meetingId, userId }) {
    this._validateMeetingRoomPayload('JOIN_MEETING_ROOM', {
      workspaceId,
      meetingId,
      meetingRoomId,
      userId
    });

    // JOIN_MEETING_ROOM 입장 전 FastAPI에서 workspace + meeting 접근 권한 검증
    // meeting은 실제 권한 검증 대상이다.
    // meetingRoomId는 WebSocket 접속 상태를 구분하기 위한 값으로 사용한다.
    // 검증 실패 시 Redis 회의방 참여 상태와 presence를 생성하지 않는다.
    // GET /meetings/{meeting_id} 또는 meetingApi 내부 정의 endpoint
    //
    // FastAPI 응답 기준:
    // - 200: 정상 멤버이며 해당 workspace에 meeting 존재
    // - 401: 토큰 없음 또는 만료
    // - 403: workspace 멤버 아님
    // - 404: 해당 workspace에 meeting 없음
    //
    // 여기서는 기존 통신 코드를 바꾸지 않는다.
    // meetingApi / fastApiClient에서 throw된 error.statusCode를 그대로 Handler로 올려보낸다.
    try {
      await meetingApi.getMeeting({
        workspaceId,
        meetingId
      });
    } catch (error) {
      logger.warn(
        `회의방 입장 검증 실패: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${userId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
      );

      throw error;
    }

    // 2. JWT userId와 payload userId 일치 검증
    if (String(ws.userId) !== String(userId)) {
      logger.warn(
        `회의방 입장 차단: JWT userId와 요청 userId 불일치, ws.userId=${ws.userId}, payload.userId=${userId}, workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}`
      );

      const error = new Error('인증 사용자와 요청 사용자가 일치하지 않습니다.');
      error.statusCode = 403;
      throw error;
    }

    // 2. 검증 성공 후에만 ws 상태 변경
    // ws.userId는 JWT 검증 시 이미 설정되어 있으므로 덮어쓰지 않는다.
    ws.workspaceId = workspaceId;
    ws.meetingId = meetingId;
    ws.meetingRoomId = meetingRoomId;

    // 3. 검증 성공 후에만 Redis 회의방 입장 처리
    const users = await meetingRoomStore.addUserToMeetingRoom(
      workspaceId,
      meetingId,
      meetingRoomId,
      userId
    );

    // 4. 검증 성공 후에만 presence 저장
    await presenceService.markMeetingRoomOnline(
      workspaceId,
      meetingId,
      meetingRoomId,
      userId
    );

    logger.info(
      `회의방 참여: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${userId}`
    );

    return { workspaceId, meetingId, meetingRoomId, userId, users };
  }

  // ----------------------------------------------------------
  // leaveMeetingRoom
  // Input  : ws            — WebSocket 객체 (ws.meetingRoomId, ws.meetingId 초기화)
  //          workspaceId   — 워크스페이스 고유 ID
  //          meetingRoomId — 회의방 접속 상태 고유 ID
  //          meetingId     — 실제 생성된 회의 고유 ID
  //          userId        — 사용자 고유 ID
  // Output : Promise<MeetingRoomServiceResult>
  //          { workspaceId, meetingRoomId, meetingId, userId, users: string[] }
  // ----------------------------------------------------------
  async leaveMeetingRoom(ws, { workspaceId, meetingRoomId, meetingId, userId }) {
    this._validateMeetingRoomPayload('LEAVE_MEETING_ROOM', {
      workspaceId,
      meetingId,
      meetingRoomId,
      userId
    });

    const users = await meetingRoomStore.removeUserFromMeetingRoom(
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

    // ws.workspaceId는 회의방 퇴장 시 초기화하지 않는다 (워크스페이스 참여는 유지)
    if (
      ws.workspaceId === workspaceId &&
      ws.meetingId === meetingId &&
      ws.meetingRoomId === meetingRoomId &&
      ws.userId === userId
    ) {
      ws.meetingRoomId = null;
      ws.meetingId = null;
    }

    logger.info(
      `회의방 퇴장: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${userId}`
    );

    return { workspaceId, meetingId, meetingRoomId, userId, users };
  }
}

module.exports = new MeetingRoomService();
