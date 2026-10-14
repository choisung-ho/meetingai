// ============================================================
// server/services/meetingSessionService.js
// ============================================================
// 역할:
//   MeetingSession 계층의 서비스 흐름을 담당한다.
//   이미 생성된 회의의 세션 상태를 시작/종료로 변경한다.
//
// 원칙:
//   - MeetingSessionService는 회의 시작/종료만 담당한다.
//   - PATCH API는 여러 용도로 재사용될 수 있으므로
//     이 서비스에서는 status 변경 요청만 감싸서 사용한다.
//   - 상태 전이 규칙은 FastAPI 서버에서 최종 강제한다.
//   - 실제 원본 데이터는 FastAPI/DB이다.
//
// 주의:
//   MeetingSession은 회의 데이터 생성/조회/삭제/일반 수정이 아니라
//   회의 진행 상태 전환 START_MEETING / END_MEETING만 담당한다.
// ============================================================

const { meetingApi } = require('../fastapi');
const logger = require('../utils/logger');
const meetingStore = require('../sessions/meetingStore');

class MeetingSessionService {
    // ----------------------------------------------------------
    // startMeeting
    // Input  : { workspaceId, meetingId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI PATCH API에 회의 시작 요청을 보낸다.
    //   2. Body에는 { status: "ACTIVE" }만 전달한다.
    //   3. FastAPI가 상태 전이 규칙을 검증한다.
    //   4. 성공 시 변경된 회의 데이터를 반환한다.
    //
    // HTTP:
    //   PATCH /workspaces/{workspace_id}/meetings/{meeting_id}
    //
    // Body:
    //   { status: "ACTIVE" }
    // ----------------------------------------------------------
    async startMeeting({ workspaceId, meetingId, title }) {
        logger.info(
            `회의 시작 요청: workspaceId=${workspaceId}, meetingId=${meetingId}`
        );

        const meetingIds = await meetingStore.getWorkspaceMeetingIds(workspaceId);
        const belongsToWorkspace = meetingIds.includes(String(meetingId));

        if (!belongsToWorkspace) {
            logger.warn(
                `회의 시작 권한 없음: workspaceId=${workspaceId}, meetingId=${meetingId}`
            );

            return {
                status: 'error',
                code: 'MEETING_ACCESS_DENIED',
                message: '해당 워크스페이스에 속한 회의가 아닙니다.'
            };
        }

        const response = await meetingApi.patchMeeting({
            workspaceId,
            meetingId,
            title,
            status: 'ACTIVE'
        });

        if (response?.status === 'success' && response?.data?.id) {
            await meetingStore.cacheMeeting(workspaceId, response.data);
            logger.info(
                `회의 시작 완료: workspaceId=${workspaceId}, meetingId=${response.data.id}, status=${response.data.status}`
            );
        } else {
            logger.warn(
                `회의 시작 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}`
            );
        }

        return response;
    }

    // ----------------------------------------------------------
    // endMeeting
    // Input  : { workspaceId, meetingId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI PATCH API에 회의 종료 요청을 보낸다.
    //   2. Body에는 { status: "ENDED" }만 전달한다.
    //   3. FastAPI가 상태 전이 규칙을 검증한다.
    //   4. 성공 시 변경된 회의 데이터를 반환한다.
    //
    // HTTP:
    //   PATCH /workspaces/{workspace_id}/meetings/{meeting_id}
    //
    // Body:
    //   { status: "ENDED" }
    // ----------------------------------------------------------
    async endMeeting({ workspaceId, meetingId, title }) {
        logger.info(
            `회의 종료 요청: workspaceId=${workspaceId}, meetingId=${meetingId}`
        );

        // 1. Redis 기준으로 해당 meetingId가 workspaceId에 속하는지 확인
        const meetingIds = await meetingStore.getWorkspaceMeetingIds(workspaceId);
        const belongsToWorkspace = meetingIds.includes(String(meetingId));

        if (!belongsToWorkspace) {
            logger.warn(
                `회의 종료 권한 없음: workspaceId=${workspaceId}, meetingId=${meetingId}`
            );

            return {
                status: 'error',
                code: 'MEETING_ACCESS_DENIED',
                message: '해당 워크스페이스에 속한 회의가 아닙니다.'
            };
        }

        // 2. 검증 통과 후에만 FastAPI 상태 변경 요청
        const response = await meetingApi.patchMeeting({
            workspaceId,
            meetingId,
            title,
            status: 'ENDED'
        });

        if (response?.status === 'success' && response?.data?.id) {
            await meetingStore.cacheMeeting(workspaceId, response.data);

            logger.info(
                `회의 종료 완료: workspaceId=${workspaceId}, meetingId=${response.data.id}, status=${response.data.status}`
            );
        } else {
            logger.warn(
                `회의 종료 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}`
            );
        }

        return response;
    }
}

module.exports = new MeetingSessionService();
