# Client API Update: 사용자 이름/초대자 정보 응답 명세

작성 기준: 현재 FastAPI 코드 구현 기준

## 1. 공통 응답 형식

### 성공 응답

대부분의 API는 아래 형식을 사용합니다.

```json
{
  "status": "success",
  "data": {}
}
```

단, `POST /login`, `POST /auth/refresh`는 토큰 호환성을 위해 최상위에 토큰 필드를 직접 반환합니다.

### 오류 응답

일반 HTTP 예외는 아래 형식입니다.

```json
{
  "status": "error",
  "message": "오류 메시지"
}
```

입력값 검증 실패는 아래 형식입니다.

```json
{
  "status": "error",
  "message": "Invalid request",
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "password"],
      "msg": "String should have at least 8 characters",
      "input": "123"
    }
  ]
}
```

Rate Limit 초과는 아래 형식입니다.

```json
{
  "status": "error",
  "message": "Too Many Requests"
}
```

## 2. 오류 코드 의미

| HTTP Status | 의미 | 클라이언트 처리 |
| --- | --- | --- |
| 400 Bad Request | 요청 형식은 맞지만 비즈니스 규칙상 처리할 수 없음. 예: 만료된 초대, 허용되지 않는 role 값 | 사용자에게 요청 실패 사유 표시 |
| 401 Unauthorized | 로그인/토큰 인증 실패. 예: 토큰 없음, 만료, 잘못된 토큰, 로그인 실패 | 로그인 화면 이동 또는 토큰 재발급 시도 |
| 403 Forbidden | 인증은 되었지만 해당 리소스 권한 없음. 예: 다른 사용자의 초대 수락, 워크스페이스 권한 부족 | 권한 없음 안내 |
| 404 Not Found | 대상 리소스를 찾을 수 없음. 예: 사용자, 초대, 워크스페이스 없음 | 존재하지 않음/삭제됨 안내 |
| 409 Conflict | 현재 상태와 충돌. 예: 이미 멤버, 이미 PENDING 초대, 이미 처리된 초대 | 중복/상태 충돌 안내 |
| 422 Unprocessable Entity | Pydantic 입력값 검증 실패. 예: 이메일 형식 오류, 필수값 누락, 길이 제한 위반 | 폼 필드별 검증 메시지 표시 |
| 429 Too Many Requests | Rate Limit 초과. 예: 로그인 5회/분 초과, 초대 3회/분 초과 | 잠시 후 재시도 안내 |
| 500 Internal Server Error | 서버 내부 오류. 명세상 정상 케이스가 아님 | 공통 서버 오류 안내 및 재시도 |

## 3. POST /login

로그인 성공 시 토큰과 함께 현재 사용자 이름을 반환합니다.

