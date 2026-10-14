아래 그대로 문서에 넣으면 돼.

```md
# Redis 키/값 구조 문서

## 전체 키 구조 요약

```

session:user:{userId}                                → String JSON  (사용자 세션)
workspace:participants:{workspaceId}                 → Set          (워크스페이스 참여자)
meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId} → Set (회의방 참여자)
presence:{scopeType}:{scopeId}:{userId}              → String JSON  (Presence 상태)
meeting:detail:{meetingId}                           → String JSON  (회의 캐시)
workspace:meetings:{workspaceId}                     → Set          (워크스페이스 전체 회의 목록)
workspace:activeMeetings:{workspaceId}               → Set          (ACTIVE 회의 목록)
issue:detail:{issueId}                               → String JSON  (이슈 상세 캐시)
meeting:issues:{meetingId}                           → Set          (회의별 전체 이슈 목록)
meeting:activeIssues:{meetingId}                     → Set          (회의별 활성 이슈 목록)
meeting:issueStatus:{meetingId}:{status}             → Set          (회의별 상태별 이슈 목록)

```

---

## 1. 사용자 세션

### 키

```

session:user:{userId}

````

| 항목 | 내용 |
|------|------|
| **타입** | String (JSON) |
| **저장소** | `server/sessions/sessionStore.js` |
| **저장 시점** | CONNECT_USER 처리 시 |
| **삭제 시점** | DISCONNECT_USER 처리 시 / WebSocket 연결 종료 시 |

### 값

