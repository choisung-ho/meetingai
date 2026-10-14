# 통합 작업 내역 (2026-08-04)

`frontend_0727.zip` + `frontend.zip` + `realtime_backend4.zip` + 기존 `Backend`를
하나의 앱(`MeetingAI-App`)으로 합치면서 수행한 작업 기록입니다.

## 1. 병합 판단 근거

| 소스 | 날짜 | 판단 |
| --- | --- | --- |
| `frontend_0727.zip` | 07-27 (git 7커밋) | **프론트 기준본**. 여민님 View가 이미 `features/dashboard/views/`에 병합돼 있고 API/소켓 연동이 들어 있음 |
| `frontend.zip` | 07-24 | 여민님 원본 UI. 0727에 **없는 것만** 이식 |
| `realtime_backend4.zip` | 07-01 | **실시간 서버 기준본** (17,419줄). 기존 `Backend/node-server/server.mjs`(140줄 프록시)는 폐기 |
| `Backend` | 최신 | 그대로 `backend/`로 이동 |

### frontend.zip에서 이식한 항목

0727에 없던 것만 가져왔고, **디자인(레이아웃/색/간격)은 원본 그대로 유지**했습니다.

- `Toast`, `ErrorView`, `EmptyView`, `StatusBadge` → `src/shared/ui/`
- `WorkspaceMemberView` → `src/features/dashboard/views/`

이식 시 조정한 부분은 두 가지입니다.

1. **아이콘**: 원본은 FontAwesome(`fa-solid`)을 쓰는데 통합 앱에는 FontAwesome이 없어
   아이콘이 빈 칸으로 렌더링됩니다. 통합 앱의 `AppIcon`(인라인 SVG)으로 연결했습니다.
2. **상태값/역할**: 원본의 `recording`/`analyzing`, `admin`/`member` 같은 값을
   실제 백엔드 상태 머신(`READY/ACTIVE/ENDED`, `OWNER/ADMIN/MEMBER`)에 맞췄습니다.

## 2. 새로 구현한 기능 (체크리스트 미완료 항목)

### 실시간 서버 (Phase 3·4)

- `handlers/transcriptHandler.js` — **기존에는 `// TODO` 한 줄짜리 빈 파일이었습니다.**
  STT chunk 수신 → 회의방 참여 검증 → FastAPI 전달 → ACK → 회의방 broadcast
- `fastapi/realtimeApi.js` — STT chunk 전달, 안건 조회, 회의 접근 검증
- `services/transcriptService.js` — chunk 전달 흐름
- `schemas/transcriptSchema.js` — 검증 스키마 + 이벤트 포맷 (명세의 `{type, speaker, text}` 준수)
- `websocket/events/transcriptEvents.js` — 이벤트 타입 + FastAPI 이벤트 매핑
- `pubsub/realtimeEventSubscriber.js` — `realtime.events` 구독 →
  RAG/재논의 결과를 `TOPIC_*` / `ALERT_CREATED` WebSocket 이벤트로 변환
- `services/broadcastService.js` — 회의방 단위 broadcast 메서드 추가

### 프론트엔드 (Phase 4)

- `types/transcript.types.ts` — AI 결과 / speaker / 안건 / 재논의 데이터 구조
- `store/transcriptStore.ts` — 발화·화자·안건·재논의 상태 관리 (중복 제거, 상한 500줄)
- `services/aiAnalysisService.ts` — AI 분석 조회/재분석 요청
- `hooks/useSocket.ts` — `TRANSCRIPT`, `TOPIC_*`, `ANALYSIS_COMPLETED`,
  `AI_ANALYSIS_UPDATED` 수신 처리 + `sendTranscriptChunk` 전송
- `MeetingLivePage.ui.tsx` — 실시간 회의록/재논의 패널/안건 패널을 실제 데이터에 바인딩,
  "Speaker N 발언 중" 표시 추가 (디자인 변경 없음)
- 멤버 관리: `hooks/useWorkspaceMembers.ts` + 서비스 3종 + 대시보드 `menu-8` 연결

