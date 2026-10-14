// ============================================================
// server/services/fastapi/alertApi.js
// ============================================================
// 역할:
//   FastAPI의 Alert 관련 HTTP API 호출을 담당한다.
//
// 담당 endpoint:
//   - POST   /alerts/
//   - GET    /alerts/
//   - GET    /alerts/{alert_id}
//   - PATCH  /alerts/{alert_id}
//   - PATCH  /alerts/{alert_id}/acknowledge
//   - PATCH  /alerts/{alert_id}/dismiss
//   - PATCH  /alerts/{alert_id}/resolve
//   - DELETE /alerts/{alert_id}
//
// SRP:
//   이 파일은 Alert API 경로와 요청 body/query 구조만 안다.
//   WebSocket 메시지 구조, ACK 생성, 클라이언트 응답 전송은 담당하지 않는다.
//
// 필드 기준:
//   - FastAPI 요청/응답 필드는 snake_case를 사용한다.
//   - Node WebSocket payload의 camelCase 변환은 handler/service/schema 계층에서 처리한다.
// ============================================================

const fastApiClient = require('./fastApiClient');

class AlertApi {
  // ----------------------------------------------------------
  // createAlert
  //
  // Input:
  // {
  //   meeting_id,
  //   issue_id,
  //   message,
  //   level,
  //   status
  // }
  //
  // FastAPI:
  //   POST /alerts/
  //
  // 설명:
  //   Alert 생성용 API이다.
  //   현재 제품 흐름상 일반 클라이언트 직접 생성보다는
  //   서버 내부/운영/연동용 생성 API로 본다.
  //
  // 기본 상태:
  //   PENDING
  // ----------------------------------------------------------
  async createAlert({
    meeting_id,
    issue_id = null,
    message,
    level = 'info',
    status = 'PENDING'
  }) {
    const body = {
      meeting_id,
      issue_id,
      message,
      level,
      status
    };

    return fastApiClient.post('/alerts/', body);
  }

  // ----------------------------------------------------------
  // getAlerts
  //
  // Input:
  // {
  //   meeting_id,
  //   issue_id,
  //   status,
  //   level
  // }
  //
  // FastAPI:
  //   GET /alerts/?meeting_id={meeting_id}
  //
  // 설명:
  //   Alert 목록 조회용 API이다.
  //   현재 FastAPI 명세 기준으로 meeting_id 기준 목록 조회를 수행한다.
  //
  // 현재 사용:
  //   - meeting_id
  //
  // 현재 FastAPI 계약은 meeting_id 필터만 공개한다.
  // issue_id/status/level은 클라이언트의 AlertCenterView에서 후처리하며,
  // 서버 계약이 확장될 때만 query parameter를 추가한다.
  // ----------------------------------------------------------
  async getAlerts({
    meeting_id,
    issue_id,
    status,
    level
  } = {}) {
    const query = new URLSearchParams();

    if (meeting_id !== undefined && meeting_id !== null) {
      query.append('meeting_id', String(meeting_id));
    }

    /*
    if (issue_id !== undefined && issue_id !== null) {
      query.append('issue_id', String(issue_id));
    }

    if (status !== undefined && status !== null) {
      query.append('status', status);
    }

    if (level !== undefined && level !== null) {
      query.append('level', level);
    }
    */

    const queryString = query.toString();

    if (queryString) {
      return fastApiClient.get(`/alerts/?${queryString}`);
    }

    return fastApiClient.get('/alerts/');
  }
  
  // ----------------------------------------------------------
  // getAlert
  //
  // Input:
  // {
  //   alert_id
  // }
  //
  // FastAPI:
  //   GET /alerts/{alert_id}
  //
  // 설명:
  //   특정 Alert 상세 조회 API이다.
  // ----------------------------------------------------------
  async getAlert({ alert_id }) {
    return fastApiClient.get(`/alerts/${alert_id}`);
  }

  // ----------------------------------------------------------
  // updateAlert
  //
  // Input:
  // {
  //   alert_id,
  //   meeting_id,
  //   issue_id,
  //   message,
  //   level,
  //   status
  // }
  //
  // FastAPI:
  //   PATCH /alerts/{alert_id}
  //
  // 설명:
  //   Alert 일반 필드 수정 API이다.
  //   명세 기준으로 아래 필드를 수정할 수 있다.
  //
  // 수정 가능 필드:
  //   - meeting_id
  //   - issue_id
  //   - message
  //   - level
  //   - status
  //
  // 권장:
  //   단순 확인/숨김/해결 처리는
  //   PATCH /alerts/{alert_id}/acknowledge
  //   PATCH /alerts/{alert_id}/dismiss
  //   PATCH /alerts/{alert_id}/resolve
  //   전용 메서드를 사용한다.
  // ----------------------------------------------------------
  async updateAlert({
    alert_id,
    meeting_id,
    issue_id,
    message,
    level,
    status
  }) {
    const body = {};

    if (message !== undefined) {
      body.message = message;
    }

    if (level !== undefined) {
      body.level = level;
    }

    if (status !== undefined) {
      body.status = status;
    }

    return fastApiClient.patch(`/alerts/${alert_id}`, body);
  }

  // ----------------------------------------------------------
  // acknowledgeAlert
  //
  // Input:
  // {
  //   alert_id
  // }
  //
  // FastAPI:
  //   PATCH /alerts/{alert_id}/acknowledge
  //
  // 설명:
  //   Alert를 확인/읽음 처리한다.
  //   FastAPI에서 상태는 ACKNOWLEDGED로 변경된다.
  // ----------------------------------------------------------
  async acknowledgeAlert({ alert_id }) {
    return fastApiClient.patch(`/alerts/${alert_id}/acknowledge`);
  }

  // ----------------------------------------------------------
  // dismissAlert
  //
  // Input:
  // {
  //   alert_id
  // }
  //
  // FastAPI:
  //   PATCH /alerts/{alert_id}/dismiss
  //
  // 설명:
  //   Alert를 숨김/무시 처리한다.
  //   FastAPI에서 상태는 DISMISSED로 변경된다.
  // ----------------------------------------------------------
  async dismissAlert({ alert_id }) {
    return fastApiClient.patch(`/alerts/${alert_id}/dismiss`);
  }

  // ----------------------------------------------------------
  // resolveAlert
  //
  // Input:
  // {
  //   alert_id
  // }
  //
  // FastAPI:
  //   PATCH /alerts/{alert_id}/resolve
  //
  // 설명:
  //   Alert 원인이 해결됐음을 표시한다.
  //   FastAPI에서 상태는 RESOLVED로 변경된다.
  // ----------------------------------------------------------
  async resolveAlert({ alert_id }) {
    return fastApiClient.patch(`/alerts/${alert_id}/resolve`);
  }

  // ----------------------------------------------------------
  // deleteAlert
  //
  // Input:
  // {
  //   alert_id
  // }
  //
  // FastAPI:
  //   DELETE /alerts/{alert_id}
  //
  // Response:
  //   204 No Content
  //
  // 설명:
  //   Alert 삭제 API이다.
  //   삭제 응답은 body가 없을 수 있다.
  // ----------------------------------------------------------
  async deleteAlert({ alert_id }) {
    await fastApiClient.delete(`/alerts/${alert_id}`);

    return {
      status: 'success',
      data: {
        alert_id,
        deleted: true
      }
    };
  }
}

module.exports = new AlertApi();
module.exports.AlertApi = AlertApi;
