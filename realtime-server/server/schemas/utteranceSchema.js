// ============================================================
// server/schemas/utteranceSchema.js
// ============================================================
// 역할:
//   Utterance 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의하고,
//   클라이언트에게 보낼 ACK 응답 생성 함수를 제공한다.
//
// 대상 이벤트:
//   - GET_UTTERANCES
//   - GET_UTTERANCE
//   - UPDATE_UTTERANCE
//   - DELETE_UTTERANCE
//
// Utterance 계층 책임:
//   - 발화 목록 조회
//   - 발화 단건 조회
//   - 발화 수정
//   - 발화 삭제
//
// FastAPI 명세 기준:
//   GET    /utterances/
//   GET    /utterances/{utterance_id}
//   PATCH  /utterances/{utterance_id}
//   DELETE /utterances/{utterance_id}
//
// 제외 endpoint:
//   POST   /utterances/
//
// 규칙:
//   - utteranceId는 FastAPI의 utterance_id로 사용한다.
//   - sttResultId는 FastAPI 응답의 stt_result_id를 클라이언트에 camelCase로 변환한다.
//   - startMs는 FastAPI 응답의 start_ms를 클라이언트에 camelCase로 변환한다.
//   - endMs는 FastAPI 응답의 end_ms를 클라이언트에 camelCase로 변환한다.
//   - speakerLabel은 FastAPI 응답의 speaker_label을 클라이언트에 camelCase로 변환한다.
//   - 클라이언트가 WebSocket으로 발화 생성을 요청하지 않으므로 POST는 제외한다.
//   - 발화 생성 실시간 수신은 Redis realtime.events의 utterance.created와 연결한다.
// ============================================================


// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// GET_UTTERANCES
// Client → WebSocket Server
// 발화 목록 조회
//
// FastAPI:
//   GET /utterances/
//   GET /utterances/?stt_result_id={stt_result_id}
//
// Request Body:
//   없음
//
// payload:
//   FastAPI 명세상 stt_result_id는 선택 query parameter이다.
//   Node 내부 권한 검증/공간 context 확인을 위해 workspaceId,
//   meetingId, meetingRoomId를 받는다.
// ------------------------------------------------------------
const GET_UTTERANCES_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_UTTERANCES'
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
// GET_UTTERANCE
// Client → WebSocket Server
// 발화 단건 조회
//
// FastAPI:
//   GET /utterances/{utterance_id}
//
// Path Parameter:
//   utterance_id
// ------------------------------------------------------------
const GET_UTTERANCE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_UTTERANCE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'utteranceId'],
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
                utteranceId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// UPDATE_UTTERANCE
// Client → WebSocket Server
// 발화 수정
//
// FastAPI:
//   PATCH /utterances/{utterance_id}
//
// Path Parameter:
//   utterance_id
//
// Request Body:
// {
//   stt_result_id,
//   sequence,
//   start_ms,
//   end_ms,
//   speaker_label,
//   text
// }
//
// payload:
//   utteranceId만 FastAPI path parameter로 사용한다.
//   sttResultId, sequence, startMs, endMs, speakerLabel, text는
//   FastAPI request body로 변환해서 전달한다.
// ------------------------------------------------------------
const UPDATE_UTTERANCE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'UPDATE_UTTERANCE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: [
                'workspaceId',
                'meetingId',
                'meetingRoomId',
                'utteranceId',
                'sttResultId',
                'sequence',
                'startMs',
                'endMs',
                'speakerLabel',
                'text'
            ],
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
                utteranceId: {
                    type: 'integer'
                },
                sttResultId: {
                    type: 'integer'
                },
                sequence: {
                    type: 'integer'
                },
                startMs: {
                    type: 'integer'
                },
                endMs: {
                    type: 'integer'
                },
                speakerLabel: {
                    type: 'string'
                },
                text: {
                    type: 'string'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DELETE_UTTERANCE
// Client → WebSocket Server
// 발화 삭제
//
// FastAPI:
//   DELETE /utterances/{utterance_id}
//
// Response:
//   204 No Content
//
// payload:
//   utteranceId만 FastAPI path parameter로 사용한다.
//   workspaceId, meetingId, meetingRoomId는 Node 내부 권한 검증,
//   로그, 추후 브로드캐스트 context 용도이다.
// ------------------------------------------------------------
const DELETE_UTTERANCE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DELETE_UTTERANCE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'sttResultId', 'utteranceId'],
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
                },
                utteranceId: {
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
// normalizeUtterance
// FastAPI 응답 필드명을 WebSocket 클라이언트 응답 필드명으로 변환
// ------------------------------------------------------------
const normalizeUtterance = (utterance) => ({
    id: utterance.id,
    sttResultId: utterance.stt_result_id,
    sequence: utterance.sequence,
    startMs: utterance.start_ms,
    endMs: utterance.end_ms,
    speakerLabel: utterance.speaker_label,
    text: utterance.text,
    createdAt: utterance.created_at
});


// ------------------------------------------------------------
// GET_UTTERANCES_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getUtterancesAck = (requestId, utterances) => ({
    type: 'GET_UTTERANCES_ACK',
    requestId,
    success: true,
    payload: {
        utterances: utterances.map((utterance) => normalizeUtterance(utterance))
    }
});