### 보안 (Phase 4·5)

- `realtime-server/server/utils/logRedaction.js` — 로그 마스킹.
  기존에는 모든 WebSocket 요청/응답 payload가 **회의 내용 평문 그대로** INFO 로그에 남았습니다.
  발화·요약·화자 embedding·토큰을 마스킹합니다. (`LOG_SENSITIVE_PAYLOAD=true`로 임시 해제 가능)
- `/rag/search` 감사 로그 추가
- `PATCH /topics/{id}/state` — 읽기 전용 권한으로 상태를 바꿀 수 없도록 쓰기 권한 검사로 변경 + 감사 로그

## 3. 발견해서 고친 버그

| # | 증상 | 원인 | 조치 |
| --- | --- | --- | --- |
| 1 | **회의방 브로드캐스트가 전부 실패** (`브로드캐스트 대상 socket 없음`) | JWT `sub`는 숫자(`1`), Redis는 문자열(`"1"`)을 반환 → `Map` 키 불일치 | `socketStore`에서 키를 문자열로 정규화 |
| 2 | 3개 컴포넌트가 서로 다른 IP를 가리킴 | 프론트/실시간 서버에 개발 PC IP 하드코딩, 환경변수 무시 | 전부 환경변수 + localhost 기본값으로 전환 |
| 3 | `GET /stt-results/` 호출이 422로 실패 | 백엔드는 `meeting_id`가 필수인데 Node가 안 보냄 | `meeting_id` 전달하도록 수정 |
| 4 | 회의 중 발화 입력이 조용히 무시됨 | 문서(`documentId`)가 없으면 차단하는 로직 + v0.4.0에서 제거된 필드 사용 | 실시간 WebSocket 경로로 교체 |
| 5 | STT 생성 결과가 `NaN` | 응답 매핑이 옛 스키마(`stt_result_id`/`utterance_count`) 기준 | 실제 응답 형태로 수정 |
| 6 | 실시간 이벤트가 구독자에게 무시됨 | `utterance.created`/`analysis.completed`에 `workspace_id` 누락 | 백엔드 이벤트에 추가 |
| 7 | Node가 화자 라벨을 못 받음 | chunk 응답에 `speaker_label` 없음 | 응답 스키마에 추가 |
| 8 | 미인증 요청이 403 반환 (명세는 401) | `HTTPBearer(auto_error=True)` 기본 동작 | `auto_error=False` + 401 처리 |
| 9 | `.env`에 `REDIS_URL` 중복 정의(값이 다름) | 설정 누적 | 정리 |
| 15 | 설치본을 뜯으면 DB 비밀번호·JWT 서명키가 그대로 노출 | 개발용 `.env`가 DMG에 포함됨 | 번들에서 `.env` 제외 + 설치 시 기기별 무작위 키 생성 |
| 14 | 앱 실행 후 코드 서명이 깨져 재실행 차단 | Python이 앱 번들 안에 `__pycache__` 생성 | `PYTHONDONTWRITEBYTECODE=1`로 실행 |
| 13 | 업로드 파일이 앱 번들 안에 저장(서명 파손·재설치 시 유실) | `uploads` 경로가 상대경로 고정 | `MEETING_AI_DATA_DIR` 기반으로 사용자 데이터 폴더 분리 |
| 12 | `pip install -r requirements.txt` 후 화자 분리가 죽음 | torch/torchaudio 버전 미고정 → 호환되지 않는 조합 설치 | `torch==2.5.1`, `torchaudio==2.5.1` 고정 |
| 11 | 앱이 실행 즉시 SIGTRAP으로 종료 | ① 앱 이름이 한글+공백 ② iCloud 동기화 폴더에서 빌드해 서명 불가 | 이름 `MeetingAI`로 변경 + 동기화 밖에서 빌드하는 `build-mac.sh` |
| 10 | `docker compose up -d` 시 `container name is already in use` | 새 compose에 `container_name: meeting-ai-postgres`를 그대로 복사해, 삭제된 `Backend` compose가 만든 동일 이름 컨테이너와 충돌 | `container_name` 제거(프로젝트 단위 자동 명명) + 포트 환경변수화 + 고아 컨테이너 정리 |