### Request

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "rememberMe": false
}
```

또는 기존 호환용으로 `user_id`를 사용할 수 있습니다.

```json
{
  "user_id": "admin",
  "password": "Password123!"
}
```

### Success 200

```json
{
  "access_token": "ACCESS_TOKEN",
  "refresh_token": "REFRESH_TOKEN",
  "accessToken": "ACCESS_TOKEN",
  "refreshToken": "REFRESH_TOKEN",
  "token_type": "bearer",
  "defaultWorkspaceId": 143,
  "userId": 52,
  "name": "홍길동",
  "userName": "홍길동",
  "email": "user@example.com"
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| access_token | string | Access Token. snake_case 호환 필드 |
| refresh_token | string | Refresh Token. snake_case 호환 필드 |
| accessToken | string | Access Token. camelCase 클라이언트용 |
| refreshToken | string | Refresh Token. camelCase 클라이언트용 |
| token_type | string | 현재 `bearer` |
| defaultWorkspaceId | number | 로그인 사용자의 기본 워크스페이스 ID |
| userId | number | 현재 로그인 사용자 ID |
| name | string | 현재 로그인 사용자 이름 |
| userName | string | 현재 로그인 사용자 이름. UI 표시용 alias |
| email | string | 현재 로그인 사용자 이메일 |

### Error

#### 401 로그인 실패

```json
{
  "status": "error",
  "message": "아이디 또는 비밀번호가 일치하지 않습니다."
}
```

#### 422 입력값 검증 실패

```json
{
  "status": "error",
  "message": "Invalid request",
  "detail": []
}
```

#### 429 로그인 Rate Limit 초과

```json
{
  "status": "error",
  "message": "Too Many Requests"
}
```

## 4. POST /auth/refresh

토큰 재발급 시에도 현재 사용자 이름을 같이 반환합니다.

### Request - 활동 중 세션 연장

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

Body는 생략 가능합니다.

### Request - 앱 재접속/Refresh Token 사용

```json
{
  "refreshToken": "REFRESH_TOKEN"
}
```

또는 snake_case도 허용됩니다.

```json
{
  "refresh_token": "REFRESH_TOKEN"
}
```

### Success 200 - 활동 중 세션 연장

활동 중 세션 연장에서는 새 refresh token을 만들지 않으므로 `refresh_token`, `refreshToken`은 `null`입니다.

```json
{
  "success": true,
  "access_token": "NEW_ACCESS_TOKEN",
  "accessToken": "NEW_ACCESS_TOKEN",
  "refresh_token": null,
  "refreshToken": null,
  "token_type": "bearer",
  "message": "실시간 세션이 연장되었습니다.",
  "userId": 52,
  "name": "홍길동",
  "userName": "홍길동",
  "email": "user@example.com"
}
```

### Success 200 - Refresh Token 재접속

```json
{
  "success": true,
  "access_token": "NEW_ACCESS_TOKEN",
  "accessToken": "NEW_ACCESS_TOKEN",
  "refresh_token": "NEW_REFRESH_TOKEN",
  "refreshToken": "NEW_REFRESH_TOKEN",
  "token_type": "bearer",
  "message": "로그인 유지가 확인되어 세션을 복구합니다.",
  "userId": 52,
  "name": "홍길동",
  "userName": "홍길동",
  "email": "user@example.com"
}
```

### Error

#### 401 토큰 없음/만료/유효하지 않음

```json
{
  "status": "error",
  "message": "토큰이 유효하지 않거나 만료되었습니다."
}
```

#### 401 토큰 사용자 정보 누락

```json
{
  "status": "error",
  "message": "토큰 사용자 정보가 누락되었습니다."
}
```

#### 401 사용자 없음

```json
{
  "status": "error",
  "message": "사용자 정보를 찾을 수 없습니다."
}
```

## 5. GET /auth/me

현재 Access Token 기준으로 로그인 사용자 정보를 조회합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

### Success 200

```json
{
  "status": "success",
  "data": {
    "id": 52,
    "userId": 52,
    "name": "홍길동",
    "userName": "홍길동",
    "email": "user@example.com",
    "organization_team_name": "우송대 창업팀"
  }
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | number | 사용자 ID |
| userId | number | 사용자 ID. camelCase 클라이언트용 |
| name | string | 사용자 이름 |
| userName | string | 사용자 이름. UI 표시용 alias |
| email | string | 사용자 이메일 |
| organization_team_name | string \| null | 소속/팀명 |

### Error

#### 401 Authorization 헤더 없음

```json
{
  "status": "error",
  "message": "인증 정보가 필요합니다."
}
```

#### 401 Access Token 유효하지 않음

```json
{
  "status": "error",
  "message": "인증 정보가 유효하지 않습니다."
}
```

#### 404 사용자 없음

```json
{
  "status": "error",
  "message": "사용자 정보를 찾을 수 없습니다."
}
```

## 6. GET /workspace-invitations/me

현재 로그인 사용자가 받은 PENDING 초대 목록을 조회합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

### Success 200 - 초대 있음

```json
{
  "status": "success",
  "data": [
    {
      "id": 13,
      "workspace_id": 143,
      "workspace_name": "흠냐링 Default Workspace",
      "invited_email": "user@example.com",
      "invited_by_user_id": 11,
      "invited_by_user_name": "초대한사람",
      "invited_by_user_email": "inviter@example.com",
      "role": "MEMBER",
      "status": "PENDING",
      "expires_at": "2026-06-17T17:27:14.822715+09:00",
      "created_at": "2026-06-10T17:27:14.822715+09:00"
    }
  ]
}
```

### Success 200 - 초대 없음

```json
{
  "status": "success",
  "data": []
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| id | number | 초대 ID |
| workspace_id | number | 초대된 워크스페이스 ID |
| workspace_name | string | 초대된 워크스페이스 이름 |
| invited_email | string | 초대를 받은 이메일 |
| invited_by_user_id | number | 초대한 사용자 ID |
| invited_by_user_name | string | 초대한 사용자 이름 |
| invited_by_user_email | string | 초대한 사용자 이메일 |
| role | string | 수락 시 부여될 role. `MEMBER` 또는 `ADMIN` |
| status | string | 현재 초대 상태. 목록에서는 `PENDING`만 반환 |
| expires_at | string | 초대 만료 시각 |
| created_at | string | 초대 생성 시각 |

### Error

#### 401 인증 실패

```json
{
  "status": "error",
  "message": "인증 정보가 유효하지 않습니다."
}
```

## 7. POST /workspaces/{workspace_id}/invitations

워크스페이스 멤버를 초대합니다.

기존 호환 경로 `POST /workspaces/{workspace_id}/invite`도 동일하게 동작합니다.

### 권한

`OWNER`, `ADMIN`만 호출 가능합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

Body:

```json
{
  "email": "target@example.com",
  "role": "MEMBER"
}
```

`role`은 `MEMBER`, `ADMIN`만 허용됩니다. `OWNER` 초대는 허용하지 않습니다.

### Success 201

```json
{
  "status": "success",
  "data": {
    "id": 10,
    "workspace_id": 140,
    "invited_email": "target@example.com",
    "invited_user_id": 52,
    "invited_by_user_id": 11,
    "role": "MEMBER",
    "token": "INVITATION_TOKEN",
    "status": "PENDING",
    "expires_at": "2026-06-17T16:50:55.091222+09:00",
    "created_at": "2026-06-10T16:50:55.091222+09:00",
    "accepted_at": null
  }
}
```

### Error

#### 400 잘못된 role

```json
{
  "status": "error",
  "message": "초대 role은 MEMBER 또는 ADMIN만 허용됩니다."
}
```

#### 403 초대 권한 없음

```json
{
  "status": "error",
  "message": "해당 workspace를 관리할 권한이 없습니다."
}
```

#### 404 초대 대상 사용자 없음

```json
{
  "status": "error",
  "message": "초대할 회원을 찾을 수 없습니다."
}
```

#### 409 이미 같은 워크스페이스 멤버

```json
{
  "status": "error",
  "message": "이미 workspace에 참여 중인 회원입니다."
}
```

#### 409 이미 같은 워크스페이스에 PENDING 초대 있음

```json
{
  "status": "error",
  "message": "이미 대기 중인 초대가 있습니다."
}
```

#### 422 입력값 검증 실패

```json
{
  "status": "error",
  "message": "Invalid request",
  "detail": []
}
```

#### 429 초대 Rate Limit 초과

```json
{
  "status": "error",
  "message": "Too Many Requests"
}
```

## 8. POST /workspace-invitations/{invitation_id}/accept

초대를 수락합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

Body 없음.

### Success 200

```json
{
  "status": "success",
  "data": {
    "invitation_id": 13,
    "workspace_id": 143,
    "user_id": 52,
    "role": "MEMBER",
    "status": "ACCEPTED"
  }
}
```

### Error

#### 400 만료된 초대

```json
{
  "status": "error",
  "message": "만료된 초대입니다. 다시 초대를 요청하세요."
}
```

#### 403 초대 대상자가 아님

```json
{
  "status": "error",
  "message": "이 초대를 수락할 권한이 없습니다."
}
```

#### 404 초대 없음

```json
{
  "status": "error",
  "message": "초대를 찾을 수 없습니다."
}
```

#### 409 이미 처리된 초대

```json
{
  "status": "error",
  "message": "이미 처리된 초대입니다."
}
```

## 9. POST /auth/invitations/accept

초대 토큰으로 초대를 수락합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

Body:

```json
{
  "token": "INVITATION_TOKEN"
}
```

### Success 200

```json
{
  "status": "success",
  "data": {
    "invitation_id": 13,
    "workspace_id": 143,
    "user_id": 52,
    "role": "MEMBER",
    "status": "ACCEPTED"
  }
}
```

### Error

#### 404 토큰 초대 없음

```json
{
  "status": "error",
  "message": "유효하지 않거나 존재하지 않는 초대 링크입니다."
}
```

나머지 오류는 `POST /workspace-invitations/{invitation_id}/accept`와 동일합니다.

## 10. POST /workspace-invitations/{invitation_id}/reject

초대를 거절합니다.

### Request

Header:

```http
Authorization: Bearer ACCESS_TOKEN
```

Body 없음.

### Success 200

```json
{
  "status": "success",
  "data": {
    "invitation_id": 13,
    "status": "REJECTED"
  }
}
```

### Error

#### 400 만료된 초대

```json
{
  "status": "error",
  "message": "만료된 초대입니다. 다시 초대를 요청하세요."
}
```

#### 403 초대 대상자가 아님

```json
{
  "status": "error",
  "message": "이 초대를 수락할 권한이 없습니다."
}
```

#### 404 초대 없음

```json
{
  "status": "error",
  "message": "초대를 찾을 수 없습니다."
}
```

#### 409 이미 처리된 초대

```json
{
  "status": "error",
  "message": "이미 처리된 초대입니다."
}
```

## 11. 클라이언트 적용 포인트

1. 로그인 직후 사용자 이름 표시는 `POST /login` 응답의 `userName` 사용.
2. 새로고침 후 사용자 이름 복원은 `GET /auth/me` 호출 후 `data.userName` 사용.
3. 토큰 갱신 응답에서도 `userName`이 오므로, 인터셉터에서 사용자 상태를 갱신할 수 있음.
4. 받은 초대 목록 UI에서 초대한 사람 표시는 `invited_by_user_name` 사용.
5. 기존 `name` 필드도 유지되므로, 클라이언트 컨벤션에 따라 `name` 또는 `userName` 중 하나를 선택 가능.
6. OWNER/ADMIN의 보낸 초대 관리는 `GET /workspaces/{workspace_id}/invitations` 사용.
7. `PENDING` 초대 취소는 `DELETE /workspaces/{workspace_id}/invitations/{invitation_id}` 사용.
8. 취소 성공 시 `data.status`는 `CANCELLED`, 이미 처리된 초대는 `409`.
