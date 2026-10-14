# 전체 API 명세서 - 현재 Backend 구현 기준

**명세 버전: v0.4.0** (APP_VERSION `0.4.0`, 2026-07-07)

작성 기준: FastAPI OpenAPI 스키마와 현재 라우터 코드 기준

v0.4.0 변경 요약:

- STT Result에서 `document_id` 제거 (요청/응답/DB 컬럼 모두)
- `stt.created`/`stt.updated` Redis payload에 `workspace_id`, `meeting_id` 명시
- STT Result 삭제 시 하위 Utterance/AnalysisResult가 함께 삭제되도록 cascade 수정 (500 오류 해결)
- Phase 4 신규: 문서 파싱/청킹/임베딩(`POST /documents/{id}/process`), pgvector 기반 유사도 검색(`POST /rag/search`), 화자 분리(clustering) 및 `Speaker 1`/`Speaker 2`/`Unknown` 정규화, 화자 결합 transcript(`GET /stt-results/{id}/transcript`), 상태 머신 기반 안건(Topic) 추출과 재논의 탐지

## 공통 규칙

- Base URL은 배포 환경에 따라 다릅니다. 로컬 기본 예시는 `http://localhost:8000` 입니다.
- 인증이 필요한 API는 `Authorization: Bearer ACCESS_TOKEN` 헤더를 사용합니다.
- `/`, `/health`, `/auth/register`, `/login`, `/auth/refresh`를 제외한 업무 API는 인증이 필요합니다. `/auth/me`도 Authorization 헤더가 필요합니다.
- 날짜/시간은 ISO 8601 문자열입니다. 예: `2026-06-17T12:00:00+09:00`.
- 삭제 API 중 일부는 `204 No Content`로 본문 없이 응답합니다.

### 공통 성공 응답

```json
{
  "status": "success",
  "data": {
    "message": "AI Meeting Assistant Backend is running"
  }
}
```

예외: `POST /login`, `POST /auth/refresh`는 토큰 호환성을 위해 최상위에 토큰 필드를 직접 반환합니다.

### 공통 오류 응답

```json
{
  "status": "error",
  "message": "오류 메시지"
}
```

### 입력값 검증 오류 응답

```json
{
  "status": "error",
  "message": "Invalid request",
  "detail": [
    {
      "type": "string_too_short",
      "loc": [
        "body",
        "field"
      ],
      "msg": "validation error message",
      "input": "invalid value"
    }
  ]
}
```

### Rate Limit 오류 응답

```json
{
  "status": "error",
  "message": "Too Many Requests"
}
```

### 오류 코드 의미

| Status | 의미 | 대표 상황 |
| --- | --- | --- |
| 400 | 요청 형식은 맞지만 비즈니스 규칙상 처리 불가 | 만료된 초대, 허용되지 않는 role/status, 잘못된 상태 전이 |
| 401 | 인증 실패 | 토큰 없음/만료/잘못됨, 로그인 실패 |
| 403 | 권한 없음 | 워크스페이스 접근 권한 없음, 초대 대상자 불일치, 관리자 권한 없음 |
| 404 | 리소스 없음 | 사용자/워크스페이스/회의/이슈/알림/문서/초대 없음 |
| 409 | 상태 충돌 또는 중복 | 이미 멤버, 이미 PENDING 초대, 이미 처리된 초대 |
| 422 | 입력값 검증 실패 | 필수값 누락, 타입 오류, 이메일/길이/enum 검증 실패 |
| 429 | Rate Limit 초과 | 로그인 5회/분 초과, 초대 3회/분 초과 |
| 500 | 서버 내부 오류 | 예상하지 못한 서버 예외 |

## 엔드포인트 요약

