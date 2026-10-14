// ============================================================
// server/pubsub/schemas/commonPubSubSchema.js
// ============================================================
// 역할:
//   Redis Pub/Sub으로 수신한 서버 이벤트의 공통 구조를 검증한다.
// ============================================================

function validatePubSubEventBase(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return {
      valid: false,
      message: 'event는 객체여야 합니다.'
    };
  }

  if (typeof event.type !== 'string' || event.type.trim().length === 0) {
    return {
      valid: false,
      message: 'event.type은 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    return {
      valid: false,
      message: 'event.payload는 필수값이며 객체여야 합니다.'
    };
  }

  return {
    valid: true,
    message: null
  };
}

module.exports = {
  validatePubSubEventBase
};