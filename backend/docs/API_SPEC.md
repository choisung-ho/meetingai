# API SPEC v0.4.0

> Spec version: **v0.4.0** (2026-07-07), aligned with backend `APP_VERSION` 0.4.0.
> This file lags behind the Korean specs in detail; `docs/API_SPEC_KO.md` and
> `docs/api_spec_current.md` are the source of truth for v0.4.0.
>
> v0.4.0 changes:
> - `document_id` removed from STT Result (request/response/DB)
> - `stt.created`/`stt.updated` Redis payloads carry `workspace_id`, `meeting_id`
> - Deleting an STT Result cascades to its utterances/analysis results (fixes DELETE 500)
> - New Phase 4 endpoints: `POST /documents/{id}/process`, `GET /documents/{id}/chunks`,
>   `POST /rag/search`, `GET /stt-results/{id}/transcript`,
>   `GET /meetings/{id}/topics`, `GET /topics/{id}`, `GET /topics/{id}/events`,
>   `PATCH /topics/{id}/state`
> - Speaker clustering: utterance speaker labels are canonical `Speaker 1`/`Speaker 2`/`Unknown`

## 1. 핵심 구조

User -> Workspace -> Meeting -> Issue

Node.js = 실시간 처리
FastAPI = 데이터 처리

------------------------------------------------------------------------

## 공통 응답 형식

대부분의 REST API는 아래 형식을 사용한다.

```json
{
  "status": "success",
  "data": {}
}
```

리스트 응답도 `data` 안에 배열 또는 페이지 객체를 넣는다.

```json
{
  "status": "success",
  "data": []
}
```

에러 응답:

```json
{
  "status": "error",
  "message": "에러 메시지"
}
```

예외:

- `POST /login`은 토큰 응답을 그대로 반환한다.
- `204 No Content` DELETE 응답은 body가 없다.

## 2. Auth

POST /auth/register
POST /login
POST /auth/refresh

JWT 기반 인증

MVP v0.4.0에서는 Access Token과 Refresh Token을 사용한다.
Access Token은 보호 API 호출에 사용하고, Refresh Token은 회의 중 강제 로그아웃을 막기 위한 silent refresh에 사용한다.
Refresh Token은 30일 동안 유효하며, `/auth/refresh` 호출 때마다 새 Refresh Token을 함께 발급하는 Rotation 방식으로 수명을 갱신한다.

로그인 성공 응답:

```json
{
  "access_token": "jwt-token",
  "refresh_token": "refresh-jwt-token",
  "accessToken": "jwt-token",
  "refreshToken": "refresh-jwt-token",
  "token_type": "bearer",
  "defaultWorkspaceId": 1
}
```

`defaultWorkspaceId`는 로그인한 사용자가 처음 진입할 workspace이다. 사용자의 기본 workspace가 없으면 서버가 자동 생성한다.

공개 API:

- GET /
- GET /health
- POST /auth/register
- POST /login
- POST /auth/refresh

그 외 REST API는 `Authorization: Bearer <access_token>` 헤더가 필요하다.

### GET /

Response:

```json
{
  "status": "success",
  "data": {
    "message": "AI Meeting Assistant Backend is running"
  }
}
```

### GET /health

Response:

```json
{
  "status": "success",
  "data": {
    "status": "ok",
    "service": "fastapi-backend",
    "version": "0.4.0"
  }
}
```

### POST /auth/register

Request:

```json
{
  "name": "최성호",
  "email": "user@example.com",
  "birth_date": "2000-01-01",
  "password": "SecurePass123!",
  "password_confirm": "SecurePass123!",
  "organization_team_name": "B_42",
  "terms_agreed": true,
  "terms_version": "v1"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "최성호",
    "email": "user@example.com",
    "birth_date": "2000-01-01",
    "organization_team_name": "B_42",
    "terms_agreed": true,
    "terms_agreed_at": "2026-05-18T10:00:00+09:00",
    "terms_version": "v1",
    "created_at": "2026-05-18T10:00:00+09:00",
    "updated_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### POST /login

Request:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Response:

```json
{
  "access_token": "jwt-token",
  "refresh_token": "refresh-jwt-token",
  "accessToken": "jwt-token",
  "refreshToken": "refresh-jwt-token",
  "token_type": "bearer",
  "defaultWorkspaceId": 1
}
```

### POST /auth/refresh

Request:

```json
{
  "refresh_token": "refresh-jwt-token"
}
```

프론트/Node 연동 편의를 위해 camelCase도 허용한다.

```json
{
  "refreshToken": "refresh-jwt-token"
}
```

회의 중 silent refresh는 body 없이 기존 Access Token을 헤더에 실어 호출한다.

```http
Authorization: Bearer <access_token>
```

Response:

```json
{
  "success": true,
  "access_token": "new-jwt-token",
  "refresh_token": "new-refresh-jwt-token",
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-jwt-token",
  "token_type": "bearer",
  "message": "실시간 세션이 연장되었습니다."
}
```

------------------------------------------------------------------------

## 3. Workspace

POST /workspaces
GET /workspaces
GET /workspaces/{workspace_id}
POST /workspaces/{workspace_id}/invite

규칙:

- workspace 접근 권한은 `workspace_members`의 `(workspace_id, user_id, role)`로 검증한다.
- JWT의 `role` claim은 workspace 권한 기준이 아니다.
- 프론트/Node.js는 workspace 권한을 `my_role`, `canInviteMember`, 또는 FastAPI 검증 API 결과로 판단한다.
- workspace 기반 협업 API 접근 가능 role은 `OWNER`, `ADMIN`, `MEMBER`이다.
- 초대 생성 권한은 `OWNER`, `ADMIN`만 가진다. 초대된 사용자는 `MEMBER`로 추가한다.
- 멤버 row가 없거나 허용 role이 아니면 403으로 차단한다.
- `owner_user_id`는 전환 기간 동안 응답 및 기존 데이터 이관을 위한 호환 필드로 유지한다.

### Role Policy

`ADMIN 이상`은 `OWNER`, `ADMIN`을 의미하고, `MEMBER 이상`은 `OWNER`, `ADMIN`, `MEMBER`를 의미한다.

| 기능 | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| workspace / meeting / issue 조회 | 가능 | 가능 | 가능 |
| meeting 생성 및 수정 | 가능 | 가능 | 가능 |
| meeting 삭제 | 가능 | 가능 | 불가 |
| issue 생성 및 수정/삭제 | 가능 | 가능 | 가능 |
| workspace 초대 | 가능 | 가능 | 불가 |

`VIEWER`는 MVP에 포함하지 않는다. 읽기 전용 역할을 추가할 때는 REST API의 mutation 차단과 WebSocket의 `CREATE_MEETING`, `CREATE_ISSUE` 이벤트 차단을 함께 정의한다.

### POST /workspaces

Request:

```json
{
  "name": "B_42 Workspace"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "B_42 Workspace",
    "owner_user_id": 1,
    "my_role": "OWNER",
    "canInviteMember": true,
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### GET /workspaces

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "B_42 Workspace",
      "owner_user_id": 1,
      "my_role": "OWNER",
      "canInviteMember": true,
      "created_at": "2026-05-18T10:00:00+09:00"
    }
  ]
}
```

### GET /workspaces/{workspace_id}

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "B_42 Workspace",
    "owner_user_id": 1,
    "my_role": "OWNER",
    "canInviteMember": true,
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### POST /workspaces/{workspace_id}/invite

가입된 사용자를 workspace에 초대한다. `OWNER` 또는 `ADMIN`만 요청 가능하며, 성공 시 해당 사용자의 `workspace_members` row가 `MEMBER` role로 생성된다.

현재 v0.4 구현은 즉시 참여형이다. 즉, 이 API가 성공하면 초대받은 사용자는 별도 수락 없이 바로 workspace 멤버가 된다.

Request:

```json
{
  "email": "member@example.com"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "workspace_id": 1,
    "user_id": 2,
    "role": "MEMBER",
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

Errors:

- `403`: 요청자가 `OWNER` 또는 `ADMIN`이 아님
- `404`: 초대할 가입 회원 또는 workspace를 찾을 수 없음
- `409`: 이미 참여 중인 회원

### 수락형 초대 구조

실제 서비스에서는 초대 생성과 workspace 참여를 분리한다. `POST /workspaces/{workspace_id}/invite`는 초대만 생성하고, 초대받은 사용자가 수락해야 `workspace_members`에 추가된다.

흐름:

```text
OWNER/ADMIN 초대 생성
-> workspace_invitations.status = PENDING
-> 초대받은 사용자 초대 목록 조회
-> 수락 또는 거절
-> 수락 시 workspace_members MEMBER 생성
-> invitation.status = ACCEPTED 또는 REJECTED
```

테이블: `workspace_invitations`

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | int | 초대 ID |
| `workspace_id` | int | 초대 대상 workspace |
| `invited_email` | string | 초대받은 이메일 |
| `invited_user_id` | int 또는 null | 가입된 초대 대상 사용자 ID |
| `invited_by_user_id` | int | 초대한 사용자 ID |
| `role` | string | 수락 시 부여할 role. 기본값 `MEMBER` |
| `status` | string | `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED` |
| `created_at` | datetime | 초대 생성 시각 |
| `accepted_at` | datetime 또는 null | 초대 수락 시각 |

#### POST /workspaces/{workspace_id}/invite

v0.4.1에서는 초대 row만 생성한다. 즉시 `workspace_members`에 추가하지 않는다.

Request:

```json
{
  "email": "member@example.com",
  "role": "MEMBER"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 10,
    "workspace_id": 1,
    "invited_email": "member@example.com",
    "invited_user_id": 2,
    "invited_by_user_id": 1,
    "role": "MEMBER",
    "status": "PENDING",
    "created_at": "2026-05-29T10:00:00+09:00",
    "accepted_at": null
  }
}
```

#### GET /workspace-invitations/me

로그인 사용자가 받은 초대 목록을 조회한다.

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 10,
      "workspace_id": 1,
      "workspace_name": "B_42 Workspace",
      "invited_email": "member@example.com",
      "role": "MEMBER",
      "status": "PENDING",
      "created_at": "2026-05-29T10:00:00+09:00"
    }
  ]
}
```

#### GET /workspaces/{workspace_id}/invitations

`OWNER` and `ADMIN` users can list all sent invitation history for the workspace.

#### DELETE /workspaces/{workspace_id}/invitations/{invitation_id}

Cancels a `PENDING` invitation by changing its status to `CANCELLED`. The row is retained for audit history. Already processed invitations return `409`.

#### POST /workspace-invitations/{invitation_id}/accept

초대를 수락한다. 성공 시 `workspace_members`에 `MEMBER` row를 생성하고 invitation 상태를 `ACCEPTED`로 변경한다.

Response:

```json
{
  "status": "success",
  "data": {
    "invitation_id": 10,
    "workspace_id": 1,
    "user_id": 2,
    "role": "MEMBER",
    "status": "ACCEPTED"
  }
}
```

#### POST /workspace-invitations/{invitation_id}/reject

초대를 거절한다. invitation 상태를 `REJECTED`로 변경하며 `workspace_members`에는 추가하지 않는다.

Response:

```json
{
  "status": "success",
  "data": {
    "invitation_id": 10,
    "status": "REJECTED"
  }
}
```

------------------------------------------------------------------------

## 4. Meetings

### Status

READY / ACTIVE / ENDED

### Flow

READY -> ACTIVE -> ENDED

금지:

- ENDED -> ACTIVE
- ACTIVE -> READY
- READY -> ENDED

Meeting 시간 필드:

| Field | Meaning | Saved when |
| --- | --- | --- |
| `created_at` | 회의 페이지 생성 시각 | Meeting 생성 시 자동 저장 |
| `started_at` | 실제 회의 시작 시각 | `PATCH status=ACTIVE` 성공 시 비어 있으면 자동 저장 |
| `ended_at` | 실제 회의 종료 시각 | `PATCH status=ENDED` 성공 시 비어 있으면 자동 저장 |

------------------------------------------------------------------------

### POST /workspaces/{workspace_id}/meetings

회의 페이지 생성. 회의 시작이 아니다. `MEMBER 이상`만 요청 가능하다. 생성 시 status는 `READY`여야 한다.

```json
{ "title": "회의", "status": "READY" }
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "회의",
    "description": null,
    "status": "READY",
    "scheduled_at": null,
    "started_at": null,
    "ended_at": null,
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

