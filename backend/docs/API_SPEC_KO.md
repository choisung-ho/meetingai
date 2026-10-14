# API 명세서 v0.4.0

> **명세 버전: v0.4.0** (2026-07-07). 이번 개정부터 명세 버전을 백엔드 `APP_VERSION`(0.4.0)과 통일한다.
> 이전 문서에 표기됐던 v0.5.0은 코드 버전과 무관한 독립 번호였다.
>
> v0.4.0 주요 변경:
> - STT Result에서 `document_id` 완전 제거 (요청/응답/DB)
> - `stt.created`/`stt.updated` Redis payload에 `workspace_id`, `meeting_id` 포함 명시
> - STT Result 삭제 시 하위 Utterance/AnalysisResult cascade 삭제 (DELETE 500 오류 수정)
> - **Phase 4 신규**: 문서 파싱/청킹/임베딩, pgvector 유사도 검색(`POST /rag/search`),
>   화자 분리 클러스터링(`Speaker 1`/`Speaker 2`/`Unknown`), 화자 결합 transcript,
>   상태 머신 기반 안건(Topic) 추출 + 재논의 탐지 (섹션 11 참조)

## 1. 핵심 구조와 역할 분리

```text
User -> Workspace -> Meeting -> Issue
```

- `Node.js`: WebSocket 연결, room 관리, 실시간 broadcast 담당
- `FastAPI`: REST API, 인증/권한 검증, PostgreSQL 저장 담당
- 모든 협업 권한과 데이터 흐름은 `workspaceId`를 기준으로 처리한다.

## 2. 공통 응답 형식

대부분의 REST API 성공 응답:

```json
{
  "status": "success",
  "data": {}
}
```

목록도 `data` 안에 배열 또는 페이지 객체로 반환한다.

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

- `POST /login`은 토큰 객체를 직접 반환한다.
- `204 No Content`로 처리하는 삭제 API는 응답 body가 없다.

## 3. 인증 API

MVP v0.4.0은 JWT Access Token과 Refresh Token을 사용한다.
Access Token은 보호 API 호출에 사용하고, Refresh Token은 회의 중 강제 로그아웃을 막기 위한 silent refresh에 사용한다.
Refresh Token은 30일 동안 유효하며, `/auth/refresh` 호출 때마다 새 Refresh Token을 함께 발급하는 Rotation 방식으로 수명을 갱신한다.

공개 API:

- `GET /`
- `GET /health`
- `POST /auth/register`
- `POST /login`
- `POST /auth/refresh`

그 외 REST API에는 아래 헤더가 필요하다.

```http
Authorization: Bearer <access_token>
```

### GET /

응답:

```json
{
  "status": "success",
  "data": {
    "message": "AI Meeting Assistant Backend is running"
  }
}
```

### GET /health

응답:

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

회원가입을 완료하면 사용자 기본 workspace와 `OWNER` membership이 함께 생성된다.

요청:

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

응답:

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
    "terms_agreed_at": "2026-05-27T10:00:00+09:00",
    "terms_version": "v1",
    "created_at": "2026-05-27T10:00:00+09:00",
    "updated_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### POST /login

요청:

```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

응답:

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

`defaultWorkspaceId`는 로그인 사용자가 처음 진입할 기본 workspace이다.

### POST /auth/refresh

요청:

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

응답:

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

## 4. Workspace 및 Membership

엔드포인트:

- `POST /workspaces`
- `GET /workspaces`
- `GET /workspaces/{workspace_id}`
- `POST /workspaces/{workspace_id}/invite`

규칙:

- 권한은 `workspace_members`의 `(workspace_id, user_id, role)`로 검증한다.
- JWT의 `role` claim은 workspace 권한 기준이 아니다.
- 프론트/Node.js는 workspace 권한을 `my_role`, `canInviteMember`, 또는 FastAPI 검증 API 결과로 판단한다.
- 접근 가능한 역할은 `OWNER`, `ADMIN`, `MEMBER`이다.
- 신규 workspace를 만든 사용자는 `OWNER`가 된다.
- 초대는 `OWNER`, `ADMIN`만 수행하며 초대받은 가입 회원은 `MEMBER`가 된다.
- membership이 없으면 `403`으로 차단한다.
- `owner_user_id`는 기존 데이터 호환 필드이며, 권한 판단 기준은 `workspace_members`이다.

### 역할 정책

`ADMIN 이상`은 `OWNER`, `ADMIN`이고, `MEMBER 이상`은 `OWNER`, `ADMIN`, `MEMBER`이다.

| 기능 | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| workspace, meeting, issue 조회 | 가능 | 가능 | 가능 |
| meeting 생성 및 수정 | 가능 | 가능 | 가능 |
| meeting 삭제 | 가능 | 가능 | 불가 |
| issue 생성, 수정, 삭제 | 가능 | 가능 | 가능 |
| workspace 초대 | 가능 | 가능 | 불가 |

`VIEWER`는 MVP에서 제외한다. 읽기 전용 role을 추가할 때는 REST 변경 요청 차단과 WebSocket 생성 이벤트 차단을 함께 정의해야 한다.

### POST /workspaces

요청:

```json
{
  "name": "B_42 Workspace"
}
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "B_42 Workspace",
    "owner_user_id": 1,
    "my_role": "OWNER",
    "canInviteMember": true,
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### GET /workspaces

