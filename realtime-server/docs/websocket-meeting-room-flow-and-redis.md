# WebSocket Meeting Room Flow and Redis Structure

이 문서는 서버 시작부터 WebSocket 메시지가 핸들러로 전달되는 흐름, MeetingRoom 관련 메시지 처리 중 호출되는 함수들의 인자 매칭, 그리고 Redis에 저장되는 자료 구조를 코드 기준으로 정리한 것이다.

## 1. 서버 시작 흐름

진입점은 `server/mainServer.js`이다.

1. `.env`를 로드한다.
2. `AppLifecycle.start({ clusterMode, workerCount, initFn })`를 호출한다.
3. `initFn()`에서 Redis를 먼저 연결한다.
   - 호출: `redisManager.connect()`
   - Redis URL: `process.env.REDIS_URL || 'redis://localhost:6379'`
4. WebSocket 서버를 생성한다.
   - 호출: `webSocketServer.create(PORT, HOST)`
   - 내부에서 `new WebSocketServer({ port, host })` 생성
5. 클라이언트가 접속하면 `connectionHandler.handle(wss, ws)`가 실행된다.
6. 접속 직후 서버는 클라이언트에게 `CONNECTED` 응답을 보낸다.

## 2. 메시지 처리 공통 흐름

모든 WebSocket 메시지는 `server/websocket/connectionHandler.js`의 `ws.on('message')`에서 시작된다.

```text
client raw message
  -> connectionHandler.handle()
  -> messageRouter.route(wss, ws, rawMessage)
  -> JSON.parse(rawMessage)
  -> MessageValidator.validate(message)
  -> HandlerRegistry.resolve(message.type)
  -> handler(wss, ws, message)
```

공통 메시지 검증은 `MessageValidator`가 담당한다.

- `message`는 객체여야 한다.
- `type`은 비어 있지 않은 string이어야 한다.
- `requestId`는 없거나, string 또는 null이어야 한다.
- `payload`는 객체여야 한다.

이후 이벤트별 상세 스키마는 각 핸들러의 `validateOrReject()`에서 다시 검증한다.

## 3. MeetingRoom 이벤트 등록

`server/handlers/HandlerRegistry.js`에서 MeetingRoom 이벤트는 다음 함수로 매핑된다.

| Client event | Handler |
| --- | --- |
| `JOIN_MEETING_ROOM` | `handleJoinMeetingRoom(wss, ws, msg)` |
| `LEAVE_MEETING_ROOM` | `handleLeaveMeetingRoom(wss, ws, msg)` |

두 핸들러 모두 표준 시그니처는 동일하다.

```js
(wss, ws, message) => Promise<void>
```

## 4. JOIN_MEETING_ROOM 인자 검증

### 요청 스키마

`server/schemas/meetingRoomSchema.js` 기준 요청은 다음 구조여야 한다.

```json
{
  "type": "JOIN_MEETING_ROOM",
  "requestId": "optional-string",
  "payload": {
    "workspaceId": "workspace-1",
    "meetingRoomId": "room-1",
    "meetingId": 123,
    "userId": "user-1"
  }
}
```

필수 필드:

- `payload.workspaceId`: string
- `payload.meetingRoomId`: string
- `payload.meetingId`: number
- `payload.userId`: string

### 호출 흐름과 인자 매칭

```text
MeetingRoomHandler.handleJoinMeetingRoom(wss, ws, message)
  -> meetingRoomService.joinMeetingRoom(ws, {
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     })
  -> meetingRoomStore.addUserToMeetingRoom(
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     )
  -> presenceService.markMeetingRoomOnline(
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     )
  -> presenceStore.setUserPresence(
       'meetingRoom',
       `${workspaceId}:${meetingId}:${meetingRoomId}`,
       userId,
       { status: 'online', lastSeenAt }
     )
  -> createJoinMeetingRoomAck(requestId, result)
  -> broadcastService.broadcastMeetingRoomUsersUpdated(wss, {
       workspaceId,
       meetingId,
       meetingRoomId
     })
```

JOIN 흐름의 인자 순서는 일관된다.

```text
workspaceId -> meetingId -> meetingRoomId -> userId
```

주의할 점:

- `meetingId`는 스키마에서 number로 검증된다.
- Redis key에 들어갈 때는 template literal에 의해 문자열로 변환된다.
- `ws.workspaceId`, `ws.meetingId`, `ws.meetingRoomId`, `ws.userId`도 JOIN 시점에 세팅된다.

