# realtime-backend

Node.js + WebSocket 기반 실시간 통신 백엔드 서버입니다.  
JWT 인증, 워크스페이스·회의방 참여자 관리, 회의·안건·알림·문서·STT 이벤트 라우팅과
FastAPI/Redis Pub/Sub 연동을 제공합니다.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 런타임 | Node.js |
| WebSocket 라이브러리 | [ws](https://github.com/websockets/ws) |
| 환경변수 관리 | dotenv |
| 세션 저장소 | 메모리 Map + Redis presence |
| 기본 포트 | 8080 |

---

## 폴더 트리 구조

프로젝트 루트(`realtime_backend`) 기준 폴더와 하위 파일 구조입니다.

```text
realtime_backend/
|-- node_modules/              # npm install로 생성되는 의존성 폴더
|-- server/
|   |-- handlers/
|   |   |-- alertHandler.js        # 알림 조회/상태 변경 이벤트 처리
|   |   |-- handlerMap.js          # 이벤트 type과 handler 함수 매핑
|   |   |-- presenceHandler.js     # 호환용 모듈 (presence는 join/leave에서 처리)
|   |   |-- transcriptHandler.js   # STT chunk 수신·분석·broadcast
|   |   `-- userHandler.js         # User 계층 이벤트 처리 (CONNECT/DISCONNECT/PING)
|   |-- fastapi/                  # FastAPI HTTP API 클라이언트
|   |   |-- fastApiClient.js
|   |   |-- documentApi.js
|   |   |-- realtimeApi.js
|   |   `-- sttResultApi.js
|   |-- redis/
|   |   |-- pubsubService.js       # Redis subscriber 연결/구독 관리
|   |   `-- redisClient.js         # Redis command client
|   |-- pubsub/
|   |   |-- initializer.js          # Redis 구독 초기화/종료
|   |   |-- documentSubscriber.js   # 레거시 전용 채널 호환 모듈(기본 미기동)
|   |   |-- sttResultSubscriber.js  # 레거시 전용 채널 호환 모듈(기본 미기동)
|   |   `-- realtimeEventSubscriber.js # realtime.events 단일 canonical 구독
|   |-- schemas/
|   |   |-- messageSchemas.js      # 공통 응답 객체 생성 (CONNECTED, ERROR)
|   |   `-- userSchema.js          # User 계층 요청 형식 및 응답 팩토리 함수
|   |-- services/
|   |   |-- alertService.js        # 알림 FastAPI 호출/응답 변환
|   |   |-- transcriptService.js   # STT chunk FastAPI 전달
|   |   |-- broadcastService.js    # workspace/meeting room broadcast
|   |   `-- presenceService.js     # Redis presence 집계
|   |-- sessions/
|   |   |-- meetingRoomStore.js    # 회의방별 클라이언트 관리
|   |   |-- presenceStore.js       # Redis presence CRUD
|   |   `-- sessionStore.js        # userId 기반 WebSocket 세션 저장소 (Map)
|   |-- utils/
|   |   |-- logger.js              # 로그 출력 유틸
|   |   |-- sendJson.js            # JSON 응답 전송 및 에러 응답 유틸
|   |   |-- validateMessage.js     # 공통 메시지 형식 검증 (type 필드 존재 여부)
|   |   `-- validatePayloadBySchema.js # 이벤트별 payload 스키마 검증
|   |-- websocket/
|   |   |-- events/
|   |   |   |-- legacyEvents.js        # 초기 WebSocket 연결 및 채팅 테스트 이벤트
|   |   |   |-- meetingRoomEvents.js   # 회의실 입장/퇴장 이벤트
|   |   |   |-- meetingSessionEvents.js# 회의 시작/종료 이벤트
|   |   |   |-- userEvents.js          # 사용자 연결/해제/PING 이벤트
|   |   |   `-- workspaceEvents.js     # 워크스페이스 입장/퇴장 이벤트
|   |   |-- connectionHandler.js   # 클라이언트 연결/종료/에러 처리
|   |   |-- eventTypes.js          # 계층별 이벤트를 합쳐서 내보내는 통합 진입점
|   |   |-- messageRouter.js       # JSON 파싱, 공통 검증, handlerMap 기반 분기
|   |   `-- websocketServer.js     # WebSocketServer 생성 및 연결 이벤트 등록
|   `-- mainServer.js              # 서버 진입점 (.env 로드, 포트 설정, 서버 시작)
|-- .env                           # 로컬 환경변수 파일
|-- package-lock.json
|-- package.json
|-- README.md
`-- testclient.html                # 브라우저 기반 WebSocket 테스트 클라이언트
```

### 주요 폴더 역할

- `server/websocket`: WebSocket 서버 생성, 연결 처리, 메시지 라우팅, 이벤트 타입 정의
- `server/handlers`: 이벤트 type별 실제 처리 로직 및 handler 매핑 (`handlerMap.js`)
- `server/schemas`: 이벤트별 요청 형식 정의 및 응답 객체 생성 팩토리 함수
- `server/utils`: JSON 전송, 메시지 검증, payload 스키마 검증, 로그 공통 유틸
- `server/sessions`: userId 기반 WebSocket 세션 저장소 (Map)
- `server/services`: 알림, 분석, FastAPI 연동 같은 비즈니스 로직 확장 지점
- `server/redis`: Redis 클라이언트와 Pub/Sub 확장 지점

---

## WebSocket 이벤트 타입 구조

이벤트 타입은 `server/websocket/events/` 폴더에서 계층별 파일로 관리합니다.  
`server/websocket/eventTypes.js`는 계층별 이벤트를 하나로 합쳐서 내보내는 통합 진입점입니다.

새 코드에서는 방향이 명확한 `CLIENT_EVENTS`, `SERVER_EVENTS` 사용을 권장합니다.

```js
const {
  CLIENT_EVENTS,
  SERVER_EVENTS
} = require("./eventTypes");
```

- `CLIENT_EVENTS`: 클라이언트가 서버로 보내는 이벤트
- `SERVER_EVENTS`: 서버가 클라이언트로 보내는 이벤트 (공통 `ERROR` 포함)

현재 분리된 이벤트 계층은 다음과 같습니다.

| 계층 | CLIENT_EVENTS | SERVER_EVENTS |
|---|---|---|
| **User** | `CONNECT_USER`, `DISCONNECT_USER`, `PING` | `CONNECT_USER_ACK`, `DISCONNECT_USER_ACK`, `PONG` |
| **Workspace** | `JOIN_WORKSPACE`, `LEAVE_WORKSPACE` | `JOIN_WORKSPACE_ACK`, `LEAVE_WORKSPACE_ACK`, `WORKSPACE_USERS_UPDATED` |
| **MeetingRoom** | `JOIN_MEETING_ROOM`, `LEAVE_MEETING_ROOM` | `JOIN_MEETING_ROOM_ACK`, `LEAVE_MEETING_ROOM_ACK`, `MEETING_ROOM_USERS_UPDATED` |
| **MeetingSession** | `START_MEETING`, `END_MEETING` | `START_MEETING_ACK`, `END_MEETING_ACK`, `MEETING_STATUS_CHANGED` |
| **공통** | — | `ERROR` |

> Workspace, MeetingRoom, MeetingSession 계층 이벤트는 실제 handler와 FastAPI/Redis 서비스에 연결되어 있습니다.

---

## 파일 흐름

서버가 실행되고 WebSocket 메시지가 처리되는 흐름은 아래 순서로 따라가면 됩니다.

### 1. 서버 시작 흐름

```text
server/mainServer.js
  -> server/websocket/websocketServer.js
  -> server/websocket/connectionHandler.js
```

- `server/mainServer.js`: `.env`에서 `PORT`를 읽고 WebSocket 서버를 시작하는 진입점입니다.
- `server/websocket/websocketServer.js`: `ws` 라이브러리의 `WebSocketServer`를 생성하고, 클라이언트 연결이 들어오면 `connectionHandler`로 넘깁니다.
- `server/websocket/connectionHandler.js`: 클라이언트 연결/종료/에러 이벤트를 관리합니다. 연결 직후 `CONNECTED` 응답을 보내고, 받은 메시지는 `messageRouter`로 전달합니다.

### 2. 메시지 처리 흐름

```text
client
  -> connectionHandler.js
  -> messageRouter.js        (JSON 파싱, 공통 검증)
  -> handlerMap.js           (type → handler 매핑)
  -> handlers/userHandler.js (payload 스키마 검증)
  -> schemas/userSchema.js   (응답 객체 생성)
  -> sendJson.js
  -> client
```

- `server/websocket/messageRouter.js`: 클라이언트가 보낸 원본 메시지를 JSON으로 파싱하고, 공통 형식 검증 후 `handlerMap`에서 `type`에 맞는 handler를 찾아 실행합니다.
- `server/utils/validateMessage.js`: 모든 메시지에 공통으로 필요한 `type` 필드 존재 여부를 검증합니다.
- `server/handlers/handlerMap.js`: 이벤트 `type`과 실제 handler 함수를 연결하는 매핑 객체입니다. switch문 대신 이 파일에서 이벤트 분기를 한 곳에 관리합니다.
- `server/handlers/userHandler.js`: `CONNECT_USER`, `DISCONNECT_USER`, `PING` 이벤트를 처리합니다. 각 이벤트마다 payload 스키마 검증 → 비즈니스 로직 → 응답 전송 순서로 처리합니다.
- `server/utils/validatePayloadBySchema.js`: 각 이벤트의 payload를 스키마(`requiredPayloadFields`, `payloadShape`)에 따라 검증합니다. 필수 필드 누락, 타입 불일치, 공백 문자열을 감지합니다.
- `server/schemas/userSchema.js`: User 계층 이벤트의 요청 형식(`*_SCHEMA`)과 응답 객체 생성 팩토리 함수(`create*Ack`)를 정의합니다.
- `server/schemas/messageSchemas.js`: `CONNECTED`, `ERROR` 같은 공통 응답 객체를 생성하는 팩토리 함수를 담당합니다.
- `server/utils/sendJson.js`: 응답 객체를 `JSON.stringify`로 변환해서 WebSocket으로 전송합니다. 에러 응답을 보내는 `sendError`도 여기서 처리합니다.

### 3. 세션 관리 흐름

```text
userHandler.js (CONNECT_USER)
  -> sessionStore.addClient(userId, ws)

connectionHandler.js (close 이벤트) or userHandler.js (DISCONNECT_USER)
  -> sessionStore.removeClient(userId)
```

- `server/sessions/sessionStore.js`: 현재 접속 중인 WebSocket 클라이언트를 `userId`를 키로 하는 메모리 기반 `Map`으로 관리합니다.
- WebSocket 연결 직후(`connectionHandler`)에는 세션 저장소에 추가하지 않습니다. 클라이언트가 `CONNECT_USER` 이벤트를 보내 사용자 정보를 등록할 때 `sessionStore`에 추가됩니다.
- `DISCONNECT_USER` 이벤트 또는 브라우저 종료 등으로 연결이 끊기면 `ws.userId` 기준으로 세션 저장소에서 제거됩니다.

### 4. 운영 시 확인할 확장 지점

현재 Phase 3/4 범위의 실시간 전달은 구현되어 있습니다. 다음 항목은 기능 확장 시
추가할 수 있는 선택 영역입니다.

- 별도 presence Client 이벤트가 필요하면 `presenceHandler.js`를 이벤트 레지스트리에 연결
- 대규모 다중 인스턴스 배포 시 Redis Streams consumer group과 모니터링 추가
- 분석 서버를 분리할 경우 `fastapi/fastApiClient.js`의 timeout/retry 정책 조정

---

## 시작하는 방법

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정

프로젝트 루트에 `.env` 파일을 만들고 아래 내용을 작성합니다.

```env
PORT=8080
```

`PORT`를 지정하지 않으면 기본값 `8080`으로 실행됩니다.

### 3. 서버 실행

```bash
npm start
```

실행 후 `ws://localhost:8080` 으로 WebSocket 연결이 가능합니다.  
`testclient.html`을 브라우저에서 열면 간단한 테스트 클라이언트로 사용할 수 있습니다.

---

## 구현된 기능

### 클라이언트 연결 감지

- 클라이언트가 WebSocket 연결에 성공하면 즉시 `CONNECTED` 메시지를 전송합니다.
- 이 시점에는 사용자 정보를 알 수 없으므로 세션 저장소에는 등록하지 않습니다.
- 클라이언트가 연결을 끊으면 `ws.userId` 기준으로 세션 저장소에서 자동으로 제거합니다.
- WebSocket 에러 발생 시 서버 로그에 기록합니다.

### 사용자 등록 (`CONNECT_USER`)

- 클라이언트가 WebSocket 연결 후 `CONNECT_USER` 이벤트를 보내 사용자 정보를 서버에 등록합니다.
- `payload.userId` (필수), `payload.name` (선택)을 받아 `sessionStore`에 저장합니다.
- 등록 성공 시 `CONNECT_USER_ACK`를 응답합니다.

### 사용자 연결 해제 (`DISCONNECT_USER`)

- 클라이언트가 명시적으로 연결 종료를 요청할 때 사용합니다.
- `payload.userId`가 없으면 `ws.userId`를 사용합니다.
- `sessionStore`에서 해당 사용자를 제거하고 `DISCONNECT_USER_ACK`를 응답합니다.
- 실제 WebSocket 연결 종료는 클라이언트가 결정합니다.

### PING / PONG (연결 상태 확인)

- 클라이언트가 서버 연결이 살아있는지 확인할 때 사용합니다.
- 클라이언트가 `PING`을 보내면 서버는 `PONG`으로 응답합니다.
- `PONG` 응답에는 서버의 현재 시각(`serverTime`)이 포함됩니다.
- `payload` 없이 보내도 정상 처리됩니다.

### 메시지 유효성 검사

- 클라이언트가 보낸 메시지가 JSON 형식인지 확인합니다.
- 메시지에 `type` 필드가 있는지 확인합니다.
- 이벤트별 `*_SCHEMA`에 정의된 필수 필드, 타입, 공백 여부를 `validatePayloadBySchema`로 검증합니다.
- `handlerMap`에 등록되지 않은 `type`이 오면 `UNKNOWN_TYPE` 에러를 응답합니다.
- 등록되지 않은 `type`이 오면 `UNKNOWN_TYPE` 에러를 응답합니다.

---

## 메시지 형식

모든 메시지는 JSON 형식이며, WebSocket으로 문자열로 주고받습니다.

### 클라이언트 → 서버

```json
{
  "type": "이벤트 타입",
  "requestId": "요청 식별자 (선택)",
  "payload": {}
}
```

### 서버 → 클라이언트 (성공)

```json
{
  "type": "이벤트 타입",
  "requestId": "요청 식별자 또는 null",
  "success": true,
  "payload": {}
}
```

### 서버 → 클라이언트 (에러)

```json
{
  "type": "ERROR",
  "requestId": "요청 식별자 또는 null",
  "success": false,
  "errorCode": "에러 코드",
  "message": "에러 설명"
}
```

---

## 이벤트 타입 목록

### 구현 완료

| 이벤트 타입 | 방향 | 설명 |
|---|---|---|
| `CONNECTED` | 서버 → 클라이언트 | WebSocket 연결 직후 자동 전송 |
| `CONNECT_USER` | 클라이언트 → 서버 | 사용자 정보 등록 요청 |
| `CONNECT_USER_ACK` | 서버 → 클라이언트 | 사용자 등록 성공 응답 (`userId`, `name`, `connectedAt` 포함) |
| `DISCONNECT_USER` | 클라이언트 → 서버 | 사용자 연결 해제 요청 |
| `DISCONNECT_USER_ACK` | 서버 → 클라이언트 | 사용자 연결 해제 성공 응답 (`userId`, `disconnectedAt` 포함) |
| `PING` | 클라이언트 → 서버 | 연결 상태 확인 요청 |
| `PONG` | 서버 → 클라이언트 | PING에 대한 응답 (`serverTime` 포함) |
| `ERROR` | 서버 → 클라이언트 | 에러 발생 시 전송 |

### 구현 완료

| 이벤트 타입 | 방향 | 설명 |
|---|---|---|
| `JOIN_WORKSPACE` | 클라이언트 → 서버 | 워크스페이스 참여 요청 |
| `LEAVE_WORKSPACE` | 클라이언트 → 서버 | 워크스페이스 퇴장 요청 |
| `JOIN_WORKSPACE_ACK` | 서버 → 클라이언트 | 워크스페이스 참여 성공 응답 |
| `LEAVE_WORKSPACE_ACK` | 서버 → 클라이언트 | 워크스페이스 퇴장 성공 응답 |
| `WORKSPACE_USERS_UPDATED` | 서버 → 클라이언트 | 워크스페이스 참여자 목록 변경 알림 |
| `JOIN_MEETING_ROOM` | 클라이언트 → 서버 | 회의실 참여 요청 |
| `LEAVE_MEETING_ROOM` | 클라이언트 → 서버 | 회의실 퇴장 요청 |
| `JOIN_MEETING_ROOM_ACK` | 서버 → 클라이언트 | 회의실 참여 성공 응답 |
| `LEAVE_MEETING_ROOM_ACK` | 서버 → 클라이언트 | 회의실 퇴장 성공 응답 |
| `MEETING_ROOM_USERS_UPDATED` | 서버 → 클라이언트 | 회의실 참여자 목록 변경 알림 |
| `START_MEETING` | 클라이언트 → 서버 | 회의 시작 요청 |
| `END_MEETING` | 클라이언트 → 서버 | 회의 종료 요청 |
| `START_MEETING_ACK` | 서버 → 클라이언트 | 회의 시작 성공 응답 |
| `END_MEETING_ACK` | 서버 → 클라이언트 | 회의 종료 성공 응답 |
| `MEETING_STATUS_CHANGED` | 서버 → 클라이언트 | 회의 상태 변경 알림 |

---

## 에러 코드 목록

| 에러 코드 | 원인 |
|---|---|
| `INVALID_JSON` | 메시지가 올바른 JSON 형식이 아닌 경우 |
| `MISSING_TYPE` | 메시지에 `type` 필드가 없는 경우 |
| `UNKNOWN_TYPE` | `handlerMap`에 등록되지 않은 `type`이 전달된 경우 |
| `NOT_IMPLEMENTED` | 명세는 정의되었으나 아직 처리 로직이 구현되지 않은 `type`인 경우 |
| `MISSING_USER_ID` | `CONNECT_USER` 요청에 `payload.userId`가 없거나 공백인 경우 |
| `MISSING_<FIELD>` | 필수 payload 필드가 누락된 경우 (필드명이 에러 코드에 포함됨) |
| `INVALID_<FIELD>` | payload 필드의 타입이 잘못되었거나 공백 문자열인 경우 (필드명이 에러 코드에 포함됨) |

---

## 사용 예시

### WebSocket 연결 시 서버 자동 응답

```json
{
  "type": "CONNECTED",
  "requestId": null,
  "success": true,
  "payload": {
    "message": "WebSocket 서버에 연결되었습니다.",
    "connectedAt": "2026-05-08T10:00:00.000Z"
  }
}
```

### 사용자 등록 요청

```json
{ "type": "CONNECT_USER", "requestId": "req-001", "payload": { "userId": "user-001", "name": "김아영" } }
```

### 사용자 등록 응답

```json
{
  "type": "CONNECT_USER_ACK",
  "requestId": "req-001",
  "success": true,
  "payload": { "userId": "user-001", "name": "김아영", "connectedAt": "2026-05-08T10:00:00.000Z" }
}
```

### 사용자 연결 해제 요청

```json
{ "type": "DISCONNECT_USER", "requestId": "req-002", "payload": { "userId": "user-001" } }
```

### 사용자 연결 해제 응답

```json
{
  "type": "DISCONNECT_USER_ACK",
  "requestId": "req-002",
  "success": true,
  "payload": { "userId": "user-001", "disconnectedAt": "2026-05-08T10:05:00.000Z" }
}
```

### PING 요청

```json
{ "type": "PING", "requestId": "req-003" }
```

### PONG 응답

```json
{
  "type": "PONG",
  "requestId": "req-003",
  "success": true,
  "payload": { "serverTime": "2026-05-08T10:00:00.000Z" }
}
```

### 에러 응답 예시

```json
{
  "type": "ERROR",
  "requestId": "req-004",
  "success": false,
  "errorCode": "MISSING_USER_ID",
  "message": "payload.userId가 필요합니다."
}
```

---

## 운영 전 확인 사항

- Redis와 FastAPI가 모두 준비되어야 WebSocket의 권한 확인·Pub/Sub 이벤트가 정상 동작합니다.

### 실시간 이벤트 전달 기준

FastAPI가 발행하는 `utterance.*`, `analysis.*`, `topic.*`, `document.*`,
`stt.*` 이벤트는 모두 `REALTIME_EVENT_CHANNEL`(기본 `realtime.events`)과
Redis Stream에 기록됩니다. Node는 이 단일 채널을 canonical consumer로 사용해
문서/STT 이벤트가 전용 채널과 어긋나 유실되거나, 요청 경로와 Pub/Sub 경로가
중복 브로드캐스트하지 않도록 합니다. `documentSubscriber.js`와
`sttResultSubscriber.js`는 구버전 전용 채널 호환용이며 기본 initializer에서는
기동하지 않습니다.
- `SECRET_KEY`, `FASTAPI_BASE_URL`, `REDIS_URL`은 배포 환경에서 반드시 주입합니다.
- 회의 발화 본문과 화자 embedding은 기본 로그에서 마스킹됩니다.

---

## 미사용 파일 및 함수 정리

> 코드베이스 전체를 정적 분석한 결과를 기록합니다. (기준일: 2026-05-14)

### 1. 호환용 파일

`presenceHandler.js`는 별도 presence Client 이벤트를 추가할 때 사용할 호환용 위치입니다.
현재 presence는 `JOIN_WORKSPACE`/`JOIN_MEETING_ROOM`과 연결 종료 흐름에서 처리됩니다.

---

### 2. 하위 호환 래퍼 파일 — 직접 호출 없음

이전 코드와의 호환성을 위해 남겨둔 파일로, 현재 코드베이스 내에서 직접 `require`되는 곳이 없습니다.  
새로 작성하는 코드에서는 래퍼가 아닌 **원본 클래스를 직접 사용**하는 것을 권장합니다.

| 래퍼 파일 | 위임 대상 | 비고 |
|---|---|---|
| `server/handlers/handlerMap.js` | `HandlerRegistry` | `registry.resolve(type)` 사용 권장 |
| `server/schemas/messageSchemas.js` | `CommonSchema` | `CommonSchema`를 직접 import 권장 |
| `server/utils/sendJson.js` | `MessageSender` | `MessageSender.sendJson()` 사용 권장 |
| `server/utils/validateMessage.js` | `MessageValidator` | `MessageValidator.validate()` 사용 권장 |
| `server/utils/validatePayloadBySchema.js` | `SchemaValidator` | `SchemaValidator.validate()` 사용 권장 |

---

### 3. 미사용 메서드 — 정의만 되고 호출 없음

파일 자체는 정상 사용 중이나, 내부의 일부 메서드가 현재 코드베이스 어디에서도 호출되지 않습니다.

#### `server/services/presenceService.js`

| 메서드 | 설명 |
|---|---|
| `markWorkspaceOffline(workspaceId, userId)` | 워크스페이스 Presence를 offline으로 변경 |
| `markMeetingRoomOffline(workspaceId, meetingRoomId, meetingId, userId)` | 회의방 Presence를 offline으로 변경 |
| `markOnline(scopeType, scopeId, userId)` | 범용 online 마킹 (public) |
| `markOffline(scopeType, scopeId, userId)` | 범용 offline 마킹 |
| `markAway(scopeType, scopeId, userId)` | 자리비움 상태 마킹 |
| `markSpeaking(scopeType, scopeId, userId)` | 발화 중 상태 마킹 |
| `markMuted(scopeType, scopeId, userId)` | 음소거 상태 마킹 |
| `removePresence(scopeType, scopeId, userId)` | 범용 Presence 삭제 (public) |
| `updateLastSeen(scopeType, scopeId, userId)` | 마지막 접속 시각 갱신 |
| `getPresenceList(scopeType, scopeId)` | 범용 Presence 목록 조회 |
| `removeUserFromAllPresence(userId)` | 사용자 전체 Presence 일괄 삭제 |

#### `server/sessions/meetingStore.js`

| 메서드 | 설명 |
|---|---|
| `getWorkspaceMeetingIds(workspaceId)` | 워크스페이스의 meetingId 목록 조회 |
| `getActiveMeetingIds(workspaceId)` | ACTIVE 상태 meetingId 목록 조회 |
| `updateMeetingStatus(meetingId, status)` | Redis 캐시의 회의 상태 변경 |
| `removeMeeting(meetingId)` | 회의 캐시 삭제 |
| `clearWorkspaceMeetings(workspaceId)` | 워크스페이스 전체 회의 캐시 초기화 |
| `getAllCachedMeetings()` | 전체 캐시된 회의 목록 조회 (디버깅용) |

#### `server/core/ThreadPool.js`

`ThreadPool` 클래스 자체가 현재 어디에서도 `require`되지 않습니다.  
CPU 집약적 작업을 메인 이벤트 루프에서 분리하기 위한 확장 지점으로 작성되었습니다.

| 메서드 | 설명 |
|---|---|
| `runTask(data)` | 워커 스레드에 작업 전달 |
| `shutdown()` | 모든 워커 종료 |
| `getStats()` | 풀 상태 조회 (idle/queued/total) |

#### `server/core/AppLifecycle.js`

| 메서드 | 설명 |
|---|---|
| `setWss(wss)` | WSS 인스턴스를 외부에서 주입할 때 사용. 현재는 `initFn` 반환값으로 자동 설정되므로 불필요 |

#### `server/handlers/HandlerRegistry.js`

| 메서드 | 설명 |
|---|---|
| `getHandler(type)` | `resolve(type)`과 동일 기능. `handlerMap` Proxy 내부에서만 사용됨 |
| `register(type, handler)` | 런타임에 핸들러를 동적 등록. 현재 코드베이스에서 호출되는 곳 없음 |

#### `server/websocket/connectionHandler.js`

| 함수/메서드 | 설명 |
|---|---|
| `handleConnection(wss, ws)` (module.exports) | `connectionHandler.handle()`의 함수 래퍼. 현재 `websocketServer.js`는 `connectionHandler` 객체를 직접 사용 |

#### `server/websocket/messageRouter.js`

| 함수 | 설명 |
|---|---|
| `routeMessage(wss, ws, rawMessage)` (module.exports) | `messageRouter.route()`의 함수 래퍼. 현재 `connectionHandler.js`는 `messageRouter` 객체를 직접 사용 |
