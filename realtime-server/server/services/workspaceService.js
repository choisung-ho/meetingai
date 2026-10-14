// ============================================================
// server/services/workspaceService.js
// ============================================================
// 역할:
//   Workspace 계층 비즈니스 로직을 담당한다.
//   JOIN_WORKSPACE, LEAVE_WORKSPACE 핸들러가 호출한다.
//
// SRP: 워크스페이스 입장/퇴장 처리 로직만 담당.
//      응답 전송은 handler에서, 브로드캐스트는 broadcastService에서 담당.
//
// Input/Output 흐름:
//   joinWorkspace(ws, { workspaceId, userId })  → WorkspaceServiceResult
//   leaveWorkspace(ws, { workspaceId, userId }) → WorkspaceServiceResult
// ============================================================

const workspaceStore = require('../sessions/workspaceStore');
const presenceService = require('./presenceService');
const workspaceApi = require('../fastapi/workspaceApi');
const logger = require('../utils/logger');

class WorkspaceService {
  // ----------------------------------------------------------
  // joinWorkspace
  // Input  : ws          — JWT 검증 후 ws.userId가 이미 설정된 WebSocket 객체
  //                        (ws.workspaceId 세팅)
  //          workspaceId — 워크스페이스 고유 ID
  //          userId      — JWT에서 추출된 사용자 고유 ID (ws.userId와 동일)
  // Output : Promise<WorkspaceServiceResult>
  //          { workspaceId, userId, users: string[] }
  // ----------------------------------------------------------
  async joinWorkspace(ws, { workspaceId, userId }) {
    // 1. JOIN_WORKSPACE 전 FastAPI에 workspace membership 검증 요청
    // GET /workspaces/{workspace_id}
    // 200이면 정상 진행
    // 401: 토큰 없음 또는 만료
    // 403: workspace 멤버 아님
    // 404: workspace 없음
    //
    // 여기서는 기존 통신 코드를 바꾸지 않는다.
    // workspaceApi / fastApiClient에서 throw된 error.statusCode를 그대로 Handler로 올려보낸다.
    try {
      await workspaceApi.getWorkspace({
        workspaceId
      });
    } catch (error) {
      logger.warn(
        `워크스페이스 검증 실패: workspaceId=${workspaceId}, userId=${userId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
      );

      throw error;
    }

    // 2. 검증 성공 후에만 ws 상태 변경
    // ws.userId는 JWT 검증 시 이미 설정되어 있으므로 덮어쓰지 않는다.
    ws.workspaceId = workspaceId;

    // 3. 검증 성공 후에만 Redis 입장 처리
    const users = await workspaceStore.addUserToWorkspace(workspaceId, userId);

    // 4. 검증 성공 후에만 presence 저장
    await presenceService.markWorkspaceOnline(workspaceId, userId);

    logger.info(`워크스페이스 참여: workspaceId=${workspaceId}, userId=${userId}`);

    return { workspaceId, userId, users };
  }

  // ----------------------------------------------------------
  // leaveWorkspace
  // Input  : ws          — WebSocket 객체 (ws.workspaceId 초기화)
  //          workspaceId — 워크스페이스 고유 ID
  //          userId      — 사용자 고유 ID
  // Output : Promise<WorkspaceServiceResult>
  //          { workspaceId, userId, users: string[] }
  // ----------------------------------------------------------
  async leaveWorkspace(ws, { workspaceId, userId }) {
    const users = await workspaceStore.removeUserFromWorkspace(workspaceId, userId);
    await presenceService.removeWorkspacePresence(workspaceId, userId);

    if (ws.workspaceId === workspaceId && ws.userId === userId) {
      ws.workspaceId = null;
    }

    logger.info(`워크스페이스 퇴장: workspaceId=${workspaceId}, userId=${userId}`);

    return { workspaceId, userId, users };
  }
}

module.exports = new WorkspaceService();
