// ============================================================
// server/sessions/meetingRoomStore.js
// ============================================================
// 역할:
//   회의방별 현재 WebSocket 접속자 userId 목록을 Redis Set에 저장한다.
//   실제 회의방 엔티티 CRUD는 FastAPI/DB에서 처리한다.
//
// SRP: workspaceId + meetingId + meetingRoomId 기준 참여자 Set 관리만 담당.
//
// Redis Key : meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}
// Redis Type: Set (userId 문자열 집합)
//
// Input/Output 흐름:
//   addUserToMeetingRoom(wId, meetingId, meetingRoomId, userId)       → Promise<string[]>
//   removeUserFromMeetingRoom(wId, meetingId, meetingRoomId, userId) → Promise<string[]>
//   getMeetingRoomUsers(wId, meetingId, meetingRoomId)               → Promise<string[]>
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS, REDIS_PREFIX } = require('../redis/redisKeyConfig');

class MeetingRoomStore {
  // ----------------------------------------------------------
  // _key  (private)
  // Input  : workspaceId, meetingId, meetingRoomId
  // Output : string — Redis key
  // ----------------------------------------------------------
  _key(workspaceId, meetingId, meetingRoomId) {
    return REDIS_KEYS.meetingRoomParticipants(
      workspaceId,
      meetingId,
      meetingRoomId
    );
  }

  // ----------------------------------------------------------
  // _parseKey  (private)
  // Input  : key — Redis key
  // Output : { workspaceId, meetingId, meetingRoomId }
  // ----------------------------------------------------------
  _parseKey(key) {
    const [workspaceId, meetingId, meetingRoomId] = key
      .replace(REDIS_PREFIX.MEETING_ROOM_PARTICIPANTS, '')
      .split(':');

    return { workspaceId, meetingId, meetingRoomId };
  }

  // ----------------------------------------------------------
  // addUserToMeetingRoom
  // Input  : workspaceId   — 워크스페이스 고유 ID
  //          meetingId     — 실제 생성된 회의 고유 ID
  //          meetingRoomId — 회의방 접속 상태 고유 ID
  //          userId        — 사용자 고유 ID
  // Output : Promise<string[]> — 추가 후 참여자 목록
  // ----------------------------------------------------------
  async addUserToMeetingRoom(workspaceId, meetingId, meetingRoomId, userId) {
    await redisManager
      .getClient()
      .sAdd(this._key(workspaceId, meetingId, meetingRoomId), String(userId));

    return this.getMeetingRoomUsers(workspaceId, meetingId, meetingRoomId);
  }

  // ----------------------------------------------------------
  // removeUserFromMeetingRoom
  // Input  : workspaceId, meetingId, meetingRoomId, userId
  // Output : Promise<string[]> — 제거 후 남은 참여자 목록
  // ----------------------------------------------------------
  async removeUserFromMeetingRoom(workspaceId, meetingId, meetingRoomId, userId) {
    const key = this._key(workspaceId, meetingId, meetingRoomId);

    await redisManager.getClient().sRem(key, String(userId));

    const count = await redisManager.getClient().sCard(key);
    if (count === 0) {
      await redisManager.getClient().del(key);
      return [];
    }

    return this.getMeetingRoomUsers(workspaceId, meetingId, meetingRoomId);
  }

  // ----------------------------------------------------------
  // getMeetingRoomUsers
  // Input  : workspaceId, meetingId, meetingRoomId
  // Output : Promise<string[]>
  // ----------------------------------------------------------
  async getMeetingRoomUsers(workspaceId, meetingId, meetingRoomId) {
    const users = await redisManager
      .getClient()
      .sMembers(this._key(workspaceId, meetingId, meetingRoomId));

    return users ?? [];
  }

  // ----------------------------------------------------------
  // isUserInMeetingRoom
  // Input  : workspaceId, meetingId, meetingRoomId, userId
  // Output : Promise<boolean>
  // ----------------------------------------------------------
  async isUserInMeetingRoom(workspaceId, meetingId, meetingRoomId, userId) {
    const result = await redisManager.getClient().sIsMember(
      this._key(workspaceId, meetingId, meetingRoomId),
      String(userId)
    );

    return result === true || result === 1;
  }

  // ----------------------------------------------------------
  // removeUserFromAllMeetingRooms
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<{workspaceId, meetingId, meetingRoomId}[]>
  // ----------------------------------------------------------
  async removeUserFromAllMeetingRooms(userId) {
    const changed = [];

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.meetingRoomParticipantsPattern());

