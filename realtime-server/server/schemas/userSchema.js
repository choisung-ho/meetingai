// ============================================================
// server/schemas/userSchema.js
// ============================================================
// 역할:
//   User 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의한다.
//
// 대상 이벤트:
//   - CONNECT_USER
//   - DISCONNECT_USER
//   - PING
//
// User 계층 책임:
//   - WebSocket 연결 사용자 등록
//   - WebSocket 연결 사용자 해제
//   - WebSocket 연결 상태 확인
//
// 보안 적용 후 원칙:
//   - userId, name은 클라이언트 payload에서 받지 않는다.
//   - 사용자 식별 정보는 WebSocket 연결 시 JWT 검증 후 ws.userId,ws.name에 저장된 값을 사용한다.
//   - 따라서 CONNECT_USER / DISCONNECT_USER / PING의 payload는 빈 객체만 허용한다.
// ============================================================

const { SERVER_EVENTS } = require("../websocket/eventTypes");

// -------------------------------------------------------
// CONNECT_USER 요청 스키마
// 클라이언트가 WebSocket 연결 후 사용자 세션 등록을 요청할 때 사용한다.
//
// 보안 적용 후 의미:
//   userId JWT 검증 후 ws에 저장된 값을 사용한다 (payload 미사용).
//   name은 JWT에 포함되지 않으므로 클라이언트가 payload로 전달한다.
//
// 메시지 예시:
// {
//   "type": "CONNECT_USER",
//   "requestId": "req-001",
//   "payload": {
//     "name": "홍길동"
//   }
// }
// -------------------------------------------------------
const CONNECT_USER_SCHEMA = {
  type: "object",
  required: ["type", "payload"],
  additionalProperties: false,
  properties: {
    type: {
      const: "CONNECT_USER"
    },
    requestId: {
      type: ["string", "null"],
      minLength: 1
    },
    payload: {
      type: "object",
      required: [],
      additionalProperties: false,
      properties: {
        name: {
          type: ["string", "null"],
          minLength: 1
        }
      }
    }
  }
};

// -------------------------------------------------------
// DISCONNECT_USER 요청 스키마
// 클라이언트가 명시적으로 사용자 연결 종료를 요청할 때 사용한다.
//
// 보안 적용 후 의미:
//   userId를 payload로 받지 않는다.
//   서버는 ws.userId를 기준으로 연결을 종료한다.
//
// 메시지 예시:
// {
//   "type": "DISCONNECT_USER",
//   "requestId": "req-002",
//   "payload": {}
// }
// -------------------------------------------------------
const DISCONNECT_USER_SCHEMA = {
  type: "object",
  required: ["type", "payload"],
  additionalProperties: false,
  properties: {
    type: {
      const: "DISCONNECT_USER"
    },
    requestId: {
      type: ["string", "null"],
      minLength: 1
    },
    payload: {
      type: "object",
      required: [],
      additionalProperties: false,
      properties: {}
    }
  }
};

// -------------------------------------------------------
// PING 요청 스키마
// 클라이언트가 WebSocket 서버 연결 상태를 확인할 때 사용한다.
//
// payload에는 별도 데이터가 필요 없다.
// 연결 확인만 하는 이벤트이므로 빈 객체만 허용한다.
//
// 메시지 예시:
// {
//   "type": "PING",
//   "requestId": "req-003",
//   "payload": {}
// }
// -------------------------------------------------------
const PING_USER_SCHEMA = {
  type: "object",
  required: ["type", "payload"],
  additionalProperties: false,
  properties: {
    type: {
      const: "PING"
    },
    requestId: {
      type: ["string", "null"],
      minLength: 1
    },
    payload: {
      type: "object",
      required: [],
      additionalProperties: false,
      properties: {}
    }
  }
};

// -------------------------------------------------------
// CONNECT_USER_ACK 응답 생성 함수
// 서버가 사용자 연결 등록을 정상 처리했을 때 클라이언트에게 보낸다.
//
// data는 클라이언트 payload가 아니라,
// JWT 검증 후 서버가 ws에서 꺼낸 사용자 정보 기반이어야 한다.
// -------------------------------------------------------
function createConnectUserAck(requestId = null, data) {
  return {
    type: SERVER_EVENTS.CONNECT_USER_ACK,
    requestId,
    success: true,
    payload: {
      userId: data.userId,
      name: data.name || null,
      status: data.status || "online",
      connectedAt: data.connectedAt || new Date().toISOString()
    }
  };
}

// -------------------------------------------------------
// DISCONNECT_USER_ACK 응답 생성 함수
// 서버가 사용자 연결 해제를 정상 처리했을 때 클라이언트에게 보낸다.
// -------------------------------------------------------
function createDisconnectUserAck(requestId = null, data) {
  return {
    type: SERVER_EVENTS.DISCONNECT_USER_ACK,
    requestId,
    success: true,
    payload: {
      userId: data.userId,
      disconnectedAt: new Date().toISOString()
    }
  };
}

// -------------------------------------------------------
// PONG 응답 생성 함수
// 서버가 PING 요청을 정상 처리했을 때 클라이언트에게 보낸다.
// -------------------------------------------------------
function createPongAck(requestId = null) {
  return {
    type: SERVER_EVENTS.PONG,
    requestId,
    success: true,
    payload: {
      serverTime: new Date().toISOString()
    }
  };
}

module.exports = {
  CONNECT_USER_SCHEMA,
  DISCONNECT_USER_SCHEMA,
  PING_USER_SCHEMA,
  createConnectUserAck,
  createDisconnectUserAck,
  createPongAck
};