------------------------------------------------------------------------

### GET /workspaces/{workspace_id}/meetings?page=1&size=20

workspace 안의 meeting 목록 조회.

Response:

```json
{
  "status": "success",
  "data": {
    "workspaceId": 1,
    "page": 1,
    "size": 20,
    "meetings": [
      {
        "id": 7,
        "workspace_id": 1,
        "title": "회의",
        "description": null,
        "status": "READY",
        "scheduled_at": null,
        "started_at": null,
        "ended_at": null,
        "created_at": "2026-06-18T10:00:00+09:00"
      }
    ]
  }
}
```

------------------------------------------------------------------------

### GET /workspaces/{workspace_id}/meetings/{meeting_id}

workspace_id + meeting_id를 같이 검증한다. Node.js가 `JOIN_MEETING_ROOM` 전 검증용으로 호출할 수 있으며, 응답에는 회의 시작/종료 시간이 포함된다.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "회의",
    "description": null,
    "status": "ACTIVE",
    "scheduled_at": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "ended_at": null,
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

------------------------------------------------------------------------

### PATCH /workspaces/{workspace_id}/meetings/{meeting_id}

회의 시작:

```json
{ "status": "ACTIVE" }
```

회의 종료:

```json
{ "status": "ENDED" }
```

상태 전이 규칙을 강제하며, `MEMBER 이상`만 요청 가능하다. `ACTIVE` 전환 시 `started_at`, `ENDED` 전환 시 `ended_at`이 비어 있으면 현재 시각으로 자동 저장된다.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "회의",
    "description": null,
    "status": "ACTIVE",
    "scheduled_at": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "ended_at": null,
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

