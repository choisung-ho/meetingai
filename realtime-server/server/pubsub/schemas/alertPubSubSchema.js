// ============================================================
// server/pubsub/schemas/alertPubSubSchema.js
// ============================================================
// 역할:
//   alert.created Pub/Sub 이벤트의 payload를 검증한다.
// ============================================================

const ALERT_LEVELS = new Set([
  'info',
  'warning',
  'error'
]);

const ALERT_STATUSES = new Set([
  'PENDING',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED'
]);

function isRequiredNumber(value) {
  return value !== undefined && value !== null && Number.isFinite(Number(value));
}

function isOptionalNumber(value) {
  if (value === undefined || value === null) {
    return true;
  }

  return Number.isFinite(Number(value));
}

function isRequiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateAlertCreatedPayload(payload) {
  if (!isRequiredNumber(payload.id)) {
    return {
      valid: false,
      message: 'payload.id는 필수값이며 숫자여야 합니다.'
    };
  }

  if (!isRequiredNumber(payload.workspace_id)) {
    return {
      valid: false,
      message: 'payload.workspace_id는 필수값이며 숫자여야 합니다.'
    };
  }

  if (!isRequiredNumber(payload.meeting_id)) {
    return {
      valid: false,
      message: 'payload.meeting_id는 필수값이며 숫자여야 합니다.'
    };
  }

  if (!isOptionalNumber(payload.issue_id)) {
    return {
      valid: false,
      message: 'payload.issue_id는 값이 있으면 숫자여야 합니다.'
    };
  }

  if (!isRequiredString(payload.message)) {
    return {
      valid: false,
      message: 'payload.message는 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!isRequiredString(payload.level)) {
    return {
      valid: false,
      message: 'payload.level은 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!ALERT_LEVELS.has(payload.level)) {
    return {
      valid: false,
      message: 'payload.level은 info, warning, error 중 하나여야 합니다.'
    };
  }

  if (!isRequiredString(payload.status)) {
    return {
      valid: false,
      message: 'payload.status는 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!ALERT_STATUSES.has(payload.status)) {
    return {
      valid: false,
      message: 'payload.status는 PENDING, ACKNOWLEDGED, RESOLVED, DISMISSED 중 하나여야 합니다.'
    };
  }

  if (!isRequiredString(payload.created_at)) {
    return {
      valid: false,
      message: 'payload.created_at은 필수값이며 문자열이어야 합니다.'
    };
  }

  return {
    valid: true,
    message: null
  };
}

module.exports = {
  validateAlertCreatedPayload
};