// ============================================================
// server/sessions/meetingStore.js
// ============================================================
// 역할:
//   FastAPI/DB에서 받은 Meeting 정보를 Redis에 캐시한다.
//   원본 데이터는 FastAPI/DB이고, Redis는 WebSocket 서버의 빠른 조회용 캐시이다.
//
// Redis 구조:
//   meeting:detail:{meetingId}              → 회의 상세 정보 JSON, TTL 적용
//   workspace:meetings:{workspaceId}        → 워크스페이스별 전체 meetingId Set, TTL 미적용
//   workspace:activeMeetings:{workspaceId}  → 워크스페이스별 ACTIVE meetingId Set, TTL 미적용
//
// TTL 정책:
//   - meeting:detail:{meetingId}
//     FastAPI/DB 원본이 있는 캐시성 데이터이므로 TTL 적용
//
//   - workspace:meetings:{workspaceId}
//   - workspace:activeMeetings:{workspaceId}
//     회의 목록/상태 인덱스 Set이므로 TTL 미적용
//     자동 만료되면 Redis 인덱스가 깨질 수 있으므로 생성/수정/삭제 시 명시적으로 관리한다.
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS, REDIS_TTL } = require('../redis/redisKeyConfig');

class MeetingStore {
    // meetingId로 회의 상세 정보를 저장할 Redis key를 만든다.
    _meetingKey(meetingId) {
        return REDIS_KEYS.meetingDetail(meetingId);
    }

    // workspaceId로 해당 워크스페이스의 전체 회의 목록 key를 만든다.
    _workspaceMeetingsKey(workspaceId) {
        return REDIS_KEYS.workspaceMeetings(workspaceId);
    }

    // workspaceId로 해당 워크스페이스의 ACTIVE 회의 목록 key를 만든다.
    _workspaceActiveMeetingsKey(workspaceId) {
        return REDIS_KEYS.workspaceActiveMeetings(workspaceId);
    }

    // 회의 상세 정보를 TTL이 있는 캐시로 저장한다.
    async _saveMeetingDetail(meetingId, cachedMeeting) {
        await redisManager
            .getClient()
            .setEx(
                this._meetingKey(meetingId),
                REDIS_TTL.MEETING_DETAIL_SECONDS,
                JSON.stringify(cachedMeeting)
            );
    }

    // FastAPI 응답으로 받은 meeting 정보를 Redis에 캐시한다.
    // workspaceId는 FastAPI 응답에 없을 수 있으므로 WebSocket 요청 payload에서 받은 값을 같이 저장한다.
    async cacheMeeting(workspaceId, meeting) {
        const meetingId = String(meeting.id);

        const cachedMeeting = {
            id: meeting.id,
            workspaceId,
            title: meeting.title,
            status: meeting.status
        };

        // meeting:detail:{meetingId}에 회의 상세 정보를 JSON 문자열로 저장한다.
        // 이 값은 FastAPI/DB 원본이 따로 있는 캐시이므로 TTL을 적용한다.
        await this._saveMeetingDetail(meetingId, cachedMeeting);

        // workspace:meetings:{workspaceId} Set에 meetingId를 추가한다.
        // 이 워크스페이스에 어떤 회의들이 있는지 조회할 때 사용하는 인덱스이므로 TTL을 걸지 않는다.
        await redisManager
            .getClient()
            .sAdd(
                this._workspaceMeetingsKey(workspaceId),
                meetingId
            );

        // 회의 상태가 ACTIVE라면 별도의 ACTIVE 회의 목록에도 추가한다.
        if (meeting.status === 'ACTIVE') {
            await redisManager
                .getClient()
                .sAdd(
                    this._workspaceActiveMeetingsKey(workspaceId),
                    meetingId
                );
        }

        // 회의 상태가 ENDED라면 ACTIVE 회의 목록에서는 제거한다.
        if (meeting.status === 'ENDED') {
            await redisManager
                .getClient()
                .sRem(
                    this._workspaceActiveMeetingsKey(workspaceId),
                    meetingId
                );
        }

        return cachedMeeting;
    }

    // meetingId로 Redis에 캐시된 회의 상세 정보를 조회한다.
    async getMeeting(meetingId) {
        const data = await redisManager
            .getClient()
            .get(this._meetingKey(meetingId));

        return data ? JSON.parse(data) : null;
    }