응답:

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
      "created_at": "2026-05-27T10:00:00+09:00"
    }
  ]
}
```

### GET /workspaces/{workspace_id}

Node.js가 `JOIN_WORKSPACE` 전 검증용으로 호출할 수 있다.

응답 코드:

| 상황 | 응답 코드 |
| --- | --- |
| 정상 멤버 | `200` |
| workspace 멤버 아님 | `403` |
| 토큰 없음 또는 만료 | `401` |
| workspace 없음 | `404` |

성공 응답:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "B_42 Workspace",
    "owner_user_id": 1,
    "my_role": "OWNER",
    "canInviteMember": true,
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### POST /workspaces/{workspace_id}/invite

가입된 사용자를 workspace에 초대한다. `OWNER`, `ADMIN`만 요청 가능하다.

현재 v0.4 구현은 즉시 참여형이다. 이 API가 성공하면 초대받은 사용자는 별도 수락 없이 바로 `workspace_members`에 `MEMBER`로 추가된다.

요청:

```json
{
  "email": "member@example.com"
}
```

응답:

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

오류:

- `403`: 요청자가 초대 권한이 없음
- `404`: workspace 또는 초대 대상 가입 회원을 찾을 수 없음
- `409`: 이미 참여 중인 회원

### v0.4.1 예정: 수락형 초대 구조

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

요청:

```json
{
  "email": "member@example.com",
  "role": "MEMBER"
}
```

응답:

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

응답:

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

`OWNER`, `ADMIN`이 해당 Workspace의 보낸 초대 이력을 조회한다. `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED` 이력이 모두 포함된다.

#### DELETE /workspaces/{workspace_id}/invitations/{invitation_id}

`OWNER`, `ADMIN`이 `PENDING` 초대를 취소한다. 초대 행은 감사 이력을 위해 유지하고 status를 `CANCELLED`로 변경한다. 이미 처리된 초대는 `409`를 반환한다.

#### POST /workspace-invitations/{invitation_id}/accept

초대를 수락한다. 성공 시 `workspace_members`에 `MEMBER` row를 생성하고 invitation 상태를 `ACCEPTED`로 변경한다.

응답:

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

응답:

```json
{
  "status": "success",
  "data": {
    "invitation_id": 10,
    "status": "REJECTED"
  }
}
```

## 5. Meeting

Meeting은 독립 리소스가 아니라 Workspace 하위 리소스이다. 모든 단건 작업에서 `meeting.workspace_id == workspace_id`를 검증한다.

상태:

```text
READY -> ACTIVE -> ENDED
```

금지되는 전이:

- `READY -> ENDED`
- `ACTIVE -> READY`
- `ENDED -> ACTIVE`

시간 필드:

| 필드 | 의미 | 저장 시점 |
| --- | --- | --- |
| `created_at` | 회의 페이지 생성 시각 | 회의 생성 시 자동 저장 |
| `started_at` | 실제 회의 시작 시각 | `PATCH status=ACTIVE` 성공 시 비어 있으면 자동 저장 |
| `ended_at` | 실제 회의 종료 시각 | `PATCH status=ENDED` 성공 시 비어 있으면 자동 저장 |

### POST /workspaces/{workspace_id}/meetings

회의 페이지를 생성한다. 회의 시작이 아니며 `MEMBER 이상`만 요청 가능하다. 생성 시 상태는 `READY`여야 한다.

요청:

```json
{
  "title": "Phase 3 회의",
  "status": "READY"
}
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "Phase 3 회의",
    "description": null,
    "status": "READY",
    "scheduled_at": null,
    "started_at": null,
    "ended_at": null,
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

### GET /workspaces/{workspace_id}/meetings?page=1&size=20

특정 workspace의 meeting 목록을 조회한다.

응답:

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
        "title": "Phase 3 회의",
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

### GET /workspaces/{workspace_id}/meetings/{meeting_id}

Node.js가 `JOIN_MEETING_ROOM` 전 검증용으로 호출할 수 있다. 응답에는 회의 시작/종료 시간이 포함된다.

응답 코드:

| 상황 | 응답 코드 |
| --- | --- |
| 정상 멤버이며 meeting 존재 | `200` |
| workspace 멤버 아님 | `403` |
| 토큰 없음 또는 만료 | `401` |
| 해당 workspace에 meeting 없음 | `404` |

성공 응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "Phase 3 회의",
    "description": null,
    "status": "ACTIVE",
    "scheduled_at": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "ended_at": null,
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

### PATCH /workspaces/{workspace_id}/meetings/{meeting_id}

`MEMBER 이상`만 요청 가능하다. `status=ACTIVE`는 회의 시작, `status=ENDED`는 회의 종료를 의미한다.

회의 시작 요청:

```json
{
  "status": "ACTIVE"
}
```

회의 종료 요청:

