// ============================================================
// server/utils/MessageSender.js
// ============================================================
// 역할:
//   WebSocket 클라이언트에 JSON 응답/에러를 전송하는 정적 유틸 클래스.
//   실제 전송 전 소켓 상태를 검사하여 dead socket 전송을 방지한다.
//
// SRP: 소켓 상태 확인 + JSON 직렬화 + 전송만 담당.
// ============================================================

const WebSocket = require('ws');
const { createErrorResponse } = require('../schemas/CommonSchema');
const logger = require('./logger');
const { redact } = require('./logRedaction');

class MessageSender {
  static _logOutgoingMessage(ws, data) {
    // 회의 내용/토큰/화자 embedding은 로그에 평문으로 남기지 않는다.
    const prettyPayload = JSON.stringify(redact(data), null, 2);
    const lines = [
      'WebSocket response sent',
      `  target.userId : ${ws.userId ?? 'unknown'}`,
      `  event.type    : ${data?.type ?? 'unknown'}`,
      `  requestId     : ${data?.requestId ?? 'null'}`,
      `  success       : ${data?.success ?? 'unknown'}`,
      '  response      :',
      prettyPayload
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')
    ];

    logger.info(lines.join('\n'));
  }

  // ----------------------------------------------------------
  // sendJson
  // Input  : ws     — 대상 WebSocket 객체
  //          data   — JSON 직렬화 가능한 응답 객체 (WsResponse)
  // Output : boolean — 전송 성공 여부
  // ----------------------------------------------------------
  static sendJson(ws, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const payload = JSON.stringify(data);

    MessageSender._logOutgoingMessage(ws, data);

    ws.send(payload);
    return true;
  }

  // ----------------------------------------------------------
  // sendError
  // Input  : ws         — 대상 WebSocket 객체
  //          requestId  — 요청 추적 ID (null 허용)
  //          errorCode  — 에러 코드 문자열
  //          message    — 에러 설명 문자열
  // Output : boolean    — 전송 성공 여부
  // ----------------------------------------------------------
  static sendError(ws, requestId, errorCode, message) {
    const errorResponse = createErrorResponse(requestId ?? null, errorCode, message);
    return MessageSender.sendJson(ws, errorResponse);
  }
}

module.exports = MessageSender;