| Method | Path | 설명 | 인증 |
| --- | --- | --- | --- |
| `GET` | `/` | 서버 루트 상태 확인 | 불필요 |
| `GET` | `/health` | 헬스 체크 | 불필요 |
| `POST` | `/auth/invitations/accept` | 초대 토큰으로 수락 | 필요 |
| `GET` | `/auth/me` | 현재 로그인 사용자 정보 조회 | 필요 |
| `POST` | `/auth/refresh` | Access Token 재발급 | 불필요 |
| `POST` | `/auth/register` | 회원가입 및 기본 워크스페이스 생성 | 불필요 |
| `POST` | `/login` | 로그인 및 토큰 발급 | 불필요 |
| `GET` | `/workspace-invitations/me` | 내가 받은 PENDING 초대 목록 조회 | 필요 |
| `POST` | `/workspace-invitations/{invitation_id}/accept` | 초대 수락 | 필요 |
| `POST` | `/workspace-invitations/{invitation_id}/reject` | 초대 거절 | 필요 |
| `GET` | `/workspaces` | 내가 참여 중인 워크스페이스 목록 조회 | 필요 |
| `POST` | `/workspaces` | 워크스페이스 생성 | 필요 |
| `GET` | `/workspaces/{workspace_id}` | 워크스페이스 상세 조회 | 필요 |
| `POST` | `/workspaces/{workspace_id}/invitations` | 워크스페이스 멤버 초대 | 필요 |
| `GET` | `/workspaces/{workspace_id}/invitations` | 워크스페이스의 보낸 초대 목록 | 필요(ADMIN 이상) |
| `DELETE` | `/workspaces/{workspace_id}/invitations/{invitation_id}` | PENDING 초대 취소 | 필요(ADMIN 이상) |
| `POST` | `/workspaces/{workspace_id}/invite` | 워크스페이스 멤버 초대(호환 경로) | 필요 |
| `GET` | `/workspaces/{workspace_id}/meetings` | 워크스페이스 회의 목록 조회 | 필요 |
| `POST` | `/workspaces/{workspace_id}/meetings` | 회의 생성 | 필요 |
| `GET` | `/workspaces/{workspace_id}/meetings/{meeting_id}` | 회의 상세 조회 | 필요 |
| `PATCH` | `/workspaces/{workspace_id}/meetings/{meeting_id}` | 회의 수정/상태 변경 | 필요 |
| `DELETE` | `/workspaces/{workspace_id}/meetings/{meeting_id}` | 회의 삭제 | 필요 |
| `GET` | `/workspaces/{workspace_id}/issues` | 워크스페이스 전체 이슈 목록 조회 | 필요 |
| `GET` | `/meetings/{meeting_id}/issues` | 특정 회의 이슈 목록 조회 | 필요 |
| `GET` | `/workspaces/{workspace_id}/members` | 워크스페이스 멤버 목록 조회 | 필요 |
| `PATCH` | `/workspaces/{workspace_id}/members/{target_user_id}` | 멤버 role 변경 | 필요 |
| `PUT` | `/workspaces/{workspace_id}/members/{target_user_id}` | 멤버 role 변경(PATCH와 동일) | 필요 |
| `DELETE` | `/workspaces/{workspace_id}/members/{target_user_id}` | 멤버 제거 또는 본인 나가기 | 필요 |
| `GET` | `/issues/` | 이슈 목록 조회(호환용). meeting_id query 필요 | 필요 |
| `POST` | `/issues/` | 이슈 생성 | 필요 |
| `GET` | `/issues/{issue_id}` | 이슈 상세 조회 | 필요 |
| `PATCH` | `/issues/{issue_id}` | 이슈 일반 수정 | 필요 |
| `DELETE` | `/issues/{issue_id}` | 이슈 삭제 | 필요 |
| `GET` | `/issues/{issue_id}/events` | 이슈 이벤트 목록 조회 | 필요 |
| `PATCH` | `/issues/{issue_id}/state` | 이슈 상태 변경 | 필요 |
| `GET` | `/alerts/` | 알림 목록 조회. meeting_id query 필요. 미전달 시 400 | 필요 |
| `POST` | `/alerts/` | 알림 생성 및 Redis publish | 필요 |
| `GET` | `/alerts/{alert_id}` | 알림 상세 조회 | 필요 |
| `PATCH` | `/alerts/{alert_id}` | 알림 일반 수정 | 필요 |
| `DELETE` | `/alerts/{alert_id}` | 알림 삭제 | 필요 |
| `PATCH` | `/alerts/{alert_id}/acknowledge` | 알림 읽음 처리 | 필요 |
| `PATCH` | `/alerts/{alert_id}/dismiss` | 알림 숨김/무시 처리 | 필요 |
| `PATCH` | `/alerts/{alert_id}/resolve` | 알림 해결 처리 | 필요 |
| `GET` | `/documents/` | 문서 목록 조회. meeting_id 또는 workspace_id query 필요 | 필요 |
| `POST` | `/documents/upload` | 문서 업로드. meeting_id 또는 workspace_id query 필요 | 필요 |
| `GET` | `/documents/{document_id}` | 문서 상세 조회 | 필요 |
| `POST` | `/documents/{document_id}/process` | 문서 파싱/청킹/임베딩 처리 | 필요 |
| `GET` | `/documents/{document_id}/chunks` | 문서 청크 목록 조회 | 필요 |
| `DELETE` | `/documents/{document_id}` | 문서 삭제 | 필요 |
| `POST` | `/rag/search` | 워크스페이스 유사도 검색 (문서/발화/안건) | 필요 |
| `GET` | `/meetings/{meeting_id}/topics` | 회의 안건(Topic) 목록 조회 | 필요 |
| `GET` | `/topics/{topic_id}` | 안건 상세 조회 | 필요 |
| `GET` | `/topics/{topic_id}/events` | 안건 이벤트(누가 언제 재논의했는지) 조회 | 필요 |
| `PATCH` | `/topics/{topic_id}/state` | 안건 상태 수동 변경 | 필요 |
| `GET` | `/stt-results/` | STT 결과 목록 조회 | 필요 |
| `POST` | `/stt-results/` | STT 처리 결과 생성 | 필요 |
| `GET` | `/stt-results/{stt_result_id}` | STT 결과 상세 조회 | 필요 |
| `GET` | `/stt-results/{stt_result_id}/transcript` | 화자 결합 transcript 조회 | 필요 |
| `PATCH` | `/stt-results/{stt_result_id}` | STT 결과 수정 | 필요 |
| `DELETE` | `/stt-results/{stt_result_id}` | STT 결과 삭제 | 필요 |
| `GET` | `/utterances/` | 발화 목록 조회. stt_result_id로 필터 가능 | 필요 |
| `POST` | `/utterances/` | 발화 생성 | 필요 |
| `GET` | `/utterances/{utterance_id}` | 발화 상세 조회 | 필요 |
| `PATCH` | `/utterances/{utterance_id}` | 발화 수정 | 필요 |
| `DELETE` | `/utterances/{utterance_id}` | 발화 삭제 | 필요 |

## 기본

### GET /

- 설명: 서버 루트 상태 확인
- 인증: 불필요
- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "status": "ok",
    "service": "fastapi-backend",
    "version": "1.0.0"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /health

- 설명: 헬스 체크
- 인증: 불필요
- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {}
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Auth

### POST /auth/invitations/accept

- 설명: 초대 토큰으로 수락
- 인증: 필요
- Request Body: `application/json`