// ------------------------------------------------------------
// GET_UTTERANCE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getUtteranceAck = (requestId, utterance) => ({
    type: 'GET_UTTERANCE_ACK',
    requestId,
    success: true,
    payload: normalizeUtterance(utterance)
});


// ------------------------------------------------------------
// UPDATE_UTTERANCE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const updateUtteranceAck = (requestId, utterance) => ({
    type: 'UPDATE_UTTERANCE_ACK',
    requestId,
    success: true,
    payload: normalizeUtterance(utterance)
});


// ------------------------------------------------------------
// DELETE_UTTERANCE_ACK
// Server → 요청한 Client
//
// FastAPI DELETE /utterances/{utterance_id}는 204 No Content라서
// 응답 body 없이 utteranceId만 내려준다.
// ------------------------------------------------------------
const deleteUtteranceAck = (requestId, utteranceId) => ({
    type: 'DELETE_UTTERANCE_ACK',
    requestId,
    success: true,
    payload: {
        utteranceId,
        deleted: true
    }
});


// ============================================================
// Pub/Sub Broadcast Builders
// ============================================================

// ------------------------------------------------------------
// UTTERANCE_CREATED
// Redis Pub/Sub utterance.created 수신 후
// WebSocket Server → 관련 Client
//
// 현재 WebSocket 직접 POST는 제외한다.
// FastAPI 또는 STT 처리 서버에서 발화 생성 완료 후 publish하면 사용한다.
// ------------------------------------------------------------
const utteranceCreatedBroadcast = ({
    workspaceId = null,
    meetingId = null,
    utterance
}) => ({
    type: 'UTTERANCE_CREATED',
    payload: {
        workspaceId,
        meetingId,
        utterance: normalizeUtterance(utterance)
    }
});



// ------------------------------------------------------------
// UTTERANCE_UPDATED
// Redis Pub/Sub utterance.updated 수신 후
// WebSocket Server → 관련 Client
//
// Node WebSocket PATCH 성공 후 브로드캐스트하거나,
// FastAPI 또는 STT 처리 서버에서 수정 완료 후 publish하면 사용한다.
// ------------------------------------------------------------
const utteranceUpdatedBroadcast = ({
    workspaceId = null,
    meetingId = null,
    utterance
}) => ({
    type: 'UTTERANCE_UPDATED',
    payload: {
        workspaceId,
        meetingId,
        utterance: normalizeUtterance(utterance)
    }
});


// ------------------------------------------------------------
// UTTERANCE_DELETED
// Redis Pub/Sub utterance.deleted 수신 후
// WebSocket Server → 관련 Client
//
// 삭제를 공간 단위로 브로드캐스트해야 하는 경우 사용한다.
// ------------------------------------------------------------
const utteranceDeletedBroadcast = ({
    workspaceId = null,
    meetingId = null,
    utteranceId
}) => ({
    type: 'UTTERANCE_DELETED',
    payload: {
        workspaceId,
        meetingId,
        utteranceId,
        deleted: true
    }
});


// ============================================================
// module exports
// ============================================================

module.exports = {
    GET_UTTERANCES_SCHEMA,
    GET_UTTERANCE_SCHEMA,
    UPDATE_UTTERANCE_SCHEMA,
    DELETE_UTTERANCE_SCHEMA,

    normalizeUtterance,

    getUtterancesAck,
    getUtteranceAck,
    updateUtteranceAck,
    deleteUtteranceAck,

    utteranceCreatedBroadcast,
    utteranceUpdatedBroadcast,
    utteranceDeletedBroadcast
};
