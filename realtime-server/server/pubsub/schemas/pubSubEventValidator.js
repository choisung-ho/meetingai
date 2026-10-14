// ============================================================
// server/pubsub/schemas/pubSubEventValidator.js
// ============================================================
// 역할:
//   Redis Pub/Sub 이벤트의 type을 기준으로 적절한 payload 검증 함수로 라우팅한다.
//
// 기준:
//   - 이 파일은 event.type 라우팅만 담당한다.
//   - payload 내부 필드 검증은 각 도메인 schema 파일에서 처리한다.
//   - document.uploaded의 meeting_id null/number 구분은
//     documentPubSubSchema.validateDocumentUploadedPayload에서 처리한다.
// ============================================================

const {
  validatePubSubEventBase
} = require('./commonPubSubSchema');

const {
  validateAlertCreatedPayload
} = require('./alertPubSubSchema');

const {
  validateDocumentUploadedPayload
} = require('./documentPubSubSchema');

const {
  ALERT_PUBSUB_CHANNELS
} = require('../../websocket/events/alertEvents');

const {
  DOCUMENT_PUBSUB_CHANNELS
} = require('../../websocket/events/documentEvents');

// ----------------------------------------------------------
// PUBSUB_EVENT_VALIDATORS
// 설명:
//   event.type별 payload 검증 함수 등록표
// ----------------------------------------------------------
const PUBSUB_EVENT_VALIDATORS = {
  [ALERT_PUBSUB_CHANNELS.ALERT_CREATED]: validateAlertCreatedPayload,
  [DOCUMENT_PUBSUB_CHANNELS.DOCUMENT_UPLOADED]: validateDocumentUploadedPayload

  // 나중에 추가:
  // [ISSUE_PUBSUB_CHANNELS.ISSUE_CREATED]: validateIssueCreatedPayload,
  // [TRANSCRIPT_PUBSUB_CHANNELS.TRANSCRIPT_CREATED]: validateTranscriptCreatedPayload
};

// ----------------------------------------------------------
// validatePubSubEvent
// Input  : event — Redis Pub/Sub에서 수신한 이벤트 객체
// Output : { valid: boolean, message: string|null }
//
// 설명:
//   1. Pub/Sub 이벤트 공통 구조를 검증한다.
//   2. event.type에 맞는 payload 검증 함수로 라우팅한다.
//   3. payload 내부 세부 검증은 각 도메인 schema에 위임한다.
// ----------------------------------------------------------
function validatePubSubEvent(event) {
  const baseValidation = validatePubSubEventBase(event);

  if (!baseValidation.valid) {
    return baseValidation;
  }

  const validator = PUBSUB_EVENT_VALIDATORS[event.type];

  if (!validator) {
    return {
      valid: false,
      message: `지원하지 않는 Pub/Sub 이벤트 타입입니다: ${event.type}`
    };
  }

  return validator(event.payload);
}

module.exports = {
  validatePubSubEvent
};