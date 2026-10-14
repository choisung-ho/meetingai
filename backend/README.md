# AI Meeting Assistant Backend

FastAPI backend with PostgreSQL, SQLAlchemy models, and basic APIs for issues, alerts, and meetings.

Korean documentation: [`README_KO.md`](README_KO.md), [`docs/API_SPEC_KO.md`](docs/API_SPEC_KO.md)
Project structure documentation: [`docs/project_structure.md`](docs/project_structure.md)

## Setup

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env
```

Never include `.env` in shared zip files or commits. Use `.env.example` for shareable configuration keys.

If Docker is available, start PostgreSQL with:

```bash
docker compose -f ../docker-compose.yml --env-file ../.env up -d
```

Or run a local PostgreSQL server that matches:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5433/meeting_ai_db
SECRET_KEY=replace-with-a-long-random-secret
FRONTEND_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173
```

On this machine, the project PostgreSQL cluster is initialized at:

```text
~/.local/share/meeting-ai-postgres
```

Start it with:

```bash
/Library/PostgreSQL/18/bin/pg_ctl -D "$HOME/.local/share/meeting-ai-postgres" -l "$HOME/.local/share/meeting-ai-postgres/server.log" -o "-p 5433" start
```

Stop it with:

```bash
/Library/PostgreSQL/18/bin/pg_ctl -D "$HOME/.local/share/meeting-ai-postgres" stop
```

## Run

```bash
uvicorn app.main:app --reload
```

If you run the command from another folder, point uvicorn to this backend directory:

```bash
uvicorn --app-dir backend app.main:app --reload
```

Open API docs at:

```text
http://127.0.0.1:8000/docs
```

## APIs

Detailed API Request/Response schemas and WebSocket event mapping are documented in:

```text
docs/API_SPEC.md
```

### Auth

- `POST /auth/register`
- `POST /login`
- `POST /auth/refresh`

All APIs except `/`, `/health`, `/auth/register`, `/login`, and `/auth/refresh` require a Bearer token.
`POST /login` returns `access_token`, `refresh_token`, and `defaultWorkspaceId` so the client can enter the user's default workspace immediately.
Use `POST /auth/refresh` for silent Access Token renewal during long meetings. Refresh Tokens last 30 days and are rotated on every refresh response.

### Workspaces

- `POST /workspaces`
- `GET /workspaces`
- `GET /workspaces/{workspace_id}`
- `POST /workspaces/{workspace_id}/invite`

Workspace access is authorized through `workspace_members`. Users with `OWNER`, `ADMIN`, or accepted `MEMBER` roles can use the workspace-scoped collaboration APIs. Only `OWNER` or `ADMIN` can invite a registered user, which creates a pending workspace invitation. Accepting the invitation creates the `MEMBER` row. `owner_user_id` remains only as legacy ownership metadata during the transition.

Workspace responses include `my_role` and `canInviteMember` for the current authenticated user. The frontend should show the member invite button only when `canInviteMember === true`.
The JWT `role` claim is not the workspace authorization source. Frontend and Node.js should use `my_role`, `canInviteMember`, or FastAPI validation responses for workspace permissions.

Accept-based invite flow:

```text
OWNER/ADMIN sends invite
-> workspace_invitations row is created with PENDING status
-> invited user views pending invites
-> invited user accepts or rejects
-> accept creates workspace_members MEMBER row
-> invitation status becomes ACCEPTED or REJECTED
```

Invite APIs:

- `POST /workspaces/{workspace_id}/invite`: create invitation only, no immediate membership
- `GET /workspace-invitations/me`: list my pending invitations
- `GET /workspaces/{workspace_id}/invitations`: list sent invitations (OWNER/ADMIN)
- `DELETE /workspaces/{workspace_id}/invitations/{invitation_id}`: cancel a pending invitation
- `POST /workspace-invitations/{invitation_id}/accept`: accept invitation and join workspace
- `POST /workspace-invitations/{invitation_id}/reject`: reject invitation

