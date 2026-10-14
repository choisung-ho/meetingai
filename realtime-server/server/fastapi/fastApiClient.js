// ============================================================
// server/services/fastapi/fastApiClient.js
// ============================================================
// 역할:
//   FastAPI 서버와 통신하는 공통 HTTP 클라이언트이다.
//   baseURL 관리, 요청 timeout, JSON 직렬화/파싱, HTTP 에러 처리를 담당한다.
//
// SRP:
//   이 파일은 특정 도메인 API(/issues, /meetings 등)를 알지 않는다.
//   오직 공통 HTTP 요청 처리만 담당한다.
//
// 사용 예:
//   fastApiClient.get('/issues?meeting_id=7')
//   fastApiClient.post('/issues', { meeting_id: 7, title: '...', priority: 'HIGH' })
//   fastApiClient.patch('/issues/10', { status: 'IN_PROGRESS' })
// ============================================================

const logger = require('../utils/logger');
const tokenStore = require('./tokenStore');


// 로컬 통합 실행 기준 기본값. 배포 환경에서는 FASTAPI_BASE_URL 환경변수로 덮어쓴다.
const DEFAULT_BASE_URL = 'http://localhost:8000';
const DEFAULT_TIMEOUT_MS = 10_000;

class FastApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.FASTAPI_BASE_URL || DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs || Number(process.env.FASTAPI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  // ----------------------------------------------------------
  // _buildUrl
  // Input  : path — FastAPI endpoint 경로
  // Output : string — baseUrl이 붙은 전체 URL
  // ----------------------------------------------------------
  _buildUrl(path) {
    if (!path.startsWith('/')) {
      return `${this.baseUrl}/${path}`;
    }

    return `${this.baseUrl}${path}`;
  }

  // ----------------------------------------------------------
  // _request
  // Input  : method, path, body
  // Output : Promise<any> — FastAPI 응답 JSON
  // ----------------------------------------------------------
  async _request(method, path, body = null) {
    const url = this._buildUrl(path);
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const headers = { 'Content-Type': 'application/json' };

    const token = tokenStore.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      method,
      headers,
      signal: controller.signal
    };

    if (body !== null && body !== undefined) {
      options.body = JSON.stringify(body);
    }

    try {
      logger.info(`FastAPI 요청: ${method} ${url}`);

      const response = await fetch(url, options);
      const responseText = await response.text();

      let parsedBody = {};
      if (responseText) {
        try {
          parsedBody = JSON.parse(responseText);
        } catch (parseError) {
          parsedBody = {
            raw: responseText
          };
        }
      }

      logger.info(`FastAPI 응답 상태: ${response.status} ${response.statusText}`);
      // 응답에는 raw_text, AI 요약, 문서 메타데이터가 포함될 수 있다.
      // 전문을 로그에 남기면 설치본의 로컬 로그만으로도 회의 기밀이
      // 노출되므로 상태/최상위 키만 기록한다.
      const responseKeys = parsedBody && typeof parsedBody === 'object'
        ? Object.keys(parsedBody).slice(0, 20)
        : [];
      logger.info(
        `FastAPI 응답 본문 요약: status=${response.status} keys=${responseKeys.join(',')}`
      );

      if (!response.ok) {
        const error = new Error(
          parsedBody.message ||
          parsedBody.detail ||
          `FastAPI 요청 실패: ${response.status} ${response.statusText}`
        );

        error.statusCode = response.status;
        error.response = parsedBody;
        error.url = url;
        error.method = method;

        throw error;
      }

      logger.info(`FastAPI 응답 성공: ${method} ${url}`);

      return parsedBody;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutError = new Error(`FastAPI 요청 timeout: ${method} ${url}`);
        timeoutError.code = 'FASTAPI_TIMEOUT';
        timeoutError.url = url;
        timeoutError.method = method;
        throw timeoutError;
      }

      logger.error(`FastAPI 요청 오류: ${method} ${url} - ${error.message}`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ----------------------------------------------------------
  // get
  // Input  : path
  // Output : Promise<any>
  // ----------------------------------------------------------
  async get(path) {
    return this._request('GET', path);
  }

  // ----------------------------------------------------------
  // post
  // Input  : path, body
  // Output : Promise<any>
  // ----------------------------------------------------------
  async post(path, body) {
    return this._request('POST', path, body);
  }

  // ----------------------------------------------------------
  // patch
  // Input  : path, body
  // Output : Promise<any>
  // ----------------------------------------------------------
  async patch(path, body) {
    return this._request('PATCH', path, body);
  }

  // ----------------------------------------------------------
  // put
  // Input  : path, body
  // Output : Promise<any>
  // ----------------------------------------------------------
  async put(path, body) {
    return this._request('PUT', path, body);
  }

  // ----------------------------------------------------------
  // delete
  // Input  : path
  // Output : Promise<any>
  // ----------------------------------------------------------
  async delete(path) {
    return this._request('DELETE', path);
  }
}

module.exports = new FastApiClient();
module.exports.FastApiClient = FastApiClient;