상태 변경 성공 시 `REDIS_URL`이 설정되어 있으면 FastAPI는 Node.js 서버에 위치한 Redis의 `meeting.updated` 채널로 이벤트를 publish한다. Redis 연결 실패는 로그로 남기고, 이미 성공한 DB 상태 변경은 롤백하지 않는다.

Node.js Redis publish payload:

```json
{
  "type": "meeting.updated",
  "payload": {
    "id": 7,
    "meeting_id": 7,
    "meetingId": 7,
    "workspace_id": 1,
    "workspaceId": 1,
    "title": "회의",
    "description": null,
    "status": "ACTIVE",
    "previous_status": "READY",
    "previousStatus": "READY",
    "scheduled_at": null,
    "scheduledAt": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "startedAt": "2026-06-18T10:05:00+09:00",
    "ended_at": null,
    "endedAt": null,
    "created_at": "2026-06-18T10:00:00+09:00",
    "createdAt": "2026-06-18T10:00:00+09:00"
  }
}
```

Redis is shared infrastructure for FastAPI and Node.js. FastAPI connects through
`REDIS_URL`; Node.js subscribes to `meeting.updated` and Phase 3 `realtime.events`.

------------------------------------------------------------------------

### DELETE /workspaces/{workspace_id}/meetings/{meeting_id}

workspace_id + meeting_id를 같이 검증한다. `ADMIN 이상`만 요청 가능하다.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "회의",
    "description": null,
    "status": "ENDED",
    "scheduled_at": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "ended_at": "2026-06-18T11:00:00+09:00",
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

------------------------------------------------------------------------

## 5. Issues

Issue 생성, 수정, 상태 변경, 삭제는 `MEMBER 이상`만 수행할 수 있다.

POST /issues
GET /workspaces/{workspace_id}/issues
GET /meetings/{meeting_id}/issues
GET /issues?meeting_id
PATCH /issues/{id}
DELETE /issues/{id}

Status:

- `OPEN -> IN_PROGRESS`
- `IN_PROGRESS -> CLOSED`

규칙:

- `meeting_id` 필수
- New list endpoints use `GET /workspaces/{workspace_id}/issues` and `GET /meetings/{meeting_id}/issues`
- `GET /issues` is a compatibility endpoint and still requires the `meeting_id` query parameter
- `meeting_id` 유효성 검사 필수
- FastAPI 응답에는 Node broadcast를 위해 `workspaceId` 포함

### POST /issues

Request:

```json
{
  "meeting_id": 7,
  "title": "WebSocket 연결 테스트 안건",
  "description": "Node broadcast 검증",
  "status": "OPEN",
  "priority": "HIGH",
  "due_date": null,
  "assignee_id": null
}
```

Response:

```json
{
  "status": "success",
  "data": {
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
}
```

### GET /workspaces/1/issues

Workspace-scoped issue list. Use this for dashboard/workspace issue tab.

Response:

```json
{
  "status": "success",
  "data": [
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
  ]
}
```

### GET /meetings/7/issues

Meeting-scoped issue list. Use this for meeting detail page.

Response:

```json
{
  "status": "success",
  "data": [
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
  ]
}
```

### GET /issues?meeting_id=7

Compatibility endpoint. New clients/Node should prefer `GET /meetings/{meeting_id}/issues`.

Response:

```json
{
  "status": "success",
  "data": [
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
  ]
}
```

### GET /issues/{issue_id}

Response:

```json
{
  "status": "success",
  "data": {
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
}
```

