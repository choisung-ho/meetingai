// 하위 호환성 유지: MessageSender 클래스의 정적 메서드를 함수 형태로 래핑한다.
const MessageSender = require('./MessageSender');

function sendJson(ws, data) {
  return MessageSender.sendJson(ws, data);
}

function sendError(ws, requestId, errorCode, message) {
  return MessageSender.sendError(ws, requestId, errorCode, message);
}

module.exports = { sendJson, sendError };