```json
{
  "status": "ENDED"
}
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "Phase 3 회의",
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
    "title": "Phase 3 회의",
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

Redis는 FastAPI와 Node.js가 공유하는 별도 인프라다. FastAPI는 Redis 프로세스를
직접 실행하지 않고 `REDIS_URL`로 publish하며, Node.js는 `meeting.updated`와
Phase 3 `realtime.events`를 구독한다.

### DELETE /workspaces/{workspace_id}/meetings/{meeting_id}

`ADMIN 이상`만 요청 가능하다.

응답:

```json
{
  "status": "success",
  "data": {
    "id": 7,
    "workspace_id": 1,
    "title": "Phase 3 회의",
    "description": null,
    "status": "ENDED",
    "scheduled_at": null,
    "started_at": "2026-06-18T10:05:00+09:00",
    "ended_at": "2026-06-18T11:00:00+09:00",
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

## 6. Issue

Issue는 Meeting에 종속되며 생성, 수정, 상태 변경, 삭제는 `MEMBER 이상`만 수행한다.

상태 전이:

- `OPEN -> IN_PROGRESS`
- `IN_PROGRESS -> CLOSED`

규칙:

- 생성과 목록 조회 시 `meeting_id`가 필수이다.
- 신규 목록 조회는 `GET /workspaces/{workspace_id}/issues`, `GET /meetings/{meeting_id}/issues`를 사용한다.
- `GET /issues`는 기존 호환용이며 `meeting_id` query parameter가 필요하다.
- 삭제된 issue는 조회 목록에서 제외한다.
- FastAPI 응답에는 Node broadcast용 `workspaceId`가 포함된다.

### POST /issues/

요청:

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

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00",
    "updated_at": "2026-05-27T10:00:00+09:00",
    "deleted_at": null
  }
}
```

### GET /workspaces/1/issues

워크스페이스 전체 이슈 목록 조회. 대시보드/워크스페이스 이슈 탭에서 사용한다.

응답:

```json
{
  "status": "success",
  "data": [
    {
      "id": 12,
      "workspaceId": 1,
      "meeting_id": 7,
      "title": "WebSocket 연결 테스트 안건",
      "status": "OPEN",
      "priority": "HIGH",
      "deleted_at": null
    }
  ]
}
```

### GET /meetings/7/issues

특정 회의 이슈 목록 조회. 회의 상세 페이지에서 사용한다.

응답:

```json
{
  "status": "success",
  "data": [
    {
      "id": 12,
      "workspaceId": 1,
      "meeting_id": 7,
      "title": "WebSocket 연결 테스트 안건",
      "status": "OPEN",
      "priority": "HIGH",
      "deleted_at": null
    }
  ]
}
```

### GET /issues/?meeting_id=7

기존 호환용 회의별 이슈 목록 조회. 신규 클라이언트/Node는 `GET /meetings/{meeting_id}/issues` 사용을 권장한다.

응답:

```json
{
  "status": "success",
  "data": [
    {
      "id": 12,
      "workspaceId": 1,
      "meeting_id": 7,
      "title": "WebSocket 연결 테스트 안건",
      "status": "OPEN",
      "priority": "HIGH",
      "deleted_at": null
    }
  ]
}
```

### GET /issues/{issue_id}

단일 issue를 조회한다. 해당 issue의 meeting이 속한 workspace membership을 검증한다.

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00",
    "updated_at": "2026-05-27T10:00:00+09:00",
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

요청 예시:

```json
{
  "title": "로그인 기능 마감일 조정",
  "priority": "HIGH",
  "due_date": "2026-05-30T18:00:00+09:00"
}
```

응답은 변경된 issue를 공통 응답 형식으로 반환한다.

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00",
    "updated_at": "2026-05-27T10:10:00+09:00",
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

### PATCH /issues/{issue_id}/state

issue 상태 전이 전용 API이다.
상태 변경 이벤트를 `issue_events`에 기록하며, 회의 중 상태 변경, Node.js broadcast, 상태 머신 흐름에서는 이 API를 기준으로 사용한다.

요청:

```json
{
  "to_state": "CLOSED",
  "meeting_id": 7,
  "reason": "논의 완료",
  "evidence": "회의 중 결정"
}
```

응답:

```json
{
  "status": "success",
  "data": {
    "issue_id": 12,
    "from_state": "IN_PROGRESS",
    "to_state": "CLOSED",
    "event_type": "ISSUE_CLOSED",
    "changed_at": "2026-05-27T10:30:00+09:00"
  }
}
```

### DELETE /issues/{issue_id}

soft delete를 수행하며, 응답의 `deleted_at`에 삭제 시각이 포함된다.

응답:

```json
{
  "status": "success",
  "data": {
    "id": 12,
    "workspaceId": 1,
    "meeting_id": 7,
    "title": "로그인 기능 마감일 조정",
    "description": "Node broadcast 검증",
    "status": "CLOSED",
    "priority": "HIGH",
    "due_date": "2026-05-30T18:00:00+09:00",
    "assignee_id": null,
    "created_at": "2026-05-27T10:00:00+09:00",
    "updated_at": "2026-05-27T10:10:00+09:00",
    "deleted_at": "2026-05-27T10:20:00+09:00"
  }
}
```

### GET /issues/{issue_id}/events

issue 상태 변경 이벤트 목록을 반환한다.

요청:

```http
GET /issues/12/events
Authorization: Bearer <access_token>
```

응답:

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
      "created_at": "2026-05-27T10:00:00+09:00"
    },
    {
      "id": 2,
      "issue_id": 12,
      "meeting_id": 7,
      "event_type": "ISSUE_CLOSED",
      "from_state": "IN_PROGRESS",
      "to_state": "CLOSED",
      "reason": "논의 완료",
      "evidence": "회의 중 결정",
      "created_at": "2026-05-27T10:30:00+09:00"
    }
  ]
}
```

응답 필드:

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | int | issue event ID |
| `issue_id` | int | 이벤트가 속한 issue ID |
| `meeting_id` | int 또는 null | 이벤트가 발생한 meeting ID |
| `event_type` | string | 이벤트 타입. 예: `ISSUE_CREATED`, `ISSUE_CLOSED` |
| `from_state` | string 또는 null | 변경 전 상태. 생성 이벤트는 `null` |
| `to_state` | string | 변경 후 상태 |
| `reason` | string 또는 null | 상태 변경 사유 |
| `evidence` | string 또는 null | 상태 변경 근거 |
| `created_at` | datetime string | 이벤트 생성 시각 |

오류:

- `401`: 토큰 없음 또는 만료
- `403`: issue가 속한 workspace의 멤버가 아님
- `404`: issue 없음

## 7. Alert

Alert는 특정 meeting 또는 issue에 연결되는 알림 데이터이다.
마감 임박, 재논의 필요, 담당자 확인 필요 같은 UI 알림을 표현한다.