### PATCH /issues/{issue_id}

일반 issue 필드 수정용 API이다.
`title`, `description`, `priority`, `due_date`, `assignee_id`, `meeting_id` 같은 기본 필드를 수정할 때 사용한다.

주의:

- `status` 필드는 허용하지 않는다.
- `status`를 보내면 `400 Bad Request`가 반환된다.
- 상태 전이 이력, reason, evidence가 필요한 실제 업무/실시간 흐름에서는 반드시 `PATCH /issues/{issue_id}/state`를 사용한다.

Request:

```json
{
  "title": "로그인 기능 마감일 조정",
  "priority": "HIGH",
  "due_date": "2026-05-30T18:00:00+09:00"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 12,
    "workspaceId": 1,
    "meeting_id": 7,
    "title": "로그인 기능 마감일 조정",
    "description": "Node broadcast 검증",
    "status": "OPEN",
    "priority": "HIGH",
    "due_date": "2026-05-30T18:00:00+09:00",
    "assignee_id": null,
    "created_at": "2026-05-18T10:00:00+09:00",
    "updated_at": "2026-05-18T10:10:00+09:00",
    "deleted_at": null
  }
}
```

Status 변경 시도 오류:

```json
{
  "status": "error",
  "message": "Use PATCH /issues/{issue_id}/state to change issue status"
}
```

### DELETE /issues/{issue_id}

Response:

```json
{
  "status": "success",
  "data": {
    "id": 12,
    "workspaceId": 1,
    "meeting_id": 7,
    "title": "WebSocket 연결 테스트 안건",
    "description": "Node broadcast 검증",
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "due_date": null,
    "assignee_id": null,
    "created_at": "2026-05-18T10:00:00+09:00",
    "updated_at": "2026-05-18T10:10:00+09:00",
    "deleted_at": "2026-05-18T10:20:00+09:00"
  }
}
```

### PATCH /issues/{issue_id}/state

issue 상태 전이 전용 API이다.
상태 변경 이벤트를 `issue_events`에 기록하며, 회의 중 상태 변경, Node.js broadcast, 상태 머신 흐름에서는 이 API를 기준으로 사용한다.

Request:

```json
{
  "to_state": "CLOSED",
  "meeting_id": 7,
  "reason": "논의 완료",
  "evidence": "회의 중 결정"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "issue_id": 12,
    "from_state": "IN_PROGRESS",
    "to_state": "CLOSED",
    "event_type": "ISSUE_CLOSED",
    "changed_at": "2026-05-18T10:30:00+09:00"
  }
}
```