```json
{
  "token": "TOKEN"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "invitation_id": 1,
    "workspace_id": 1,
    "user_id": 1,
    "role": "MEMBER",
    "status": "ACCEPTED"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /auth/me

- 설명: 현재 로그인 사용자 정보 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `authorization` | header | N | string |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "userId": 1,
    "name": "string",
    "userName": "string",
    "email": "user@example.com",
    "organization_team_name": "string"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /auth/refresh

- 설명: Access Token 재발급
- 인증: 불필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `authorization` | header | N | string |  |

- Request Body: `application/json`

```json
{
  "refreshToken": "TOKEN",
  "accessToken": "TOKEN"
}
```

- Success: `200`

```json
{
  "success": true,
  "access_token": "TOKEN",
  "refresh_token": "TOKEN",
  "accessToken": "TOKEN",
  "refreshToken": "TOKEN",
  "token_type": "bearer",
  "message": "string",
  "userId": 1,
  "name": "string",
  "userName": "string",
  "email": "user@example.com"
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /auth/register

- 설명: 회원가입 및 기본 워크스페이스 생성
- 인증: 불필요
- Request Body: `application/json`

```json
{
  "name": "string",
  "email": "user@example.com",
  "birth_date": "2000-01-01",
  "password": "Password123!",
  "password_confirm": "Password123!",
  "organization_team_name": "string",
  "terms_agreed": true,
  "terms_version": "string"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "string",
    "email": "user@example.com",
    "birth_date": "2000-01-01",
    "organization_team_name": "string",
    "terms_agreed": true,
    "terms_agreed_at": "2026-06-17T12:00:00+09:00",
    "terms_version": "string",
    "created_at": "2026-06-17T12:00:00+09:00",
    "updated_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /login

- 설명: 로그인 및 토큰 발급
- 인증: 불필요
- Request Body: `application/json`

```json
{
  "email": "user@example.com",
  "user_id": "string",
  "password": "Password123!",
  "rememberMe": true
}
```

- Success: `200`

```json
{
  "access_token": "TOKEN",
  "refresh_token": "TOKEN",
  "accessToken": "TOKEN",
  "refreshToken": "TOKEN",
  "token_type": "bearer",
  "defaultWorkspaceId": 1,
  "userId": 1,
  "name": "string",
  "userName": "string",
  "email": "user@example.com"
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Workspace

### GET /workspace-invitations/me

- 설명: 내가 받은 PENDING 초대 목록 조회
- 인증: 필요
- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "workspace_name": "string",
      "invited_email": "user@example.com",
      "invited_by_user_id": 1,
      "invited_by_user_name": "string",
      "invited_by_user_email": "user@example.com",
      "role": "MEMBER",
      "status": "PENDING",
      "expires_at": "2026-06-17T12:00:00+09:00",
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /workspace-invitations/{invitation_id}/accept

- 설명: 초대 수락
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `invitation_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "invitation_id": 1,
    "workspace_id": 1,
    "user_id": 1,
    "role": "MEMBER",
    "status": "ACCEPTED"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /workspace-invitations/{invitation_id}/reject

- 설명: 초대 거절
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `invitation_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "invitation_id": 1,
    "status": "REJECTED"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces

- 설명: 내가 참여 중인 워크스페이스 목록 조회
- 인증: 필요
- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "name": "string",
      "owner_user_id": 1,
      "my_role": "string",
      "canInviteMember": true,
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /workspaces

- 설명: 워크스페이스 생성
- 인증: 필요
- Request Body: `application/json`

```json
{
  "name": "string"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "string",
    "owner_user_id": 1,
    "my_role": "string",
    "canInviteMember": true,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces/{workspace_id}

- 설명: 워크스페이스 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "string",
    "owner_user_id": 1,
    "my_role": "string",
    "canInviteMember": true,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /workspaces/{workspace_id}/invitations

- 설명: 워크스페이스 멤버 초대
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "email": "user@example.com",
  "role": "MEMBER"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "invited_email": "user@example.com",
    "invited_user_id": 1,
    "invited_by_user_id": 1,
    "role": "MEMBER",
    "token": "TOKEN",
    "status": "PENDING",
    "expires_at": "2026-06-17T12:00:00+09:00",
    "created_at": "2026-06-17T12:00:00+09:00",
    "accepted_at": null
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces/{workspace_id}/invitations

- 설명: OWNER/ADMIN이 해당 Workspace의 보낸 초대 전체 이력을 조회
- 인증/권한: 필요, `ADMIN` 이상
- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "invited_email": "user@example.com",
      "invited_user_id": 2,
      "invited_by_user_id": 1,
      "role": "MEMBER",
      "status": "PENDING",
      "expires_at": "2026-06-24T12:00:00+09:00",
      "created_at": "2026-06-23T12:00:00+09:00",
      "accepted_at": null
    }
  ]
}
```

### DELETE /workspaces/{workspace_id}/invitations/{invitation_id}

- 설명: OWNER/ADMIN이 해당 Workspace의 `PENDING` 초대를 취소
- 인증/권한: 필요, `ADMIN` 이상
- 처리: 감사 이력 보존을 위해 행을 삭제하지 않고 status를 `CANCELLED`로 변경
- Success: `200`

```json
{
  "status": "success",
  "data": {
    "invitation_id": 1,
    "status": "CANCELLED"
  }
}
```

- 주요 오류: `403` 권한 없음, `404` 초대 없음, `409` 이미 처리/만료된 초대

### POST /workspaces/{workspace_id}/invite

- 설명: 워크스페이스 멤버 초대(호환 경로)
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "email": "user@example.com",
  "role": "MEMBER"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "invited_email": "user@example.com",
    "invited_user_id": 1,
    "invited_by_user_id": 1,
    "role": "MEMBER",
    "token": "TOKEN",
    "status": "PENDING",
    "expires_at": "2026-06-17T12:00:00+09:00",
    "created_at": "2026-06-17T12:00:00+09:00",
    "accepted_at": null
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces/{workspace_id}/meetings

- 설명: 워크스페이스 회의 목록 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `page` | query | N | integer |  |
| `size` | query | N | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "workspaceId": 1,
    "page": 1,
    "size": 1,
    "meetings": [
      {
        "id": 1,
        "workspace_id": 1,
        "title": "string",
        "description": null,
        "status": "READY",
        "scheduled_at": null,
        "started_at": null,
        "ended_at": null,
        "created_at": "2026-06-17T12:00:00+09:00"
      }
    ]
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /workspaces/{workspace_id}/meetings

- 설명: 회의 생성
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "title": "string",
  "status": "READY"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "title": "string",
    "description": null,
    "status": "READY",
    "scheduled_at": null,
    "started_at": null,
    "ended_at": null,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces/{workspace_id}/meetings/{meeting_id}

- 설명: 회의 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `meeting_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "title": "string",
    "description": null,
    "status": "READY",
    "scheduled_at": null,
    "started_at": null,
    "ended_at": null,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /workspaces/{workspace_id}/meetings/{meeting_id}

- 설명: 회의 수정/상태 변경
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `meeting_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "title": "string",
  "status": "ACTIVE"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "title": "string",
    "description": null,
    "status": "ACTIVE",
    "scheduled_at": null,
    "started_at": "2026-06-17T12:00:00+09:00",
    "ended_at": null,
    "created_at": "2026-06-17T11:50:00+09:00"
  }
}
```

- 상태를 `ACTIVE`로 변경하면 `started_at`이 비어 있을 때 현재 시각으로 자동 저장됩니다.
- 상태를 `ENDED`로 변경하면 `ended_at`이 비어 있을 때 현재 시각으로 자동 저장됩니다.
- 상태 변경 성공 시 `REDIS_URL`이 설정된 경우 FastAPI가 Node.js 서버에 위치한 Redis의 `meeting.updated` 채널로 이벤트를 publish합니다.

Node.js Redis publish payload:

```json
{
  "type": "meeting.updated",
  "payload": {
    "id": 1,
    "meeting_id": 1,
    "meetingId": 1,
    "workspace_id": 1,
    "workspaceId": 1,
    "title": "string",
    "description": null,
    "status": "ACTIVE",
    "previous_status": "READY",
    "previousStatus": "READY",
    "scheduled_at": null,
    "scheduledAt": null,
    "started_at": "2026-06-17T12:00:00+09:00",
    "startedAt": "2026-06-17T12:00:00+09:00",
    "ended_at": null,
    "endedAt": null,
    "created_at": "2026-06-17T11:50:00+09:00",
    "createdAt": "2026-06-17T11:50:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /workspaces/{workspace_id}/meetings/{meeting_id}

- 설명: 회의 삭제
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `meeting_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "title": "string",
    "description": null,
    "status": "READY",
    "scheduled_at": null,
    "started_at": null,
    "ended_at": null,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /workspaces/{workspace_id}/members

- 설명: 워크스페이스 멤버 목록 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "user_id": 1,
      "name": "string",
      "email": "user@example.com",
      "role": "MEMBER",
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /workspaces/{workspace_id}/members/{target_user_id}

- 설명: 멤버 role 변경
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `target_user_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "role": "ADMIN"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "user_id": 1,
    "name": "string",
    "email": "user@example.com",
    "role": "MEMBER",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PUT /workspaces/{workspace_id}/members/{target_user_id}

- 설명: 멤버 role 변경(PATCH와 동일)
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `target_user_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "role": "ADMIN"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "user_id": 1,
    "name": "string",
    "email": "user@example.com",
    "role": "MEMBER",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /workspaces/{workspace_id}/members/{target_user_id}

- 설명: 멤버 제거 또는 본인 나가기
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer |  |
| `target_user_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {}
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Issue

### GET /workspaces/{workspace_id}/issues

- 설명: 워크스페이스 전체 이슈 목록 조회. 대시보드/워크스페이스 이슈 탭에서 사용합니다.
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `workspace_id` | path | Y | integer | 워크스페이스 ID |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "title": "string",
      "description": "string",
      "meeting_id": 1,
      "status": "OPEN",
      "priority": "LOW",
      "due_date": "2026-06-17T12:00:00+09:00",
      "assignee_id": 1,
      "id": 1,
      "workspaceId": 1,
      "created_at": "2026-06-17T12:00:00+09:00",
      "updated_at": "2026-06-17T12:00:00+09:00",
      "deleted_at": null
    }
  ]
}
```

- 주요 오류: workspace가 없으면 `404`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /meetings/{meeting_id}/issues

- 설명: 특정 회의 이슈 목록 조회. 회의 상세 페이지에서 사용합니다.
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `meeting_id` | path | Y | integer | 회의 ID |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "title": "string",
      "description": "string",
      "meeting_id": 1,
      "status": "OPEN",
      "priority": "LOW",
      "due_date": "2026-06-17T12:00:00+09:00",
      "assignee_id": 1,
      "id": 1,
      "workspaceId": 1,
      "created_at": "2026-06-17T12:00:00+09:00",
      "updated_at": "2026-06-17T12:00:00+09:00",
      "deleted_at": null
    }
  ]
}
```