엔드포인트:

- `POST /alerts/`
- `GET /alerts/?meeting_id={meeting_id}`
- `GET /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}/acknowledge`
- `PATCH /alerts/{alert_id}/dismiss`
- `PATCH /alerts/{alert_id}/resolve`
- `DELETE /alerts/{alert_id}`: `204 No Content`

클라이언트/내부 사용 구분:

| URL | 무슨 요청인지 | 시작점 | FastAPI 역할 | Pub/Sub 여부 |
| --- | --- | --- | --- | --- |
| `POST /alerts/` | Alert 생성 | 서버 내부 또는 내부 API | Alert DB 저장, 내부 `create_alert()` 호출, Node.js 서버 Redis의 `alert.created` 채널로 publish | O |
| `GET /alerts/?meeting_id={meeting_id}` | Alert 목록 조회 | 클라이언트 | 특정 meeting의 Alert 목록 조회 후 응답 | O |
| `GET /alerts/{alert_id}` | Alert 상세 조회 | 클라이언트 | 특정 Alert 조회 후 응답 | O |
| `PATCH /alerts/{alert_id}` | Alert 일반 수정 | 상황별 | `message`, `level`, `status`, `meeting_id`, `issue_id` 수정 | O |
| `PATCH /alerts/{alert_id}/acknowledge` | 알림 확인/읽음 처리 | 클라이언트 | 상태를 `ACKNOWLEDGED`로 변경 | O |
| `PATCH /alerts/{alert_id}/dismiss` | 알림 숨김/무시 처리 | 클라이언트 | 상태를 `DISMISSED`로 변경 | O |
| `PATCH /alerts/{alert_id}/resolve` | 알림 원인 해결 처리 | 클라이언트 또는 내부 로직 | 상태를 `RESOLVED`로 변경 | O |
| `DELETE /alerts/{alert_id}` | Alert 삭제 | 보통 클라이언트 또는 관리자 | Alert 삭제 | O |
| 내부 `create_alert()` | 서버 내부 Alert 생성 함수 | FastAPI/AI 분석/배치/조건 감지 로직 | Alert 생성, DB 저장, publish 준비 | O |
| `PUBLISHED alert.created` | Redis publish 로그 | FastAPI 내부 | Node.js 서버 Redis의 `alert.created` 채널로 payload를 publish | O |

`POST /alerts/`는 현재 인증이 필요한 REST endpoint로 열려 있지만, 제품 흐름상 일반 클라이언트가 직접 누르는 공개 기능이라기보다 서버 내부/운영/연동용 생성 API로 본다.
재논의 감지, 마감 임박, 담당자 확인 필요 같은 모든 서버 내부 Alert 생성은 내부 `create_alert()` 함수를 공통 진입점으로 사용한다.

요청 예시:

```json
{
  "meeting_id": 7,
  "issue_id": 12,
  "message": "마감일이 가까운 안건입니다.",
  "level": "info",
  "status": "PENDING"
}
```

상태:

```text
PENDING -> ACKNOWLEDGED 또는 DISMISSED
ACKNOWLEDGED -> RESOLVED 또는 DISMISSED
```

단건 응답:

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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

목록 응답:

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
      "created_at": "2026-05-27T10:00:00+09:00"
    }
  ]
}
```

### PATCH /alerts/{alert_id}/acknowledge

알림을 확인 처리한다. 상태는 `ACKNOWLEDGED`로 변경된다.

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### PATCH /alerts/{alert_id}/dismiss

알림을 숨김 처리한다. 상태는 `DISMISSED`로 변경된다.

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### PATCH /alerts/{alert_id}/resolve

알림 원인이 해결됐음을 표시한다. 상태는 `RESOLVED`로 변경된다.

응답:

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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

### PATCH /alerts/{alert_id}

Alert 일반 필드 수정 API이다. `message`, `level`, `status`, `meeting_id`, `issue_id`를 수정할 수 있다.
단순 확인/숨김 처리는 `/acknowledge`, `/dismiss` 사용을 권장한다.

요청:

```json
{
  "message": "마감일이 매우 가까운 안건입니다.",
  "level": "warning",
  "status": "ACKNOWLEDGED"
}
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 3,
    "meeting_id": 7,
    "issue_id": 12,
    "message": "마감일이 매우 가까운 안건입니다.",
    "level": "warning",
    "status": "ACKNOWLEDGED",
    "created_at": "2026-05-27T10:00:00+09:00"
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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

## 8. Document

Document는 Workspace에 소속되는 파일 리소스이다. 기존 회의 페이지 흐름은 그대로 유지하며, 문서 탭/대시보드 확장을 위해 `workspace_id` 기준 문서 조회와 업로드를 추가한다.

기준:

- 회의 페이지: `meeting_id` 기준으로 해당 회의에 연결된 문서만 조회/업로드한다.
- 문서 탭/대시보드: `workspace_id` 기준으로 해당 워크스페이스의 모든 문서를 조회/업로드한다.
- `meeting_id`가 있는 문서는 특정 회의에 연결된 문서이다.
- `meeting_id`가 `null`인 문서는 워크스페이스 문서 탭/대시보드에서 업로드한 워크스페이스 단위 문서이다.
- 모든 Document 응답에는 `workspace_id`가 포함된다.

엔드포인트:

- `POST /documents/upload?meeting_id=7`: 기존 회의 페이지 문서 업로드
- `POST /documents/upload?workspace_id=1`: 문서 탭/대시보드 워크스페이스 문서 업로드
- `GET /documents/?meeting_id=7`: 특정 회의 문서 목록
- `GET /documents/?workspace_id=1`: 특정 워크스페이스 전체 문서 목록
- `GET /documents/{document_id}`: 문서 상세 조회
- `DELETE /documents/{document_id}`: 문서 삭제, `204 No Content`

