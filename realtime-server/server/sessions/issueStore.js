// ============================================================
// server/sessions/issueStore.js
// ============================================================
// 역할:
//   FastAPI/DB에서 받은 Issue 정보를 Redis에 캐시한다.
//   원본 데이터는 FastAPI/DB이고, Redis는 WebSocket 서버의 빠른 조회용 캐시이다.
//
// Redis 구조:
//   issue:detail:{issueId}                         → 이슈 상세 정보 JSON, TTL 적용
//   meeting:issues:{meetingId}                     → 회의별 전체 issueId Set, TTL 미적용
//   meeting:activeIssues:{meetingId}               → 회의별 삭제되지 않은 issueId Set, TTL 미적용
//   meeting:issueStatus:{meetingId}:{status}       → 회의별 상태별 issueId Set, TTL 미적용
//
// TTL 정책:
//   - issue:detail:{issueId}
//     FastAPI/DB 원본이 있는 캐시성 데이터이므로 TTL 적용
//
//   - meeting:issues:{meetingId}
//   - meeting:activeIssues:{meetingId}
//   - meeting:issueStatus:{meetingId}:{status}
//     이슈 목록/상태 인덱스 Set이므로 TTL 미적용
//     자동 만료되면 Redis 인덱스가 깨질 수 있으므로 생성/수정/삭제 시 명시적으로 관리한다.
//
// 주의:
//   - workspaceId는 클라이언트 요청에서 받지 않는다.
//   - workspaceId는 FastAPI 응답 data.workspaceId를 그대로 캐시한다.
//   - Issue 분류 기준은 workspaceId가 아니라 meeting_id이다.
//   - UPDATE_ISSUE는 FastAPI가 반환한 issue 전체를 cacheIssue()로 다시 캐시한다.
//   - CHANGE_ISSUE_STATE는 FastAPI가 반환한 state event를 기준으로 changeIssueState()에서 상태만 동기화한다.
//   - DELETE /issues/{issue_id}는 soft delete 응답이므로 detail은 삭제하지 않고 deleted_at 포함 상태로 갱신한다.
// ============================================================

const redisManager = require('../redis/RedisManager');
const { REDIS_KEYS, REDIS_TTL } = require('../redis/redisKeyConfig');

const ISSUE_STATUS = {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    CLOSED: 'CLOSED'
};

class IssueStore {
    // issueId로 이슈 상세 정보를 저장할 Redis key를 만든다.
    _issueKey(issueId) {
        return REDIS_KEYS.issueDetail(issueId);
    }

    // meetingId로 해당 회의의 전체 이슈 목록 key를 만든다.
    _meetingIssuesKey(meetingId) {
        return REDIS_KEYS.meetingIssues(meetingId);
    }

    // meetingId로 해당 회의의 활성 이슈 목록 key를 만든다.
    _meetingActiveIssuesKey(meetingId) {
        return REDIS_KEYS.meetingActiveIssues(meetingId);
    }

    // meetingId와 status로 해당 회의의 상태별 이슈 목록 key를 만든다.
    _meetingIssueStatusKey(meetingId, status) {
        return REDIS_KEYS.meetingIssueStatus(meetingId, status);
    }

    // 이슈 상세 정보를 TTL이 있는 캐시로 저장한다.
    async _saveIssueDetail(issueId, cachedIssue) {
        await redisManager
            .getClient()
            .setEx(
                this._issueKey(issueId),
                REDIS_TTL.ISSUE_DETAIL_SECONDS,
                JSON.stringify(cachedIssue)
            );
    }

    // FastAPI 응답으로 받은 issue 정보를 Redis에 캐시한다.
    // CREATE_ISSUE, UPDATE_ISSUE, GET_ISSUE 등 issue 전체 객체가 반환되는 경우 사용한다.
    async cacheIssue(issue) {
        const issueId = String(issue.id);
        const meetingId = String(issue.meeting_id);
        const status = issue.status;

        const cachedIssue = {
            id: issue.id,
            workspaceId: issue.workspaceId,
            meeting_id: issue.meeting_id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            due_date: issue.due_date,
            assignee_id: issue.assignee_id,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            deleted_at: issue.deleted_at
        };

        if (!issue?.id) {
            throw new Error('Issue ID가 없어 Redis 캐시에 저장할 수 없습니다.');
        }

        if (!issue?.meeting_id) {
            throw new Error('meeting_id가 없어 Issue를 meeting 기준으로 캐시할 수 없습니다.');
        }

        // issue:detail:{issueId}는 FastAPI/DB 원본이 따로 있는 캐시이므로 TTL을 적용한다.
        await this._saveIssueDetail(issueId, cachedIssue);

        // meeting:issues:{meetingId} Set은 이 회의에 속한 issueId 목록 인덱스이므로 TTL을 걸지 않는다.
        await redisManager
            .getClient()
            .sAdd(
                this._meetingIssuesKey(meetingId),
                issueId
            );

        // 삭제되지 않은 이슈는 active Set과 상태별 Set에 포함한다.
        if (cachedIssue.deleted_at === null || cachedIssue.deleted_at === undefined) {
            await redisManager
                .getClient()
                .sAdd(
                    this._meetingActiveIssuesKey(meetingId),
                    issueId
                );

            // status가 바뀐 경우 기존 상태별 Set에 남아 있지 않도록 전체 상태 Set에서 제거한다.
            await this._removeIssueFromAllStatusSets(meetingId, issueId);

            if (status) {
                await redisManager
                    .getClient()
                    .sAdd(
                        this._meetingIssueStatusKey(meetingId, status),
                        issueId
                    );
            }
        }

        // soft delete된 이슈는 전체 목록에는 남기되 active/status 인덱스에서는 제거한다.
        if (cachedIssue.deleted_at !== null && cachedIssue.deleted_at !== undefined) {
            await redisManager
                .getClient()
                .sRem(
                    this._meetingActiveIssuesKey(meetingId),
                    issueId
                );

            await this._removeIssueFromAllStatusSets(meetingId, issueId);
        }

        return cachedIssue;
    }