Role policy for MVP:

| Action | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| View workspace/meeting/issue data | Allowed | Allowed | Allowed |
| Create or update meeting | Allowed | Allowed | Allowed |
| Delete meeting | Allowed | Allowed | Denied |
| Create or edit issue | Allowed | Allowed | Allowed |
| Invite member | Allowed | Allowed | Denied |

`VIEWER` is intentionally deferred. Adding a read-only member also requires REST mutation rules and WebSocket event permissions to be split consistently.

### Meetings

Meetings are scoped to a workspace.

- `POST /workspaces/{workspace_id}/meetings`
- `GET /workspaces/{workspace_id}/meetings?page=1&size=20`
- `GET /workspaces/{workspace_id}/meetings/{meeting_id}`
- `PATCH /workspaces/{workspace_id}/meetings/{meeting_id}`
- `DELETE /workspaces/{workspace_id}/meetings/{meeting_id}`

Meeting status flow:

```text
READY -> ACTIVE -> ENDED
```

`POST /workspaces/{workspace_id}/meetings` creates a meeting page with `READY` status.
`PATCH status=ACTIVE` starts the meeting.
`PATCH status=ENDED` ends the meeting.

### Issues

- `POST /issues/`
- `GET /issues/?meeting_id={meeting_id}`
- `GET /issues/{issue_id}`
- `PATCH /issues/{issue_id}`
- `PATCH /issues/{issue_id}/state`
- `DELETE /issues/{issue_id}`
- `GET /issues/{issue_id}/events`

Issue rules:

- `meeting_id` is required for create and list.
- `POST /issues/` response includes `workspaceId` for Node broadcast.
- Status transitions: `OPEN -> IN_PROGRESS -> CLOSED`.
- `PATCH /issues/{issue_id}` is for general field updates only. Do not send `status` here.
- `PATCH /issues/{issue_id}/state` is the only supported endpoint for issue status changes and event history.

### Alerts

- `POST /alerts/`
- `GET /alerts/?meeting_id={meeting_id}`
- `GET /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}`
- `PATCH /alerts/{alert_id}/acknowledge`
- `PATCH /alerts/{alert_id}/dismiss`
- `PATCH /alerts/{alert_id}/resolve`
- `DELETE /alerts/{alert_id}`

Alert responses use the common response shape and include `id`, `workspace_id`, `meeting_id`, `issue_id`, `message`, `level`, `status`, and `created_at` in `data`.
Alert creation publishes an `alert.created` event payload to Redis.
`POST /alerts/` should be treated as an internal/server integration creation API rather than a normal client button action. Server-generated alerts such as rediscussion detection, due-date warnings, and assignee confirmation should use `create_alert()` as the common entry point.
Current Pub/Sub integration only exists for alert creation. `PATCH` and `DELETE` do not publish events yet.

### Documents

- `POST /documents/upload?meeting_id={meeting_id}`
- `GET /documents/?meeting_id={meeting_id}`
- `GET /documents/{document_id}`
- `DELETE /documents/{document_id}`

Document is not a separate meeting-result-page resource. It is an uploaded file attached to the same `meeting_id`, covering pre-meeting materials, in-meeting files, post-meeting minutes, STT source files, and result documents.

### STT Results

- `POST /stt-results/`
- `GET /stt-results/`
- `GET /stt-results/{stt_result_id}`
- `PATCH /stt-results/{stt_result_id}`
- `DELETE /stt-results/{stt_result_id}`

### Utterances

- `GET /utterances/?stt_result_id={stt_result_id}`
- `POST /utterances/`
- `GET /utterances/{utterance_id}`
- `PATCH /utterances/{utterance_id}`
- `DELETE /utterances/{utterance_id}`

