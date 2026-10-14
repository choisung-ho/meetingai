# AI 회의 보조 백엔드

FastAPI, PostgreSQL, SQLAlchemy를 사용하는 회의 협업 백엔드입니다. Workspace 단위로 Meeting, Issue, Alert, 문서 및 STT 데이터를 관리하며, 실시간 통신과 broadcast는 Node.js 서버가 담당합니다.

상세 요청/응답 명세와 WebSocket 이벤트 계약은 [`docs/API_SPEC_KO.md`](docs/API_SPEC_KO.md)를 확인합니다.
현재 폴더 구조와 각 파일 역할은 [`docs/project_structure.md`](docs/project_structure.md)를 확인합니다.
Phase 4 AI 결과·원본 음성 접근·로그 redaction 보안 계약은
[`docs/PHASE4_SECURITY_KO.md`](docs/PHASE4_SECURITY_KO.md)를 확인합니다.
운영 환경의 잔여 위험과 배포 전 점검표는
[`docs/PHASE4_SECURITY_RISK_REVIEW_KO.md`](docs/PHASE4_SECURITY_RISK_REVIEW_KO.md)를 확인합니다.

## 설치

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env
```

`.env` 파일은 실제 비밀키와 DB 접속 정보를 포함할 수 있으므로 공유 zip 또는 커밋에 포함하지 않습니다. 공유가 필요한 설정 키는 `.env.example`을 사용합니다.

Docker를 사용할 수 있다면 PostgreSQL을 실행합니다.

```bash
docker compose -f ../docker-compose.yml --env-file ../.env up -d
```

v0.4.0부터 Postgres 이미지가 `pgvector/pgvector:pg16`으로 변경되었습니다(RAG 유사도 검색용, 기존 볼륨 호환).
이미 구버전 `postgres:16` 컨테이너를 쓰고 있다면 한 번 재생성합니다.

```bash
docker compose pull postgres && docker compose -f ../docker-compose.yml --env-file ../.env up -d --force-recreate postgres
```

pgvector 확장이 없는 Postgres에서도 서버는 정상 동작하며, 유사도 검색만 Python 폴백으로 수행됩니다.

또는 아래 환경 변수와 일치하는 로컬 PostgreSQL을 실행합니다.

```env
DATABASE_URL=postgresql://postgres:password@localhost:5433/meeting_ai_db
SECRET_KEY=replace-with-a-long-random-secret
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
```

현재 개발 PC에서 프로젝트 PostgreSQL 클러스터 경로는 다음과 같습니다.

```text
~/.local/share/meeting-ai-postgres
```

시작:

```bash
/Library/PostgreSQL/18/bin/pg_ctl -D "$HOME/.local/share/meeting-ai-postgres" -l "$HOME/.local/share/meeting-ai-postgres/server.log" -o "-p 5433" start
```

종료:

```bash
/Library/PostgreSQL/18/bin/pg_ctl -D "$HOME/.local/share/meeting-ai-postgres" stop
```

## 실행

백엔드 폴더에서 실행합니다.

```bash
uvicorn app.main:app --reload
```

다른 폴더에서 실행할 때는 애플리케이션 디렉터리를 지정합니다.

```bash
uvicorn --app-dir backend app.main:app --reload
```

Swagger 문서:

```text
http://127.0.0.1:8000/docs
```

## 인증

공개 API:

- `GET /`
- `GET /health`
- `POST /auth/register`
- `POST /login`
- `POST /auth/refresh`

그 외 API는 `Authorization: Bearer <access_token>` 헤더가 필요합니다.

- `POST /auth/register`: 회원가입 시 기본 workspace를 생성하고 사용자를 `OWNER`로 등록합니다.
- `POST /login`: Access Token, Refresh Token, `defaultWorkspaceId`를 반환합니다.
- `POST /auth/refresh`: 긴 회의 중 Access Token을 조용히 갱신합니다. Refresh Token은 30일 유효하며, 재발급 때마다 새 Refresh Token도 함께 반환합니다.

MVP v0.4.0에서는 Access Token과 Refresh Token을 사용합니다.

## Workspace 및 역할

API:

- `POST /workspaces`
- `GET /workspaces`
- `GET /workspaces/{workspace_id}`
- `POST /workspaces/{workspace_id}/invite`

접근 권한은 `workspace_members` 테이블의 `(workspace_id, user_id, role)`을 기준으로 검사합니다. 신규 workspace의 생성자는 `OWNER`이고, 초대된 가입 회원은 `MEMBER`로 등록됩니다. 초대는 `OWNER` 또는 `ADMIN`만 수행할 수 있습니다.

Workspace 응답에는 현재 로그인 사용자 기준 `my_role`과 `canInviteMember`가 포함됩니다. 프론트는 `canInviteMember === true`일 때만 멤버 초대 버튼을 표시하면 됩니다.
JWT의 `role`은 workspace 권한 판단 기준이 아닙니다. 프론트와 Node.js는 workspace 권한을 `my_role`, `canInviteMember`, 또는 FastAPI 검증 API 결과로 판단해야 합니다.

`owner_user_id`는 기존 데이터 이관을 위한 호환 필드로 남아 있으며, 실제 협업 접근 검증은 `workspace_members`가 기준입니다.

수락형 초대 흐름:

```text
OWNER/ADMIN이 초대 생성
-> workspace_invitations에 PENDING 저장
-> 초대받은 사용자가 받은 초대 목록 조회
-> 초대받은 사용자가 수락 또는 거절
-> 수락 시 workspace_members에 MEMBER 추가
-> invitation 상태를 ACCEPTED 또는 REJECTED로 변경
```

초대 API:

- `POST /workspaces/{workspace_id}/invite`: 초대만 생성하고 즉시 참여시키지 않음
- `GET /workspace-invitations/me`: 내가 받은 초대 목록 조회
- `GET /workspaces/{workspace_id}/invitations`: OWNER/ADMIN의 보낸 초대 이력 조회
- `POST /workspace-invitations/{invitation_id}/accept`: 초대 수락 및 workspace 참여
- `POST /workspace-invitations/{invitation_id}/reject`: 초대 거절
- `DELETE /workspaces/{workspace_id}/invitations/{invitation_id}`: PENDING 초대 취소

### MVP 역할 정책

| 기능 | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| workspace/meeting/issue 조회 | 가능 | 가능 | 가능 |
| meeting 생성 및 수정 | 가능 | 가능 | 가능 |
| meeting 삭제 | 가능 | 가능 | 불가 |
| issue 생성, 수정, 삭제 | 가능 | 가능 | 가능 |
| 회원 초대 | 가능 | 가능 | 불가 |

`VIEWER`는 MVP에 포함하지 않습니다. 읽기 전용 역할을 추가할 때는 REST 변경 API와 WebSocket 생성 이벤트 권한을 함께 나누어야 합니다.

## Meeting

Meeting은 Workspace 하위 리소스입니다.

- `POST /workspaces/{workspace_id}/meetings`
- `GET /workspaces/{workspace_id}/meetings?page=1&size=20`
- `GET /workspaces/{workspace_id}/meetings/{meeting_id}`
- `PATCH /workspaces/{workspace_id}/meetings/{meeting_id}`
- `DELETE /workspaces/{workspace_id}/meetings/{meeting_id}`

상태 흐름:

```text
READY -> ACTIVE -> ENDED
```

- `POST`는 회의 페이지를 `READY` 상태로 생성합니다. 회의 시작이 아닙니다.
- `PATCH status=ACTIVE`는 회의 시작입니다.
- `PATCH status=ENDED`는 회의 종료입니다.
- 모든 단건 접근은 `meeting.workspace_id == workspace_id`를 함께 검증합니다.
- 삭제는 `OWNER` 또는 `ADMIN`만 가능합니다.

## Issue

- `POST /issues/`
- `GET /issues/?meeting_id={meeting_id}`
- `GET /issues/{issue_id}`
- `PATCH /issues/{issue_id}`
- `PATCH /issues/{issue_id}/state`
- `DELETE /issues/{issue_id}`
- `GET /issues/{issue_id}/events`

규칙:

- 생성과 목록 조회에는 `meeting_id`가 필요합니다.
- 삭제된 issue는 목록 조회에서 제외됩니다.
- `POST /issues/` 응답은 Node broadcast를 위해 `workspaceId`를 포함합니다.
- 생성, 수정, 상태 변경, 삭제는 `MEMBER` 이상만 가능합니다.
- 상태 전이는 `OPEN -> IN_PROGRESS -> CLOSED`만 허용합니다.
- `PATCH /issues/{issue_id}`는 일반 필드 수정 전용입니다. 여기에는 `status`를 보내지 않습니다.
- `PATCH /issues/{issue_id}/state`만 issue 상태 변경과 이벤트 이력을 담당합니다.

## 기타 데이터 API

Alert:

- `POST /alerts/`
- `GET /alerts/?meeting_id={meeting_id}`
- `GET /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}/acknowledge`
- `PATCH /alerts/{alert_id}/dismiss`
- `PATCH /alerts/{alert_id}/resolve`
- `DELETE /alerts/{alert_id}`

Alert 응답은 공통 응답 형식이며 `data` 안에 `id`, `workspace_id`, `meeting_id`, `issue_id`, `message`, `level`, `status`, `created_at`을 포함합니다.
Alert 생성 시 Redis로 `alert.created` 이벤트 payload를 실제 publish합니다.
`POST /alerts/`는 일반 클라이언트 버튼용 공개 기능이라기보다 서버 내부/연동용 Alert 생성 API로 봅니다. 재논의 감지, 마감 임박, 담당자 확인 필요 같은 내부 Alert 생성은 `create_alert()`를 공통 진입점으로 사용합니다.
현재 Pub/Sub는 Alert 생성 시 `alert.created` publish까지만 되어 있고, `PATCH`, `DELETE`에서는 발생하지 않습니다.

문서:

- `POST /documents/upload?meeting_id={meeting_id}`
- `GET /documents/?meeting_id={meeting_id}`
- `GET /documents/{document_id}`
- `DELETE /documents/{document_id}`

Document는 별도의 “회의 결과 페이지” 리소스가 아니라 같은 `meeting_id`에 연결된 첨부 파일입니다. 회의 전/중 자료와 회의 후 회의록, STT 원본, 결과 문서를 모두 같은 Document로 관리합니다.

STT 결과:

- `POST /stt-results/`
- `GET /stt-results/?meeting_id={meeting_id}`
- `GET /stt-results/{stt_result_id}`
- `PATCH /stt-results/{stt_result_id}`
- `DELETE /stt-results/{stt_result_id}`

STT 생성·수정 성공 시 Redis Stream/Pub/Sub으로 `stt.created`, `stt.updated`를
발행합니다. 모든 STT 결과 응답은 소속 Meeting에서 파생한 `workspace_id`를 포함합니다.
문서 업로드·삭제 성공 시에는 `document.created`, `document.deleted`를 발행합니다.

발화:

- `GET /utterances/?stt_result_id={stt_result_id}`
- `POST /utterances/`
- `GET /utterances/{utterance_id}`
- `PATCH /utterances/{utterance_id}`
- `DELETE /utterances/{utterance_id}`

## WebSocket 연동

Node.js 실시간 서버가 WebSocket 연결과 broadcast를 담당하고, FastAPI는 인증·DB 저장·분석 계약·Redis Stream 발행을 담당합니다.

```text
Audio -> STT -> Node.js(:3001) -> FastAPI(:8000) -> PostgreSQL
                                      -> Redis Stream/PubSub -> Node.js -> WebSocket