### GET /issues/{issue_id}/events

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "issue_id": 12,
      "meeting_id": 7,
      "event_type": "ISSUE_CREATED",
      "from_state": null,
      "to_state": "OPEN",
      "reason": "안건 생성",
      "evidence": null,
      "created_at": "2026-05-18T10:00:00+09:00"
    }
  ]
}
```

## 6. Alerts / Documents / STT / Utterances

### Alerts

Alert는 특정 meeting 또는 issue에 연결되는 알림 데이터이다.
마감 임박, 재논의 필요, 담당자 확인 필요 같은 UI 알림을 표현한다.

Endpoints:

- `POST /alerts/`
- `GET /alerts/?meeting_id={meeting_id}`
- `GET /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}/acknowledge`
- `PATCH /alerts/{alert_id}/dismiss`
- `PATCH /alerts/{alert_id}/resolve`
- `DELETE /alerts/{alert_id}`: `204 No Content`

Client/internal usage:

| URL | Meaning | Initiator | FastAPI role | Pub/Sub |
| --- | --- | --- | --- | --- |
| `POST /alerts/` | Create alert | Server internal or internal API | Save Alert, call internal `create_alert()`, publish `alert.created` payload to the Redis server owned by Node.js | O |
| `GET /alerts/?meeting_id={meeting_id}` | List alerts | Client | Return alert list for one meeting | Yes |
| `GET /alerts/{alert_id}` | Alert detail | Client | Return one alert | Yes |
| `PATCH /alerts/{alert_id}` | Generic alert update | Case-by-case | Update `message`, `level`, `status`, `meeting_id`, `issue_id` | Yes |
| `PATCH /alerts/{alert_id}/acknowledge` | Mark as read/seen | Client | Set status to `ACKNOWLEDGED` | Yes |
| `PATCH /alerts/{alert_id}/dismiss` | Hide/ignore alert | Client | Set status to `DISMISSED` | Yes |
| `PATCH /alerts/{alert_id}/resolve` | Mark cause as resolved | Client or internal logic | Set status to `RESOLVED` | Yes |
| `DELETE /alerts/{alert_id}` | Delete alert | Usually client/admin | Delete alert | Yes |
| Internal `create_alert()` | Common server-side alert creation function | FastAPI/AI analysis/batch/rule logic | Create alert, save DB, prepare publish payload | Yes |
| `PUBLISHED alert.created` | Redis publish log | FastAPI internal | Publish `alert.created` payload to the Redis channel on the Node.js server | O |

`POST /alerts/` is currently exposed as an authenticated REST endpoint, but product-wise it should be treated as an internal/server integration creation API rather than a normal client button action.
Server-generated alerts such as rediscussion detection, due-date warning, and assignee confirmation should use internal `create_alert()` as the common entry point.

Request:

```json
{
  "meeting_id": 7,
  "issue_id": 12,
  "message": "마감일이 가까운 안건입니다.",
  "level": "info",
  "status": "PENDING"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 가까운 안건입니다.",
    "level": "info",
    "status": "PENDING",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

List Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 3,
      "meeting_id": 7,
      "issue_id": 12,
      "message": "마감일이 가까운 안건입니다.",
      "level": "info",
      "status": "PENDING",
      "created_at": "2026-05-18T10:00:00+09:00"
    }
  ]
}
```

### PATCH /alerts/{alert_id}/acknowledge

알림을 확인 처리한다. 상태는 `ACKNOWLEDGED`로 변경된다.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 가까운 안건입니다.",
    "level": "info",
    "status": "ACKNOWLEDGED",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### PATCH /alerts/{alert_id}/dismiss

알림을 숨김 처리한다. 상태는 `DISMISSED`로 변경된다.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 가까운 안건입니다.",
    "level": "info",
    "status": "DISMISSED",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### PATCH /alerts/{alert_id}/resolve

Marks the cause of the alert as resolved. Status becomes `RESOLVED`.

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 가까운 안건입니다.",
    "level": "info",
    "status": "RESOLVED",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

Alert 생성 후 `REDIS_URL`이 설정되어 있으면 FastAPI는 아래 이벤트 payload를 Node.js 서버 Redis 채널로 publish한다.

```json
{
  "type": "alert.created",
  "payload": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 가까운 안건입니다.",
    "level": "info",
    "status": "PENDING",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

### Documents

Document is a file resource that belongs to a workspace. The existing meeting-page behavior remains unchanged, and workspace-level document upload/listing is added for Dashboard and Document tab flows.

Rules:

- Meeting page: use `meeting_id` to upload/list documents for one meeting.
- Document tab/Dashboard: use `workspace_id` to upload/list all documents in one workspace.
- A document with `meeting_id` belongs to a specific meeting.
- A document with `meeting_id: null` is a workspace-level document uploaded from the Document tab/Dashboard.
- Every Document response includes `workspace_id`.

Endpoints:

- `POST /documents/upload?meeting_id=7`: existing meeting-page upload
- `POST /documents/upload?workspace_id=1`: workspace-level upload for Document tab/Dashboard
- `GET /documents/?meeting_id=7`: meeting document list
- `GET /documents/?workspace_id=1`: all workspace documents
- `GET /documents/{document_id}`: document detail
- `DELETE /documents/{document_id}`: `204 No Content`

If both `meeting_id` and `workspace_id` are passed, the meeting must belong to that workspace. Otherwise the API returns `400`. If neither is passed, the API returns `400`.

#### POST /documents/upload?meeting_id=7

Existing meeting-page document upload.

```http
multipart/form-data
file: <uploaded-file>
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 7,
    "original_filename": "meeting-note.txt",
    "stored_filename": "uuid.txt",
    "content_type": "text/plain",
    "file_size": 1024,
    "storage_path": "uploads/uuid.txt",
    "status": "UPLOADED",
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

#### POST /documents/upload?workspace_id=1

Workspace-level document upload for Document tab/Dashboard. `meeting_id` is `null`.

```http
multipart/form-data
file: <uploaded-file>
```

Response:

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "workspace_id": 1,
    "meeting_id": null,
    "original_filename": "workspace-file.pdf",
    "stored_filename": "uuid.pdf",
    "content_type": "application/pdf",
    "file_size": 2048,
    "storage_path": "uploads/uuid.pdf",
    "status": "UPLOADED",
    "created_at": "2026-06-18T10:05:00+09:00"
  }
}
```

#### GET /documents/?meeting_id=7

Returns documents for one meeting.

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "meeting_id": 7,
      "original_filename": "meeting-note.txt",
      "stored_filename": "uuid.txt",
      "content_type": "text/plain",
      "file_size": 1024,
      "storage_path": "uploads/uuid.txt",
      "status": "UPLOADED",
      "created_at": "2026-06-18T10:00:00+09:00"
    }
  ]
}
```

#### GET /documents/?workspace_id=1

Returns all documents in the workspace, including meeting documents and workspace-level documents.

```json
{
  "status": "success",
  "data": [
    {
      "id": 2,
      "workspace_id": 1,
      "meeting_id": null,
      "original_filename": "workspace-file.pdf",
      "stored_filename": "uuid.pdf",
      "content_type": "application/pdf",
      "file_size": 2048,
      "storage_path": "uploads/uuid.pdf",
      "status": "UPLOADED",
      "created_at": "2026-06-18T10:05:00+09:00"
    },
    {
      "id": 1,
      "workspace_id": 1,
      "meeting_id": 7,
      "original_filename": "meeting-note.txt",
      "stored_filename": "uuid.txt",
      "content_type": "text/plain",
      "file_size": 1024,
      "storage_path": "uploads/uuid.txt",
      "status": "UPLOADED",
      "created_at": "2026-06-18T10:00:00+09:00"
    }
  ]
}
```

#### GET /documents/{document_id}

Returns one document after workspace permission validation.

#### DELETE /documents/{document_id}

Deletes one document. Success response is `204 No Content`.

### STT Results

Endpoints:

- `POST /stt-results/`
- `GET /stt-results/`
- `GET /stt-results/{stt_result_id}`
- `PATCH /stt-results/{stt_result_id}`
- `DELETE /stt-results/{stt_result_id}`: `204 No Content`

Request:

```json
{
  "meeting_id": 7,
  "language": "ko",
  "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다."
}
```

POST Response:

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "utterance_count": 2
  }
}
```

