// ============================================================
// server/services/issueService.js
// ============================================================
// 역할:
//   Issue 계층의 서비스 흐름을 담당한다.
//   FastAPI Issue API 호출 후, 성공 시 Redis issueStore에 캐시한다.
//
// 원칙:
//   - CREATE_ISSUE 성공 시 Redis 캐시 저장
//   - GET_ISSUES 조회 성공 시 meetingId 기준 Redis 캐시 갱신
//   - UPDATE_ISSUE 성공 시 Redis 캐시 갱신
//   - DELETE_ISSUE 성공 시 soft delete 상태로 Redis 캐시 갱신
//   - 실제 원본 데이터는 FastAPI/DB
//
// 주의:
//   workspaceId는 클라이언트 요청에서 받지 않는다.
//   workspaceId는 FastAPI 응답 data.workspaceId를 사용한다.
//   Issue 분류 기준은 workspaceId가 아니라 meeting_id이다.
// ============================================================

const { issueApi } = require('../fastapi');
const issueStore = require('../sessions/issueStore');
const logger = require('../utils/logger');

class IssueService {
    // ----------------------------------------------------------
    // createIssue
    // Input  : {
    //   meetingId,
    //   title,
    //   description,
    //   status,
    //   priority,
    //   dueDate,
    //   assigneeId
    // }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 안건 생성을 요청한다.
    //   2. FastAPI가 DB에 저장하고 issue id와 workspaceId를 반환한다.
    //   3. 성공 응답이면 Redis에 issue 정보를 캐시한다.
    // ----------------------------------------------------------
    async createIssue({
        meetingId,
        title,
        description = null,
        status = 'OPEN',
        priority = null,
        dueDate = null,
        assigneeId = null
    }) {
        logger.info(`Issue 생성 요청: meetingId=${meetingId}, title=${title}`);

        const response = await issueApi.createIssue({
            meeting_id: meetingId,
            title,
            description,
            status,
            priority,
            due_date: dueDate,
            assignee_id: assigneeId
        });

        // ----------------------------------------------------------
        // FastAPI 실패 응답 처리
        // - 기존 issueApi 통신 로직은 건드리지 않음
        // - FastAPI가 status: 'error' 형태로 응답한 경우
        //   statusCode와 message를 그대로 Handler로 올려보냄
        // ----------------------------------------------------------
        if (response?.status !== 'success') {
            logger.warn(
                `Issue 생성 실패 응답: meetingId=${meetingId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Issue 생성에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        if (response?.data?.id) {
            await issueStore.cacheIssue(response.data);

            logger.info(
                `Issue 생성 후 Redis 캐시 저장 완료: meetingId=${response.data.meeting_id}, issueId=${response.data.id}`
            );
        }

        return response;
    }

    // ----------------------------------------------------------
    // getIssues
    // Input  : { meetingId }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 특정 meetingId의 안건 목록을 조회한다.
    //   2. 조회 성공 시 meetingId 기준으로 Redis 캐시를 갱신한다.
    //   3. FastAPI data 배열을 그대로 반환한다.
    //
    // FastAPI:
    //   GET /issues?meeting_id={meetingId}
    // ----------------------------------------------------------
    async getIssues({ meetingId }) {
        logger.info(`Issue 목록 조회 요청: meetingId=${meetingId}`);

        const result = await issueApi.getMeetingIssues({
            meeting_id: meetingId
        });

        if (result?.status !== 'success') {
            logger.warn(`Issue 목록 조회 실패 응답: meetingId=${meetingId}`);

            const error = new Error(result?.message || 'Issue 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const issues = Array.isArray(result.data) ? result.data : [];

        await issueStore.cacheIssuesByMeeting(meetingId, issues);

        logger.info(
            `Issue 목록 조회 후 Redis 캐시 갱신 완료: meetingId=${meetingId}, count=${issues.length}`
        );

        return issues;
    }

    //추가된 이슈 전체조회
    async getAllIssues(workspaceId) {
        logger.info('Issue 전체 목록 조회 요청');

        const result = await issueApi.getWorkspaceIssues(workspaceId);

        if (result?.status !== 'success') {
            logger.warn('Issue 전체 목록 조회 실패 응답');

            const error = new Error(result?.message || 'Issue 전체 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const issues = Array.isArray(result.data) ? result.data : [];

        logger.info(`Issue 전체 목록 조회 완료: count=${issues.length}`);

        return issues;
    }

    // ----------------------------------------------------------
    // updateIssue
    // Input  : { issueId, title, description, priority, dueDate, assigneeId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 일반 issue 필드 수정을 요청한다.
    //   2. FastAPI가 DB에서 issue 기본 정보를 수정한다.
    //   3. 성공 응답이면 Redis에 issue 정보를 갱신한다.
    //
    // FastAPI:
    //   PATCH /issues/{issueId}
    //
    // 주의:
    //   - 상태 변경은 여기서 처리하지 않는다.
    //   - 상태 전이, reason, evidence, issue_events 기록은 changeIssueState()를 사용한다.
    // ----------------------------------------------------------
    async updateIssue({
        issueId,
        title,
        description,
        priority,
        dueDate,
        assigneeId
    }) {
        logger.info(`Issue 수정 요청: issueId=${issueId}`);

        const response = await issueApi.updateIssue({
            issue_id: issueId,
            title,
            description,
            priority,
            due_date: dueDate,
            assignee_id: assigneeId
        });

        // ----------------------------------------------------------
        // FastAPI 실패 응답 처리
        // - 기존 issueApi 통신 로직은 건드리지 않음
        // - 실패 시 statusCode와 message를 그대로 Handler로 올려보냄
        // ----------------------------------------------------------
        if (response?.status !== 'success') {
            logger.warn(
                `Issue 수정 실패 응답: issueId=${issueId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Issue 수정에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        if (response?.data?.id) {
            await issueStore.cacheIssue(response.data);

            logger.info(
                `Issue 수정 후 Redis 캐시 갱신 완료: meetingId=${response.data.meeting_id}, issueId=${response.data.id}`
            );
        }

        return response;
    }

    // ----------------------------------------------------------
    // changeIssueState
    // Input  : { issueId, meetingId, toState, reason, evidence }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 안건 상태 변경을 요청한다.
    //   2. FastAPI가 DB에서 상태를 변경하고 issue_events를 기록한다.
    //   3. 성공 응답이면 Redis에 캐시된 issue 상태와 상태별 인덱스를 갱신한다.
    //
    // FastAPI:
    //   PATCH /issues/{issueId}/state
    // ----------------------------------------------------------
    async changeIssueState({
        issueId,
        meetingId,
        toState,
        reason = null,
        evidence = null
    }) {
        logger.info(
            `Issue 상태 변경 요청: issueId=${issueId}, meetingId=${meetingId}, toState=${toState}`
        );

        const response = await issueApi.changeIssueState({
            issue_id: issueId,
            meeting_id: meetingId,
            to_state: toState,
            reason,
            evidence
        });

        // ----------------------------------------------------------
        // FastAPI 실패 응답 처리
        // - 기존 issueApi 통신 로직은 건드리지 않음
        // - 실패 시 statusCode와 message를 그대로 Handler로 올려보냄
        // ----------------------------------------------------------
        if (response?.status !== 'success') {
            logger.warn(
                `Issue 상태 변경 실패 응답: issueId=${issueId}, meetingId=${meetingId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Issue 상태 변경에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        if (response?.data?.issue_id) {
            await issueStore.changeIssueState(
                response.data.issue_id,
                response.data.to_state,
                response.data.changed_at
            );

            logger.info(
                `Issue 상태 변경 후 Redis 캐시 갱신 완료: issueId=${response.data.issue_id}, fromState=${response.data.from_state}, toState=${response.data.to_state}`
            );
        }

        return response;
    }

    // ----------------------------------------------------------
    // getIssue
    // Input  : { issueId }
    // Output : Promise<Object>
    // 역할  :
    //   1. Redis에 캐시된 issue 상세 정보를 먼저 조회한다.
    //   2. 캐시가 있으면 FastAPI 호출 없이 그대로 반환한다.
    //   3. 캐시가 없으면 FastAPI에서 단일 issue를 조회한다.
    //   4. 조회 성공 시 Redis에 issue 정보를 캐시한다.
    //
    // FastAPI:
    //   GET /issues/{issueId}
    // ----------------------------------------------------------
    async getIssue({ issueId }) {
        logger.info(`Issue 단일 조회 요청: issueId=${issueId}`);

        const cachedIssue = await issueStore.getIssue(issueId);

        if (cachedIssue) {
            logger.info(`Issue 단일 조회 Redis 캐시 HIT: issueId=${issueId}`);
            return cachedIssue;
        }

        logger.info(`Issue 단일 조회 Redis 캐시 MISS: issueId=${issueId}`);

        const result = await issueApi.getIssue({
            issue_id: issueId
        });

        if (result?.status !== 'success') {
            logger.warn(`Issue 단일 조회 실패 응답: issueId=${issueId}`);

            const error = new Error(result?.message || 'Issue 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        if (!result?.data?.id) {
            const error = new Error('조회된 issue 데이터가 없습니다.');
            error.statusCode = 404;
            error.response = result;

            throw error;
        }

        await issueStore.cacheIssue(result.data);

        logger.info(
            `Issue 단일 조회 후 Redis 캐시 저장 완료: meetingId=${result.data.meeting_id}, issueId=${result.data.id}`
        );

        return result.data;
    }

    // ----------------------------------------------------------
    // getIssueEvents
    // Input  : { issueId, meetingId }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 특정 issue의 상태 변경 이벤트 목록을 조회한다.
    //   2. issue_events는 변경 이력 데이터이므로 Redis 캐시하지 않고 그대로 반환한다.
    //
    // FastAPI:
    //   GET /issues/{issueId}/events?meeting_id={meetingId}
    // ----------------------------------------------------------
    async getIssueEvents({ issueId, meetingId }) {
        logger.info(
            `Issue 이벤트 목록 조회 요청: issueId=${issueId}, meetingId=${meetingId}`
        );

        const result = await issueApi.getIssueEvents({
            issue_id: issueId,
            meeting_id: meetingId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Issue 이벤트 목록 조회 실패 응답: issueId=${issueId}, meetingId=${meetingId}`
            );

            const error = new Error(result?.message || 'Issue 이벤트 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const events = Array.isArray(result.data) ? result.data : [];

        logger.info(
            `Issue 이벤트 목록 조회 완료: issueId=${issueId}, meetingId=${meetingId}, count=${events.length}`
        );

        return events;
    }

    // ----------------------------------------------------------
    // deleteIssue
    // Input  : { issueId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 안건 삭제를 요청한다.
    //   2. FastAPI가 soft delete 처리 후 deleted_at 포함 데이터를 반환한다.
    //   3. 성공 응답이면 Redis에 soft delete 상태로 캐시를 갱신한다.
    //
    // 주의:
    //   DELETE /issues/{issueId}는 hard delete가 아니라 soft delete 응답이다.
    //   따라서 Redis detail은 삭제하지 않고 deleted_at 포함 상태로 갱신한다.
    //
    // FastAPI:
    //   DELETE /issues/{issueId}
    // ----------------------------------------------------------
    async deleteIssue({ issueId }) {
        logger.info(`Issue 삭제 요청: issueId=${issueId}`);

        const response = await issueApi.deleteIssue({
            issue_id: issueId
        });

        // ----------------------------------------------------------
        // FastAPI 실패 응답 처리
        // - 기존 issueApi 통신 로직은 건드리지 않음
        // - 실패 시 statusCode와 message를 그대로 Handler로 올려보냄
        // ----------------------------------------------------------
        if (response?.status !== 'success') {
            logger.warn(
                `Issue 삭제 실패 응답: issueId=${issueId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Issue 삭제에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        if (response?.data?.id) {
            await issueStore.markIssueDeleted(response.data);

            logger.info(
                `Issue 삭제 후 Redis soft delete 캐시 갱신 완료: meetingId=${response.data.meeting_id}, issueId=${response.data.id}`
            );
        }

        return response;
    }
}

module.exports = new IssueService();
