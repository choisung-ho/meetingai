// ============================================================
// server/schemas/meetingRoomSchema.js
// ============================================================
// 보안 적용 후 원칙:
//   userId는 JWT 검증 후 ws.userId에서 읽으므로 payload에 포함하지 않는다.
// ============================================================

const { SERVER_EVENTS } = require("../websocket/eventTypes");

// -------------------------------------------------------
// JOIN_MEETING_ROOM 요청 스키마
//
// 보안 적용 후 의미:
//   userId는 ws.userId에서 읽으므로 payload에 포함하지 않는다.
//
// 메시지 예시:
// {
//   "type": "JOIN_MEETING_ROOM",
//   "requestId": "req-001",
//   "payload": {
//     "workspaceId": 22,
//     "meetingId": 1,
//     "meetingRoomId": 3
//   }
// }
// -------------------------------------------------------
const JOIN_MEETING_ROOM_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "JOIN_MEETING_ROOM"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",
            required: ["workspaceId", "meetingRoomId", "meetingId"],  // userId는 ws에서 읽음
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",        // workspaceId는 정수
                    minimum: 1
                },
                meetingRoomId: {
                    type: "integer",        // meetingRoomId는 정수
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
// LEAVE_MEETING_ROOM 요청 스키마
//
// 보안 적용 후 의미:
//   userId는 ws.userId에서 읽으므로 payload에 포함하지 않는다.
//
// 메시지 예시:
// {
//   "type": "LEAVE_MEETING_ROOM",
//   "requestId": "req-002",
//   "payload": {
//     "workspaceId": 22,
//     "meetingId": 1,
//     "meetingRoomId": 3
//   }
// }
// -------------------------------------------------------
const LEAVE_MEETING_ROOM_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "LEAVE_MEETING_ROOM"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1
        },
        payload: {
            type: "object",
            required: ["workspaceId", "meetingRoomId", "meetingId"],  // userId는 ws에서 읽음
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",        // workspaceId는 정수
                    minimum: 1
                },
                meetingRoomId: {
                    type: "integer",        // meetingRoomId는 정수
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
// JOIN_MEETING_ROOM_ACK 응답 생성 함수
// -------------------------------------------------------
function createJoinMeetingRoomAck(requestId = null, data) {
    return {
        type: SERVER_EVENTS.JOIN_MEETING_ROOM_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            meetingRoomId: data.meetingRoomId,
            meetingId: data.meetingId,
            userId: data.userId,
            joinedAt: data.joinedAt || new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// LEAVE_MEETING_ROOM_ACK 응답 생성 함수
// -------------------------------------------------------
function createLeaveMeetingRoomAck(requestId = null, data) {
    return {
        type: SERVER_EVENTS.LEAVE_MEETING_ROOM_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            meetingRoomId: data.meetingRoomId,
            meetingId: data.meetingId,
            userId: data.userId,
            leftAt: data.leftAt || new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// MEETING_ROOM_USERS_UPDATED 알림 생성 함수
// -------------------------------------------------------
function createMeetingRoomUsersUpdated(data) {
    return {
        type: SERVER_EVENTS.MEETING_ROOM_USERS_UPDATED,
        requestId: null,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            meetingRoomId: data.meetingRoomId,
            meetingId: data.meetingId,
            users: data.users || [],
            updatedAt: data.updatedAt || new Date().toISOString()
        }
    };
}

module.exports = {
    JOIN_MEETING_ROOM_SCHEMA,
    LEAVE_MEETING_ROOM_SCHEMA,
    createJoinMeetingRoomAck,
    createLeaveMeetingRoomAck,
    createMeetingRoomUsersUpdated
};