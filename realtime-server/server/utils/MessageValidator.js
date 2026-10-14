// ============================================================
// server/utils/MessageValidator.js
// ============================================================
// 역할:
//   클라이언트가 보낸 WebSocket 메시지의 공통 외형 구조를 검증한다.
//   이벤트별 세부 payload 검증은 SchemaValidator가 담당한다.
//
// SRP: 공통 메시지 포맷(type, requestId, payload) 존재 여부만 검증.
// ============================================================

class MessageValidator {
  // ----------------------------------------------------------
  // _isPlainObject  (private)
  // Input  : value — 임의의 JavaScript 값
  // Output : boolean — null 아닌 단일 객체 여부
  // ----------------------------------------------------------
  static _isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  // ----------------------------------------------------------
  // validate
  // Input  : message — JSON.parse 후의 임의 값
  // Output : ValidationResult — { valid, errorCode?, message? }
  // ----------------------------------------------------------
  static validate(message) {
    if (!MessageValidator._isPlainObject(message)) {
      return { valid: false, errorCode: 'INVALID_MESSAGE', message: 'WebSocket 메시지는 객체 형식이어야 합니다.' };
    }

    if (message.type === undefined || message.type === null || message.type === '') {
      return { valid: false, errorCode: 'MISSING_TYPE', message: '메시지 type이 필요합니다.' };
    }

    if (typeof message.type !== 'string') {
      return { valid: false, errorCode: 'INVALID_TYPE', message: '메시지 type은 string 타입이어야 합니다.' };
    }

    if (message.type.trim() === '') {
      return { valid: false, errorCode: 'INVALID_TYPE', message: '메시지 type은 비어 있을 수 없습니다.' };
    }

    if (
      message.requestId !== undefined &&
      message.requestId !== null &&
      typeof message.requestId !== 'string'
    ) {
      return { valid: false, errorCode: 'INVALID_REQUEST_ID', message: 'requestId는 string 또는 null 타입이어야 합니다.' };
    }

    if (message.payload === undefined || message.payload === null) {
      return { valid: false, errorCode: 'MISSING_PAYLOAD', message: 'payload가 필요합니다.' };
    }

    if (!MessageValidator._isPlainObject(message.payload)) {
      return { valid: false, errorCode: 'INVALID_PAYLOAD', message: 'payload는 객체 형식이어야 합니다.' };
    }

    return { valid: true };
  }
}

module.exports = MessageValidator;
