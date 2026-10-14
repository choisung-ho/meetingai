# 보안 적용 후 데이터 흐름 및 Redis 저장 구조

## 1. 개요

이 문서는 보안 개선 작업 이후의 전체 데이터 입출력 흐름과,
Redis에 어떤 키/값이 저장되는지를 정리한다.

**핵심 변경 원칙:**
- 기존: 클라이언트 message payload에서 `userId`, `orgId`를 직접 수신
- 변경: WebSocket 연결 URL의 JWT 토큰에서 `userId`, `orgId`를 검증·추출하여 `ws.userId`, `ws.orgId`에 저장

---

## 2. 전체 데이터 입출력 흐름

### 2-1. WebSocket 연결 수립 (connectionHandler)

```
클라이언트 → ws://server:8080?token=<JWT>
                 ↓
connectionHandler.handle(wss, ws, req)
  1. URL에서 token 추출
  2. verifyToken(token) → decoded 객체 (내부: jsonwebtoken.verify)
  3. decoded.sub      → ws.userId   (사용자 식별자)
  4. decoded.org_id   → ws.orgId    (조직 식별자)
  5. decoded.role     → ws.role     (권한)
  6. ws.isAuthenticated = true
  7. 실패 조건:
     - 토큰 없음 → ws.close(4001)
     - 토큰 위조/만료 → ws.close(4002)
     - sub/org_id 누락 → ws.close(4003)
  8. 성공 시: MessageSender.sendJson(ws, CONNECTED 응답)
```

**이 단계 이후 ws 객체에 고정된 값:**

| ws 속성          | 출처         | 값 예시              |
|-----------------|-------------|---------------------|
| `ws.userId`     | JWT.sub     | `"user-001"`        |
| `ws.orgId`      | JWT.org_id  | `"org-abc"`         |
| `ws.role`       | JWT.role    | `"member"`          |
| `ws.isAuthenticated` | 서버 설정 | `true`             |

---

### 2-2. CONNECT_USER 이벤트 흐름

```
클라이언트 →
{
  "type": "CONNECT_USER",
  "requestId": "req-001",
  "payload": {}               ← userId/orgId 없음 (보안 적용)
}

userHandler.handleConnectUser(wss, ws, message)
  1. CONNECT_USER_SCHEMA 검증 (payload는 빈 객체만 허용)
  2. userId = ws.userId        ← JWT에서 추출된 값 사용
  3. userService.connectUser(ws)
     ├─ sessionStore.addUserSession(userId, { userId, orgId, name, status, connectedAt, lastSeenAt })
     │    → Redis SET: "session:user:{userId}" = JSON 저장
     └─ socketStore.addClient(userId, ws)
          → In-memory Map: userId → WebSocket 객체

서버 →
{
  "type": "CONNECT_USER_ACK",
  "requestId": "req-001",
  "success": true,
  "payload": {
    "userId": "user-001",
    "orgId": "org-abc",
    "name": null,
    "status": "online",
    "connectedAt": "2026-05-16T12:00:00.000Z"
  }
}
```

---

### 2-3. JOIN_WORKSPACE 이벤트 흐름

```
클라이언트 →
{
  "type": "JOIN_WORKSPACE",
  "requestId": "req-002",
  "payload": {
    "workspaceId": "workspace-001"  ← userId 없음 (보안 적용)
  }
}

workspaceHandler.handleJoinWorkspace(wss, ws, message)
  1. JOIN_WORKSPACE_SCHEMA 검증 (payload에 workspaceId만 허용)
  2. workspaceId = payload.workspaceId
  3. userId      = ws.userId          ← JWT에서 추출된 값 사용
  4. workspaceService.joinWorkspace(ws, { workspaceId, userId })
     ├─ ws.workspaceId = workspaceId  (ws에 현재 워크스페이스 기록)
     │    (ws.userId는 덮어쓰지 않음)
     ├─ workspaceStore.addUserToWorkspace(workspaceId, userId)
     │    → Redis SADD: "workspace:participants:{workspaceId}" ← userId
     └─ presenceService.markWorkspaceOnline(workspaceId, userId)
          → Redis SET: "presence:workspace:{workspaceId}:{userId}" = JSON 저장

서버 ACK →
{
  "type": "JOIN_WORKSPACE_ACK",
  "requestId": "req-002",
  "success": true,
  "payload": { "workspaceId": "workspace-001", "userId": "user-001", "joinedAt": "..." }
}

서버 BROADCAST (워크스페이스 전체) →
{
  "type": "WORKSPACE_USERS_UPDATED",
  "requestId": null,
  "success": true,
  "payload": { "workspaceId": "workspace-001", "users": [...], "updatedAt": "..." }
}
```