- 주요 오류: meeting이 없으면 `404`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /issues/

- 설명: 기존 호환용 이슈 목록 조회. 신규 클라이언트/Node는 `GET /workspaces/{workspace_id}/issues` 또는 `GET /meetings/{meeting_id}/issues` 사용을 권장합니다.
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `meeting_id` | query | Y | integer | 회의 ID |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "title": "string",
      "description": "string",
      "meeting_id": 1,
      "status": "OPEN",
      "priority": "LOW",
      "due_date": "2026-06-17T12:00:00+09:00",
      "assignee_id": 1,
      "id": 1,
      "workspaceId": 1,
      "created_at": "2026-06-17T12:00:00+09:00",
      "updated_at": "2026-06-17T12:00:00+09:00",
      "deleted_at": null
    }
  ]
}
```

- 주요 오류: `meeting_id`가 없으면 `400`, meeting이 없으면 `404`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /issues/

- 설명: 이슈 생성
- 인증: 필요
- Request Body: `application/json`

```json
{
  "title": "string",
  "description": "string",
  "meeting_id": 1,
  "status": "OPEN",
  "priority": "LOW",
  "due_date": "2026-06-17T12:00:00+09:00",
  "assignee_id": 1
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "title": "string",
    "description": "string",
    "meeting_id": 1,
    "status": "OPEN",
    "priority": "LOW",
    "due_date": "2026-06-17T12:00:00+09:00",
    "assignee_id": 1,
    "id": 1,
    "workspaceId": 1,
    "created_at": "2026-06-17T12:00:00+09:00",
    "updated_at": "2026-06-17T12:00:00+09:00",
    "deleted_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /issues/{issue_id}

- 설명: 이슈 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `issue_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "title": "string",
    "description": "string",
    "meeting_id": 1,
    "status": "OPEN",
    "priority": "LOW",
    "due_date": "2026-06-17T12:00:00+09:00",
    "assignee_id": 1,
    "id": 1,
    "workspaceId": 1,
    "created_at": "2026-06-17T12:00:00+09:00",
    "updated_at": "2026-06-17T12:00:00+09:00",
    "deleted_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /issues/{issue_id}

- 설명: 이슈 일반 수정
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `issue_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "title": "string",
  "description": "string",
  "priority": "LOW",
  "due_date": "2026-06-17T12:00:00+09:00",
  "assignee_id": 1,
  "meeting_id": 1
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "title": "string",
    "description": "string",
    "meeting_id": 1,
    "status": "OPEN",
    "priority": "LOW",
    "due_date": "2026-06-17T12:00:00+09:00",
    "assignee_id": 1,
    "id": 1,
    "workspaceId": 1,
    "created_at": "2026-06-17T12:00:00+09:00",
    "updated_at": "2026-06-17T12:00:00+09:00",
    "deleted_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /issues/{issue_id}

- 설명: 이슈 삭제
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `issue_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "title": "string",
    "description": "string",
    "meeting_id": 1,
    "status": "OPEN",
    "priority": "LOW",
    "due_date": "2026-06-17T12:00:00+09:00",
    "assignee_id": 1,
    "id": 1,
    "workspaceId": 1,
    "created_at": "2026-06-17T12:00:00+09:00",
    "updated_at": "2026-06-17T12:00:00+09:00",
    "deleted_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /issues/{issue_id}/events

- 설명: 이슈 이벤트 목록 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `issue_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "issue_id": 1,
      "meeting_id": 1,
      "event_type": "string",
      "from_state": "string",
      "to_state": "string",
      "reason": "string",
      "evidence": "string",
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /issues/{issue_id}/state

- 설명: 이슈 상태 변경
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `issue_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "to_state": "OPEN",
  "meeting_id": 1,
  "reason": "string",
  "evidence": "string"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "issue_id": 1,
    "from_state": "string",
    "to_state": "string",
    "event_type": "string",
    "changed_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Alert

### GET /alerts/

- 설명: 알림 목록 조회. meeting_id query 필요. 미전달 시 400
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `meeting_id` | query | N | string |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "meeting_id": 1,
      "message": "string",
      "level": "info",
      "status": "PENDING",
      "issue_id": 1,
      "id": 1,
      "workspace_id": 1,
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /alerts/

- 설명: 알림 생성 및 Redis publish
- 인증: 필요
- Request Body: `application/json`

```json
{
  "meeting_id": 1,
  "message": "string",
  "level": "info",
  "status": "PENDING",
  "issue_id": 1
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "PENDING",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /alerts/{alert_id}

- 설명: 알림 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "PENDING",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /alerts/{alert_id}

- 설명: 알림 일반 수정
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "meeting_id": 1,
  "message": "string",
  "level": "info",
  "status": "PENDING",
  "issue_id": 1
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "PENDING",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /alerts/{alert_id}

- 설명: 알림 삭제
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `204`

응답 본문 없음.

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /alerts/{alert_id}/acknowledge

- 설명: 알림 읽음 처리
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "ACKNOWLEDGED",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /alerts/{alert_id}/dismiss

- 설명: 알림 숨김/무시 처리
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "DISMISSED",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /alerts/{alert_id}/resolve

- 설명: 알림 해결 처리
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `alert_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "meeting_id": 1,
    "message": "string",
    "level": "info",
    "status": "RESOLVED",
    "issue_id": 1,
    "id": 1,
    "workspace_id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Document

Document는 기존 회의 페이지 문서 업로드를 유지하면서, 문서 탭/대시보드용 워크스페이스 단위 문서 기능을 확장합니다.

- 회의 페이지: `meeting_id` 기준으로 업로드/조회합니다.
- 문서 탭/대시보드: `workspace_id` 기준으로 업로드/조회합니다.
- `meeting_id`가 `null`이면 워크스페이스 단위 문서입니다.
- 모든 Document 응답에는 `workspace_id`가 포함됩니다.

### GET /documents/

- 설명: 문서 목록 조회. `meeting_id` 또는 `workspace_id` 중 하나가 필요합니다.
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `meeting_id` | query | N | integer | 특정 회의 문서만 조회 |
| `workspace_id` | query | N | integer | 특정 워크스페이스 전체 문서 조회 |

- Request Body: 없음

- Success: `200`

회의 페이지 조회 예시:

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

문서 탭/대시보드 조회 예시:

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

- 주요 오류:
  - `400`: `meeting_id`와 `workspace_id`가 모두 없거나, meeting이 workspace에 속하지 않음
  - `401`: 인증 실패
  - `403`: workspace 접근 권한 없음
  - `404`: meeting 또는 workspace 없음
  - `422`: 입력값 검증 실패

### POST /documents/upload

- 설명: 문서 업로드. `meeting_id` 또는 `workspace_id` 중 하나가 필요합니다.
- 인증: 필요
- 지원 형식: `.txt`, `.md`, `.csv`, `.docx`, `.pdf`
- 기본 최대 크기: `50MB` (`DOCUMENT_MAX_UPLOAD_MB` 환경변수로 조정)
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `meeting_id` | query | N | integer | 기존 회의 페이지 업로드 |
| `workspace_id` | query | N | integer | 문서 탭/대시보드 워크스페이스 업로드 |

- Request Body: `multipart/form-data`

```json
{
  "file": "<file>"
}
```

- Success: `201`

회의 페이지 업로드 응답:

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

문서 탭/대시보드 업로드 응답:

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

- 주요 오류:
  - `400`: 식별자 누락 또는 빈 파일
  - `401`: 인증 실패
  - `403`: workspace 접근 권한 없음
  - `404`: meeting 또는 workspace 없음
  - `413`: 최대 문서 크기 초과
  - `415`: 지원하지 않는 확장자

### GET /documents/{document_id}

- 설명: 문서 상세 조회
- 인증: 필요
- 문서 ID만으로 조회하며, 서버가 문서의 `workspace_id`를 기준으로 현재 사용자의 접근 권한을 확인합니다. 목록 조회처럼 `meeting_id`/`workspace_id` query를 다시 보내지 않습니다.
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `document_id` | path | Y | integer | 문서 ID |

- Request Body: 없음

- Success: `200`

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

### DELETE /documents/{document_id}

- 설명: 문서 삭제
- 인증: 필요
- 문서 ID만으로 삭제하며, 서버가 문서의 `workspace_id`를 기준으로 현재 사용자의 접근 권한을 확인합니다. 성공 시 연결 범위(`meeting_id` 값)는 서버가 원자적으로 함께 삭제합니다.
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `document_id` | path | Y | integer | 문서 ID |

- Request Body: 없음

- Success: `204`

응답 본문 없음.

## STT Result

STT Result와 Utterance의 차이:

- **STT Result**: Workspace 안 Meeting 페이지에 귀속되는, 회의 하나의 STT 처리 단위입니다. `raw_text`(원문 전체)와 처리 `status`(`PENDING -> PROCESSING -> COMPLETED`/`FAILED`)를 가지며, `POST /stt-results/`는 원문 텍스트 하나를 받아 문장 단위로 분리한 뒤 그 결과인 `Utterance`들을 서버가 자동으로 생성하는 파이프라인 엔드포인트입니다.
- **Utterance**: 하나의 STT Result에 속한 개별 발화(문장) 단위입니다. `GET/POST/PATCH/DELETE /utterances/`는 이미 존재하는 `stt_result_id`에 딸린 발화 한 건을 직접 조회/생성/수정/삭제하는 저수준 CRUD입니다. 즉 `POST /stt-results/`가 "원문 텍스트를 넣고 발화들을 일괄 생성"하는 엔드포인트라면, `POST /utterances/`는 "이미 있는 STT Result 밑에 발화 한 건을 수동으로 추가"하는 엔드포인트입니다. Phase 3 실시간 STT 파이프라인(`POST /realtime/meetings/{meeting_id}/chunks`)이 청크를 저장할 때도 내부적으로 Utterance를 만들지만, 클라이언트가 `/utterances/`를 직접 호출하는 것이 아니라 realtime 엔드포인트를 통해서만 생성됩니다.
- `stt_results` -> `utterances`는 1:N이며, STT Result가 삭제되면 소속 Utterance와 AnalysisResult도 함께 삭제됩니다(`DELETE /stt-results/{stt_result_id}`).
- 화자 라벨이 결합된 전체 대화록은 `GET /stt-results/{stt_result_id}/transcript`로 조회합니다 (Phase 4 섹션 참조).
- `document_id`는 더 이상 STT Result에 존재하지 않습니다. STT Result는 Meeting에 귀속된 리소스이고, Document(사용자 첨부 문서)는 별개의 도메인이라 두 리소스를 직접 연결할 근거가 없어 컬럼을 제거했습니다.

### GET /stt-results/?meeting_id={meeting_id}

- 설명: STT 결과 목록 조회
- 인증: 필요
- `meeting_id`: query, 필수. 해당 Meeting의 STT 결과만 반환
- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "workspace_id": 1,
      "meeting_id": 1,
      "language": "string",
      "raw_text": "string",
      "status": "PENDING",
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /stt-results/

- 설명: STT 처리 결과 생성. `raw_text`를 문장 단위로 분리해 `Utterance`를 함께 생성한다.
- 인증: 필요
- Request Body: `application/json`

```json
{
  "meeting_id": 1,
  "language": "string",
  "raw_text": "string"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 1,
    "language": "string",
    "raw_text": "string",
    "status": "COMPLETED",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

성공 후 아래 payload로 `stt.created` 이벤트를 Redis Pub/Sub으로 발행합니다. HTTP 응답 바디는 변경되지 않으며, 이 payload는 Redis로 발행되는 별도 이벤트입니다.

```json
{
  "type": "stt.created",
  "workspace_id": 1,
  "meeting_id": 1,
  "stt_result_id": 1,
  "status": "COMPLETED",
  "utterance_count": 2
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /stt-results/{stt_result_id}

- 설명: STT 결과 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `stt_result_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 1,
    "language": "string",
    "raw_text": "string",
    "status": "PENDING",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /stt-results/{stt_result_id}

- 설명: STT 결과 수정
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `stt_result_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "language": "string",
  "raw_text": "string",
  "status": "PROCESSING"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "id": 1,
    "workspace_id": 1,
    "meeting_id": 1,
    "language": "string",
    "raw_text": "string",
    "status": "PROCESSING",
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

성공 후 아래 payload로 `stt.updated` 이벤트를 Redis Pub/Sub으로 발행합니다. HTTP 응답 바디는 변경되지 않으며, 이 payload는 Redis로 발행되는 별도 이벤트입니다.

```json
{
  "type": "stt.updated",
  "workspace_id": 1,
  "meeting_id": 1,
  "stt_result_id": 1,
  "status": "PROCESSING",
  "changed_fields": ["status"]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /stt-results/{stt_result_id}

- 설명: STT 결과 삭제
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `stt_result_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `204`

응답 본문 없음.

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Utterance

### GET /utterances/

- 설명: 발화 목록 조회. stt_result_id로 필터 가능
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `stt_result_id` | query | N | string |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "stt_result_id": 1,
      "sequence": 1,
      "start_ms": 1,
      "end_ms": 1,
      "speaker_label": "string",
      "text": "string",
      "id": 1,
      "created_at": "2026-06-17T12:00:00+09:00"
    }
  ]
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### POST /utterances/

- 설명: 발화 생성
- 인증: 필요
- Request Body: `application/json`

```json
{
  "stt_result_id": 1,
  "sequence": 1,
  "start_ms": 1,
  "end_ms": 1,
  "speaker_label": "string",
  "text": "string"
}
```

- Success: `201`

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "sequence": 1,
    "start_ms": 1,
    "end_ms": 1,
    "speaker_label": "string",
    "text": "string",
    "id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### GET /utterances/{utterance_id}

- 설명: 발화 상세 조회
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `utterance_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "sequence": 1,
    "start_ms": 1,
    "end_ms": 1,
    "speaker_label": "string",
    "text": "string",
    "id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### PATCH /utterances/{utterance_id}

- 설명: 발화 수정
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `utterance_id` | path | Y | integer |  |

- Request Body: `application/json`

```json
{
  "stt_result_id": 1,
  "sequence": 1,
  "start_ms": 1,
  "end_ms": 1,
  "speaker_label": "string",
  "text": "string"
}
```

- Success: `200`

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "sequence": 1,
    "start_ms": 1,
    "end_ms": 1,
    "speaker_label": "string",
    "text": "string",
    "id": 1,
    "created_at": "2026-06-17T12:00:00+09:00"
  }
}
```

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

### DELETE /utterances/{utterance_id}

- 설명: 발화 삭제
- 인증: 필요
- 파라미터:

| 이름 | 위치 | 필수 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| `utterance_id` | path | Y | integer |  |

- Request Body: 없음

- Success: `204`

응답 본문 없음.

- 주요 오류: 공통 오류 코드 참조. 입력값 오류는 `422`, 인증 오류는 `401`, 권한 오류는 `403`을 우선 확인합니다.

## Phase 4: RAG / 화자 분리 / 재논의 탐지 (v0.4.0 신규)

### 임베딩과 pgvector

- 임베딩은 `EMBEDDING_PROVIDER` 환경변수로 선택합니다. 기본값 `hash`는 외부 의존성/API 키 없이 동작하는 결정적 feature-hashing 임베딩(차원 `EMBEDDING_DIM`, 기본 256)입니다. 시맨틱 임베딩 provider로 교체해도 저장/검색 파이프라인은 그대로 사용합니다.
- Postgres 이미지는 `pgvector/pgvector:pg16`을 사용합니다(docker-compose 반영됨, 기존 볼륨과 호환). 서버 기동 시 `CREATE EXTENSION vector`를 시도해 성공하면 `document_chunks.embedding_vec vector(256)` 컬럼과 HNSW 코사인 인덱스를 만들고 검색을 Postgres 내부에서 수행합니다. 확장이 없는 환경에서는 자동으로 Python 코사인 폴백으로 동작합니다(기능 동일, 로그로 경고).
- 재논의 판단 임계값 `REDISCUSSION_SIMILARITY_THRESHOLD`의 기본값 0.4는 hash provider 기준으로 보정된 값입니다(유사 발화 0.4+, 무관 발화 0.1 미만). 시맨틱 provider 도입 시 0.8 수준으로 올리는 것을 권장합니다.

### POST /documents/{document_id}/process

- 설명: 업로드된 문서를 파싱해 문장 경계 기준으로 청킹하고, 각 청크를 임베딩해 저장합니다. 지원 형식: `.txt`, `.md`, `.csv`, `.docx`, `.pdf`. 문서 상태는 상태 머신을 따라 `UPLOADED/FAILED -> PROCESSING -> PROCESSED/FAILED`로 전이됩니다.
- 인증: 필요
- Request Body: 없음
- Success: `200`

```json
{
  "status": "success",
  "data": {
    "document_id": 1,
    "status": "PROCESSED",
    "chunk_count": 4
  }
}
```

성공 후 `document.processed` 이벤트를 Redis로 발행합니다(`workspace_id`, `meeting_id`, `document_id`, `status`, `chunk_count` 포함).

- 주요 오류: 파싱 불가/미지원 형식/빈 문서는 `422`(문서 상태는 `FAILED`로 전이), 이미 처리 중이면 `409`, 문서 없음 `404`.

### GET /documents/{document_id}/chunks

- 설명: 처리된 문서의 청크 목록 조회 (chunk_index 오름차순)
- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "document_id": 1,
      "chunk_index": 1,
      "text": "청크 텍스트",
      "created_at": "2026-07-07T12:00:00+09:00"
    }
  ]
}
```

### POST /rag/search

- 설명: 워크스페이스 범위 유사도 검색. 질의를 임베딩해 문서 청크(pgvector), 발화, 안건과 비교합니다.
- 인증: 필요 (워크스페이스 접근 권한 검사)
- Request Body:

```json
{
  "workspace_id": 1,
  "query": "로그인 기능 언제까지 하기로 했지",
  "top_k": 5,
  "target": "documents"
}
```

- `target`: `documents`(기본) | `utterances` | `topics` | `all`
- `top_k`: 1~50, 기본 `RAG_SEARCH_TOP_K`(5)
- Success: `200`

```json
{
  "status": "success",
  "data": {
    "query": "로그인 기능 언제까지 하기로 했지",
    "target": "documents",
    "results": [
      {
        "type": "document_chunk",
        "id": 3,
        "document_id": 1,
        "chunk_index": 3,
        "text": "로그인 기능은 이번 주까지 완료하기로 합니다.",
        "score": 0.2157
      }
    ]
  }
}
```

`type`별 추가 필드: `utterance`는 `stt_result_id`, `speaker_label`, `topic`은 `meeting_id`, `status`, `proposed_by`. `score`는 코사인 유사도(높을수록 유사).

### 화자 분리 (Speaker Diarization 연동)

Diarization(음성에서 화자 구간 분리) 자체는 클라이언트/STT 엔진에서 수행하고, 서버는 chunk에 실린 화자 정보를 받아 회의 단위로 클러스터링합니다.

- `POST /realtime/meetings/{meeting_id}/chunks` 요청 필드에 `speaker_embedding`(float 배열, 최대 2048차원, 선택)이 추가되었습니다.
- `speaker_embedding`이 있으면: 회의의 기존 speaker centroid들과 코사인 비교해 `SPEAKER_SIMILARITY_THRESHOLD`(기본 0.75) 이상이면 같은 화자로 묶고, 아니면 새 프로필(`Speaker N`)을 만듭니다. centroid는 발화가 쌓일 때마다 running mean으로 갱신됩니다.
- `speaker_embedding` 없이 `speaker_label`만 있으면: 같은 원본 라벨을 같은 canonical 라벨로 매핑합니다.
- 둘 다 없으면 `Unknown`으로 저장됩니다.
- 발화의 `speaker_label`에는 항상 canonical 라벨(`Speaker 1`, `Speaker 2`, …, `Unknown`)이 저장됩니다.

### GET /stt-results/{stt_result_id}/transcript

- 설명: STT 결과와 화자 라벨을 결합한 transcript. 발화를 sequence 순으로 `[Speaker N]: 텍스트` 형태로 반환합니다.
- Success: `200`

```json
{
  "status": "success",
  "data": {
    "stt_result_id": 1,
    "meeting_id": 7,
    "workspace_id": 1,
    "line_count": 2,
    "lines": [
      "[Speaker 1]: 이 기능 다음 분기에 적용하죠",
      "[Speaker 2]: 네 좋습니다"
    ],
    "text": "[Speaker 1]: 이 기능 다음 분기에 적용하죠\n[Speaker 2]: 네 좋습니다"
  }
}
```

### 안건(Topic)과 재논의 탐지

실시간 파이프라인이 final 발화를 저장할 때마다 상태 머신 기반 판단 로직이 실행됩니다.

상태 머신: `PROPOSED -> DECIDED | DROPPED`, `DECIDED -> REVISITED`, `REVISITED -> DECIDED | DROPPED`

1. **안건 추출(화자 기반)**: 발화가 결정 표현(`~하기로`, `결정`, `확정`, `적용하죠` 등)을 포함하면 `DECIDED` 안건, 제안 표현(`어떨까요`, `제안`, `논의` 등)을 포함하면 `PROPOSED` 안건을 생성합니다. `proposed_by`/`decided_by`에 화자 라벨이 기록됩니다.
2. **재논의 탐지**: 새 발화 임베딩이 기존 `DECIDED` 안건과 `REDISCUSSION_SIMILARITY_THRESHOLD` 이상 유사하면 안건을 `REVISITED`로 전이하고, `TOPIC_REVISITED` 이벤트에 **누가**(발화 화자) 재논의했는지 기록하며, `warning` 레벨 Alert를 자동 생성합니다.
3. **재확정**: `REVISITED` 안건과 유사한 결정 발화가 오면 `DECIDED`로 복귀(`decided_by` 갱신).

Redis/WebSocket 이벤트: `topic.created`, `topic.decided`, `topic.revisited`(+ 동반 `alert.created`), `topic.redecided`, `topic.updated`. 모든 payload에 `workspace_id`, `meeting_id`, `topic_id`, `status`가 포함되며 `topic.revisited`에는 `revisited_by`, `similarity`, `alert_id`가 추가됩니다.

### GET /meetings/{meeting_id}/topics

- 설명: 회의의 안건 목록. `status` query로 필터 가능 (`PROPOSED`/`DECIDED`/`REVISITED`/`DROPPED`)
- Success: `200`

```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "meeting_id": 7,
      "workspace_id": 1,
      "label": "로그인 기능은 이번 주까지 끝내기로 결정했습니다",
      "status": "DECIDED",
      "proposed_by": "Speaker 1",
      "decided_by": "Speaker 1",
      "source_utterance_id": 12,
      "created_at": "2026-07-07T12:00:00+09:00",
      "updated_at": "2026-07-07T12:00:00+09:00"
    }
  ]
}
```

### GET /topics/{topic_id} / GET /topics/{topic_id}/events

- `GET /topics/{topic_id}`: 안건 단건 조회 (위와 동일 스키마)
- `GET /topics/{topic_id}/events`: 안건 이력 조회. 재논의 추적의 근거 데이터로, 각 이벤트에 `event_type`(`TOPIC_PROPOSED`/`TOPIC_DECIDED`/`TOPIC_REVISITED`/`TOPIC_REDECIDED`/`TOPIC_STATE_CHANGED_MANUALLY`), `speaker_label`(누가), `utterance_id`(어느 발화로), `detail`(발화 내용), `created_at`(언제)이 담깁니다.

### PATCH /topics/{topic_id}/state

- 설명: 안건 상태 수동 변경. 상태 머신 규칙을 위반하는 전이는 `400`.
- Request Body:

```json
{
  "status": "DROPPED"
}
```

- Success: `200` (안건 스키마 반환). 성공 후 `topic.updated` 이벤트 발행.

## 주요 상태값

- Workspace role: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`
- 초대 role: `ADMIN`, `MEMBER`만 생성 가능
- 초대 status: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELLED`
- Meeting status: `READY`, `ACTIVE`, `ENDED`
- Issue state: `OPEN`, `IN_PROGRESS`, `CLOSED`
- Alert status: `PENDING`, `ACKNOWLEDGED`, `DISMISSED`, `RESOLVED`

상태 전이는 Meeting `READY -> ACTIVE -> ENDED`, Issue `OPEN -> IN_PROGRESS -> CLOSED`를 따릅니다. Alert는 `PENDING -> ACKNOWLEDGED/DISMISSED`, 확인된 Alert는 `ACKNOWLEDGED -> RESOLVED/DISMISSED`를 허용합니다.
- Document status: `UPLOADED`, `PROCESSING`, `PROCESSED`, `FAILED`
- STT result status: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- Topic status: `PROPOSED`, `DECIDED`, `REVISITED`, `DROPPED` (`PROPOSED -> DECIDED/DROPPED`, `DECIDED -> REVISITED`, `REVISITED -> DECIDED/DROPPED`)
- Speaker label: `Speaker 1`, `Speaker 2`, …, `Unknown` (회의 단위 canonical 라벨)

## 클라이언트 주의사항

### Phase 3 실시간 STT

- STT 전송: `POST http://{node-host}:3001/api/meetings/{meeting_id}/stt-chunks`
- WebSocket: `ws://{node-host}:3001/ws/meetings/{meeting_id}?token={access_token}`
- FastAPI 내부 수신: `POST /realtime/meetings/{meeting_id}/chunks`
- 접근 검증: `GET /realtime/meetings/{meeting_id}/access`
- 분석 계약: `POST /realtime/analysis/realtime` (`X-Analysis-Secret` 헤더 필수)
- 분석 callback: `POST /realtime/analysis-results` (`X-Analysis-Secret` 필수)

`is_final=false`는 `utterance.partial`만 전송하며 저장하지 않습니다.
`is_final=true`는 utterance를 저장하고 DB의 최근 N개 발언으로 context를 만들어
분석 endpoint에 전달합니다. 이벤트는 Redis Stream에 저장되며 `event_id`,
`event.ack`, `last_event_id` 기반 replay를 지원합니다.

v0.4.0부터 chunk에 `speaker_embedding`(선택)을 실으면 서버가 화자 클러스터링으로
`Speaker N` canonical 라벨을 부여하고, final 발화 저장 직후 안건 추출/재논의 탐지가
실행되어 `topic.*` 이벤트가 같은 채널로 발행됩니다 (Phase 4 섹션 참조).

- 사용자 이름은 `POST /login`, `POST /auth/refresh`, `GET /auth/me`에서 `userName` 또는 `name`으로 받을 수 있습니다.
- 받은 초대 목록에서 초대한 사람 이름은 `GET /workspace-invitations/me`의 `invited_by_user_name`을 사용합니다.
- `GET /alerts/`, `GET /issues/`는 `meeting_id` query parameter로 회의별 필터링합니다. `GET /documents/`는 기존 회의 페이지에서 `meeting_id`, 문서 탭/대시보드에서 `workspace_id`를 사용합니다.
- Redis는 FastAPI와 Node.js가 공유하는 별도 인프라입니다. FastAPI는 `REDIS_URL`로
  `alert.created`, `meeting.updated`, Phase 3 실시간 이벤트를 발행하고 Node.js가 구독합니다.
- `DELETE /documents/{document_id}`, `DELETE /alerts/{alert_id}`, `DELETE /stt-results/{stt_result_id}`, `DELETE /utterances/{utterance_id}`는 성공 시 본문 없이 `204`일 수 있습니다.