`meeting_id`와 `workspace_id`를 둘 다 전달한 경우, 해당 meeting이 workspace에 속하지 않으면 `400`을 반환한다. 둘 다 전달하지 않으면 `400`을 반환한다.

### POST /documents/upload?meeting_id=7

기존 회의 페이지 문서 업로드이다. 현재 회의 페이지 코드는 이 방식을 그대로 사용하면 된다.

지원 확장자는 `.txt`, `.md`, `.csv`, `.docx`, `.pdf`이며 기본 최대 크기는
`50MB`이다(`DOCUMENT_MAX_UPLOAD_MB` 환경변수로 조정 가능). 빈 파일은 거부한다.

요청:

```http
multipart/form-data
file: <uploaded-file>
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 7,
    "original_filename": "회의록.txt",
    "stored_filename": "uuid.txt",
    "content_type": "text/plain",
    "file_size": 1024,
    "storage_path": "uploads/uuid.txt",
    "status": "UPLOADED",
    "created_at": "2026-06-18T10:00:00+09:00"
  }
}
```

### POST /documents/upload?workspace_id=1

문서 탭/대시보드에서 워크스페이스 단위 문서를 업로드한다. 이 경우 `meeting_id`는 `null`이다.

요청:

```http
multipart/form-data
file: <uploaded-file>
```

응답:

```json
{
  "status": "success",
  "data": {
    "id": 2,
    "workspace_id": 1,
    "meeting_id": null,
    "original_filename": "워크스페이스자료.pdf",
    "stored_filename": "uuid.pdf",
    "content_type": "application/pdf",
    "file_size": 2048,
    "storage_path": "uploads/uuid.pdf",
    "status": "UPLOADED",
    "created_at": "2026-06-18T10:05:00+09:00"
  }
}
```

### GET /documents/?meeting_id=7

기존 회의 페이지에서 특정 회의 문서 목록을 조회한다.

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "meeting_id": 7,
      "original_filename": "회의록.txt",
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

### GET /documents/?workspace_id=1

문서 탭에서 해당 워크스페이스의 모든 문서를 조회한다. 회의에 연결된 문서와 워크스페이스 단위 문서가 함께 반환된다.

```json
{
  "status": "success",
  "data": [
    {
      "id": 2,
      "workspace_id": 1,
      "meeting_id": null,
      "original_filename": "워크스페이스자료.pdf",
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
      "original_filename": "회의록.txt",
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

### GET /documents/{document_id}

문서 상세 조회이다. 별도 `meeting_id`/`workspace_id` query 없이 문서 ID만
전달하며, 서버가 문서의 `workspace_id` 기준으로 권한을 검증한다.

### DELETE /documents/{document_id}

문서 ID만으로 문서를 삭제한다. 서버가 문서의 `workspace_id` 기준으로 권한을
검증하고, 연결된 파일과 DB 레코드를 함께 삭제한다. 성공 시 `204 No Content`
이며 응답 본문은 없다. 지원하지 않는 확장자는 `415`, 최대 크기 초과는 `413`이다.

## 9. STT Result와 Utterance

### STT Result

STT Result와 Utterance의 차이:

- **STT Result**: Workspace 안 Meeting 페이지에 귀속되는, 회의 하나의 STT 처리 단위. `raw_text`(원문 전체)와 처리 `status`(`PENDING -> PROCESSING -> COMPLETED`/`FAILED`)를 가진다. `POST /stt-results/`는 원문 텍스트 하나를 받아 문장 단위로 분리한 뒤 그 결과인 `Utterance`들을 서버가 자동으로 생성하는 파이프라인 엔드포인트다.
- **Utterance**: 하나의 STT Result에 속한 개별 발화(문장) 단위. `/utterances/`의 CRUD는 이미 존재하는 `stt_result_id`에 딸린 발화 한 건을 직접 조회/생성/수정/삭제하는 저수준 엔드포인트다. Phase 3 실시간 STT 파이프라인(`POST /realtime/meetings/{meeting_id}/chunks`)도 내부적으로 Utterance를 생성하지만, 클라이언트가 `/utterances/`를 직접 호출하는 것이 아니라 realtime 엔드포인트를 통해서만 생성된다.
- `stt_results` -> `utterances`는 1:N이며, STT Result가 삭제되면 소속 Utterance도 함께 삭제된다.
- `document_id`는 STT Result에서 제거되었다. STT Result는 Meeting에 귀속된 리소스이고 Document(사용자 첨부 문서)는 별개의 도메인이라 두 리소스를 직접 연결할 근거가 없었다.

엔드포인트:

- `POST /stt-results/`
- `GET /stt-results/?meeting_id={meeting_id}` (`meeting_id` 필수)
- `GET /stt-results/{stt_result_id}`
- `PATCH /stt-results/{stt_result_id}`
- `DELETE /stt-results/{stt_result_id}`: `204 No Content`

서버가 STT 상태를 관리하며, `POST` 처리 시 raw text와 발화를 저장한 후 공통
STT 결과 객체를 반환한다. 모든 STT 결과에는 소속 Meeting에서 파생한
`workspace_id`가 포함된다.

요청:

```json
{
  "meeting_id": 7,
  "language": "ko",
  "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다."
}
```

응답 (HTTP 응답 바디는 기존과 동일):

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 7,
    "language": "ko",
    "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
    "status": "COMPLETED",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

Redis Stream/Pub/Sub 이벤트:

- `POST` 성공: `stt.created`
- `PATCH` 성공: `stt.updated`
- Document 업로드 성공: `document.created`
- Document 삭제 성공: `document.deleted`

`stt.created` payload (HTTP 응답과 별개로 Redis에 발행되는 이벤트 payload이며, `workspace_id`/`meeting_id`가 반드시 포함된다):

```json
{
  "type": "stt.created",
  "workspace_id": 1,
  "meeting_id": 7,
  "stt_result_id": 1,
  "status": "COMPLETED",
  "utterance_count": 2
}
```

`stt.updated` payload (`workspace_id`가 포함되며, 변경된 필드 목록을 `changed_fields`로 함께 전달한다):

```json
{
  "type": "stt.updated",
  "workspace_id": 1,
  "meeting_id": 7,
  "stt_result_id": 1,
  "status": "PROCESSING",
  "changed_fields": ["status"]
}
```

목록 조회 응답:

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "meeting_id": 7,
      "language": "ko",
      "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
      "status": "COMPLETED",
      "created_at": "2026-05-27T10:00:00+09:00"
    }
  ]
}
```