---

### 2-4. JOIN_MEETING_ROOM 이벤트 흐름

```
클라이언트 →
{
  "type": "JOIN_MEETING_ROOM",
  "requestId": "req-003",
  "payload": {
    "workspaceId": "workspace-001",
    "meetingId": 1,
    "meetingRoomId": "room-001"     ← userId 없음 (보안 적용)
  }
}

meetingRoomHandler.handleJoinMeetingRoom(wss, ws, message)
  1. JOIN_MEETING_ROOM_SCHEMA 검증 (payload에 userId 없음)
  2. workspaceId  = payload.workspaceId
  3. meetingId    = payload.meetingId
  4. meetingRoomId = payload.meetingRoomId
  5. userId       = ws.userId         ← JWT에서 추출된 값 사용
  6. meetingRoomService.joinMeetingRoom(ws, { workspaceId, meetingId, meetingRoomId, userId })
     ├─ ws.workspaceId  = workspaceId
     ├─ ws.meetingId    = meetingId
     ├─ ws.meetingRoomId = meetingRoomId
     │    (ws.userId는 덮어쓰지 않음)
     ├─ meetingRoomStore.addUserToMeetingRoom(workspaceId, meetingId, meetingRoomId, userId)
     │    → Redis SADD: "meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}" ← userId
     └─ presenceService.markMeetingRoomOnline(workspaceId, meetingId, meetingRoomId, userId)
          → Redis SET: "presence:meetingRoom:{workspaceId}:{meetingId}:{meetingRoomId}:{userId}" = JSON 저장

서버 ACK →
{
  "type": "JOIN_MEETING_ROOM_ACK",
  "requestId": "req-003",
  "success": true,
  "payload": { "workspaceId": ..., "meetingId": ..., "meetingRoomId": ..., "userId": ..., "joinedAt": "..." }
}

서버 BROADCAST (회의방 전체) →
{
  "type": "MEETING_ROOM_USERS_UPDATED",
  ...
}
```

---

### 2-5. DISCONNECT_USER 이벤트 흐름

```
클라이언트 →
{
  "type": "DISCONNECT_USER",
  "requestId": "req-099",
  "payload": {}               ← userId 없음 (보안 적용)
}

userHandler.handleDisconnectUser(wss, ws, message)
  1. DISCONNECT_USER_SCHEMA 검증
  2. userId = ws.userId        ← JWT에서 추출된 값 사용
  3. userService.disconnectUser(ws)
     ├─ sessionStore.removeUserSession(userId)
     │    → Redis DEL: "session:user:{userId}"
     ├─ socketStore.removeClient(userId)
     │    → In-memory Map에서 제거
     └─ ws.userId, ws.orgId, ws.name, ws.isAuthenticated 초기화

서버 →
{
  "type": "DISCONNECT_USER_ACK",
  "requestId": "req-099",
  "success": true,
  "payload": { "userId": "user-001", "disconnectedAt": "..." }
}
```

---

### 2-6. WebSocket close 이벤트 (비정상/정상 종료)

