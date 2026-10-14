# Phase 4 보안 적용 및 운영 계약

## AI 분석 결과

회의 단위 최종 AI 분석은 `ai_analyses`에 저장한다. 실시간 chunk 단위
`analysis_results`와 별도 리소스다.

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /workspaces/{workspace_id}/meetings/{meeting_id}/ai` | `VIEWER` 이상 | 최종 AI 결과 조회 |
| `POST /workspaces/{workspace_id}/meetings/{meeting_id}/ai/re-analyze` | `MEMBER` 이상 | 외부 AI 재분석 요청, 감사 로그 기록 |
| `POST /workspaces/{workspace_id}/meetings/{meeting_id}/ai/result` | 내부 callback secret | 결과 upsert 및 실시간 완료 이벤트 발행 |

모든 API는 `meeting.workspace_id == workspace_id`를 확인한다. URL의 ID만
알아도 다른 workspace의 결과를 읽거나 수정할 수 없다. 재분석 endpoint는
`AI_REANALYSIS_URL`이 설정되지 않은 경우 `503`을 반환한다.

## 녹음 파일 접근

| API | 권한 | 동작 |
| --- | --- | --- |
| `GET /workspaces/{workspace_id}/meetings/{meeting_id}/audio/download-link` | `MEMBER` 이상 | 5분 기본 유효 HMAC 다운로드 링크 발급 및 감사 로그 기록 |
| `GET /workspaces/{workspace_id}/meetings/{meeting_id}/audio/download` | 서명 링크 | HMAC·만료 시간·1회 사용·storage root 검증 후 파일 반환 |

`VIEWER`는 원본 음성 링크를 발급할 수 없다. 링크에는 실제 storage path를 포함하지
않으며, HMAC 검증을 통과한 요청만 `AUDIO_STORAGE_ROOT` 내부 파일에 접근할 수 있다.
Redis `SET NX`로 서명마다 한 번만 다운로드를 허용하며 Redis를 사용할 수 없으면
안전하게 다운로드를 거부한다.
녹음 수집 파이프라인은 Meeting의 `audio_storage_path`, `audio_original_filename`을
설정해야 한다. 이 두 내부 경로는 일반 Meeting API 응답에 노출하지 않는다.

## 환경 변수

- `AI_REANALYSIS_URL`: Node/AI 재분석 작업 endpoint
- `AI_RESULT_CALLBACK_SECRET`: 최종 AI 결과 callback 인증 secret
- `AUDIO_SIGNING_SECRET`: HMAC signing secret. `SECRET_KEY`와 별도 값 사용
- `AUDIO_SIGNED_URL_TTL_SECONDS`: 링크 유효 기간, 기본 300초
- `AUDIO_STORAGE_ROOT`: 허용되는 로컬 오디오 루트, 기본 `uploads/audio`

운영 환경에서는 모든 secret을 32자 이상 무작위 값으로 설정하고, `.env`를 커밋하지
않는다.

## 로그 redaction

`sanitize_log_payload()`는 `raw_text`, `text`, `transcript`, `summary_text`,
`action_items`, `rediscussion_report`, `result`, password/token, speaker embedding,
audio payload를 `[REDACTED length=N]`으로 대체한다. 요청 검증 오류 로그에도 이
정책을 적용한다.

로그에는 회의 본문·AI 전체 결과·실명 화자 매핑·오디오 바이트 또는 실제 storage path를
기록하지 않는다. 감사 로그에는 actor, 행위, 리소스 ID, workspace ID만 저장한다.
