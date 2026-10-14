// ============================================================
// server/services/fastapi/index.js
// ============================================================
// 역할:
//   FastAPI 연동 모듈을 한 곳에서 모아 export한다.
//
// 사용 목적:
//   다른 service 파일에서 import 경로를 단순화한다.
//
// 사용 예:
//   const { issueApi } = require('./fastapi');
// ============================================================

const fastApiClient = require('./fastApiClient');
const issueApi = require('./issueApi');
const meetingApi = require('./meetingApi');
const alertApi = require('./alertApi');
const documentApi = require('./documentApi');
const sttResultApi = require('./sttResultApi');
const realtimeApi = require('./realtimeApi');
const workspaceApi = require('./workspaceApi');

module.exports = {
  fastApiClient,
  issueApi,
  meetingApi,
  alertApi,
  documentApi,
  sttResultApi,
  realtimeApi,
  workspaceApi
};



