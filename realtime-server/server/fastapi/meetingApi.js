// ============================================================
// server/services/fastapi/meetingApi.js
// ============================================================
// 역할:
//   FastAPI의 Meeting 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - POST   /workspaces/{workspace_id}/meetings
//   - GET    /workspaces/{workspace_id}/meetings?page=1&size=20
//   - GET    /workspaces/{workspace_id}/meetings/{meeting_id}
//   - DELETE /workspaces/{workspace_id}/meetings/{meeting_id}
//
// SRP:
//   이 파일은 Meeting API 경로와 요청 body 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class MeetingApi {
    // ----------------------------------------------------------
    // createMeeting
    //
    // Input:
    //   {
    //     workspaceId: number,
    //     title: string,
    //     status: "READY"
    //   }
    //
    // FastAPI:
    //   POST /workspaces/{workspace_id}/meetings
    //
    // Body:
    //   {
    //     title: "회의",
    //     status: "READY"
    //   }
    //
    // 주의:
    //   회의 페이지 생성용 API다.
    //   회의 시작이 아니므로 기본 status는 READY로 보낸다.
    // ----------------------------------------------------------
    async createMeeting({ workspaceId, title, status = 'READY' }) {
        const body = {
            title,
            status
        };

        return fastApiClient.post(`/workspaces/${workspaceId}/meetings`, body);
    }

    // ----------------------------------------------------------
    // getMeetings
    //
    // Input:
    //   {
    //     workspaceId: number,
    //     page?: number,
    //     size?: number
    //   }
    //
    // FastAPI:
    //   GET /workspaces/{workspace_id}/meetings?page=1&size=20
    //
    // 의미:
    //   특정 workspace 안의 meeting 목록을 조회한다.
    //   meetingId는 필요 없다.
    //
    // 예:
    //   GET /workspaces/22/meetings?page=1&size=20
    // ----------------------------------------------------------
    async getMeetings({ workspaceId, page = 1, size = 20 }) {
        return fastApiClient.get(
            `/workspaces/${workspaceId}/meetings?page=${page}&size=${size}`
        );
    }

    // ----------------------------------------------------------
    // getMeeting
    //
    // Input:
    //   {
    //     workspaceId: number,
    //     meetingId: number
    //   }
    //
    // FastAPI:
    //   GET /workspaces/{workspace_id}/meetings/{meeting_id}
    //
    // 의미:
    //   특정 workspace 안의 특정 meeting 하나를 상세 조회한다.
    //   FastAPI 쪽에서 workspace_id + meeting_id 조합을 검증한다.
    //
    // 예:
    //   GET /workspaces/22/meetings/3
    // ----------------------------------------------------------
    async getMeeting({ workspaceId, meetingId }) {
        return fastApiClient.get(
            `/workspaces/${workspaceId}/meetings/${meetingId}`
        );
    }

    // ----------------------------------------------------------
    // deleteMeeting
    //
    // Input:
    //   {
    //     workspaceId: number,
    //     meetingId: number
    //   }
    //
    // FastAPI:
    //   DELETE /workspaces/{workspace_id}/meetings/{meeting_id}
    //
    // 주의:
    //   FastAPI 쪽에서 workspace_id + meeting_id를 같이 검증한다.
    // ----------------------------------------------------------
    async deleteMeeting({ workspaceId, meetingId }) {
        return fastApiClient.delete(
            `/workspaces/${workspaceId}/meetings/${meetingId}`
        );
    }

    // ----------------------------------------------------------
    // updateMeetingStatus
    //
    // Input:
    //   {
    //     workspaceId: number,
    //     meetingId: number,
    //     status: string
    //   }
    //
    // FastAPI:
    //   PATCH /workspaces/{workspace_id}/meetings/{meeting_id}
    //
    // Body:
    //   { "status": "ACTIVE" }
    //
    // 의미:
    //   회의 상태를 변경한다.
    // ----------------------------------------------------------
    async patchMeeting({ workspaceId, meetingId, title, status }) {
        const body = {};

        if (title !== undefined) {
            body.title = title;
        }

        if (status !== undefined) {
            body.status = status;
        }

        return fastApiClient.patch(
            `/workspaces/${workspaceId}/meetings/${meetingId}`,
            body
        );
    }
}

module.exports = new MeetingApi();
module.exports.MeetingApi = MeetingApi;