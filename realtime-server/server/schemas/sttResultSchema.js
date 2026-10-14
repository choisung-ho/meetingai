// ============================================================
// server/schemas/sttResultSchema.js
// ============================================================
// 역할:
//   STT Result 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의하고,
//   클라이언트에게 보낼 ACK 응답 생성 함수를 제공한다.
//
// 대상 이벤트:
//   - GET_STT_RESULTS
//   - GET_STT_RESULT
//   - DELETE_STT_RESULT
//
// STT Result 계층 책임:
//   - STT 결과 목록 조회
//   - STT 결과 단건 조회
//   - STT 결과 삭제
//
// FastAPI 명세 기준:
//   GET    /stt-results/
//   GET    /stt-results/{stt_result_id}
//   DELETE /stt-results/{stt_result_id}
//
// 제외 endpoint:
//   POST   /stt-results/
//   PATCH  /stt-results/{stt_result_id}
//
// 규칙:
//   - sttResultId는 FastAPI의 stt_result_id로 사용한다.
//   - meetingId는 FastAPI 응답의 meeting_id를 클라이언트에 camelCase로 변환한다.
//   - documentId는 FastAPI 응답의 document_id를 클라이언트에 camelCase로 변환한다.
//   - 클라이언트가 WebSocket으로 STT 결과 생성/수정을 요청하지 않으므로 POST/PATCH는 제외한다.
//   - STT 생성/수정 실시간 수신은 Redis Pub/Sub stt.created, stt.updated와 연결된다.
// ============================================================


// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// GET_STT_RESULTS
// Client → WebSocket Server
// STT 결과 목록 조회
//
// FastAPI:
//   GET /stt-results/
//
// Request Body:
//   없음
//
// payload:
//   FastAPI 명세상 필수 query parameter는 없지만,
//   Node 내부 권한 검증/공간 context 확인을 위해 workspaceId를 받는다.
//   meetingId, documentId는 추후 필터 확장용 선택값이다.
// ------------------------------------------------------------
const GET_STT_RESULTS_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_STT_RESULTS'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// GET_STT_RESULT
// Client → WebSocket Server
// STT 결과 단건 조회
//
// FastAPI:
//   GET /stt-results/{stt_result_id}
//
// Path Parameter:
//   stt_result_id
// ------------------------------------------------------------
const GET_STT_RESULT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_STT_RESULT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'sttResultId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                },
                sttResultId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DELETE_STT_RESULT
// Client → WebSocket Server
// STT 결과 삭제
//
// FastAPI:
//   DELETE /stt-results/{stt_result_id}
//
// Response:
//   204 No Content
//
// payload:
//   sttResultId만 FastAPI path parameter로 사용한다.
//   workspaceId, meetingId, meetingRoomId는 Node 내부 권한 검증,
//   로그, 추후 브로드캐스트 context 용도이다.
// ------------------------------------------------------------
const DELETE_STT_RESULT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DELETE_STT_RESULT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'sttResultId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                },
                sttResultId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ============================================================
// Response Builders
// ============================================================

// ------------------------------------------------------------
// normalizeSttResult
// FastAPI 응답 필드명을 WebSocket 클라이언트 응답 필드명으로 변환
// ------------------------------------------------------------
const normalizeSttResult = (sttResult) => ({
    id: sttResult.id,
    workspaceId: sttResult.workspace_id,
    meetingId: sttResult.meeting_id,
    documentId: sttResult.document_id,
    language: sttResult.language,
    rawText: sttResult.raw_text,
    status: sttResult.status,
    createdAt: sttResult.created_at
});


// ------------------------------------------------------------
// GET_STT_RESULTS_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getSttResultsAck = (requestId, sttResults) => ({
    type: 'GET_STT_RESULTS_ACK',
    requestId,
    success: true,
    payload: {
        sttResults: sttResults.map((sttResult) => normalizeSttResult(sttResult))
    }
});


// ------------------------------------------------------------
// GET_STT_RESULT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getSttResultAck = (requestId, sttResult) => ({
    type: 'GET_STT_RESULT_ACK',
    requestId,
    success: true,
    payload: normalizeSttResult(sttResult)
});


// ------------------------------------------------------------
// DELETE_STT_RESULT_ACK
// Server → 요청한 Client
//
// FastAPI DELETE /stt-results/{stt_result_id}는 204 No Content라서
// 응답 body 없이 sttResultId만 내려준다.
// ------------------------------------------------------------
const deleteSttResultAck = (requestId, sttResultId) => ({
    type: 'DELETE_STT_RESULT_ACK',
    requestId,
    success: true,
    payload: {
        sttResultId,
        deleted: true
    }
});


// ============================================================
// Pub/Sub Broadcast Builders
// ============================================================

// ------------------------------------------------------------
// STT_RESULT_CREATED
// Redis Pub/Sub stt.created 수신 후
// WebSocket Server → 관련 Client
//
// 현재 WebSocket 직접 POST는 제외한다.
// FastAPI 또는 STT 처리 서버에서 생성 완료 후 publish하면 사용한다.
// ------------------------------------------------------------
const sttResultCreatedBroadcast = ({
    workspaceId,
    meetingId,
    stt_result_id,
    status,
    utterance_count
}) => ({
    type: 'STT_RESULT_CREATED',
    payload: {
        workspaceId,
        meetingId,
        sttResultId: stt_result_id,
        status: status ?? '',
        utteranceCount: utterance_count
    }
});


// ------------------------------------------------------------
// STT_RESULT_UPDATED
// Redis Pub/Sub stt.updated 수신 후
// WebSocket Server → 관련 Client
//
// 현재 WebSocket 직접 PATCH는 제외한다.
// FastAPI 또는 STT 처리 서버에서 수정 완료 후 publish하면 사용한다.
// ------------------------------------------------------------
const sttResultUpdatedBroadcast = (sttResult) => ({
    type: 'STT_RESULT_UPDATED',
    payload: {
        ...normalizeSttResult(sttResult),
        workspaceId: sttResult.workspace_id ?? sttResult.workspaceId ?? null,
        meetingId: sttResult.meeting_id ?? sttResult.meetingId ?? null,
        sttResultId: sttResult.id,
        changedFields: sttResult.changed_fields ?? sttResult.changedFields ?? []
    }
});


// ------------------------------------------------------------
// STT_RESULT_DELETED
// Redis Pub/Sub stt.deleted 수신 후
// WebSocket Server → 관련 Client
//
// 삭제를 공간 단위로 브로드캐스트해야 하는 경우 사용한다.
// ------------------------------------------------------------
const sttResultDeletedBroadcast = ({
    workspaceId = null,
    meetingId = null,
    meetingRoomId = null,
    sttResultId
}) => ({
    type: 'STT_RESULT_DELETED',
    payload: {
        workspaceId,
        meetingId,
        meetingRoomId,
        sttResultId,
        deleted: true
    }
});


// ============================================================
// module exports
// ============================================================

module.exports = {
    GET_STT_RESULTS_SCHEMA,
    GET_STT_RESULT_SCHEMA,
    DELETE_STT_RESULT_SCHEMA,

    normalizeSttResult,

    getSttResultsAck,
    getSttResultAck,
    deleteSttResultAck,

    sttResultCreatedBroadcast,
    sttResultUpdatedBroadcast,
    sttResultDeletedBroadcast
};
