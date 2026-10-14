// 하위 호환성 유지: MessageValidator 클래스의 정적 메서드를 함수 형태로 래핑한다.
const MessageValidator = require('./MessageValidator');

function validateMessage(message) {
  return MessageValidator.validate(message);
}

module.exports = { validateMessage };