## 4. 최종 검증 결과 (2026-08-05)

이번 릴리즈에서 실제로 다시 실행한 항목만 기록합니다.

- **백엔드 유닛테스트 33건 통과**
- **Python 컴파일·프론트 타입체크/린트·realtime-server 타입체크 통과**
- **LLM 실측** — Ollama `qwen2.5:7b`가 한국어 요약, 액션아이템, 결정사항 JSON을 생성
- **STT 실측** — faster-whisper `small`이 9초 음성에서 2개 문장을 전사
- **화자 실측** — ECAPA 임베딩 2개(각 192차원)와 `Speaker 1/2` 클러스터 생성
- **내부 분석 계약 보안 실측** — 잘못된 `X-Analysis-Secret`은 401, 올바른 키는 200
- **macOS 배포본** — arm64 DMG 생성, 앱 deep/strict 코드서명 검증 통과
- **브라우저 UI smoke** — 로그인, 실제 워크스페이스/회의/문서 조회, 문서 분석 진입과 상태 표시 확인

## 5. 배포 조건 / 운영 주의사항

- **pgvector**: 개발 PC의 실제 DB는 로컬 PostgreSQL 18(`localhost:5432/meeting_ai_phase1`)이고
  여기엔 pgvector 확장이 없습니다. 유사도 검색은 Python 폴백으로 정상 동작합니다.
  네이티브 벡터 검색이 필요하면 [README](../README.md#데이터베이스-선택)의 전환 방법을 참고하세요.

- **데스크톱 앱**: macOS `.dmg`로 패키징 완료했습니다([DEPLOY.md](DEPLOY.md)).
  Windows `.exe`는 요청 범위에서 제외했으며 생성하지 않습니다.
- **화자 라벨 변경**: `UNKNOWN` → `Unknown`으로 통일했습니다.
  이 문자열을 비교하는 코드가 남아 있다면 확인이 필요합니다.
- **임베딩 provider**: 기본값은 로컬 시맨틱 임베딩(`multilingual-e5-small`, 384차원)이고
  임계값은 0.90으로 실측 보정했습니다. 모델을 못 쓰면 해시 기반으로 자동 폴백합니다
  (이 경우 임계값을 0.4로 낮춰야 합니다).
- **화자 분리 정확도**: 합성 음성으로 엔진과 클러스터링 경로는 검증했지만,
  실제 회의실 음향·겹침 발화의 정확도는 운영 녹음으로 별도 보정해야 합니다.

## 2026-08-31 최종 하드닝 반영

- 문서(`document.created/processed/deleted`)와 STT(`stt.created/updated/deleted`)를
  Redis `realtime.events` 단일 canonical 채널·Stream으로 통합하고, 전용 subscriber의
  중복 브로드캐스트를 제거했습니다.
- Redis가 일시적으로 중단되어도 DB의 문서/STT 저장·삭제가 실패하지 않도록 이벤트 발행을
  fail-soft 처리하고, `/health`에서 DB·Redis 상태를 각각 확인할 수 있게 했습니다.
- faster-whisper에 회의 도메인 prompt·VAD·이전 문맥 유지·보수적 filler 제거 옵션을
  추가하고, MediaRecorder WebM/Opus는 PyAV fallback decoder로 화자 임베딩까지 처리합니다.
- 문장 임베딩 모델 로드 실패 시에도 pgvector 선언 차원과 hash fallback 차원이 일치하도록
  보정했습니다.
- Electron 기동 전 PostgreSQL/Redis endpoint와 Python(`faster_whisper`, `speechbrain`,
  `av` 포함) 의존성을 점검하고, 누락 시 해결 명령을 표시합니다. 새 arm64 DMG는
  `dist-app/MeetingAI-1.0.0-arm64.dmg`에 반영했으며 SHA-256은
  `59dc74ab2881b0f90a90fdce6a1415b00ba188b03ecf8d2585a6d737c22959b3`입니다.