상세/PATCH 응답:

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 7,
    "language": "ko",
    "raw_text": "오늘 회의 시작합니다. 로그인 기능은 이번 주까지 끝냅시다.",
    "status": "COMPLETED",
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

삭제 응답:

```http
204 No Content
```

상태:

```text
PENDING -> PROCESSING -> COMPLETED
PENDING -> FAILED
```

### Utterance

중요한 데이터 연결 구조:

```text
utterances -> stt_result_id -> stt_results.meeting_id
```

`utterances`에는 `meeting_id` 직접 FK가 없다. 현재 단계에서 `speaker_label`은 `null`일 수 있다.
STT Result와의 차이는 위 STT Result 섹션을 참고한다: STT Result는 원문 전체 + 상태를 다루는 상위 컨테이너, Utterance는 그 안의 개별 발화 CRUD다.

엔드포인트:

- `GET /utterances/?stt_result_id=1`
- `GET /utterances/{utterance_id}`
- `POST /utterances/`
- `PATCH /utterances/{utterance_id}`
- `DELETE /utterances/{utterance_id}`: `204 No Content`

응답 예시:

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
      "created_at": "2026-05-27T10:00:00+09:00"
    }
  ]
}
```

단건/생성/PATCH 응답:

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
    "created_at": "2026-05-27T10:00:00+09:00"
  }
}
```

삭제 응답:

```http
204 No Content
```

## 10. Phase 3 실시간 STT API

### Node.js 공개 진입점

`POST http://{node-host}:3001/api/meetings/{meeting_id}/stt-chunks`

헤더: `Authorization: Bearer <access_token>`

```json
{
  "chunk_id": "meeting-12-segment-42",
  "text": "다음 배포는 금요일로 하겠습니다.",
  "stt_result_id": null,
  "sequence": null,
  "speaker_label": "SPEAKER_01",
  "speaker_embedding": [0.12, -0.03, 0.98],
  "start_ms": 12000,
  "end_ms": 14500,
  "language": "ko",
  "is_final": true
}
```

`speaker_embedding`(선택, v0.4.0)은 STT 엔진이 만든 화자 embedding 벡터다.
서버가 이 벡터를 클러스터링해 canonical 라벨(`Speaker 1`/`Speaker 2`/`Unknown`)을
부여한다(11.4 참조).

Node.js는 JWT를 우선 검증한 뒤 동일 Bearer Token으로
`POST /realtime/meetings/{meeting_id}/chunks`에 전달한다.

| `is_final` | DB 저장 | 분석 요청 | WebSocket 이벤트 |
| --- | --- | --- | --- |
| `false` | 저장하지 않음 | 보내지 않음 | `utterance.partial` |
| `true` | utterance 저장(화자 클러스터링 포함) | 최근 context와 함께 전송 | `utterance.created`, `analysis.completed`, `topic.*` |

Final chunk 응답의 `analysis_status`는 `completed`, `unavailable`, `skipped`,
중복 요청이면 `duplicate`이다. `chunk_id`와 sequence는 STT result 안에서 중복되지
않으며 meeting advisory lock으로 최초 동시 요청도 직렬화한다.

### FastAPI 실시간 endpoint

| Method | Path | 인증 | 역할 |
| --- | --- | --- | --- |
| `GET` | `/realtime/meetings/{meeting_id}/access` | Bearer | Node WebSocket 입장 권한 검증 |
| `POST` | `/realtime/meetings/{meeting_id}/chunks` | Bearer | chunk 검증·저장·context·분석 전달 |
| `POST` | `/realtime/analysis/realtime` | `X-Analysis-Secret` | Phase 3 전달 검증, `PENDING_PHASE4` 반환 |
| `POST` | `/realtime/analysis-results` | `X-Analysis-Secret` | 결과 참조 검증·`analysis_results` 저장·broadcast |

분석 요청 payload는 `meeting_id`, `stt_result_id`, `chunk_id`,
`current_utterance`, `context_window`, `speaker_preprocessing`을 포함한다.
Context는 DB에서 sequence 역순으로 최근 `REALTIME_CONTEXT_SIZE`개를 조회한 뒤
`REALTIME_CONTEXT_MAX_CHARS`를 적용한다. 화자는 공백 제거 후 빈 값이면 `UNKNOWN`이며,
이전 발언과 비교한 `speaker_changed`를 함께 보낸다.

### WebSocket 및 Redis Stream

`ws://{node-host}:3001/ws/meetings/{meeting_id}?token={access_token}`

재접속 replay:

`ws://{node-host}:3001/ws/meetings/{meeting_id}?token={access_token}&last_event_id={event_id}`