STT list requests require `meeting_id`: `GET /stt-results/?meeting_id={meeting_id}`.
All STT result objects contain the derived `workspace_id`. Creating or updating STT results
publishes `stt.created` or `stt.updated`; document upload/deletion publishes
`document.created` or `document.deleted` through the realtime Redis Stream/Pub/Sub.

## WebSocket Events

WebSocket is handled by the Node.js realtime server.
FastAPI is responsible for authorization, persistence, the analysis contract, and Redis Stream publishing.

Flow:

```text
Audio -> STT -> Node(:3001) -> FastAPI(:8000) -> PostgreSQL
                                  -> Redis Stream/PubSub -> Node -> WebSocket
```

Phase 3 endpoints:

- `POST :3001/api/meetings/{meeting_id}/stt-chunks`
- `WS :3001/ws/meetings/{meeting_id}?token={access_token}`
- `GET /realtime/meetings/{meeting_id}/access`
- `POST /realtime/meetings/{meeting_id}/chunks`
- `POST /realtime/analysis/realtime` (internal `X-Analysis-Secret` required)
- `POST /realtime/analysis-results`

Partial chunks emit `utterance.partial` without persistence. Final chunks are deduplicated,
stored as utterances, combined with the latest database-backed context window, and sent to
the analysis endpoint. Events carry a Redis Stream `event_id`; clients acknowledge them
with `event.ack` and reconnect with `last_event_id` for replay.

Common event shape used by Node:

```json
{
  "type": "ISSUE_CREATED",
  "requestId": "request-uuid",
  "success": true,
  "payload": {}
}
```

Node-side client events:

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

Legacy room/issue events retain camelCase. Phase 3 STT events use FastAPI-compatible
snake_case fields such as `meeting_id`, `stt_result_id`, and `utterance_id`.
Node must pass the FastAPI Bearer token when calling protected REST APIs such as `POST /issues/`.
Before accepting `JOIN_WORKSPACE` or `JOIN_MEETING_ROOM`, Node calls `GET /workspaces/{workspace_id}` with the Bearer token. A validated `OWNER`, `ADMIN`, or invited `MEMBER` may enter the realtime scope.

WebSocket JWT validation:

- The client passes the Access Token during WebSocket connection or `CONNECT_USER`.
- Node validates JWT signature and expiration.
- Tokens without `sub` must be rejected.
- On success, Node stores `userId` and `role` in the socket context.
- Authorization and data flow are workspace-based. Meeting events must carry `workspaceId`.
- FastAPI exposes `app.core.security.verify_websocket_token(token)` as the validation helper contract.

## State Rules

Status transition rules are defined in `app/state.py`.

- Meeting: `READY`, `ACTIVE`, `ENDED`
- Issue: `OPEN`, `IN_PROGRESS`, `CLOSED`
- Issue candidate: `DETECTED`, `REVIEWING`, `ACCEPTED`, `REJECTED`, `PROMOTED`
- Alert: `PENDING`, `ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`
- Document: `UPLOADED`, `PROCESSING`, `PROCESSED`, `FAILED`
- STT result: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`

## Pipeline State Machine

The Phase 3 AI pipeline is defined in `app/state.py`.

```text
STT PENDING
-> STT PROCESSING
-> STT COMPLETED
-> ISSUE_CANDIDATE_DETECTED
-> ISSUE_CANDIDATE_ACCEPTED or ISSUE_CANDIDATE_REJECTED
-> ISSUE_CREATED_FROM_CANDIDATE
-> ISSUE OPEN
```

## STT Data Shape

STT results are stored in `stt_results`.

Utterance-level data is stored in `utterances`. The audio pipeline runs optional
pyannote diarization + SpeechBrain ECAPA embeddings and persists a stable
`speaker_label` (`Speaker 1`, `Speaker 2`, or `Unknown`). If the optional model
dependencies or a usable audio track are unavailable, processing continues with
the explicit `Unknown` fallback rather than failing the meeting.
