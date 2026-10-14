// ============================================================
// server/utils/SchemaValidator.js
// ============================================================
// 역할:
//   JSON Schema 규칙을 기반으로 이벤트별 메시지 전체 구조를 재귀 검증한다.
//   각 핸들러는 이벤트별 스키마를 이 클래스에 전달하여 단일 호출로 검증한다.
//
// SRP: JSON Schema 검증 알고리즘만 담당.
// ============================================================

class SchemaValidator {
  // ----------------------------------------------------------
  // _getJsonType  (private)
  // Input  : value — 임의의 JavaScript 값
  // Output : string — JSON Schema 타입 문자열
  // ----------------------------------------------------------
  static _getJsonType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  // ----------------------------------------------------------
  // _isValidType  (private)
  // Input  : value        — 검사 대상 값
  //          expectedType — 문자열 또는 문자열 배열 (JSON Schema type)
  // Output : boolean
  //
  // 주의: JSON Schema의 "integer"는 typeof 기준 "number"이므로
  //       별도 분기로 Number.isInteger() 검사를 수행한다.
  // ----------------------------------------------------------
  static _isValidType(value, expectedType) {
    const types = Array.isArray(expectedType) ? expectedType : [expectedType];

    return types.some(t => {
      if (t === 'integer') {
        return typeof value === 'number' && Number.isInteger(value);
      }
      return SchemaValidator._getJsonType(value) === t;
    });
  }

  // ----------------------------------------------------------
  // _toErrorCode  (private)
  // Input  : path — 점(.) 구분 경로 문자열 (예: message.payload.userId)
  // Output : string — 대문자 언더스코어 형식 (예: MESSAGE_PAYLOAD_USERID)
  // ----------------------------------------------------------
  static _toErrorCode(path) {
    return path.toUpperCase().replace(/\./g, '_');
  }

  // ----------------------------------------------------------
  // _fail  (private)
  // Input  : errorCode — 에러 코드 문자열
  //          message   — 에러 설명 문자열
  // Output : ValidationResult
  // ----------------------------------------------------------
  static _fail(errorCode, message) {
    return { valid: false, errorCode, message };
  }

  // ----------------------------------------------------------
  // _validateRecursive  (private)
  // Input  : data   — 검증 대상 데이터
  //          schema — JSON Schema 객체
  //          path   — 현재 검사 경로 (에러 메시지용)
  // Output : ValidationResult
  // ----------------------------------------------------------
  static _validateRecursive(data, schema, path = 'message') {
    if (!schema) return { valid: true };

    // const 검사 — 특정 리터럴 값만 허용
    if (schema.const !== undefined && data !== schema.const) {
      return SchemaValidator._fail(
        `INVALID_${SchemaValidator._toErrorCode(path)}`,
        `${path}는 "${schema.const}" 값이어야 합니다.`
      );
    }

    // type 검사
    if (schema.type !== undefined && !SchemaValidator._isValidType(data, schema.type)) {
      const expected = Array.isArray(schema.type) ? schema.type.join(' 또는 ') : schema.type;
      return SchemaValidator._fail(
        `INVALID_${SchemaValidator._toErrorCode(path)}`,
        `${path}는 ${expected} 타입이어야 합니다.`
      );
    }

    // minLength 검사 — trim 적용으로 공백 문자열도 빈 값으로 처리
    if (schema.minLength !== undefined && typeof data === 'string' && data.trim().length < schema.minLength) {
      return SchemaValidator._fail(
        `INVALID_${SchemaValidator._toErrorCode(path)}`,
        `${path}는 최소 ${schema.minLength}자 이상이어야 합니다.`
      );
    }

    // minimum 검사 — 숫자 최솟값 검사 (integer/number 공통)
    if (schema.minimum !== undefined && typeof data === 'number' && data < schema.minimum) {
      return SchemaValidator._fail(
        `INVALID_${SchemaValidator._toErrorCode(path)}`,
        `${path}는 ${schema.minimum} 이상이어야 합니다.`
      );
    }

    // 객체가 아니면 이후 객체 전용 검사 불필요
    if (SchemaValidator._getJsonType(data) !== 'object') return { valid: true };

    // required 필드 존재 검사
    for (const field of (schema.required ?? [])) {
      const value = data[field];
      const fieldPath = path ? `${path}.${field}` : field;

      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        return SchemaValidator._fail(
          `MISSING_${field.toUpperCase()}`,
          `${fieldPath}가 필요합니다.`
        );
      }
    }

    // additionalProperties: false — 정의되지 않은 필드 차단
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = Object.keys(schema.properties);
      for (const field of Object.keys(data)) {
        if (!allowed.includes(field)) {
          const fieldPath = path ? `${path}.${field}` : field;
          return SchemaValidator._fail(
            `UNKNOWN_${field.toUpperCase()}`,
            `${fieldPath}는 허용되지 않은 필드입니다.`
          );
        }
      }
    }

    // properties 재귀 검사
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      const value = data[field];
      if (value === undefined) continue; // 선택 필드 누락은 통과
      const fieldPath = path ? `${path}.${field}` : field;
      const result = SchemaValidator._validateRecursive(value, fieldSchema, fieldPath);
      if (!result.valid) return result;
    }

    return { valid: true };
  }

  // ----------------------------------------------------------
  // validate  (public)
  // Input  : data   — 검증 대상 메시지 객체 (WsMessage)
  //          schema — 이벤트별 JSON Schema 객체
  // Output : ValidationResult — { valid, errorCode?, message? }
  // ----------------------------------------------------------
  static validate(data, schema) {
    return SchemaValidator._validateRecursive(data ?? {}, schema, 'message');
  }
}

module.exports = SchemaValidator;