    for (const key of keys) {
      const isMember = await redisManager
        .getClient()
        .sIsMember(key, String(userId));

      if (isMember === true || isMember === 1) {
        await redisManager.getClient().sRem(key, String(userId));

        const { workspaceId, meetingId, meetingRoomId } = this._parseKey(key);
        changed.push({ workspaceId, meetingId, meetingRoomId });

        const count = await redisManager.getClient().sCard(key);
        if (count === 0) {
          await redisManager.getClient().del(key);
        }
      }
    }

    return changed;
  }

  // ----------------------------------------------------------
  // removeUserFromWorkspaceMeetingRooms
  // Input  : workspaceId, userId
  // Output : Promise<{meetingId, meetingRoomId}[]> — 변경된 meetingRoom 정보 배열
  // ----------------------------------------------------------
  async removeUserFromWorkspaceMeetingRooms(workspaceId, userId) {
    const changedRooms = [];

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.workspaceMeetingRoomsPattern(workspaceId));

    for (const key of keys) {
      const isMember = await redisManager
        .getClient()
        .sIsMember(key, String(userId));

      if (isMember === true || isMember === 1) {
        await redisManager.getClient().sRem(key, String(userId));

        const parsed = this._parseKey(key);
        changedRooms.push({
          meetingId: parsed.meetingId,
          meetingRoomId: parsed.meetingRoomId
        });

        const count = await redisManager.getClient().sCard(key);
        if (count === 0) {
          await redisManager.getClient().del(key);
        }
      }
    }

    return changedRooms;
  }

  // ----------------------------------------------------------
  // clearMeetingRoomParticipants  (테스트/종료용)
  // Input  : workspaceId, meetingId, meetingRoomId
  // Output : Promise<number>
  // ----------------------------------------------------------
  async clearMeetingRoomParticipants(workspaceId, meetingId, meetingRoomId) {
    const key = this._key(workspaceId, meetingId, meetingRoomId);
    const exists = await redisManager.getClient().exists(key);

    if (exists === 0) return 0;

    await redisManager.getClient().del(key);
    return 1;
  }

  // ----------------------------------------------------------
  // clearWorkspaceMeetingRooms  (테스트/종료용)
  // Input  : workspaceId
  // Output : Promise<number> — 삭제된 key 수
  // ----------------------------------------------------------
  async clearWorkspaceMeetingRooms(workspaceId) {
    let count = 0;

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.workspaceMeetingRoomsPattern(workspaceId));

    for (const key of keys) {
      await redisManager.getClient().del(key);
      count++;
    }

    return count;
  }

  // ----------------------------------------------------------
  // getAllMeetingRoomParticipants  (디버깅용)
  // Input  : 없음
  // Output : Promise<Record<string, Record<string, Record<string, string[]>>>>
  //          result[workspaceId][meetingId][meetingRoomId] = userId[]
  // ----------------------------------------------------------
  async getAllMeetingRoomParticipants() {
    const result = {};

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.meetingRoomParticipantsPattern());

    for (const key of keys) {
      const { workspaceId, meetingId, meetingRoomId } = this._parseKey(key);
      const users = await redisManager.getClient().sMembers(key);

      if (!result[workspaceId]) result[workspaceId] = {};
      if (!result[workspaceId][meetingId]) result[workspaceId][meetingId] = {};

      result[workspaceId][meetingId][meetingRoomId] = users;
    }

    return result;
  }

    // ----------------------------------------------------------
  // getMeetingUsers
  // Input  : workspaceId — 워크스페이스 고유 ID
  //          meetingId   — 실제 생성된 회의 고유 ID
  // Output : Promise<string[]> — 해당 meeting 안의 모든 meetingRoom 참여자 userId 목록
  //
  // 설명:
  //   Redis에 저장된 meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}
  //   key들을 조회해서, 같은 meeting에 접속 중인 모든 사용자를 중복 없이 반환한다.
  //   Alert 같은 서버 발생 이벤트 broadcast 대상 조회에 사용한다.
  // ----------------------------------------------------------
  async getMeetingUsers(workspaceId, meetingId) {
    const users = new Set();

    const keys = await redisManager
      .getClient()
      .keys(
        REDIS_KEYS.meetingRoomParticipantsByMeetingPattern(
          workspaceId,
          meetingId
        )
      );

    for (const key of keys) {
      const roomUsers = await redisManager.getClient().sMembers(key);

      for (const userId of roomUsers) {
        users.add(userId);
      }
    }

    return Array.from(users);
  }
}

module.exports = new MeetingRoomStore();