모든 실시간 이벤트는 Redis `realtime.events.stream`에 보관되고
`realtime.events` 채널로 전달된다. 이벤트에는 `event_id`가 포함된다.
Phase 3 STT 이벤트 식별자는 FastAPI와 동일한 snake_case를 사용한다.
아래 기존 room/issue 이벤트의 camelCase 규칙과 구분한다.

```json
{"type":"event.ack","event_id":"1782643311000-0"}
```

서버 확인:

```json
{"type":"event.acknowledged","event_id":"1782643311000-0"}
```

### 기존 WebSocket 및 Node.js 연동

통신 흐름:

```text
Client -> Node.js -> FastAPI -> DB -> Node.js -> Broadcast
```

Node.js가 실시간 연결과 broadcast를 담당한다. FastAPI는 저장과 검증만 담당한다.

공통 이벤트 형식:

```json
{
  "type": "ISSUE_CREATED",
  "requestId": "request-uuid",
  "success": true,
  "payload": {}
}
```

이벤트:

- `PING`
- `CONNECT_USER`
- `JOIN_WORKSPACE`
- `GET_MEETINGS`
- `CREATE_MEETING`
- `DELETE_MEETING`
- `JOIN_MEETING_ROOM`
- `JOIN_MEETING_ROOM_ACK`
- `LEAVE_MEETING_ROOM`
- `MEETING_ROOM_USERS_UPDATED`
- `MEETING_UPDATED`
- `CREATE_ISSUE`
- `ISSUE_CREATED`

규칙:

- WebSocket payload 식별자 필드는 camelCase로 고정한다. meeting 관련 이벤트에는 `workspaceId`와 `meetingId`가 필요하다.
- REST/FastAPI 요청 및 응답 필드는 `workspace_id`, `meeting_id`와 같은 snake_case를 사용한다.
- Node.js는 보호된 FastAPI 호출 시 `Authorization: Bearer <access_token>`을 전달한다.
- Node.js는 WebSocket 연결 시 JWT 서명, 만료 시간, `sub`를 검증한다.
- 검증 후 socket context에 `userId`, `role`을 저장한다.
- Node.js는 자기 서버에 위치한 Redis의 `meeting.updated` 채널을 구독해 `startedAt`, `endedAt`을 포함한 회의 상태 변경 이벤트를 WebSocket room에 broadcast한다.

### Room 입장 전 FastAPI 검증

Node.js는 `JOIN_WORKSPACE`, `JOIN_MEETING_ROOM` 처리 전 FastAPI 검증 API를 호출한다. FastAPI가 `200`을 반환하면 room 입장을 허용하고, `401`, `403`, `404`를 반환하면 입장을 차단한다.

| 이벤트 | 검증 API |
| --- | --- |
| `JOIN_WORKSPACE` | `GET /workspaces/{workspace_id}` |
| `JOIN_MEETING_ROOM` | `GET /workspaces/{workspace_id}/meetings/{meeting_id}` |

검증 결과 계약:

| 상황 | 응답 코드 | Node 동작 |
| --- | --- | --- |
| 정상 멤버, 리소스 존재 | `200` | room 입장 |
| 토큰 없음 또는 만료 | `401` | 입장 차단 |
| workspace membership 없음 | `403` | 입장 차단 |
| workspace 또는 meeting 없음 | `404` | 입장 차단 |

## 11. Phase 4: RAG / 화자 분리 / 재논의 탐지 (v0.4.0 신규)

### 11.1 임베딩과 pgvector

- 임베딩 provider는 `EMBEDDING_PROVIDER`로 선택한다. 기본값 `hash`는 외부 API 키 없이 동작하는 결정적 feature-hashing 임베딩(`EMBEDDING_DIM`, 기본 256차원)이다. 시맨틱 provider로 교체해도 저장/검색 구조는 동일하다.
- Postgres는 `pgvector/pgvector:pg16` 이미지를 사용한다(docker-compose 반영, 기존 볼륨 호환). 서버 기동 시 `CREATE EXTENSION vector` 성공 시 `document_chunks.embedding_vec` + HNSW 인덱스로 Postgres 내부 검색, 실패 시 Python 코사인 폴백으로 자동 전환된다.
- `REDISCUSSION_SIMILARITY_THRESHOLD` 기본 0.4는 hash provider 기준 보정값(유사 0.4+, 무관 <0.1). 시맨틱 provider 도입 시 0.8 수준 권장.

### 11.2 문서 파싱 파이프라인

- `POST /documents/{document_id}/process`: 업로드된 문서를 파싱해 문장 경계 기준 청킹 후 청크별 임베딩 저장. 지원: `.txt`, `.md`, `.csv`, `.docx`, `.pdf`. 상태 전이 `UPLOADED/FAILED -> PROCESSING -> PROCESSED/FAILED`. 성공 시 `document.processed` 이벤트 발행.

```json
{
  "status": "success",
  "data": { "document_id": 1, "status": "PROCESSED", "chunk_count": 4 }
}
```

- `GET /documents/{document_id}/chunks`: 청크 목록 조회 (`id`, `document_id`, `chunk_index`, `text`, `created_at`).
- 파싱 불가/미지원 형식은 `422` + 문서 상태 `FAILED`, 처리 중 재요청은 `409`.

### 11.3 유사도 검색

`POST /rag/search`:

```json
{
  "workspace_id": 1,
  "query": "로그인 기능 언제까지 하기로 했지",
  "top_k": 5,
  "target": "documents"
}
```

- `target`: `documents`(기본) | `utterances` | `topics` | `all`
- 응답 `data.results[]`: `{type, id, text, score, ...}` — `score`는 코사인 유사도. `document_chunk`는 `document_id`/`chunk_index`, `utterance`는 `stt_result_id`/`speaker_label`, `topic`은 `meeting_id`/`status`/`proposed_by`가 추가된다.