    // GET_ISSUES 응답으로 받은 이슈 목록을 meetingId 기준으로 다시 캐시한다.
    // 기존 meeting 기준 인덱스를 초기화한 뒤 새로 저장한다.
    async cacheIssuesByMeeting(meetingId, issues) {
        await this.clearMeetingIssues(meetingId);

        for (const issue of issues) {
            await this.cacheIssue(issue);
        }

        return issues;
    }

    // issueId로 Redis에 캐시된 이슈 상세 정보를 조회한다.
    async getIssue(issueId) {
        const data = await redisManager
            .getClient()
            .get(this._issueKey(issueId));

        return data ? JSON.parse(data) : null;
    }

    // 특정 meetingId에 속한 issueId 목록만 조회한다.
    async getMeetingIssueIds(meetingId) {
        const ids = await redisManager
            .getClient()
            .sMembers(this._meetingIssuesKey(meetingId));

        return ids ?? [];
    }

    // 특정 meetingId에 속한 이슈 상세 목록을 조회한다.
    // deleted_at이 있는 이슈도 포함한다.
    async getMeetingIssues(meetingId) {
        const ids = await this.getMeetingIssueIds(meetingId);
        if (ids.length === 0) return [];

        const keys = ids.map((id) => this._issueKey(id));

        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value));
    }

    // 특정 meetingId 안에서 삭제되지 않은 issueId 목록을 조회한다.
    async getActiveIssueIds(meetingId) {
        const ids = await redisManager
            .getClient()
            .sMembers(this._meetingActiveIssuesKey(meetingId));

        return ids ?? [];
    }

    // 특정 meetingId 안에서 삭제되지 않은 이슈 상세 목록을 조회한다.
    async getActiveIssues(meetingId) {
        const ids = await this.getActiveIssueIds(meetingId);
        if (ids.length === 0) return [];

        const keys = ids.map((id) => this._issueKey(id));

        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value))
            .filter((issue) => issue.deleted_at === null || issue.deleted_at === undefined);
    }

    // 특정 meetingId 안에서 status에 해당하는 issueId 목록을 조회한다.
    async getIssueIdsByStatus(meetingId, status) {
        const ids = await redisManager
            .getClient()
            .sMembers(this._meetingIssueStatusKey(meetingId, status));

        return ids ?? [];
    }

    // 특정 meetingId 안에서 status에 해당하는 이슈 상세 목록을 조회한다.
    async getIssuesByStatus(meetingId, status) {
        const ids = await this.getIssueIdsByStatus(meetingId, status);
        if (ids.length === 0) return [];

        const keys = ids.map((id) => this._issueKey(id));

        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value))
            .filter((issue) => issue.deleted_at === null || issue.deleted_at === undefined);
    }

    // Redis에 캐시된 이슈 상태를 변경한다.
    // PATCH /issues/{issue_id}/state 성공 후,
    // FastAPI가 반환한 to_state, changed_at을 기준으로 Redis 캐시를 갱신할 때 사용한다.
    //
    // 주의:
    // - 이 함수는 FastAPI/DB 상태 변경을 직접 수행하지 않는다.
    // - 실제 상태 전이 검증과 issue_events 기록은 FastAPI가 담당한다.
    // - Node.js는 FastAPI 성공 응답을 받은 뒤 Redis 캐시만 동기화한다.
    async changeIssueState(issueId, status, changedAt = null) {
        const existing = await this.getIssue(issueId);
        if (!existing) return null;

        const updated = {
            ...existing,
            status,
            updated_at: changedAt || existing.updated_at
        };

        // issue:detail:{issueId}는 TTL을 유지해야 하므로 setEx로 다시 저장한다.
        await this._saveIssueDetail(issueId, updated);

        const id = String(issueId);
        const meetingId = String(existing.meeting_id);

        // 기존 상태별 Set에 남아 있을 수 있는 issueId를 모두 제거한다.
        await this._removeIssueFromAllStatusSets(meetingId, id);

        // 삭제되지 않은 이슈만 새 상태별 Set에 다시 추가한다.
        if (updated.deleted_at === null || updated.deleted_at === undefined) {
            await redisManager
                .getClient()
                .sAdd(
                    this._meetingIssueStatusKey(meetingId, status),
                    id
                );
        }

        return updated;
    }

    // DELETE /issues/{issue_id} 응답을 기준으로 soft delete 상태를 캐시한다.
    async markIssueDeleted(issue) {
        const issueId = String(issue.id);
        const meetingId = String(issue.meeting_id);

        const cachedIssue = {
            id: issue.id,
            workspaceId: issue.workspaceId,
            meeting_id: issue.meeting_id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            due_date: issue.due_date,
            assignee_id: issue.assignee_id,
            created_at: issue.created_at,
            updated_at: issue.updated_at,
            deleted_at: issue.deleted_at
        };

        // soft delete도 detail은 삭제하지 않고 deleted_at 포함 상태로 캐시 갱신한다.
        // detail 캐시는 TTL을 유지해야 하므로 setEx로 저장한다.
        await this._saveIssueDetail(issueId, cachedIssue);

        await redisManager
            .getClient()
            .sAdd(
                this._meetingIssuesKey(meetingId),
                issueId
            );

        await redisManager
            .getClient()
            .sRem(
                this._meetingActiveIssuesKey(meetingId),
                issueId
            );

        await this._removeIssueFromAllStatusSets(meetingId, issueId);

        return cachedIssue;
    }

    // issueId 기준으로 Redis 캐시를 삭제한다.
    // 실제 hard delete가 필요할 때만 사용한다.
    async removeIssue(issueId) {
        const existing = await this.getIssue(issueId);
        if (!existing) return null;

        const id = String(issueId);
        const meetingId = String(existing.meeting_id);

        await redisManager
            .getClient()
            .del(this._issueKey(id));

        await redisManager
            .getClient()
            .sRem(
                this._meetingIssuesKey(meetingId),
                id
            );

        await redisManager
            .getClient()
            .sRem(
                this._meetingActiveIssuesKey(meetingId),
                id
            );

        await this._removeIssueFromAllStatusSets(meetingId, id);

        return existing;
    }

    // 특정 meetingId에 속한 모든 issue 인덱스를 삭제한다.
    // GET_ISSUES 재캐싱이나 테스트 초기화 상황에서 사용한다.
    async clearMeetingIssues(meetingId) {
        let count = 0;

        const ids = await this.getMeetingIssueIds(meetingId);

        for (const id of ids) {
            await redisManager
                .getClient()
                .del(this._issueKey(id));
            count++;
        }

        const meetingIssuesKey = this._meetingIssuesKey(meetingId);
        const activeIssuesKey = this._meetingActiveIssuesKey(meetingId);
        const openIssuesKey = this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.OPEN);
        const inProgressIssuesKey = this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.IN_PROGRESS);
        const closedIssuesKey = this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.CLOSED);

        const existsMeetingIssues = await redisManager
            .getClient()
            .exists(meetingIssuesKey);

        const existsActiveIssues = await redisManager
            .getClient()
            .exists(activeIssuesKey);

        const existsOpenIssues = await redisManager
            .getClient()
            .exists(openIssuesKey);

        const existsInProgressIssues = await redisManager
            .getClient()
            .exists(inProgressIssuesKey);

        const existsClosedIssues = await redisManager
            .getClient()
            .exists(closedIssuesKey);

        if (existsMeetingIssues) {
            await redisManager
                .getClient()
                .del(meetingIssuesKey);
            count++;
        }

        if (existsActiveIssues) {
            await redisManager
                .getClient()
                .del(activeIssuesKey);
            count++;
        }

        if (existsOpenIssues) {
            await redisManager
                .getClient()
                .del(openIssuesKey);
            count++;
        }

        if (existsInProgressIssues) {
            await redisManager
                .getClient()
                .del(inProgressIssuesKey);
            count++;
        }

        if (existsClosedIssues) {
            await redisManager
                .getClient()
                .del(closedIssuesKey);
            count++;
        }

        return count;
    }

    // Redis에 캐시된 모든 issue 상세 정보를 조회한다.
    // 디버깅이나 관리자 확인용으로 사용한다.
    async getAllCachedIssues() {
        const keys = await redisManager
            .getClient()
            .keys(REDIS_KEYS.issueDetailPattern());

        if (keys.length === 0) return [];

        const values = await redisManager
            .getClient()
            .mGet(keys);

        return values
            .filter(Boolean)
            .map((value) => JSON.parse(value));
    }

    // 특정 issueId를 모든 상태별 Set에서 제거한다.
    async _removeIssueFromAllStatusSets(meetingId, issueId) {
        await redisManager
            .getClient()
            .sRem(
                this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.OPEN),
                issueId
            );

        await redisManager
            .getClient()
            .sRem(
                this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.IN_PROGRESS),
                issueId
            );

        await redisManager
            .getClient()
            .sRem(
                this._meetingIssueStatusKey(meetingId, ISSUE_STATUS.CLOSED),
                issueId
            );
    }
}

module.exports = new IssueStore();