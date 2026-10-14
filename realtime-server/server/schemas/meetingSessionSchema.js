// ============================================================
// server/schemas/meetingSessionSchema.js
// ============================================================
// 역할:
//   MeetingSession 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의한다.
//
// 대상 이벤트:
//   - START_MEETING
//   - END_MEETING
//
// HTTP 서버 명세 기준:
//   PATCH /workspaces/{workspace_id}/meetings/{meeting_id}
//
// Request Body:
//   {
//     "title": "string",
//     "status": "READY"
//   }
//
// Meeting status enum:
//   - READY
//   - ACTIVE
//   - ENDED
// ============================================================

const MEETING_STATUS = Object.freeze({
    READY: 'READY',
    ACTIVE: 'ACTIVE',
    ENDED: 'ENDED'
});


// ------------------------------------------------------------
// START_MEETING
// Client → WebSocket Server
//
// FastAPI로 전달:
// PATCH /workspaces/{workspaceId}/meetings/{meetingId}
// Body: { title, status: "ACTIVE" }
// ------------------------------------------------------------
const START_MEETING_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'START_MEETING'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'title'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer',
                    minimum: 1
                },
                meetingId: {
                    type: 'integer',
                    minimum: 1
                },
                title: {
                    type: 'string',
                    minLength: 1
                }
            }
        }
    }
};


// ------------------------------------------------------------
// END_MEETING
// Client → WebSocket Server
//
// FastAPI로 전달:
// PATCH /workspaces/{workspaceId}/meetings/{meetingId}
// Body: { title, status: "ENDED" }
// ------------------------------------------------------------
const END_MEETING_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'END_MEETING'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'title'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer',
                    minimum: 1
                },
                meetingId: {
                    type: 'integer',
                    minimum: 1
                },
                title: {
                    type: 'string',
                    minLength: 1
                }
            }
        }
    }
};


// ------------------------------------------------------------
// Meeting 상태 응답 정규화
// ------------------------------------------------------------
function normalizeMeetingStatus(data = {}) {
    return {
        meetingId: data.id ?? data.meetingId ?? data.meeting_id ?? null,
        workspaceId: data.workspaceId ?? data.workspace_id ?? null,
        title: data.title ?? null,
        description: data.description ?? null,
        status: data.status ?? null,
        scheduledAt: data.scheduledAt ?? data.scheduled_at ?? null,
        startedAt: data.startedAt ?? data.started_at ?? null,
        endedAt: data.endedAt ?? data.ended_at ?? null,
        createdAt: data.createdAt ?? data.created_at ?? null
    };
}


// ------------------------------------------------------------
// START_MEETING_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
function createStartMeetingAck(requestId = null, data = {}) {
    return {
        type: 'START_MEETING_ACK',
        requestId,
        success: true,
        payload: normalizeMeetingStatus(data)
    };
}


// ------------------------------------------------------------
// END_MEETING_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
function createEndMeetingAck(requestId = null, data = {}) {
    return {
        type: 'END_MEETING_ACK',
        requestId,
        success: true,
        payload: normalizeMeetingStatus(data)
    };
}


// ------------------------------------------------------------
// MEETING_STATUS_CHANGED
// Server → 같은 Workspace 접속자 전체
// ------------------------------------------------------------
function createMeetingStatusChanged(data = {}) {
    return {
        type: 'MEETING_STATUS_CHANGED',
        payload: normalizeMeetingStatus(data)
    };
}

module.exports = {
    MEETING_STATUS,

    START_MEETING_SCHEMA,
    END_MEETING_SCHEMA,

    createStartMeetingAck,
    createEndMeetingAck,
    createMeetingStatusChanged
};