```
연결 종료 감지 (ws 'close' 이벤트)

connectionHandler._cleanupConnection(wss, { userId, workspaceId, meetingRoomId, meetingId })
  1. socketStore.removeClient(userId)
  2. [회의방 있으면]
     ├─ meetingRoomStore.removeUserFromMeetingRoom(...)
     │    → Redis SREM: "meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}"
     ├─ presenceService.removeMeetingRoomPresence(...)
     │    → Redis DEL: "presence:meetingRoom:..."
     └─ broadcastService.broadcastMeetingRoomUsersUpdated(...)
  3. [워크스페이스 있으면]
     ├─ workspaceStore.removeUserFromWorkspace(...)
     │    → Redis SREM: "workspace:participants:{workspaceId}"
     ├─ presenceService.removeWorkspacePresence(...)
     │    → Redis DEL: "presence:workspace:..."
     └─ broadcastService.broadcastWorkspaceUsersUpdated(...)
  4. sessionStore.removeUserSession(userId)
       → Redis DEL: "session:user:{userId}"
  5. ws 속성 전체 null 초기화
```

---

## 3. Redis 저장 구조

### 3-1. 수정 전후 비교 — 어디가 바뀌었나

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| userId 출처 | message.payload.userId | JWT → ws.userId |
| orgId 출처 | message.payload.orgId | JWT → ws.orgId |
| Redis에 저장되는 userId | 클라이언트가 보낸 값 (위조 가능) | JWT 서명이 검증된 값 (신뢰됨) |
| Redis에 저장되는 orgId | 클라이언트가 보낸 값 (위조 가능) | JWT 서명이 검증된 값 (신뢰됨) |
| JOIN_WORKSPACE payload 필드 | `{ workspaceId, userId }` | `{ workspaceId }` |
| JOIN_MEETING_ROOM payload 필드 | `{ workspaceId, meetingId, meetingRoomId, userId }` | `{ workspaceId, meetingId, meetingRoomId }` |
| CONNECT_USER payload 필드 | `{ userId, name? }` | `{}` |
| workspaceService.joinWorkspace | `ws.userId = userId` 수행 (덮어쓰기) | `ws.userId` 덮어쓰기 제거 |
| meetingRoomService.joinMeetingRoom | `ws.userId = userId` 수행 (덮어쓰기) | `ws.userId` 덮어쓰기 제거 |

---

### 3-2. 현재 Redis 키 전체 목록 및 저장 값

#### ① 사용자 세션 (sessionStore)

```
키 패턴  : session:user:{userId}
타입     : String (JSON 직렬화)
TTL      : 없음 (명시적 삭제 기반)

저장 값 예시:
{
  "userId":      "user-001",       ← JWT decoded.sub
  "orgId":       "org-abc",        ← JWT decoded.org_id
  "name":        null,             ← ws.name (현재 JWT에 name 클레임 없으면 null)
  "status":      "online",
  "connectedAt": "2026-05-16T12:00:00.000Z",
  "lastSeenAt":  "2026-05-16T12:00:05.000Z"
}

저장 시점: CONNECT_USER 이벤트 처리 (userService.connectUser)
삭제 시점: DISCONNECT_USER 이벤트 또는 WebSocket close 이벤트
```

#### ② 워크스페이스 참여자 (workspaceStore)

```
키 패턴  : workspace:participants:{workspaceId}
타입     : Set (userId 문자열 집합)

저장 값 예시:
SMEMBERS "workspace:participants:workspace-001"
→ [ "user-001", "user-002", "user-003" ]

저장 시점: JOIN_WORKSPACE 이벤트 처리 (workspaceService.joinWorkspace)
삭제 시점: LEAVE_WORKSPACE 이벤트 또는 WebSocket close 이벤트
           참여자가 0명이 되면 키 자체 삭제 (자동 정리)
```

#### ③ 회의방 참여자 (meetingRoomStore)

```
키 패턴  : meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}
타입     : Set (userId 문자열 집합)

저장 값 예시:
SMEMBERS "meetingRoom:participants:workspace-001:1:room-001"
→ [ "user-001", "user-002" ]

저장 시점: JOIN_MEETING_ROOM 이벤트 처리 (meetingRoomService.joinMeetingRoom)
삭제 시점: LEAVE_MEETING_ROOM 이벤트 또는 WebSocket close 이벤트
           참여자가 0명이 되면 키 자체 삭제 (자동 정리)
```