### 11.4 화자 분리 (Diarization 연동)

Diarization 자체(음성 → 화자 구간)는 클라이언트/STT 엔진이 수행하고, 서버는 chunk의 화자 정보를 회의 단위로 클러스터링한다.

- `POST /realtime/meetings/{meeting_id}/chunks`에 `speaker_embedding: number[]`(선택, 최대 2048차원) 필드 추가.
- speaker embedding이 있으면 기존 speaker centroid들과 코사인 비교 → `SPEAKER_SIMILARITY_THRESHOLD`(기본 0.75) 이상이면 같은 화자로 묶고(centroid running mean 갱신), 아니면 새 프로필 생성.
- embedding 없이 `speaker_label`만 오면 동일 원본 라벨을 동일 canonical 라벨로 매핑. 둘 다 없으면 `Unknown`.
- 발화 `speaker_label`에는 canonical 라벨이 저장된다:

```text
Speaker 1
Speaker 2
Unknown
```

### 11.5 STT + 화자 결합 transcript

`GET /stt-results/{stt_result_id}/transcript`: 발화를 sequence 순으로 `[Speaker N]: 텍스트` 형식으로 결합해 반환.

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "meeting_id": 7,
    "workspace_id": 1,
    "line_count": 1,
    "lines": ["[Speaker 1]: 이 기능 다음 분기에 적용하죠"],
    "text": "[Speaker 1]: 이 기능 다음 분기에 적용하죠"
  }
}
```

### 11.6 안건(Topic) 추출과 재논의 탐지

final 발화 저장 직후 상태 머신 기반 판단 로직이 실행된다.

1. **화자 기반 안건 추출**: 결정 표현(`~하기로`, `결정`, `확정`, `적용하죠` 등) → `DECIDED` 안건 생성, 제안 표현(`어떨까요`, `제안`, `논의` 등) → `PROPOSED` 안건 생성. `proposed_by`/`decided_by`에 화자 기록.
2. **재논의 탐지**: 새 발화가 기존 `DECIDED` 안건과 임계값 이상 유사하면 `DECIDED -> REVISITED` 전이 + `warning` Alert 자동 생성. `TopicEvent`에 **누가**(화자 라벨) **어느 발화로** 재논의했는지 기록되어 추적 가능.
3. **재확정**: `REVISITED` 안건과 유사한 결정 발화 → `DECIDED` 복귀.

엔드포인트:

- `GET /meetings/{meeting_id}/topics` (`status` query 필터 가능)
- `GET /topics/{topic_id}`
- `GET /topics/{topic_id}/events` — 재논의 이력 (`event_type`, `speaker_label`, `utterance_id`, `detail`, `created_at`)
- `PATCH /topics/{topic_id}/state` — 수동 상태 변경 (`{"status": "DROPPED"}` 등, 상태 머신 위반 시 `400`)

Redis/WebSocket 이벤트: `topic.created`, `topic.decided`, `topic.revisited`(+ `alert.created` 동반), `topic.redecided`, `topic.updated`. 모두 `workspace_id`/`meeting_id`/`topic_id`/`status` 포함, `topic.revisited`에는 `revisited_by`/`similarity`/`alert_id` 추가.

### 11.7 STT Result와 Utterance의 차이 (재정리)

- **STT Result**: 회의 하나의 STT 처리 단위(원문 + 상태). `POST /stt-results/`는 원문을 문장 단위로 분리해 Utterance들을 자동 생성하는 파이프라인 엔드포인트.
- **Utterance**: STT Result에 속한 개별 발화. `/utterances/` CRUD는 발화 한 건을 직접 다루는 저수준 엔드포인트이며, 실시간 청크(`/realtime/.../chunks`)로도 생성된다.

## 12. 상태 머신 요약

상태 전이는 `app/state.py`에서 관리한다.

| 리소스 | 상태 흐름 |
| --- | --- |
| Meeting | `READY -> ACTIVE -> ENDED` |
| Issue | `OPEN -> IN_PROGRESS -> CLOSED` |
| Issue Candidate | `DETECTED -> REVIEWING -> ACCEPTED/REJECTED -> PROMOTED` |
| Alert | `PENDING -> ACKNOWLEDGED/DISMISSED`, `ACKNOWLEDGED -> RESOLVED/DISMISSED` |
| Document | `UPLOADED -> PROCESSING -> PROCESSED/FAILED` |
| STT Result | `PENDING -> PROCESSING -> COMPLETED/FAILED` |
| Topic | `PROPOSED -> DECIDED/DROPPED`, `DECIDED -> REVISITED`, `REVISITED -> DECIDED/DROPPED` |

AI 파이프라인:

```text
STT 원문 저장
-> 발화 단위 분리 및 utterances 저장 (화자 클러스터링 포함)
-> 안건 추출 (TOPIC_PROPOSED / TOPIC_DECIDED)
-> 재논의 탐지 (TOPIC_REVISITED + alert.created)
-> ISSUE_CANDIDATE_DETECTED
-> 후보 승인 또는 거절
-> 승인된 후보를 issue로 생성
```

## 13. MVP 핵심 규칙

- Meeting 생성은 회의 시작이 아니다.
- Meeting은 회의 페이지이고, Meeting Room은 실시간 공간이다.
- `workspaceId`와 `meetingId`를 실시간 이벤트에서 유지한다.
- broadcast는 Node.js가 담당한다.
- DB 저장과 REST 권한 검증은 FastAPI가 담당한다.
- 권한 검증은 `workspace_members`를 기준으로 한다.
- Meeting 상태 전이는 `READY -> ACTIVE -> ENDED`만 허용한다.
