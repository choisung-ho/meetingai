// ============================================================
// server/sessions/sessionStore.js
// ============================================================
// 역할:
//   접속 중인 사용자 세션 메타데이터를 Redis에 저장/조회/삭제한다.
//   ws 객체는 저장하지 않으며 JSON 직렬화 가능한 정보만 관리한다.
//
// SRP: Redis 세션 CRUD만 담당.
//
// Redis Key : session:user:{userId}
// Redis Type: String (JSON)
//
// 보안 적용 후 원칙:
//   - userId는 JWT 검증 후 ws.userId에서 온 값만 사용한다.
//   - sessionStore는 전달받은 검증 완료 데이터를 Redis에 저장만 한다.
//   - 클라이언트 payload.userId는 신뢰하지 않는다.
//
// Input/Output 흐름:
//   addUserSession(userId, data)   → UserSession 저장 및 반환
//   getUserSession(userId)         → UserSession | null
//   removeUserSession(userId)      → 삭제 전 UserSession | null
//   updateLastSeen(userId)         → 갱신된 UserSession | null
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS, REDIS_TTL } = require('../redis/redisKeyConfig');

class SessionStore {
  // ----------------------------------------------------------
  // _key  (private)
  // Input  : userId — 사용자 고유 ID
  // Output : string — Redis key
  // ----------------------------------------------------------
  _key(userId) {
    return REDIS_KEYS.sessionUser(userId);
  }

  // ----------------------------------------------------------
  // addUserSession
  // Input  : userId      — JWT 검증 후 확인된 사용자 고유 ID
  //          sessionData — { name?, status?, connectedAt?, lastSeenAt? }
  // Output : Promise<UserSession> — 저장된 세션 객체
  // ----------------------------------------------------------
  async addUserSession(userId, sessionData = {}) {
    const now = new Date().toISOString();

    const session = {
      userId,
      name: sessionData.name ?? null,
      status: sessionData.status ?? 'online',
      connectedAt: sessionData.connectedAt ?? now,
      lastSeenAt: sessionData.lastSeenAt ?? now
    };

    await redisManager
      .getClient()
      .setEx(
        this._key(userId),
        REDIS_TTL.SESSION_SECONDS,
        JSON.stringify(session)
      );

    return session;
  }

  // ----------------------------------------------------------
  // getUserSession
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<UserSession|null>
  // ----------------------------------------------------------
  async getUserSession(userId) {
    const data = await redisManager
      .getClient()
      .get(this._key(userId));

    return data ? JSON.parse(data) : null;
  }

  // ----------------------------------------------------------
  // removeUserSession
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<UserSession|null> — 삭제 전 세션
  // ----------------------------------------------------------
  async removeUserSession(userId) {
    const existing = await this.getUserSession(userId);

    await redisManager
      .getClient()
      .del(this._key(userId));

    return existing;
  }

  // ----------------------------------------------------------
  // hasUserSession
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<boolean>
  // ----------------------------------------------------------
  async hasUserSession(userId) {
    const exists = await redisManager
      .getClient()
      .exists(this._key(userId));

    return exists === 1;
  }

  // ----------------------------------------------------------
  // updateLastSeen
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<UserSession|null>
  // ----------------------------------------------------------
  async updateLastSeen(userId) {
    const existing = await this.getUserSession(userId);

    if (!existing) return null;

    const updated = {
      ...existing,
      lastSeenAt: new Date().toISOString()
    };

    await redisManager
      .getClient()
      .setEx(
        this._key(userId),
        REDIS_TTL.SESSION_SECONDS,
        JSON.stringify(updated)
      );

    return updated;
  }

  // ----------------------------------------------------------
  // updateUserStatus
  // Input  : userId — 사용자 고유 ID
  //          status — 'online' | 'offline' | 'away'
  // Output : Promise<UserSession|null>
  // ----------------------------------------------------------
  async updateUserStatus(userId, status) {
    const existing = await this.getUserSession(userId);

    if (!existing) return null;

    const updated = {
      ...existing,
      status,
      lastSeenAt: new Date().toISOString()
    };

    await redisManager
      .getClient()
      .setEx(
        this._key(userId),
        REDIS_TTL.SESSION_SECONDS,
        JSON.stringify(updated)
      );

    return updated;
  }

  // ----------------------------------------------------------
  // getAllUserSessions  (관리/디버깅용)
  // Input  : 없음
  // Output : Promise<UserSession[]>
  // ----------------------------------------------------------
  async getAllUserSessions() {
    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.sessionUserPattern());

    if (keys.length === 0) return [];

    const values = await redisManager.getClient().mGet(keys);

    return values.filter(Boolean).map((v) => JSON.parse(v));
  }

  // ----------------------------------------------------------
  // getUserSessionCount
  // Input  : 없음
  // Output : Promise<number>
  // ----------------------------------------------------------
  async getUserSessionCount() {
    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.sessionUserPattern());

    return keys.length;
  }

  // ----------------------------------------------------------
  // clearUserSessions  (테스트/초기화용)
  // Input  : 없음
  // Output : Promise<number> — 삭제된 수
  // ----------------------------------------------------------
  async clearUserSessions() {
    const keys = await redisManager
      .getClient()
      .keys(REDIS_KEYS.sessionUserPattern());

    if (keys.length === 0) return 0;

    await redisManager.getClient().del(keys);

    return keys.length;
  }
}

// 싱글톤 — 서버 전역에서 동일 인스턴스 사용
module.exports = new SessionStore();