#### ④ 워크스페이스 Presence (presenceStore)

```
키 패턴  : presence:workspace:{workspaceId}:{userId}
타입     : String (JSON 직렬화)

저장 값 예시:
{
  "scopeType": "workspace",
  "scopeId":   "workspace-001",
  "userId":    "user-001",       ← JWT에서 검증된 값
  "status":    "online",
  "joinedAt":  "2026-05-16T12:00:00.000Z",
  "lastSeenAt":"2026-05-16T12:00:05.000Z"
}

저장 시점: JOIN_WORKSPACE 이벤트 처리 (presenceService.markWorkspaceOnline)
삭제 시점: LEAVE_WORKSPACE 이벤트 또는 WebSocket close 이벤트
```

#### ⑤ 회의방 Presence (presenceStore)

```
키 패턴  : presence:meetingRoom:{workspaceId}:{meetingId}:{meetingRoomId}:{userId}
타입     : String (JSON 직렬화)

저장 값 예시:
{
  "scopeType":    "meetingRoom",
  "scopeId":      "room-001",
  "userId":       "user-001",    ← JWT에서 검증된 값
  "status":       "online",
  "joinedAt":     "2026-05-16T12:00:00.000Z",
  "lastSeenAt":   "2026-05-16T12:00:05.000Z"
}

저장 시점: JOIN_MEETING_ROOM 이벤트 처리 (presenceService.markMeetingRoomOnline)
삭제 시점: LEAVE_MEETING_ROOM 이벤트 또는 WebSocket close 이벤트
```

#### ⑥ In-Memory 저장 (Redis 아님 — socketStore)

```
저장소   : socketStore (Node.js 프로세스 내 Map 객체)
키       : userId  ← JWT에서 검증된 값
값       : WebSocket 객체 (직렬화 불가 → Redis 저장 불가)

저장 시점: CONNECT_USER 이벤트 처리
삭제 시점: DISCONNECT_USER 이벤트 또는 WebSocket close 이벤트
```

---

## 4. 수정된 파일 목록

| 파일 | 수정 내용 |
|------|---------|
| `server/handlers/userHandler.js` | `handleConnectUser`: payload에서 userId/name 추출 제거 → ws에서 읽음. `userService.connectUser(ws)` 인자 정리. ACK에 orgId 추가. `handleDisconnectUser`: payload userId 제거 → ws.userId 사용. `userService.disconnectUser(ws)` 인자 정리. |
| `server/schemas/workspaceSchema.js` | `JOIN_WORKSPACE_SCHEMA`, `LEAVE_WORKSPACE_SCHEMA`의 payload에서 `userId` 필드 제거 |
| `server/handlers/workspaceHandler.js` | `handleJoinWorkspace`, `handleLeaveWorkspace`에서 userId를 payload 대신 `ws.userId`에서 읽도록 수정 |
| `server/services/workspaceService.js` | `joinWorkspace`에서 `ws.userId = userId` 덮어쓰기 제거 |
| `server/schemas/meetingRoomSchema.js` | `JOIN_MEETING_ROOM_SCHEMA`, `LEAVE_MEETING_ROOM_SCHEMA`의 payload에서 `userId` 필드 제거 |
| `server/handlers/meetingRoomHandler.js` | `handleJoinMeetingRoom`, `handleLeaveMeetingRoom`에서 userId를 payload 대신 `ws.userId`에서 읽도록 수정 |
| `server/services/meetingRoomService.js` | `joinMeetingRoom`에서 `ws.userId = userId` 덮어쓰기 제거 |

**수정되지 않은 파일 (이미 보안 적용 완료):**
- `server/websocket/connectionHandler.js` — JWT 검증 및 ws.userId/ws.orgId 세팅 로직 완료
- `server/schemas/userSchema.js` — payload 빈 객체 적용 완료
- `server/services/userService.js` — ws에서 userId/orgId 읽는 구조 완료
- `server/sessions/sessionStore.js` — 검증된 데이터 저장 구조 완료