    // 특정 workspaceId에 속한 meetingId 목록만 조회한다.
    async getWorkspaceMeetingIds(workspaceId) {
        const ids = await redisManager
            .getClient()
            .sMembers(this._workspaceMeetingsKey(workspaceId));

        return ids ?? [];
    }

    // 특정 workspaceId에 속한 회의 상세 목록을 조회한다.
    // 먼저 meetingId 목록을 가져오고, 각 meetingId의 상세 정보를 다시 가져온다.
    async getWorkspaceMeetings(workspaceId) {
        const ids = await this.getWorkspaceMeetingIds(workspaceId);
        if (ids.length === 0) return [];

        const keys = ids.map((id) => this._meetingKey(id));
        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value));
    }

    // 특정 workspaceId 안에서 ACTIVE 상태인 meetingId 목록을 조회한다.
    async getActiveMeetingIds(workspaceId) {
        const ids = await redisManager
            .getClient()
            .sMembers(this._workspaceActiveMeetingsKey(workspaceId));

        return ids ?? [];
    }

    // Redis에 캐시된 회의 상태를 변경한다.
    // status가 ACTIVE면 activeMeetings Set에 추가하고,
    // status가 ENDED면 activeMeetings Set에서 제거한다.
    async updateMeetingStatus(meetingId, status) {
        const existing = await this.getMeeting(meetingId);
        if (!existing) return null;

        const updated = {
            ...existing,
            status
        };

        // 회의 상세 캐시는 TTL을 유지해야 하므로 setEx로 다시 저장한다.
        await this._saveMeetingDetail(meetingId, updated);

        const id = String(meetingId);

        if (status === 'ACTIVE') {
            await redisManager
                .getClient()
                .sAdd(
                    this._workspaceActiveMeetingsKey(existing.workspaceId),
                    id
                );
        }

        if (status === 'ENDED') {
            await redisManager
                .getClient()
                .sRem(
                    this._workspaceActiveMeetingsKey(existing.workspaceId),
                    id
                );
        }

        return updated;
    }

    // meetingId 기준으로 Redis 캐시를 삭제한다.
    // 회의 상세 정보, workspace 회의 목록, ACTIVE 회의 목록에서 모두 제거한다.
    async removeMeeting(meetingId) {
        const existing = await this.getMeeting(meetingId);
        if (!existing) return null;

        const id = String(meetingId);

        await redisManager
            .getClient()
            .del(this._meetingKey(id));

        await redisManager
            .getClient()
            .sRem(
                this._workspaceMeetingsKey(existing.workspaceId),
                id
            );

        await redisManager
            .getClient()
            .sRem(
                this._workspaceActiveMeetingsKey(existing.workspaceId),
                id
            );

        return existing;
    }

    // 특정 workspaceId에 속한 모든 meeting 캐시를 삭제한다.
    // 테스트나 초기화 상황에서 사용한다.
    async clearWorkspaceMeetings(workspaceId) {
        let count = 0;

        const ids = await this.getWorkspaceMeetingIds(workspaceId);

        for (const id of ids) {
            await redisManager
                .getClient()
                .del(this._meetingKey(id));
            count++;
        }

        const workspaceMeetingsKey = this._workspaceMeetingsKey(workspaceId);
        const activeMeetingsKey = this._workspaceActiveMeetingsKey(workspaceId);

        const existsWorkspaceMeetings = await redisManager
            .getClient()
            .exists(workspaceMeetingsKey);

        const existsActiveMeetings = await redisManager
            .getClient()
            .exists(activeMeetingsKey);

        if (existsWorkspaceMeetings) {
            await redisManager
                .getClient()
                .del(workspaceMeetingsKey);
            count++;
        }

        if (existsActiveMeetings) {
            await redisManager
                .getClient()
                .del(activeMeetingsKey);
            count++;
        }

        return count;
    }

    // Redis에 캐시된 모든 meeting 상세 정보를 조회한다.
    // 디버깅이나 관리자 확인용으로 사용한다.
    async getAllCachedMeetings() {
        const keys = await redisManager
            .getClient()
            .keys(REDIS_KEYS.meetingDetailPattern());

        if (keys.length === 0) return [];

        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value));
    }
}

module.exports = new MeetingStore();