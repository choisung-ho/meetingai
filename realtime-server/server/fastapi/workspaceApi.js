// ============================================================
// server/services/fastapi/workspaceApi.js
// ============================================================
// 역할:
//   FastAPI의 Workspace membership 검증 API 호출을 담당한다.
//
// 담당 endpoint:
//   - GET /workspaces/{workspace_id}
//
// SRP:
//   이 파일은 JOIN_WORKSPACE 전 검증용 Workspace API 경로만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class WorkspaceApi {
    // ----------------------------------------------------------
    // getWorkspace
    //
    // Input:
    //   {
    //     workspaceId: number
    //   }
    //
    // FastAPI:
    //   GET /workspaces/{workspace_id}
    //
    // 의미:
    //   Node.js가 JOIN_WORKSPACE 전 검증용으로 호출한다.
    //
    // 응답 코드:
    //   200: 정상 멤버
    //   403: workspace 멤버 아님
    //   401: 토큰 없음 또는 만료
    //   404: workspace 없음
    // ----------------------------------------------------------
    async getWorkspace({ workspaceId }) {
        return fastApiClient.get(`/workspaces/${workspaceId}`);
    }
}

module.exports = new WorkspaceApi();
module.exports.WorkspaceApi = WorkspaceApi;