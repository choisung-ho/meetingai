// ============================================================
// server/sessions/workspaceStore.js
// ============================================================
// 역할:
//   워크스페이스별 현재 WebSocket 접속자 userId 목록을 Redis Set에 저장한다.
//   실제 워크스페이스 엔티티 CRUD는 FastAPI/DB에서 처리한다.
//
// SRP: workspaceId별 참여자 Set 관리만 담당.
//
// Redis Key : workspace:participants:{workspaceId}
// Redis Type: Set (userId 문자열 집합)
//
// Input/Output 흐름:
//   addUserToWorkspace(workspaceId, userId)       → Promise<string[]> 현재 참여자 목록
//   removeUserFromWorkspace(workspaceId, userId) → Promise<string[]> 제거 후 목록
//   getWorkspaceUsers(workspaceId)               → Promise<string[]>
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS, REDIS_PREFIX } = require('../redis/redisKeyConfig');

class WorkspaceStore {
  // ----------------------------------------------------------
  // _key  (private)
  // Input  : workspaceId — 워크스페이스 고유 ID
  // Output : string — Redis key
  // ----------------------------------------------------------
  _key(workspaceId) {
    return REDIS_KEYS.workspaceParticipants(workspaceId);
  }

  // ----------------------------------------------------------
  // addUserToWorkspace
  // Input  : workspaceId — 워크스페이스 고유 ID
  //          userId      — 사용자 고유 ID
  // Output : Promise<string[]> — 추가 후 현재 참여자 목록
  // ----------------------------------------------------------
  async addUserToWorkspace(workspaceId, userId) {
    await redisManager
      .getClient()
      .sAdd(this._key(workspaceId), String(userId));

    return this.getWorkspaceUsers(workspaceId);
  }

  // ----------------------------------------------------------
  // removeUserFromWorkspace
  // Input  : workspaceId — 워크스페이스 고유 ID
  //          userId      — 사용자 고유 ID
  // Output : Promise<string[]> — 제거 후 남은 참여자 목록
  // ----------------------------------------------------------
  async removeUserFromWorkspace(workspaceId, userId) {
    const key = this._key(workspaceId);

    await redisManager
      .getClient()
      .sRem(key, String(userId));

    const count = await redisManager.getClient().sCard(key);

    if (count === 0) {
      await redisManager.getClient().del(key);
      return [];
    }

    return this.getWorkspaceUsers(workspaceId);
  }

  // ----------------------------------------------------------
  // getWorkspaceUsers
  // Input  : workspaceId — 워크스페이스 고유 ID
  // Output : Promise<string[]> — 현재 참여자 userId 배열
  // ----------------------------------------------------------
  async getWorkspaceUsers(workspaceId) {
    const users = await redisManager
      .getClient()
      .sMembers(this._key(workspaceId));

    return users ?? [];
  }

  // ----------------------------------------------------------
  // isUserInWorkspace
  // Input  : workspaceId — 워크스페이스 고유 ID
  //          userId      — 사용자 고유 ID
  // Output : Promise<boolean>
  // ----------------------------------------------------------
  async isUserInWorkspace(workspaceId, userId) {
    const result = await redisManager
      .getClient()
      .sIsMember(this._key(workspaceId), String(userId));

    return result === true || result === 1;
  }

  // ----------------------------------------------------------
  // removeUserFromAllWorkspaces
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<string[]> — 변경된 workspaceId 배열
  // ----------------------------------------------------------
  async removeUserFromAllWorkspaces(userId) {
    const changedIds = [];

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.workspaceParticipantsPattern());

    for (const key of keys) {
      const isMember = await redisManager
        .getClient()
        .sIsMember(key, String(userId));

      if (isMember === true || isMember === 1) {
        await redisManager
          .getClient()
          .sRem(key, String(userId));

        changedIds.push(
          key.replace(REDIS_PREFIX.WORKSPACE_PARTICIPANTS, '')
        );

        const count = await redisManager.getClient().sCard(key);

        if (count === 0) {
          await redisManager.getClient().del(key);
        }
      }
    }

    return changedIds;
  }

  // ----------------------------------------------------------
  // clearWorkspaceParticipants  (테스트/종료용)
  // Input  : workspaceId — 워크스페이스 고유 ID
  // Output : Promise<number> — 삭제된 key 수
  // ----------------------------------------------------------
  async clearWorkspaceParticipants(workspaceId) {
    const key = this._key(workspaceId);
    const exists = await redisManager.getClient().exists(key);

    if (exists === 0) return 0;

    await redisManager.getClient().del(key);

    return 1;
  }

  // ----------------------------------------------------------
  // getAllWorkspaceParticipants  (디버깅용)
  // Input  : 없음
  // Output : Promise<Record<string, string[]>>
  // ----------------------------------------------------------
  async getAllWorkspaceParticipants() {
    const result = {};

    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.workspaceParticipantsPattern());

    for (const key of keys) {
      const workspaceId = key.replace(
        REDIS_PREFIX.WORKSPACE_PARTICIPANTS,
        ''
      );

      result[workspaceId] = await redisManager
        .getClient()
        .sMembers(key);
    }

    return result;
  }
}

module.exports = new WorkspaceStore();