```json
{
  "userId": "uuid-001",
  "orgId": "org-001",
  "name": "홍길동",
  "status": "online",
  "connectedAt": "2026-05-18T01:00:00.000Z",
  "lastSeenAt": "2026-05-18T01:10:00.000Z"
}
````

| 필드            | 타입                            | 출처                   |
| ------------- | ----------------------------- | -------------------- |
| `userId`      | string                        | JWT `sub` 클레임        |
| `orgId`       | string                        | JWT `org_id` 클레임     |
| `name`        | string | null                 | CONNECT_USER payload |
| `status`      | `online` | `offline` | `away` | 서버 생성                |
| `connectedAt` | ISO 8601                      | 서버 생성                |
| `lastSeenAt`  | ISO 8601                      | 서버 생성 / PING 시 갱신    |

---

## 2. 워크스페이스 참여자 목록

### 키

```
workspace:participants:{workspaceId}
```

| 항목        | 내용                                                          |
| --------- | ----------------------------------------------------------- |
| **타입**    | Set (userId 문자열 집합)                                         |
| **저장소**   | `server/sessions/workspaceStore.js`                         |
| **저장 시점** | JOIN_WORKSPACE 처리 시                                         |
| **삭제 시점** | LEAVE_WORKSPACE 처리 시 / WebSocket 연결 종료 시 / 참여자 0명 시 키 자동 삭제 |

### 값

```
{ "uuid-001", "uuid-002", "uuid-003" }
```

---

## 3. 회의방 참여자 목록

### 키

```
meetingRoom:participants:{workspaceId}:{meetingId}:{meetingRoomId}
```

| 항목        | 내용                                                             |
| --------- | -------------------------------------------------------------- |
| **타입**    | Set (userId 문자열 집합)                                            |
| **저장소**   | `server/sessions/meetingRoomStore.js`                          |
| **저장 시점** | JOIN_MEETING_ROOM 처리 시                                         |
| **삭제 시점** | LEAVE_MEETING_ROOM 처리 시 / WebSocket 연결 종료 시 / 참여자 0명 시 키 자동 삭제 |

### 값

```
{ "uuid-001", "uuid-002" }
```

---

## 4. Presence 상태

### 키

```
presence:{scopeType}:{scopeId}:{userId}
```

### scopeType별 scopeId 형식

| scopeType     | scopeId 형식                                  | 키 예시                                         |
| ------------- | ------------------------------------------- | -------------------------------------------- |
| `workspace`   | `{workspaceId}`                             | `presence:workspace:1:uuid-001`              |
| `meetingRoom` | `{workspaceId}:{meetingId}:{meetingRoomId}` | `presence:meetingRoom:1:7:room-001:uuid-001` |

| 항목        | 내용                                      |
| --------- | --------------------------------------- |
| **타입**    | String (JSON)                           |
| **저장소**   | `server/sessions/presenceStore.js`      |
| **저장 시점** | JOIN_WORKSPACE / JOIN_MEETING_ROOM 처리 시 |
| **삭제 시점** | LEAVE / WebSocket 연결 종료 시               |

### 값

```json
{
  "scopeType": "workspace",
  "scopeId": "1",
  "userId": "uuid-001",
  "status": "online",
  "joinedAt": "2026-05-18T01:00:00.000Z",
  "lastSeenAt": "2026-05-18T01:10:00.000Z"
}
```

| 필드           | 타입                                                   | 설명                |
| ------------ | ---------------------------------------------------- | ----------------- |
| `scopeType`  | `workspace` | `meetingRoom`                          | Presence 적용 공간 종류 |
| `scopeId`    | string                                               | 공간 식별자            |
| `userId`     | string                                               | 사용자 고유 ID         |
| `status`     | `online` | `offline` | `away` | `speaking` | `muted` | 현재 상태             |
| `joinedAt`   | ISO 8601                                             | 해당 scope 최초 참여 시각 |
| `lastSeenAt` | ISO 8601                                             | 마지막 활동 시각         |

---

## 5. 회의 상세 캐시

### 키

```
meeting:detail:{meetingId}
```

| 항목        | 내용                                                                            |
| --------- | ----------------------------------------------------------------------------- |
| **타입**    | String (JSON)                                                                 |
| **저장소**   | `server/sessions/meetingStore.js`                                             |
| **저장 시점** | CREATE_MEETING FastAPI 응답 수신 시 / START_MEETING 또는 END_MEETING FastAPI 응답 수신 시 |
| **삭제 시점** | DELETE_MEETING 처리 시                                                           |

### 값

```json
{
  "id": 7,
  "workspaceId": 1,
  "title": "주간 회의",
  "status": "ACTIVE"
}
```

| 필드            | 타입                           | 설명                                    |
| ------------- | ---------------------------- | ------------------------------------- |
| `id`          | number                       | FastAPI에서 반환한 meeting id              |
| `workspaceId` | number                       | WebSocket 요청 payload에서 받은 workspaceId |
| `title`       | string                       | 회의 제목                                 |
| `status`      | `READY` | `ACTIVE` | `ENDED` | 회의 상태                                 |

### 상태별 의미

| status   | 의미                           |
| -------- | ---------------------------- |
| `READY`  | 회의 페이지가 생성되었지만 아직 시작되지 않은 상태 |
| `ACTIVE` | 회의가 시작되어 진행 중인 상태            |
| `ENDED`  | 회의가 종료된 상태                   |

---

## 6. 워크스페이스 전체 회의 목록

### 키

```
workspace:meetings:{workspaceId}
```

| 항목        | 내용                                                                 |
| --------- | ------------------------------------------------------------------ |
| **타입**    | Set (meetingId 문자열 집합)                                             |
| **저장소**   | `server/sessions/meetingStore.js`                                  |
| **저장 시점** | CREATE_MEETING 처리 시 / START_MEETING 또는 END_MEETING 처리 후 회의 캐시 갱신 시 |
| **삭제 시점** | DELETE_MEETING 처리 시                                                |

### 값

```
{ "7", "8", "9" }
```

### 설명

`workspace:meetings:{workspaceId}`는 특정 워크스페이스에 속한 전체 회의 ID 목록이다.

회의 상태가 `READY`, `ACTIVE`, `ENDED` 중 무엇이든 해당 워크스페이스의 회의라면 이 Set에 포함될 수 있다.

---

## 7. 워크스페이스 ACTIVE 회의 목록

### 키

```
workspace:activeMeetings:{workspaceId}
```

| 항목        | 내용                                                                  |
| --------- | ------------------------------------------------------------------- |
| **타입**    | Set (ACTIVE 상태 meetingId 문자열 집합)                                    |
| **저장소**   | `server/sessions/meetingStore.js`                                   |
| **저장 시점** | START_MEETING 처리 후 FastAPI 응답 status=ACTIVE 수신 시                    |
| **삭제 시점** | END_MEETING 처리 후 FastAPI 응답 status=ENDED 수신 시 / DELETE_MEETING 처리 시 |

### 값

```
{ "7", "8" }
```

### 설명

`workspace:activeMeetings:{workspaceId}`는 현재 진행 중인 회의 ID만 저장한다.

회의가 시작되면 해당 meetingId를 추가하고, 회의가 종료되면 해당 meetingId를 제거한다.

---

## 8. 회의 상태 변경 캐시 반영

### 관련 이벤트

* START_MEETING
* END_MEETING

### Redis 반영 위치

```
server/sessions/meetingStore.js
```

### START_MEETING 처리 흐름

Client 요청:

```json
{
  "type": "START_MEETING",
  "requestId": "start-meeting-001",
  "payload": {
    "workspaceId": 1,
    "meetingId": 7
  }
}
```

FastAPI 요청:

```http
PATCH /workspaces/1/meetings/7
```

Body:

```json
{
  "status": "ACTIVE"
}
```

FastAPI 응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "title": "회의",
    "status": "ACTIVE"
  }
}
```