GET Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "meeting_id": 7,
      "language": "ko",
    "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
    "status": "COMPLETED",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}

```

List Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "meeting_id": 7,
          "language": "ko",
      "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
      "status": "COMPLETED",
      "created_at": "2026-05-18T10:00:00+09:00"
    }
  ]
}
```

Patch Response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "meeting_id": 7,
      "language": "ko",
    "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
    "status": "COMPLETED",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

Delete Response:

```http
204 No Content
```

### Utterances

중요 구조:

```text
utterances -> stt_result_id -> stt_results.meeting_id
```

`utterances`에는 `meeting_id` 직접 FK가 없다.

Endpoints:

- `GET /utterances/?stt_result_id=1`
- `GET /utterances/{utterance_id}`
- `POST /utterances/`
- `PATCH /utterances/{utterance_id}`
- `DELETE /utterances/{utterance_id}`: `204 No Content`

Response:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "stt_result_id": 1,
      "sequence": 1,
      "start_ms": null,
      "end_ms": null,
      "speaker_label": null,
      "text": "오늘 회의 시작합니다.",
      "created_at": "2026-05-18T10:00:00+09:00"
    }
  ]
}
```

Single/create/patch response:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "stt_result_id": 1,
    "sequence": 1,
    "start_ms": null,
    "end_ms": null,
    "speaker_label": null,
    "text": "오늘 회의 시작합니다.",
    "created_at": "2026-05-18T10:00:00+09:00"
  }
}
```

Delete Response:

```http
204 No Content
```

------------------------------------------------------------------------

## 7. Phase 3 Realtime STT Contract

Public Node.js ingress:

`POST http://{node-host}:3001/api/meetings/{meeting_id}/stt-chunks`

Use `Authorization: Bearer <access_token>`. The payload contains `chunk_id`, `text`,
optional `stt_result_id`, optional `sequence`, `speaker_label`, `start_ms`, `end_ms`,
`language`, and `is_final`.

- Partial (`is_final=false`): emit `utterance.partial`; do not persist or analyze.
- Final (`is_final=true`): deduplicate, persist one utterance, load the latest
  database-backed context window, and call the analysis endpoint.
- Empty speaker labels normalize to `UNKNOWN`; `speaker_changed` is included.
- A PostgreSQL advisory lock serializes concurrent first chunks for a meeting.

FastAPI endpoints:

| Method | Path | Authorization | Purpose |
| --- | --- | --- | --- |
| `GET` | `/realtime/meetings/{meeting_id}/access` | Bearer | WebSocket meeting access |
| `POST` | `/realtime/meetings/{meeting_id}/chunks` | Bearer | Persist/fan out STT chunks |
| `POST` | `/realtime/analysis/realtime` | `X-Analysis-Secret` | Phase 3 transport contract (`PENDING_PHASE4`) |
| `POST` | `/realtime/analysis-results` | `X-Analysis-Secret` | Validate, persist, and broadcast result |

WebSocket:

`ws://{node-host}:3001/ws/meetings/{meeting_id}?token={access_token}`

Events are persisted in Redis Stream `realtime.events.stream`, published through
`realtime.events`, and carry `event_id`. Send
`{"type":"event.ack","event_id":"..."}` to acknowledge. Reconnect with
`last_event_id={event_id}` to replay later meeting events.
Phase 3 STT event identifiers use snake_case; the legacy room/issue event contract below
retains camelCase.

## 7.1 Legacy WebSocket Structure

Client -> Node -> FastAPI -> DB -> Node -> Broadcast

Node.js가 실시간 연결과 broadcast를 담당한다.
FastAPI는 REST API와 DB 저장을 담당한다.

------------------------------------------------------------------------

## 이벤트

PING
CONNECT_USER
JOIN_WORKSPACE
GET_MEETINGS
CREATE_MEETING
DELETE_MEETING
JOIN_MEETING_ROOM
JOIN_MEETING_ROOM_ACK
LEAVE_MEETING_ROOM
MEETING_ROOM_USERS_UPDATED
MEETING_UPDATED
CREATE_ISSUE
ISSUE_CREATED

필수 payload:

- workspaceId
- meetingId

WebSocket payload의 식별자 필드는 camelCase(`workspaceId`, `meetingId`)로 고정한다. REST/FastAPI 요청 및 응답 필드는 snake_case(`workspace_id`, `meeting_id`)를 사용한다.

room 기준 broadcast.

Node.js는 WebSocket 연결 시 JWT를 검증하고, `ws.userId`, `ws.role` 또는 이에 준하는 인증 정보를 socket context에 저장한다.
Node.js가 FastAPI REST API를 호출할 때도 `Authorization: Bearer <access_token>` 헤더를 전달해야 한다.
Node.js는 `JOIN_WORKSPACE`, `JOIN_MEETING_ROOM` 처리 전 FastAPI 검증 API를 호출한다. FastAPI가 `200`을 반환하면 room 입장을 허용하고, `401`, `403`, `404`를 반환하면 입장을 차단한다.
Node.js는 자기 서버에 위치한 Redis의 `meeting.updated` 채널을 구독해 `startedAt`, `endedAt`을 포함한 회의 상태 변경 이벤트를 WebSocket room에 broadcast한다.
`JOIN_WORKSPACE`, `JOIN_MEETING_ROOM` 처리 전 Node.js는 `GET /workspaces/{workspace_id}`를 호출하여 해당 사용자가 `workspace_members`의 허용 role(`OWNER`, `ADMIN`, `MEMBER`)인지 확인한다. 검증 실패 시 room 및 presence 저장을 수행하지 않는다.

WebSocket JWT 검증 기준:

- Client는 WebSocket 연결 또는 `CONNECT_USER` 시 Access Token을 전달한다.
- Node.js는 JWT 서명과 만료 시간을 검증한다.
- JWT payload에 `sub`가 없으면 연결을 차단한다.
- 검증 성공 시 socket context에 `userId`, `role`을 저장한다.
- 권한 및 데이터 흐름은 `workspaceId` 기준으로 처리한다.
- 이후 `JOIN_WORKSPACE`, `JOIN_MEETING_ROOM`, `CREATE_MEETING`, `CREATE_ISSUE` 이벤트는 이 context 기준으로 처리한다.
- FastAPI 측 검증 헬퍼는 `app.core.security.verify_websocket_token(token)`이다.

------------------------------------------------------------------------

## 8. 상태 머신

STT -> Utterance -> Rule -> Issue Candidate -> Issue

------------------------------------------------------------------------

## 9. 핵심 규칙

- Meeting 생성 != 회의 시작
- Meeting = 회의 페이지
- Meeting Room = 실시간 공간
- workspaceId 필수
- meetingId 필수
- broadcast는 Node 담당
- FastAPI는 데이터 담당
- 상태 전이 규칙 강제
