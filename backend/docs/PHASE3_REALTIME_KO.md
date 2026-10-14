# Phase 3 실시간 연동

## 흐름

`Audio → STT → Node.js → FastAPI 저장 → 분석 endpoint → Redis → Node.js WebSocket`

## 환경 변수

- `ANALYSIS_SERVER_URL`: 분석 FastAPI 주소. 비어 있으면 저장과 WebSocket 전송만 수행한다.
- `ANALYSIS_TIMEOUT_SECONDS`: 분석 요청 제한 시간(기본 3초).
- `ANALYSIS_CALLBACK_SECRET`: 실시간 분석 계약과 비동기 분석 결과 콜백에 사용하는 `X-Analysis-Secret`.
- `REALTIME_CONTEXT_SIZE`: 회의별 최근 발언 수(기본 20).
- `REALTIME_CONTEXT_MAX_CHARS`: context window 최대 글자 수(기본 8000).
- `REDIS_URL`: FastAPI와 Node.js가 공유하는 Redis.
- `REALTIME_EVENT_CHANNEL`: 실시간 Pub/Sub 채널(기본 `realtime.events`).
- `REALTIME_EVENT_STREAM`: replay용 Redis Stream(기본 `realtime.events.stream`).
- `REALTIME_STREAM_MAXLEN`: Stream 보관 이벤트 수(기본 10000).
- `FASTAPI_URL`, `NODE_PORT`: Node.js gateway의 upstream과 포트.

## STT chunk 수신

클라이언트는 Node.js의 `POST /api/meetings/{meeting_id}/stt-chunks`를 호출한다.
Node.js가 토큰을 검증하고 FastAPI의 `POST /realtime/meetings/{meeting_id}/chunks`로 전달한다.
WebSocket 연결 전에는 `GET /realtime/meetings/{meeting_id}/access`로 실제 workspace
membership을 재검증한다.

```json
{
  "chunk_id": "meeting-12-chunk-42",
  "text": "다음 배포는 금요일로 하겠습니다.",
  "speaker_label": "SPEAKER_01",
  "start_ms": 12000,
  "end_ms": 14500,
  "language": "ko",
  "is_final": true
}
```

`stt_result_id`를 생략하면 해당 회의의 `PROCESSING` 결과를 사용하거나 새로 만든다.
`sequence`를 생략하면 서버가 다음 번호를 할당한다. 같은 `chunk_id` 재전송은 중복 저장하지 않는다.
`is_final=false`는 `utterance.partial` 이벤트만 발생하며 DB와 분석 context에는 저장하지 않는다.
Final context는 DB의 최근 N개 발언에서 매번 복원되므로 재시작과 다중 worker에서도 유지된다.

분석 서버에는 `POST {ANALYSIS_SERVER_URL}/realtime/analysis/realtime`로 현재 발언,
최근 context window, 정규화된 화자와 화자 변경 여부를 전달한다. 요청에는
`X-Analysis-Secret: ANALYSIS_CALLBACK_SECRET` 헤더가 필요하며, 키가 없으면
분석 요청을 보내지 않는다.
Phase 3 endpoint는 `PENDING_PHASE4`를 반환하고 AI/RAG 판단은 수행하지 않는다.

## WebSocket

`ws://{node-host}:3001/ws/meetings/{meeting_id}?token={access_token}`

Node.js는 JWT 검증 후 FastAPI에 meeting 접근 권한을 재검증한다. FastAPI가 Redis
`realtime.events`에 발행한 이벤트는 모든 Node.js instance에 전달된다.

서버 이벤트:

- `connection.ready`
- `utterance.partial`
- `utterance.created`
- `analysis.completed`

클라이언트의 `{"type":"ping"}`에는 `{"type":"pong"}`으로 응답한다.
각 Redis Stream 이벤트에는 `event_id`가 포함된다. 처리 후
`{"type":"event.ack","event_id":"..."}`를 보내면 확인 응답을 받는다.
재접속할 때 `last_event_id` query parameter를 전달하면 이후 이벤트를 replay한다.

## 분석 결과 콜백

`POST /realtime/analysis-results`

헤더 `X-Analysis-Secret`이 필요하다. meeting/STT/utterance 관계를 검증한 후
`analysis_results`에 저장하고 Redis를 통해 `analysis.completed`로 전달한다.