## 5. LEAVE_MEETING_ROOM 인자 검증

### 요청 스키마

현재 스키마 기준으로는 LEAVE도 JOIN과 동일하게 모든 payload 필드가 필수이다.

```json
{
  "type": "LEAVE_MEETING_ROOM",
  "requestId": "optional-string",
  "payload": {
    "workspaceId": "workspace-1",
    "meetingRoomId": "room-1",
    "meetingId": 123,
    "userId": "user-1"
  }
}
```

### 호출 흐름과 인자 매칭

```text
MeetingRoomHandler.handleLeaveMeetingRoom(wss, ws, message)
  -> meetingRoomService.leaveMeetingRoom(ws, {
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     })
  -> meetingRoomStore.removeUserFromMeetingRoom(
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     )
  -> presenceService.removeMeetingRoomPresence(
       workspaceId,
       meetingId,
       meetingRoomId,
       userId
     )
  -> presenceStore.removeUserPresence(
       'meetingRoom',
       `${workspaceId}:${meetingId}:${meetingRoomId}`,
       userId
     )
  -> createLeaveMeetingRoomAck(requestId, result)
  -> broadcastService.broadcastMeetingRoomUsersUpdated(wss, {
       workspaceId,
       meetingId,
       meetingRoomId
     })
```

LEAVE 핸들러 내부의 서비스 호출 인자 순서는 일관된다.

```text
workspaceId -> meetingId -> meetingRoomId -> userId
```

주의할 점:

- 핸들러 코드는 `payload` 값이 없으면 `ws.workspaceId`, `ws.meetingId`, `ws.meetingRoomId`, `ws.userId`를 fallback으로 사용하려고 한다.
- 그러나 `LEAVE_MEETING_ROOM_SCHEMA`가 payload의 4개 필드를 모두 required로 잡고 있어, payload를 생략하면 fallback 코드까지 도달하지 못한다.
- 즉, 코드 의도는 "payload optional + ws fallback"처럼 보이지만 현재 스키마 계약은 "payload 필수"이다.

## 6. Broadcast 흐름

`broadcastService.broadcastMeetingRoomUsersUpdated(wss, { workspaceId, meetingId, meetingRoomId })`는 다음 순서로 동작한다.

```text
presenceService.getMeetingRoomPresenceList(workspaceId, meetingId, meetingRoomId)
  -> meetingRoomStore.getMeetingRoomUsers(workspaceId, meetingId, meetingRoomId)
  -> for each userId:
       sessionStore.getUserSession(userId)
       presenceStore.getUserPresence('meetingRoom', scopeId, userId)
       없으면 presenceStore.setUserPresence(...)로 online 생성
  -> createMeetingRoomUsersUpdated({ workspaceId, meetingId, meetingRoomId, users })
  -> for each user:
       socketStore.getClient(user.userId)
       MessageSender.sendJson(client, response)
```

브로드캐스트 대상은 Redis의 MeetingRoom participant set에 남아 있는 userId 목록이다. 실제 WebSocket 객체는 Redis가 아니라 `socketStore`의 프로세스 메모리 `Map<userId, ws>`에서 조회한다.

## 7. Redis 저장 구조

### 7.1 User session

파일: `server/sessions/sessionStore.js`

```text
Key   : session:user:{userId}
Type  : String
Value : JSON
```

예시:

```json
{
  "userId": "user-1",
  "name": "Alice",
  "status": "online",
  "connectedAt": "2026-05-15T01:23:45.000Z",
  "lastSeenAt": "2026-05-15T01:23:45.000Z"
}
```

생성 시점:

- `CONNECT_USER`
- `userService.connectUser()`
- `sessionStore.addUserSession(userId, { name, connectedAt })`

삭제 시점:

- `DISCONNECT_USER`
- WebSocket `close` cleanup

### 7.2 Workspace participants

파일: `server/sessions/workspaceStore.js`

```text
Key   : workspace:participants:{workspaceId}
Type  : Set
Value : userId 문자열 집합
```

예시:

```text
SADD workspace:participants:workspace-1 user-1
SADD workspace:participants:workspace-1 user-2
```

조회 결과:

```json
["user-1", "user-2"]
```

생성/추가 시점:

