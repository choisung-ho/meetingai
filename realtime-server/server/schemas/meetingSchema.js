// ============================================================
// server/schemas/meetingSchema.js
// ============================================================
// 역할:
//   Meeting 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의한다.
//
// 대상 이벤트:
//   - CREATE_MEETING
//   - GET_MEETINGS
//   - GET_MEETING
//   - DELETE_MEETING
//
// Meeting 계층 책임:
//   - 회의 페이지 생성 요청
//   - 회의 목록 조회 요청
//   - 회의 상세 조회 요청
//   - 회의 삭제 요청
//   - 새 회의 생성/삭제 시 관련 클라이언트에게 브로드캐스트
//
// 주의:
//   MeetingRoom은 "이미 존재하는 회의방에 참여/퇴장"하는 계층이고,
//   Meeting은 "회의 데이터 자체를 생성/조회/삭제"하는 계층이다.
//
// HTTP 서버 명세 기준:
//   POST /workspaces/{workspace_id}/meetings
//     - 회의 페이지 생성
//     - 회의 시작이 아님
//     - status는 READY
//     - Response data: { id, title, status }
//
//   GET /workspaces/{workspace_id}/meetings?page=1&size=20
//     - workspace 안의 meeting 목록 조회
//     - Response data: { workspaceId, page, size, meetings }
//
//   GET /workspaces/{workspace_id}/meetings/{meeting_id}
//     - workspace_id + meeting_id를 함께 검증
//     - Response data: { id, title, status }
//
//   DELETE /workspaces/{workspace_id}/meetings/{meeting_id}
//     - workspace_id + meeting_id를 함께 검증
//     - Response data: { id, title, status }
//
// 참고:
//   MEETING_CREATED, MEETING_DELETED는 클라이언트가 직접 요청하는 이벤트가 아니라,
//   성공 이후 서버가 자동으로 브로드캐스트하는 알림 이벤트이다.
// ============================================================

const { SERVER_EVENTS } = require("../websocket/eventTypes");

// -------------------------------------------------------
// CREATE_MEETING 요청 스키마
// -------------------------------------------------------
const CREATE_MEETING_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "CREATE_MEETING"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",

            // status는 클라이언트가 보내도 READY만 허용한다.
            // status가 없으면 service 계층에서 READY 기본값 처리한다.
            required: ["workspaceId", "title"],

            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",
                    minimum: 1
                },
                title: {
                    type: "string",
                    minLength: 1
                },
                status: {
                    type: "string",
                    enum: ["READY"]
                }
            }
        }
    }
};

// -------------------------------------------------------
// GET_MEETINGS 요청 스키마
// -------------------------------------------------------
const GET_MEETINGS_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "GET_MEETINGS"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",
            required: ["workspaceId"],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",
                    minimum: 1
                },
                page: {
                    type: "integer",
                    minimum: 1
                },
                size: {
                    type: "integer",
                    minimum: 1
                }
            }
        }
    }
};

// -------------------------------------------------------
// GET_MEETING 요청 스키마
// -------------------------------------------------------
const GET_MEETING_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "GET_MEETING"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",
            required: ["workspaceId", "meetingId"],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",
                    minimum: 1
                },
                meetingId: {
                    type: "integer",
                    minimum: 1
                }
            }
        }
    }
};

// -------------------------------------------------------
// DELETE_MEETING 요청 스키마
// -------------------------------------------------------
const DELETE_MEETING_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "DELETE_MEETING"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",
            required: ["workspaceId", "meetingId"],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",
                    minimum: 1
                },
                meetingId: {
                    type: "integer",
                    minimum: 1
                }
            }
        }
    }
};

// -------------------------------------------------------
// CREATE_MEETING_ACK 응답 생성 함수
//
// FastAPI POST 응답 data 기준:
// {
//   "id": 7,
//   "title": "회의",
//   "status": "READY"
// }
//
// 주의:
//   FastAPI 응답 data에는 workspaceId가 없을 수 있다.
//   그래서 handler/service에서 받은 workspaceId를 두 번째 인자로 넣을 수 있게 한다.
// -------------------------------------------------------
function createCreateMeetingAck(requestId = null, workspaceId = null, data = {}) {
    const id = data.id ?? data.meetingId ?? data.meeting_id ?? null;

    return {
        type: SERVER_EVENTS.CREATE_MEETING_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            id,
            title: data.title ?? null,
            status: data.status ?? "READY"
        }
    };
}

