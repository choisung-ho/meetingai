// ============================================================
// server/services/fastapi/issueApi.js
// ============================================================
// 역할:
//   FastAPI의 Issue 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - POST   /issues
//   - GET    /issues?meeting_id={meeting_id}
//   - GET    /issues/{issue_id}
//   - PATCH  /issues/{issue_id}
//   - PATCH  /issues/{issue_id}/state
//   - DELETE /issues/{issue_id}
//   - GET    /issues/{issue_id}/events
//
// SRP:
//   이 파일은 Issue API 경로와 요청 body 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class IssueApi {
  // ----------------------------------------------------------
  // createIssue
  //
  // Input:
  // {
  //   meeting_id,
  //   title,
  //   description,
  //   status,
  //   priority,
  //   due_date,
  //   assignee_id
  // }
  //
  // FastAPI:
  //   POST /issues
  // ----------------------------------------------------------
  async createIssue({
    meeting_id,
    title,
    description = null,
    status = 'OPEN',
    priority = null,
    due_date = null,
    assignee_id = null
  }) {
    const body = {
      meeting_id,
      title,
      description,
      status,
      priority,
      due_date,
      assignee_id
    };

    return fastApiClient.post('/issues/', body);
  }


  // ----------------------------------------------------------
  // getWorkspaceIssues
  //
  // Input:
  // {
  //   workspace_id
  // }
  //
  // FastAPI:
  //   GET /workspaces/{workspace_id}/issues
  //
  // 설명:
  //   워크스페이스 전체 이슈 조회.
  //   대시보드 / 워크스페이스 단위 이슈 목록에서 사용한다.
  // ----------------------------------------------------------
  async getWorkspaceIssues(workspace_id) {
    if (workspace_id === undefined || workspace_id === null) {
      throw new Error('workspace_id is required');
    }

    return fastApiClient.get(`/workspaces/${workspace_id}/issues`);
  }


  // ----------------------------------------------------------
  // getMeetingIssues
  //
  // Input:
  // {
  //   meeting_id
  // }
  //
  // FastAPI:
  //   GET /meetings/{meeting_id}/issues
  //
  // 설명:
  //   특정 회의에 연결된 이슈 조회.
  //   회의방 / 회의 상세 페이지 이슈 목록에서 사용한다.
  // ----------------------------------------------------------
  async getMeetingIssues({ meeting_id } = {}) {
    if (meeting_id === undefined || meeting_id === null) {
      throw new Error('meeting_id is required');
    }

    return fastApiClient.get(`/meetings/${meeting_id}/issues`);
  }

  // ----------------------------------------------------------
  // getIssue
  //
  // Input:
  // {
  //   issue_id
  // }
  //
  // FastAPI:
  //   GET /issues/{issue_id}
  // ----------------------------------------------------------
  async getIssue({ issue_id }) {
    return fastApiClient.get(`/issues/${issue_id}`);
  }

  // ----------------------------------------------------------
  // updateIssue
  //
  // Input:
  // {
  //   issue_id,
  //   title,
  //   description,
  //   priority,
  //   due_date,
  //   assignee_id
  // }
  //
  // FastAPI:
  //   PATCH /issues/{issue_id}
  //
  // 설명:
  //   일반 issue 필드 수정 API 호출용이다.
  //   title, description, priority, due_date, assignee_id 같은 기본 필드만 수정한다.
  //   상태 변경 이벤트 로그를 남기는 상태 전이 API가 아니다.
  //   상태 전이 처리는 changeIssueState()를 사용한다.
  // ----------------------------------------------------------
  async updateIssue({
    issue_id,
    title,
    description,
    priority,
    due_date,
    assignee_id
  }) {
    const body = {};

    if (title !== undefined) {
      body.title = title;
    }

    if (description !== undefined) {
      body.description = description;
    }

    if (priority !== undefined) {
      body.priority = priority;
    }

    if (due_date !== undefined) {
      body.due_date = due_date;
    }

    if (assignee_id !== undefined) {
      body.assignee_id = assignee_id;
    }

    return fastApiClient.patch(`/issues/${issue_id}`, body);
  }

  // ----------------------------------------------------------
  // changeIssueState
  //
  // Input:
  // {
  //   issue_id,
  //   to_state,
  //   meeting_id,
  //   reason,
  //   evidence
  // }
  //
  // FastAPI:
  //   PATCH /issues/{issue_id}/state
  // ----------------------------------------------------------
  async changeIssueState({
    issue_id,
    to_state,
    meeting_id,
    reason = null,
    evidence = null
  }) {
    const body = {
      to_state,
      meeting_id,
      reason,
      evidence
    };

    return fastApiClient.patch(`/issues/${issue_id}/state`, body);
  }

  // ----------------------------------------------------------
  // deleteIssue
  //
  // Input:
  // {
  //   issue_id
  // }
  //
  // FastAPI:
  //   DELETE /issues/{issue_id}
  // ----------------------------------------------------------
  async deleteIssue({ issue_id }) {
    return fastApiClient.delete(`/issues/${issue_id}`);
  }

  // ----------------------------------------------------------
  // getIssueEvents
  //
  // Input:
  // {
  //   issue_id
  // }
  //
  // FastAPI:
  //   GET /issues/{issue_id}/events
  // ----------------------------------------------------------
  async getIssueEvents({ issue_id }) {
    return fastApiClient.get(`/issues/${issue_id}/events`);
  }
}

module.exports = new IssueApi();
module.exports.IssueApi = IssueApi;