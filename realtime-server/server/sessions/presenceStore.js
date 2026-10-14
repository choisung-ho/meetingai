// ============================================================
// server/sessions/presenceStore.js
// ============================================================
// 역할:
//   특정 scope(workspace/meetingRoom/meetingSession) 안에서
//   사용자의 현재 Presence 상태를 Redis에 저장/조회/삭제한다.
//
// SRP: scopeType + scopeId + userId 기준 Presence CRUD만 담당.
//
// Redis Key : presence:{scopeType}:{scopeId}:{userId}
// Redis Type: String (JSON)
//
// TTL 정책:
//   - Presence 전체 TTL 미적용
//   - 이유:
//     workspace / meetingRoom / meetingSession 위치 상태는
//     사용자가 실제로 입장해 있는 동안 유지되어야 하는 현재 상태 데이터이다.
//     TTL로 자동 만료되면 실제 접속 중인 사용자가 Redis에서 사라질 수 있다.
//
//   - 정리 방식:
//     JOIN 시 저장
//     LEAVE 시 삭제
//     DISCONNECT_USER 시 삭제
//     WebSocket close cleanup 시 삭제
//     테스트/서버 종료 시 clear 함수로 명시 삭제
//
// Input/Output 흐름:
//   setUserPresence(scopeType, scopeId, userId, data)  → PresenceData
//   getUserPresence(scopeType, scopeId, userId)        → PresenceData | null
//   removeUserPresence(scopeType, scopeId, userId)     → PresenceData | null
//   getPresenceList(scopeType, scopeId)                → PresenceData[]
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS } = require('../redis/redisKeyConfig');

class PresenceStore {
  // ----------------------------------------------------------
  // _key  (private)
  // Input  : scopeType, scopeId, userId
  // Output : string — Redis key
  // ----------------------------------------------------------
  _key(scopeType, scopeId, userId) {
    return REDIS_KEYS.presence(scopeType, scopeId, userId);
  }

  // ----------------------------------------------------------
  // _scopePattern  (private)
  // Input  : scopeType, scopeId
  // Output : string — Redis pattern
  // ----------------------------------------------------------
  _scopePattern(scopeType, scopeId) {
    return REDIS_KEYS.presenceScopePattern(scopeType, scopeId);
  }

  // ----------------------------------------------------------
  // _savePresence  (private)
  // Input  : scopeType, scopeId, userId, presence
  // Output : Promise<void>
  //
  // Presence는 TTL 없이 저장한다.
  // 위치 상태가 자동 만료되면 브로드캐스트 기준이 깨질 수 있으므로,
  // 입장/퇴장/연결 종료 흐름에서 명시적으로 삭제한다.
  // ----------------------------------------------------------
  async _savePresence(scopeType, scopeId, userId, presence) {
    const key = this._key(scopeType, scopeId, userId);
    const value = JSON.stringify(presence);

    await redisManager
      .getClient()
      .set(key, value);
  }

  // ----------------------------------------------------------
  // setUserPresence
  // Input  : scopeType    — 'workspace' | 'meetingRoom' | 'meetingSession'
  //          scopeId      — 공간 식별자
  //          userId       — 사용자 고유 ID
  //          presenceData — { status?, joinedAt?, lastSeenAt? }
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async setUserPresence(scopeType, scopeId, userId, presenceData = {}) {
    const now = new Date().toISOString();
    const existing = await this.getUserPresence(scopeType, scopeId, userId);

    const presence = {
      scopeType,
      scopeId,
      userId,
      status: presenceData.status ?? existing?.status ?? 'online',
      joinedAt: presenceData.joinedAt ?? existing?.joinedAt ?? now,
      lastSeenAt: presenceData.lastSeenAt ?? now
    };

    await this._savePresence(scopeType, scopeId, userId, presence);

    return presence;
  }

  // ----------------------------------------------------------
  // getUserPresence
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async getUserPresence(scopeType, scopeId, userId) {
    const data = await redisManager
      .getClient()
      .get(this._key(scopeType, scopeId, userId));

    return data ? JSON.parse(data) : null;
  }

  // ----------------------------------------------------------
  // updateUserPresenceStatus
  // Input  : scopeType, scopeId, userId, status
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async updateUserPresenceStatus(scopeType, scopeId, userId, status) {
    const existing = await this.getUserPresence(scopeType, scopeId, userId);

    if (!existing) {
      return this.setUserPresence(scopeType, scopeId, userId, { status });
    }

    const updated = {
      ...existing,
      status,
      lastSeenAt: new Date().toISOString()
    };

    await this._savePresence(scopeType, scopeId, userId, updated);

    return updated;
  }

  // ----------------------------------------------------------
  // updatePresenceLastSeen
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async updatePresenceLastSeen(scopeType, scopeId, userId) {
    const existing = await this.getUserPresence(scopeType, scopeId, userId);

    if (!existing) return null;

    const updated = {
      ...existing,
      lastSeenAt: new Date().toISOString()
    };

    await this._savePresence(scopeType, scopeId, userId, updated);

    return updated;
  }

  // ----------------------------------------------------------
  // removeUserPresence
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null> — 삭제 전 데이터
  // ----------------------------------------------------------
  async removeUserPresence(scopeType, scopeId, userId) {
    const existing = await this.getUserPresence(scopeType, scopeId, userId);

    await redisManager
      .getClient()
      .del(this._key(scopeType, scopeId, userId));

    return existing;
  }

  // ----------------------------------------------------------
  // getPresenceList
  // Input  : scopeType, scopeId
  // Output : Promise<PresenceData[]>
  // ----------------------------------------------------------
  async getPresenceList(scopeType, scopeId) {
    const keys = await redisManager
      .getClient()
      .keys(this._scopePattern(scopeType, scopeId));

    if (keys.length === 0) return [];

    const values = await redisManager
      .getClient()
      .mGet(keys);

    return values
      .filter(Boolean)
      .map((v) => JSON.parse(v));
  }

  // ----------------------------------------------------------
  // clearScopePresence  (종료/테스트용)
  // Input  : scopeType, scopeId
  // Output : Promise<number> — 삭제된 수
  // ----------------------------------------------------------
  async clearScopePresence(scopeType, scopeId) {
    const keys = await redisManager
      .getClient()
      .keys(this._scopePattern(scopeType, scopeId));

    if (keys.length === 0) return 0;

    await redisManager
      .getClient()
      .del(keys);

    return keys.length;
  }

  // ----------------------------------------------------------
  // removeUserFromAllPresence
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<number> — 삭제된 수
  // ----------------------------------------------------------
  async removeUserFromAllPresence(userId) {
    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.presenceUserPattern(userId));

    if (keys.length === 0) return 0;

    await redisManager
      .getClient()
      .del(keys);

    return keys.length;
  }

  // ----------------------------------------------------------
  // clearAllPresence  (테스트/초기화용)
  // Input  : 없음
  // Output : Promise<number>
  // ----------------------------------------------------------
  async clearAllPresence() {
    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.presenceAllPattern());

    if (keys.length === 0) return 0;

    await redisManager
      .getClient()
      .del(keys);

    return keys.length;
  }
}

module.exports = new PresenceStore();