// -------------------------------------------------------
// GET_MEETINGS_ACK 응답 생성 함수
//
// FastAPI GET 목록 응답 data 기준:
// {
//   "workspaceId": 1,
//   "page": 1,
//   "size": 20,
//   "meetings": [
//     {
//       "id": 7,
//       "title": "회의",
//       "status": "READY"
//     }
//   ]
// }
// -------------------------------------------------------
function createGetMeetingsAck(requestId = null, workspaceId = null, data = {}) {
    const meetings = Array.isArray(data?.meetings) ? data.meetings : [];

    return {
        type: SERVER_EVENTS.GET_MEETINGS_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            page: data.page ?? null,
            size: data.size ?? null,
            meetings,
            count: meetings.length,
            fetchedAt: new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// GET_MEETING_ACK 응답 생성 함수
//
// FastAPI GET 상세 응답 data 기준:
// {
//   "id": 7,
//   "title": "회의",
//   "status": "ACTIVE"
// }
//
// 주의:
//   FastAPI 응답 data에는 workspaceId가 없을 수 있다.
//   그래서 handler/service에서 받은 workspaceId, meetingId를 인자로 넣을 수 있게 한다.
// -------------------------------------------------------
function createGetMeetingAck(requestId = null, workspaceId = null, data = {}) {
    const id = data.id ?? data.meetingId ?? data.meeting_id ?? null;

    return {
        type: SERVER_EVENTS.GET_MEETING_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            id,
            title: data.title ?? null,
            status: data.status ?? null,
            fetchedAt: new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// DELETE_MEETING_ACK 응답 생성 함수
//
// FastAPI DELETE 응답 data 기준:
// {
//   "id": 7,
//   "title": "회의",
//   "status": "ENDED"
// }
//
// 주의:
//   FastAPI 응답 data에는 workspaceId가 없을 수 있다.
//   그래서 handler/service에서 받은 workspaceId, meetingId를 인자로 넣을 수 있게 한다.
// -------------------------------------------------------
function createDeleteMeetingAck(requestId = null, workspaceId = null, meetingId = null, data = {}) {
    const id = data.id ?? data.meetingId ?? data.meeting_id ?? meetingId ?? null;

    return {
        type: SERVER_EVENTS.DELETE_MEETING_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            id,
            title: data.title ?? null,
            status: data.status ?? "ENDED"
        }
    };
}

// -------------------------------------------------------
// MEETING_CREATED 알림 생성 함수
//
// CREATE_MEETING 성공 이후 같은 워크스페이스 접속자들에게 브로드캐스트한다.
//
// FastAPI POST 응답 data 기준:
// {
//   "id": 7,
//   "title": "회의",
//   "status": "READY"
// }
//
// 주의:
//   FastAPI 응답 data에 workspaceId가 없을 수 있으므로
//   service/handler에서 workspaceId를 합쳐서 넘기거나,
//   이 함수의 두 번째 인자로 workspaceId를 넘길 수 있게 한다.
// -------------------------------------------------------
function createMeetingCreated(data = {}, workspaceId = null) {
    const id = data.id ?? data.meetingId ?? data.meeting_id ?? null;

    return {
        type: SERVER_EVENTS.MEETING_CREATED,
        requestId: null,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            id,
            title: data.title ?? null,
            status: data.status ?? "READY"
        }
    };
}

// -------------------------------------------------------
// MEETING_DELETED 알림 생성 함수
//
// DELETE_MEETING 성공 이후 같은 워크스페이스 접속자들에게 브로드캐스트한다.
//
// FastAPI DELETE 응답 data 기준:
// {
//   "id": 7,
//   "title": "회의",
//   "status": "ENDED"
// }
//
// 주의:
//   FastAPI 응답 data에 workspaceId가 없을 수 있으므로
//   service/handler에서 workspaceId를 합쳐서 넘기거나,
//   이 함수의 두 번째 인자로 workspaceId를 넘길 수 있게 한다.
// -------------------------------------------------------
function createMeetingDeleted(data = {}, workspaceId = null, meetingId = null) {
    const id = data.id ?? data.meetingId ?? data.meeting_id ?? meetingId ?? null;

    return {
        type: SERVER_EVENTS.MEETING_DELETED,
        requestId: null,
        success: true,
        payload: {
            workspaceId: data.workspaceId ?? data.workspace_id ?? workspaceId ?? null,
            id,
            title: data.title ?? null,
            status: data.status ?? "ENDED"
        }
    };
}

module.exports = {
    CREATE_MEETING_SCHEMA,
    GET_MEETINGS_SCHEMA,
    GET_MEETING_SCHEMA,
    DELETE_MEETING_SCHEMA,

    createCreateMeetingAck,
    createGetMeetingsAck,
    createGetMeetingAck,
    createDeleteMeetingAck,

    createMeetingCreated,
    createMeetingDeleted
};