- `JOIN_WORKSPACE`
- `workspaceStore.addUserToWorkspace(workspaceId, userId)`

삭제 시점:

- `LEAVE_WORKSPACE`
- WebSocket `close` cleanup
- set이 비면 key 자체를 삭제한다.

### 7.3 Meeting cache

파일: `server/sessions/meetingStore.js`

Meeting 원본 데이터는 FastAPI/DB가 담당하고, Node WebSocket 서버의 Redis 저장은 캐시 성격이다.

```text
Key   : meeting:detail:{meetingId}
Type  : String
Value : JSON
```

예시:

```json
{
  "id": 123,
  "workspaceId": "workspace-1",
  "title": "Weekly Sync",
  "status": "ACTIVE"
}
```

워크스페이스별 meetingId 목록:

```text
Key   : workspace:meetings:{workspaceId}
Type  : Set
Value : meetingId 문자열 집합
```

예시:

```text
SADD workspace:meetings:workspace-1 123
```

워크스페이스별 ACTIVE meetingId 목록:

```text
Key   : workspace:activeMeetings:{workspaceId}
Type  : Set
Value : ACTIVE 상태인 meetingId 문자열 집합
```

예시:

```text
SADD workspace:activeMeetings:workspace-1 123
```

생성/추가 시점:

- `CREATE_MEETING`
- `meetingService.createMeeting({ workspaceId, title, status })`
- FastAPI `POST /meetings/` 성공 응답에 `data.id`가 있을 때
- `meetingStore.cacheMeeting(workspaceId, response.data)`

주의할 점:

- `GET_MEETINGS`는 Redis 캐시를 읽지 않고 FastAPI `GET /meetings/` 결과를 그대로 반환한다.
- `GET_MEETINGS` 결과를 Redis에 다시 저장하지도 않는다.
- 따라서 Redis의 meeting 저장은 "생성 성공 후 캐시"이고, 현재 조회 경로의 source of truth는 FastAPI/DB이다.
- `meetingStore`에는 `getMeeting`, `getWorkspaceMeetings`, `getActiveMeetingIds`가 있지만 현재 `meetingService.getMeetings()`에서는 사용하지 않는다.
- MeetingRoom participant key가 삭제되어도 `meeting:detail:{meetingId}`, `workspace:meetings:{workspaceId}`, `workspace:activeMeetings:{workspaceId}`는 삭제되지 않는다.

### 7.4 MeetingRoom participants

파일: `server/sessions/meetingRoomStore.js`

```text
Key   : meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}
Type  : Set
Value : userId 문자열 집합
```

예시:

```text
SADD meetingRoom:participants:workspace-1:123:room-1 user-1
SADD meetingRoom:participants:workspace-1:123:room-1 user-2
```

조회 결과:

```json
["user-1", "user-2"]
```

생성/추가 시점:

- `JOIN_MEETING_ROOM`
- `meetingRoomStore.addUserToMeetingRoom(workspaceId, meetingId, meetingRoomId, userId)`

삭제 시점:

- `LEAVE_MEETING_ROOM`
- WebSocket `close` cleanup
- set이 비면 key 자체를 삭제한다.

이 삭제는 현재 회의방 접속자 목록 key인 `meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}`에만 해당한다.
즉, 회의방에 남은 사용자가 없어 participant set key가 삭제되어도 meeting 자체 캐시인 `meeting:detail:{meetingId}`는 삭제되지 않는다.

Meeting과 MeetingRoom은 Redis에서 하나의 부모-자식 객체로 묶여 삭제되는 구조가 아니다.
둘은 `meetingId` 값을 공유해 논리적으로 연결될 뿐이고, 삭제 함수도 분리되어 있다.

- MeetingRoom 참여자 정리: `meetingRoomStore.removeUserFromMeetingRoom(...)`
- Meeting 캐시 삭제: `meetingStore.removeMeeting(meetingId)`

따라서 MeetingRoom 사용자가 0명이 되는 것은 "현재 접속자가 없다"는 의미이고, "meeting이 없어졌다"는 의미가 아니다.

### 7.5 Presence

파일: `server/sessions/presenceStore.js`

```text
Key   : presence:{scopeType}:{scopeId}:{userId}
Type  : String
Value : JSON
```

Workspace presence:

```text
Key: presence:workspace:{workspaceId}:{userId}
```

