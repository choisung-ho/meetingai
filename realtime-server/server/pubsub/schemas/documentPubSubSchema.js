// ============================================================
// server/pubsub/schemas/documentPubSubSchema.js
// ============================================================
// 역할:
//   document.uploaded Pub/Sub 이벤트의 payload를 검증한다.
//
// 사용 위치:
//   server/pubsub/documentSubscriber.js
//
// 검증 대상:
//   FastAPI 내부 Document 업로드 완료
//   -> Document DB 저장
//   -> Redis publish('document.uploaded', event)
//
// 기준:
//   - workspace_id는 항상 필수이다.
//   - meeting_id가 number이면 회의 내부 문서이다.
//   - meeting_id가 null이면 대시보드/문서 탭의 workspace 문서이다.
//
// 예상 payload - meeting 문서:
// {
//   "id": 1,
//   "workspace_id": 5,
//   "meeting_id": 78,
//   "original_filename": "회의자료.pdf",
//   "stored_filename": "uuid-file.pdf",
//   "content_type": "application/pdf",
//   "file_size": 12345,
//   "storage_path": "documents/uuid-file.pdf",
//   "status": "UPLOADED",
//   "created_at": "2026-06-08T12:00:00"
// }
//
// 예상 payload - workspace 문서:
// {
//   "id": 2,
//   "workspace_id": 5,
//   "meeting_id": null,
//   "original_filename": "대시보드자료.pdf",
//   "stored_filename": "uuid-file.pdf",
//   "content_type": "application/pdf",
//   "file_size": 12345,
//   "storage_path": "documents/uuid-file.pdf",
//   "status": "UPLOADED",
//   "created_at": "2026-06-08T12:00:00"
// }
// ============================================================

const DOCUMENT_STATUSES = new Set([
  'UPLOADED',
  'PROCESSING',
  'PROCESSED',
  'FAILED'
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

function isOptionalString(value) {
  if (value === undefined || value === null) {
    return true;
  }

  return typeof value === 'string';
}

// ----------------------------------------------------------
// validateDocumentUploadedPayload
// Input  : payload
// Output : { valid: boolean, message: string | null }
//
// 역할:
//   document.uploaded Pub/Sub payload가
//   WebSocket DOCUMENT_UPLOADED 브로드캐스트에 필요한 값을
//   포함하고 있는지 검증한다.
//
// 기준:
//   - payload.id는 필수이다.
//   - payload.workspace_id는 필수이다.
//   - payload.meeting_id는 선택값이다.
//     - number: meeting 문서
//     - null 또는 undefined: workspace 문서
// ----------------------------------------------------------
function validateDocumentUploadedPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      valid: false,
      message: 'payload는 필수값이며 객체여야 합니다.'
    };
  }

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

  if (!isOptionalNumber(payload.meeting_id)) {
    return {
      valid: false,
      message: 'payload.meeting_id는 값이 있으면 숫자여야 합니다.'
    };
  }

  if (!isRequiredString(payload.original_filename)) {
    return {
      valid: false,
      message: 'payload.original_filename은 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!isRequiredString(payload.stored_filename)) {
    return {
      valid: false,
      message: 'payload.stored_filename은 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!isRequiredString(payload.content_type)) {
    return {
      valid: false,
      message: 'payload.content_type은 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!isOptionalNumber(payload.file_size)) {
    return {
      valid: false,
      message: 'payload.file_size는 값이 있으면 숫자여야 합니다.'
    };
  }

  if (!isOptionalString(payload.storage_path)) {
    return {
      valid: false,
      message: 'payload.storage_path는 값이 있으면 문자열이어야 합니다.'
    };
  }

  if (!isRequiredString(payload.status)) {
    return {
      valid: false,
      message: 'payload.status는 필수값이며 문자열이어야 합니다.'
    };
  }

  if (!DOCUMENT_STATUSES.has(payload.status)) {
    return {
      valid: false,
      message: 'payload.status는 UPLOADED, PROCESSING, PROCESSED, FAILED 중 하나여야 합니다.'
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
  validateDocumentUploadedPayload
};