Redis 반영:

```
meeting:detail:7
→ status: "ACTIVE"

workspace:meetings:1
→ "7" 추가 또는 유지

workspace:activeMeetings:1
→ "7" 추가
```

---

### END_MEETING 처리 흐름

Client 요청:

```json
{
  "type": "END_MEETING",
  "requestId": "end-meeting-001",
  "payload": {
    "workspaceId": 1,
    "meetingId": 7
  }
}
```

FastAPI 요청:

```http
PATCH /workspaces/1/meetings/7
```

Body:

```json
{
  "status": "ENDED"
}
```

FastAPI 응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "title": "회의",
    "status": "ENDED"
  }
}
```

Redis 반영:

```
meeting:detail:7
→ status: "ENDED"

workspace:meetings:1
→ "7" 유지

workspace:activeMeetings:1
→ "7" 제거
```

---

## 9. MeetingSession 관련 Redis 원칙

### 별도 MeetingSession Redis key는 사용하지 않는다.

사용하지 않는 키:

```
meetingSession:detail:{meetingId}
workspace:meetingSessions:{workspaceId}
workspace:activeMeetingSessions:{workspaceId}
```

### 이유

MeetingSession은 별도의 저장 엔티티가 아니라, 기존 Meeting의 상태를 변경하는 WebSocket 계층이다.

따라서 회의 시작/종료 상태는 기존 Meeting 캐시에 반영한다.

사용하는 키:

```
meeting:detail:{meetingId}
workspace:meetings:{workspaceId}
workspace:activeMeetings:{workspaceId}
```

### 역할 분리

| 계층                         | 역할                                           |
| -------------------------- | -------------------------------------------- |
| `meetingService.js`        | 회의 생성, 목록 조회, 상세 조회, 삭제                      |
| `meetingSessionService.js` | 회의 시작, 회의 종료                                 |
| `meetingStore.js`          | 회의 캐시 통합 관리                                  |
| `meetingSessionHandler.js` | START_MEETING / END_MEETING WebSocket 이벤트 처리 |
| `broadcastService.js`      | MEETING_STATUS_CHANGED 브로드캐스트 전송             |

---

## 10. 회의 상태 변경 브로드캐스트

### 이벤트

```
MEETING_STATUS_CHANGED
```

### 전송 시점

| 이벤트           | 전송 시점              |
| ------------- | ------------------ |
| START_MEETING | FastAPI PATCH 성공 후 |
| END_MEETING   | FastAPI PATCH 성공 후 |

### 전송 대상

같은 `workspaceId`에 접속해 있는 사용자 전체

### 메시지 예시

회의 시작 시:

```json
{
  "type": "MEETING_STATUS_CHANGED",
  "payload": {
    "workspaceId": 1,
    "meetingId": 7,
    "title": "회의",
    "status": "ACTIVE"
  }
}
```

회의 종료 시:

```json
{
  "type": "MEETING_STATUS_CHANGED",
  "payload": {
    "workspaceId": 1,
    "meetingId": 7,
    "title": "회의",
    "status": "ENDED"
  }
}
```

### 주의

FastAPI 응답의 `data.id`를 WebSocket 응답에서는 `meetingId`로 변환해 전달한다.

```json
{
  "id": 7
}
```

↓

```json
{
  "meetingId": 7
}
```

`id`와 `meetingId`를 중복해서 둘 다 보내지 않는다.

```
```

---

## 11. Issue 관련 Redis 구조

### 사용 키

```
issue:detail:{issueId}
meeting:issues:{meetingId}
meeting:activeIssues:{meetingId}
meeting:issueStatus:{meetingId}:{status}
```

### 공통 원칙

Issue의 원본 데이터는 FastAPI/DB에 있고, Redis는 WebSocket 서버의 빠른 조회와 브로드캐스트 후속 처리를 위한 캐시로 사용한다.

Issue 캐시의 분류 기준은 `workspaceId`가 아니라 FastAPI의 `meeting_id`이다. `workspaceId`는 클라이언트 요청값이 아니라 FastAPI 응답 `data.workspaceId`를 그대로 캐시한다.

---

### 11-1. 이슈 상세 캐시

### 키

```
issue:detail:{issueId}
```

| 항목        | 내용                                                                 |
| --------- | ------------------------------------------------------------------ |
| **타입**    | String (JSON)                                                      |
| **저장소**   | `server/sessions/issueStore.js`                                   |
| **저장 시점** | CREATE_ISSUE / GET_ISSUES / UPDATE_ISSUE / DELETE_ISSUE 성공 응답 수신 시 |
| **삭제 시점** | hard delete가 필요한 경우에만 `removeIssue(issueId)`로 삭제                 |

### 값

```json
{
  "id": 12,
  "workspaceId": 1,
  "meeting_id": 7,
  "title": "WebSocket 연결 테스트 안건",
  "description": "Node broadcast 검증",
  "status": "OPEN",
  "priority": "HIGH",
  "due_date": null,
  "assignee_id": null,
  "created_at": "2026-05-18T10:00:00+09:00",
  "updated_at": "2026-05-18T10:00:00+09:00",
  "deleted_at": null
}
```

| 필드           | 타입                              | 설명                         |
| ------------ | ------------------------------- | -------------------------- |
| `id`         | number                          | FastAPI에서 반환한 issue id     |
| `workspaceId` | number                         | FastAPI 응답의 workspaceId     |
| `meeting_id` | number                         | FastAPI 기준 meeting id       |
| `title`      | string                          | 이슈 제목                      |
| `description` | string | null                  | 이슈 설명                      |
| `status`     | `OPEN` | `IN_PROGRESS` | `CLOSED` | 이슈 상태                      |
| `priority`   | `LOW` | `MEDIUM` | `HIGH` | null | 이슈 우선순위                   |
| `due_date`   | string | null                   | 마감일                        |
| `assignee_id` | number | null                 | 담당자 id                     |
| `created_at` | ISO 8601                       | 생성 시각                      |
| `updated_at` | ISO 8601                       | 수정 시각                      |
| `deleted_at` | ISO 8601 | null                | soft delete 시각             |

---

### 11-2. 회의별 전체 이슈 목록

### 키

```
meeting:issues:{meetingId}
```

| 항목        | 내용                                      |
| --------- | --------------------------------------- |
| **타입**    | Set (issueId 문자열 집합)                    |
| **저장소**   | `server/sessions/issueStore.js`          |
| **저장 시점** | 이슈 캐시 저장 시 `issueId` 추가                |
| **삭제 시점** | meeting 기준 캐시 초기화 또는 hard delete 처리 시 |

### 값

```
{ "12", "13", "14" }
```

### 설명

`meeting:issues:{meetingId}`는 특정 회의에 속한 전체 이슈 ID 목록이다.

soft delete 된 이슈도 전체 목록에는 남을 수 있다. 삭제 여부는 `issue:detail:{issueId}`의 `deleted_at`으로 판단한다.

---

### 11-3. 회의별 활성 이슈 목록

### 키

```
meeting:activeIssues:{meetingId}
```

| 항목        | 내용                                                               |
| --------- | ---------------------------------------------------------------- |
| **타입**    | Set (deleted_at이 없는 issueId 문자열 집합)                            |
| **저장소**   | `server/sessions/issueStore.js`                                  |
| **저장 시점** | CREATE_ISSUE / GET_ISSUES / UPDATE_ISSUE 응답에서 `deleted_at`이 없을 때 |
| **삭제 시점** | DELETE_ISSUE soft delete 응답 수신 시                                |

### 값

```
{ "12", "13" }
```

### 설명

`meeting:activeIssues:{meetingId}`는 삭제되지 않은 이슈만 저장한다.

`DELETE_ISSUE`는 hard delete가 아니라 soft delete이므로, `issue:detail:{issueId}`는 삭제하지 않고 `deleted_at`이 포함된 상태로 갱신한다. 대신 active Set에서는 해당 issueId를 제거한다.

---

### 11-4. 회의별 상태별 이슈 목록

### 키

```
meeting:issueStatus:{meetingId}:{status}
```

### status 값

```
OPEN
IN_PROGRESS
CLOSED
```

| 항목        | 내용                                           |
| --------- | -------------------------------------------- |
| **타입**    | Set (해당 status의 issueId 문자열 집합)              |
| **저장소**   | `server/sessions/issueStore.js`               |
| **저장 시점** | 이슈 캐시 저장 시 기존 상태 Set에서 제거한 뒤 현재 상태 Set에 추가 |
| **삭제 시점** | DELETE_ISSUE soft delete 응답 수신 시 모든 상태 Set에서 제거 |

### 값

```
meeting:issueStatus:7:OPEN
→ { "12", "14" }

