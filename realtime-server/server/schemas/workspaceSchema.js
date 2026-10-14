// ============================================================
// server/schemas/workspaceSchema.js
// ============================================================
// 역할:
//   Workspace 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의한다.
//
// 대상 이벤트:
//   - JOIN_WORKSPACE
//   - LEAVE_WORKSPACE
//
// Workspace 계층 책임:
//   - 사용자의 워크스페이스 참여 처리
//   - 사용자의 워크스페이스 퇴장 처리
//   - 워크스페이스 참여자 목록 업데이트 알림 생성
//
// 주의:
//   이 파일은 실제 검증을 실행하지 않는다.
//   handler 또는 validate 함수에서 JSON Schema를 기준으로 요청 메시지를 검증한다.
// ============================================================

const { SERVER_EVENTS } = require("../websocket/eventTypes");

// -------------------------------------------------------
// JOIN_WORKSPACE 요청 스키마
// 클라이언트가 특정 워크스페이스에 참여할 때 사용한다.
//
// 보안 적용 후 의미:
//   userId는 JWT 검증 후 ws.userId에서 읽으므로 payload에 포함하지 않는다.
//   사용자를 특정 workspaceId에 참여시키고,
//   서버는 해당 워크스페이스의 참여자 목록을 관리한다.
//
// 메시지 예시:
// {
//   "type": "JOIN_WORKSPACE",
//   "requestId": "req-001",
//   "payload": {
//     "workspaceId": 22
//   }
// }
// -------------------------------------------------------
const JOIN_WORKSPACE_SCHEMA = {
    type: "object",                 // 검증 대상 데이터가 객체임을 명시
    required: ["type", "payload"],  // 필수 필드
    additionalProperties: false,    // 추가 필드 허용 안함
    properties: {                   // 각 필드가 어떤 규칙을 따라야 하는지 정의
        type: {
            const: "JOIN_WORKSPACE"     // type 필드 이름
        },
        requestId: {
            type: ["string", "null"],   // requestId는 문자열이거나 null일 수 있다
            minLength: 1                // 문자열로 보낼 경우 빈 문자열은 허용하지 않는다
        },
        payload: {                    // 실제 데이터가 들어가는 곳
            type: "object",             // 객체
            required: ["workspaceId"],  // 필수 필드 (userId는 ws에서 읽음)
            additionalProperties: false,// 추가 필드 허용 안함
            properties: {               // 각 필드가 어떤 규칙을 따라야 하는지 정의
                workspaceId: {
                    type: "integer",        // workspaceId는 정수
                    minimum: 1
                }
            }
        }
    }
};

// -------------------------------------------------------
// LEAVE_WORKSPACE 요청 스키마
// 클라이언트가 특정 워크스페이스에서 퇴장할 때 사용한다.
//
// 보안 적용 후 의미:
//   userId는 JWT 검증 후 ws.userId에서 읽으므로 payload에 포함하지 않는다.
//   사용자를 특정 workspaceId에서 제거하고,
//   서버는 변경된 워크스페이스 참여자 목록을 다시 계산한다.
//
// 메시지 예시:
// {
//   "type": "LEAVE_WORKSPACE",
//   "requestId": "req-002",
//   "payload": {
//     "workspaceId": 22
//   }
// }
// -------------------------------------------------------
const LEAVE_WORKSPACE_SCHEMA = {
    type: "object",
    required: ["type", "payload"],
    additionalProperties: false,
    properties: {
        type: {
            const: "LEAVE_WORKSPACE"
        },
        requestId: {
            type: ["string", "null"],
            minLength: 1                // 문자열로 보낼 경우 빈 문자열은 허용하지 않는다
        },
        payload: {
            type: "object",
            required: ["workspaceId"],  // 필수 필드 (userId는 ws에서 읽음)
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: "integer",        // workspaceId는 정수
                    minimum: 1
                }
            }
        }
    }
};

// -------------------------------------------------------
// JOIN_WORKSPACE_ACK 응답 생성 함수
// 서버가 워크스페이스 참여를 정상 처리했을 때 클라이언트에게 보낸다.
// -------------------------------------------------------
function createJoinWorkspaceAck(requestId = null, data) {
    return {
        type: SERVER_EVENTS.JOIN_WORKSPACE_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            userId: data.userId,
            joinedAt: data.joinedAt || new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// LEAVE_WORKSPACE_ACK 응답 생성 함수
// 서버가 워크스페이스 퇴장을 정상 처리했을 때 클라이언트에게 보낸다.
// -------------------------------------------------------
function createLeaveWorkspaceAck(requestId = null, data) {
    return {
        type: SERVER_EVENTS.LEAVE_WORKSPACE_ACK,
        requestId,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            userId: data.userId,
            leftAt: data.leftAt || new Date().toISOString()
        }
    };
}

// -------------------------------------------------------
// WORKSPACE_USERS_UPDATED 알림 생성 함수
// 서버가 워크스페이스 참여자 목록 변경을 같은 워크스페이스 사용자들에게 알릴 때 보낸다.
//
// 이 이벤트는 특정 요청에 대한 ACK가 아니라,
// 참여/퇴장 이후 브로드캐스트되는 서버 알림이다.
// -------------------------------------------------------
function createWorkspaceUsersUpdated(data) {
    return {
        type: SERVER_EVENTS.WORKSPACE_USERS_UPDATED,
        requestId: null,
        success: true,
        payload: {
            workspaceId: data.workspaceId,
            users: data.users || [],
            updatedAt: data.updatedAt || new Date().toISOString()
        }
    };
}

module.exports = {
    JOIN_WORKSPACE_SCHEMA,
    LEAVE_WORKSPACE_SCHEMA,
    createJoinWorkspaceAck,
    createLeaveWorkspaceAck,
    createWorkspaceUsersUpdated
};