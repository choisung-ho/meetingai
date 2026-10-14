// ============================================================
// server/utils/logRedaction.js
// ============================================================
// 역할:
//   로그에 남기면 안 되는 민감 데이터를 마스킹한다.
//
// 왜 필요한가:
//   WebSocket 요청/응답 로그는 payload 전문을 남긴다.
//   실시간 발화(TRANSCRIPT), AI 요약, 화자 embedding은 회의 내용 그 자체이므로
//   운영 로그 파일에 평문으로 쌓이면 회의 기밀이 그대로 노출된다.
//
// 정책:
//   - 회의 내용/음성 특징에 해당하는 필드는 길이만 남기고 내용은 지운다.
//   - 토큰류는 항상 완전히 가린다.
//   - 디버깅이 필요하면 LOG_SENSITIVE_PAYLOAD=true로 일시적으로 해제할 수 있다.
// ============================================================

// 회의 내용에 해당하는 필드 (길이만 로깅)
const CONTENT_FIELDS = new Set([
  'text',
  'rawText',
  'raw_text',
  'summaryText',
  'summary_text',
  'topicLabel',
  'topic_label',
  'detail',
  'transcript',
  'lines'
]);

// 항상 완전히 가리는 필드
const SECRET_FIELDS = new Set([
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'password',
  'authorization'
]);

// 음성 특징 벡터 (화자 식별 정보)
const VECTOR_FIELDS = new Set([
  'speakerEmbedding',
  'speaker_embedding',
  'embedding',
  'centroid'
]);

const MAX_DEPTH = 6;

function isSensitiveLoggingEnabled() {
  return String(process.env.LOG_SENSITIVE_PAYLOAD || '').toLowerCase() === 'true';
}

// ----------------------------------------------------------
// redact
// Input  : value — 로깅 대상 값 (객체/배열/원시값)
// Output : 마스킹된 복사본
// ----------------------------------------------------------
function redact(value, depth = 0) {
  if (isSensitiveLoggingEnabled()) {
    return value;
  }

  if (value === null || value === undefined || depth > MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (typeof value !== 'object') {
    return value;
  }

  const result = {};

  for (const [key, item] of Object.entries(value)) {
    if (SECRET_FIELDS.has(key)) {
      result[key] = '[REDACTED]';
      continue;
    }

    if (VECTOR_FIELDS.has(key)) {
      result[key] = Array.isArray(item)
        ? `[vector ${item.length}차원 생략]`
        : '[vector 생략]';
      continue;
    }

    if (CONTENT_FIELDS.has(key)) {
      if (typeof item === 'string') {
        result[key] = `[회의 내용 ${item.length}자 생략]`;
      } else if (Array.isArray(item)) {
        result[key] = `[회의 내용 ${item.length}건 생략]`;
      } else {
        result[key] = '[회의 내용 생략]';
      }
      continue;
    }

    result[key] = redact(item, depth + 1);
  }

  return result;
}

module.exports = { redact, isSensitiveLoggingEnabled };