meeting:issueStatus:7:IN_PROGRESS
→ { "13" }

meeting:issueStatus:7:CLOSED
→ { "15" }
```

### 설명

이슈 상태가 변경되면 기존 상태별 Set에서 먼저 제거한 뒤 새 상태별 Set에 추가한다.

soft delete 된 이슈는 상태별 Set에 남기지 않는다.

---

## 12. Issue 이벤트별 Redis 반영

### CREATE_ISSUE

FastAPI `POST /issues` 성공 응답을 받은 뒤 Redis에 반영한다.

```
issue:detail:{issueId}
→ 이슈 상세 JSON 저장

meeting:issues:{meetingId}
→ issueId 추가

meeting:activeIssues:{meetingId}
→ deleted_at이 없으면 issueId 추가

meeting:issueStatus:{meetingId}:{status}
→ 해당 status Set에 issueId 추가
```

---

### GET_ISSUES

FastAPI `GET /issues?meeting_id={meetingId}` 성공 응답을 받은 뒤 meeting 기준 캐시를 다시 구성한다.

```
meeting:issues:{meetingId}
meeting:activeIssues:{meetingId}
meeting:issueStatus:{meetingId}:OPEN
meeting:issueStatus:{meetingId}:IN_PROGRESS
meeting:issueStatus:{meetingId}:CLOSED
```

위 인덱스를 초기화한 뒤 응답 목록의 이슈를 다시 저장한다.

---

### UPDATE_ISSUE

FastAPI `PATCH /issues/{issueId}` 성공 응답을 받은 뒤 Redis에 반영한다.

```
issue:detail:{issueId}
→ 응답 데이터로 갱신

meeting:issueStatus:{meetingId}:OPEN
meeting:issueStatus:{meetingId}:IN_PROGRESS
meeting:issueStatus:{meetingId}:CLOSED
→ 모든 상태 Set에서 issueId 제거

meeting:issueStatus:{meetingId}:{newStatus}
→ 새 status Set에 issueId 추가
```

---

### DELETE_ISSUE

FastAPI `DELETE /issues/{issueId}`는 soft delete 응답을 반환한다.

```
issue:detail:{issueId}
→ deleted_at 포함 상태로 갱신

meeting:issues:{meetingId}
→ issueId 유지

meeting:activeIssues:{meetingId}
→ issueId 제거

meeting:issueStatus:{meetingId}:OPEN
meeting:issueStatus:{meetingId}:IN_PROGRESS
meeting:issueStatus:{meetingId}:CLOSED
→ 모든 상태 Set에서 issueId 제거
```

### 주의

`DELETE_ISSUE` 처리 시 `issue:detail:{issueId}`를 삭제하지 않는다. soft delete 이력을 유지하기 위해 `deleted_at`이 포함된 상세 JSON으로 갱신한다.