MeetingRoom presence:

```text
Key: presence:meetingRoom:{workspaceId}:{meetingId}:{meetingRoomId}:{userId}
```

주의: Redis key 생성 함수는 `presence:{scopeType}:{scopeId}:{userId}`이고, MeetingRoom의 `scopeId` 자체가 `{workspaceId}:{meetingId}:{meetingRoomId}`이므로 최종 key가 위처럼 6개 segment로 보인다.

예시:

```json
{
  "scopeType": "meetingRoom",
  "scopeId": "workspace-1:123:room-1",
  "userId": "user-1",
  "status": "online",
  "joinedAt": "2026-05-15T01:23:45.000Z",
  "lastSeenAt": "2026-05-15T01:23:45.000Z"
}
```

생성/갱신 시점:

- Workspace: `presenceService.markWorkspaceOnline(workspaceId, userId)`
- MeetingRoom: `presenceService.markMeetingRoomOnline(workspaceId, meetingId, meetingRoomId, userId)`
- participant set에는 있는데 presence가 없으면 presence list 생성 중 자동으로 `online` presence를 만든다.

삭제 시점:

- Workspace: `presenceService.removeWorkspacePresence(workspaceId, userId)`
- MeetingRoom: `presenceService.removeMeetingRoomPresence(workspaceId, meetingId, meetingRoomId, userId)`

### 7.6 Socket store

파일: `server/sessions/socketStore.js`

```text
Redis 저장 아님
Type: process memory Map
Key : userId
Value: WebSocket object
```

브로드캐스트는 Redis에 저장된 userId 목록을 얻은 뒤, 실제 전송 대상 WebSocket은 `socketStore.getClient(userId)`로 찾는다.

## 8. 검증 결과 요약

### 정상 매칭

MeetingRoom의 일반 메시지 처리 흐름은 다음 인자 순서가 맞다.

```text
workspaceId -> meetingId -> meetingRoomId -> userId
```

확인된 정상 호출:

- `meetingRoomHandler` -> `meetingRoomService.joinMeetingRoom(ws, { workspaceId, meetingId, meetingRoomId, userId })`
- `meetingRoomService.joinMeetingRoom()` -> `meetingRoomStore.addUserToMeetingRoom(workspaceId, meetingId, meetingRoomId, userId)`
- `meetingRoomService.joinMeetingRoom()` -> `presenceService.markMeetingRoomOnline(workspaceId, meetingId, meetingRoomId, userId)`
- `meetingRoomHandler` -> `broadcastService.broadcastMeetingRoomUsersUpdated(wss, { workspaceId, meetingId, meetingRoomId })`
- `meetingRoomHandler` -> `meetingRoomService.leaveMeetingRoom(ws, { workspaceId, meetingId, meetingRoomId, userId })`
- `meetingRoomService.leaveMeetingRoom()` -> `meetingRoomStore.removeUserFromMeetingRoom(workspaceId, meetingId, meetingRoomId, userId)`
- `meetingRoomService.leaveMeetingRoom()` -> `presenceService.removeMeetingRoomPresence(workspaceId, meetingId, meetingRoomId, userId)`

### 수정 완료: WebSocket close cleanup 인자 순서

파일: `server/websocket/connectionHandler.js`

이전에 close cleanup에서 MeetingRoom 정리 호출 인자 순서가 다음처럼 잘못되어 있었다.

```js
await meetingRoomStore.removeUserFromMeetingRoom(workspaceId, meetingRoomId, userId);
await presenceService.removeMeetingRoomPresence(workspaceId, meetingRoomId, meetingId, userId);
```

하지만 각 함수의 기대 인자는 다음과 같다.

```js
meetingRoomStore.removeUserFromMeetingRoom(workspaceId, meetingId, meetingRoomId, userId)
presenceService.removeMeetingRoomPresence(workspaceId, meetingId, meetingRoomId, userId)
```

영향:

- `meetingRoomStore.removeUserFromMeetingRoom()`에는 `meetingId`가 빠지고, `meetingRoomId`와 `userId`가 한 칸씩 밀려 들어간다.
- 결과적으로 정상 key인 `meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}`가 아니라 잘못된 key를 대상으로 `SREM`할 수 있다.
- `presenceService.removeMeetingRoomPresence()`는 `meetingId`와 `meetingRoomId`가 서로 바뀐 scopeId를 만들 수 있다.
- 따라서 비정상 연결 종료 시 MeetingRoom participants/presence가 Redis에 남을 가능성이 있다.