```

Phase 3 엔드포인트:

- `POST :3001/api/meetings/{meeting_id}/stt-chunks`: 클라이언트 STT 진입점
- `WS :3001/ws/meetings/{meeting_id}?token={access_token}`: 회의 실시간 구독
- `GET /realtime/meetings/{meeting_id}/access`: Node.js의 회의 접근 검증
- `POST /realtime/meetings/{meeting_id}/chunks`: FastAPI 내부 STT 수신
- `POST /realtime/analysis/realtime`: Phase 3 분석 전달 계약 (`X-Analysis-Secret` 필수)
- `POST /realtime/analysis-results`: 분석 결과 저장 및 broadcast callback

`is_final=false`는 `utterance.partial`만 발행하고 저장하지 않습니다. `is_final=true`는
중복을 방지해 utterance로 저장하고 DB에서 최근 N개 context를 구성해 분석 endpoint로
전달합니다. 이벤트는 `event_id`를 포함하며 `event.ack`와 재접속
`last_event_id` replay를 지원합니다.

공통 이벤트 형식:

```json
{
  "type": "ISSUE_CREATED",
  "requestId": "request-uuid",
  "success": true,
  "payload": {}
}
```

지원 이벤트:

- `connection.ready`
- `utterance.partial`
- `utterance.created`
- `analysis.completed`
- `event.ack`
- `event.acknowledged`
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
- `CREATE_ISSUE`
- `ISSUE_CREATED`

기존 room/issue 이벤트 payload는 camelCase를 유지합니다. Phase 3 STT 이벤트는 FastAPI
payload와 동일한 snake_case(`meeting_id`, `stt_result_id`, `utterance_id`)를 사용합니다.
Node.js가 보호된 FastAPI API를 호출할 때는 사용자 Access Token을
`Authorization: Bearer <access_token>` 헤더로 전달해야 합니다.

`JOIN_WORKSPACE`, `JOIN_MEETING_ROOM` 처리 전 Node.js는 FastAPI 검증 API를 호출합니다. FastAPI가 `200`을 반환하면 입장시키고, `401`, `403`, `404`이면 입장을 막습니다.

- `GET /workspaces/{workspace_id}`: workspace 참여 가능 여부 확인
- `GET /workspaces/{workspace_id}/meetings/{meeting_id}`: 해당 workspace의 meeting 존재 및 접근 가능 여부 확인

## 상태 규칙

상태 전이 규칙은 `app/state.py`에 정의되어 있습니다.

- Meeting: `READY`, `ACTIVE`, `ENDED`
- Issue: `OPEN`, `IN_PROGRESS`, `CLOSED`
- Issue candidate: `DETECTED`, `REVIEWING`, `ACCEPTED`, `REJECTED`, `PROMOTED`
- Alert: `PENDING`, `ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`
- Document: `UPLOADED`, `PROCESSING`, `PROCESSED`, `FAILED`
- STT result: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

Phase 3 AI 파이프라인:

```text
STT PENDING
-> STT PROCESSING
-> STT COMPLETED
-> ISSUE_CANDIDATE_DETECTED
-> ISSUE_CANDIDATE_ACCEPTED 또는 ISSUE_CANDIDATE_REJECTED
-> ISSUE_CREATED_FROM_CANDIDATE
-> ISSUE OPEN
```

## STT 데이터 구조

원문 STT 결과는 `stt_results`에 저장되고, 문장 단위 발화는 `utterances`에 저장됩니다.

```text
utterances -> stt_result_id -> stt_results.meeting_id
```

`utterances`에 `meeting_id` 직접 FK는 없습니다. 현재 단계에서는 화자 분리를 구현하지 않으므로 `speaker_label`은 `null`일 수 있습니다.