수정된 호출:

```js
await meetingRoomStore.removeUserFromMeetingRoom(
  workspaceId,
  meetingId,
  meetingRoomId,
  userId
);

await presenceService.removeMeetingRoomPresence(
  workspaceId,
  meetingId,
  meetingRoomId,
  userId
);
```

이 수정은 연결 종료 시 정확한 MeetingRoom participant/presence key만 정리하기 위한 것이며, meeting cache key는 삭제하지 않는다.

### 발견된 불일치 2: LEAVE payload fallback과 스키마 계약

파일:

- `server/handlers/meetingRoomHandler.js`
- `server/schemas/meetingRoomSchema.js`

핸들러는 `LEAVE_MEETING_ROOM`에서 payload 값이 없으면 `ws`에 저장된 값으로 fallback하려고 한다.

```js
const workspaceId = this.extractTrimmed(message.payload, 'workspaceId') || ws.workspaceId;
const meetingId = this.extractTrimmed(message.payload, 'meetingId') || ws.meetingId;
const meetingRoomId = this.extractTrimmed(message.payload, 'meetingRoomId') || ws.meetingRoomId;
const userId = this.extractTrimmed(message.payload, 'userId') || ws.userId;
```

하지만 스키마는 payload의 4개 필드를 모두 required로 요구한다.

```js
required: ["workspaceId", "meetingRoomId", "meetingId", "userId"]
```

영향:

- 클라이언트가 `{ type: "LEAVE_MEETING_ROOM", payload: {} }`처럼 보내면 스키마 검증에서 먼저 실패한다.
- 따라서 현재 코드 기준으로는 LEAVE 요청도 모든 필드를 보내야 한다.

선택지:

- payload 필수 정책을 유지한다면 핸들러의 fallback 코드는 사실상 방어 코드로만 남는다.
- ws fallback 정책을 의도했다면 `LEAVE_MEETING_ROOM_SCHEMA`의 `payload.required`를 완화해야 한다.

## 9. Redis 상태 예시

사용자 `user-1`이 `workspace-1`, `meetingId=123`, `meetingRoomId=room-1`에 참여한 직후 Redis에는 보통 다음 key들이 생긴다.

```text
session:user:user-1
workspace:participants:workspace-1
meetingRoom:participants:workspace-1:123:room-1
presence:workspace:workspace-1:user-1
presence:meetingRoom:workspace-1:123:room-1:user-1
```

그리고 이 meeting이 WebSocket의 `CREATE_MEETING`으로 생성된 직후라면 다음 meeting 캐시 key들도 생긴다.

```text
meeting:detail:123
workspace:meetings:workspace-1
workspace:activeMeetings:workspace-1
```

각 값:

```text
GET meeting:detail:123
  -> JSON string: Meeting cache

SMEMBERS workspace:meetings:workspace-1
  -> ["123"]

SMEMBERS workspace:activeMeetings:workspace-1
  -> ["123"]  # status가 ACTIVE인 경우

GET session:user:user-1
  -> JSON string: UserSession

SMEMBERS workspace:participants:workspace-1
  -> ["user-1"]

SMEMBERS meetingRoom:participants:workspace-1:123:room-1
  -> ["user-1"]

GET presence:workspace:workspace-1:user-1
  -> JSON string: PresenceData

GET presence:meetingRoom:workspace-1:123:room-1:user-1
  -> JSON string: PresenceData
```

## 10. 결론

- 서버 시작, 메시지 라우팅, MeetingRoom JOIN/LEAVE의 정상 경로는 구조적으로 분리되어 있다.
- JOIN/LEAVE의 핵심 서비스 호출 인자 순서는 정상이다.
- Redis는 session/presence/meeting detail은 JSON string, workspace/meeting/meetingRoom 목록은 Set으로 저장한다.
- Meeting은 FastAPI/DB가 원본이고, Redis에는 `CREATE_MEETING` 성공 시 캐시로만 저장된다.
- 수정이 필요한 지점은 WebSocket `close` cleanup의 MeetingRoom 정리 인자 순서이다.
- LEAVE 메시지의 payload optional 정책 여부도 스키마와 핸들러 중 하나로 명확히 맞추는 것이 좋다.
