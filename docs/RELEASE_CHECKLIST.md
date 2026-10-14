# 최종 릴리즈 체크리스트

검증일: 2026-08-31  
대상: `MeetingAI-App` macOS arm64 배포본

이 문서는 첨부된 Phase 1~5 명세를 현재 코드와 대조한 최종 기준 문서다.

## 최종 판정

코드 구현, 서버 연결, UI 연결, 로컬 AI 실행 경로, macOS DMG 패키징은 완료됐다.
DMG는 앱 번들에 개발용 `.env`와 Python 가상환경을 포함하지 않으므로, 설치 Mac에는
Docker Desktop과 `backend/requirements.txt`가 설치된 Python 3.11을 준비해야 한다.
Electron이 이를 자동 점검해 미설치 상태에서 모호한 포트 timeout을 만들지 않는다.
Windows `.exe`는 요청 범위에서 제외했다. 실제 사람의 회의 녹음에 대한 화자 정확도
보정과 설치 Mac에서의 마이크 권한 확인은 배포 환경별 운영 확인 항목이다.

## Phase 1~2.5 — 기반·데이터 흐름·권한 안정화

- [x] FastAPI, PostgreSQL/pgvector, Node.js WebSocket, Redis, React/Electron 골격
- [x] `/issues`, `/alerts`, `/meetings` 및 workspace 기준 CRUD
- [x] JWT 인증, workspace scope, OWNER/ADMIN/MEMBER 권한 검사
- [x] Meeting/Issue/Alert/STT 상태 전이와 DB CHECK/unique/FK 제약
- [x] 초대 생성·조회·수락·취소와 멤버 목록·역할 변경·삭제
- [x] 401/403/404/409/422/500 응답과 클라이언트 loading/empty/error/toast
- [x] Audit Log 생성과 민감 필드 로그 마스킹
- [x] WebSocket ACK/ERROR, requestId/eventId 중복 방지, heartbeat/reconnect, room cleanup
- [x] `GET /stt-results/`의 `meeting_id` 필수 필터
- [x] STT 응답의 `workspace_id` 포함

## Phase 3 — 실시간 기능 연결

- [x] 회의방 WebSocket 입장/퇴장·presence·권한 검증
- [x] `TRANSCRIPT_CHUNK` 수신 → Node.js → FastAPI 전달
- [x] 발언 chunk 중복 방지, sequence 할당, utterance 저장
- [x] 최근 N개 발언 및 최대 글자 수 context window
- [x] `utterance.partial`/`utterance.created`/`analysis.completed` 이벤트
- [x] Redis Stream 보존과 Pub/Sub → WebSocket 브로드캐스트
- [x] Speaker 전처리 필드와 `Speaker 1`/`Speaker 2`/`Unknown` 표시 구조
- [x] 실시간 분석 계약 `POST /realtime/analysis/realtime`
- [x] 내부 분석 계약에 `X-Analysis-Secret` 인증 적용
- [x] 문서/STT 생성·수정·삭제 이벤트를 `realtime.events` 단일 canonical 경로로 통합
- [x] 확정 발화의 중복 브로드캐스트 제거 및 WebSocket context 불일치 차단

실제 마이크 녹음은 회의 중 수집하고 종료 시 전체 파일을 STT·화자 분리한다. 회의 중
즉시 반영되는 텍스트는 WebSocket으로 들어온 STT text chunk다.

## Phase 4 — AI/RAG/재논의/화자

- [x] TXT/MD/CSV/DOCX/PDF 파싱과 chunking
- [x] `multilingual-e5-small` 임베딩 및 pgvector 검색
- [x] pgvector가 없는 DB에서 Python cosine 폴백
- [x] 상태 머신 기반 안건 생성·결정·재논의 탐지
- [x] 재논의 이벤트와 화자 포함 경고(`TOPIC_REVISITED`, `ALERT_CREATED`)
- [x] faster-whisper STT와 ECAPA-TDNN 192차원 speaker embedding
- [x] average-linkage speaker clustering과 발언별 canonical label
- [x] Ollama 요약·액션아이템·결정사항 및 규칙 기반 fallback
- [x] AI 결과 workspace 권한, 음성 signed URL/1회 사용, 감사 로그
- [x] 문서 `document.created`/`document.processed`/`document.deleted` 실시간 이벤트
- [x] STT `stt.created`/`stt.updated`/`stt.deleted` 실시간 이벤트

## Phase 5 — 데스크톱 통합·배포

- [x] Electron이 PostgreSQL/Redis, FastAPI, realtime-server 준비 상태 확인
- [x] Docker Compose 자동 기동 시도 및 실패 시 사용자 안내
- [x] 설치 Mac별 JWT/콜백/오디오 서명 비밀키 생성(파일 권한 600)
- [x] 설치본 WebSocket을 loopback(`127.0.0.1`)에 바인딩
- [x] 데스크톱 Compose PostgreSQL/Redis 포트를 loopback에 바인딩
- [x] `.env`·개발용 비밀키를 DMG에서 제외
- [x] 사용자 데이터·오디오·문서를 앱 번들 외부에 저장
- [x] Ollama 자동 기동·모델 확인/다운로드와 미설치 fallback
- [x] macOS 마이크 권한 요청과 MediaRecorder 실제 입력
- [x] DMG arm64 패키징 및 ad-hoc deep/strict 코드서명 검증
- [x] 파일 업로드 형식/크기/경로 검증과 UI 오류 상태
- [x] 재연결·실시간 이벤트 중복/브로드캐스트 범위 검증
- [x] Windows `.exe` 제외 (요청사항)
- [N/A] 별도 Electron IPC 기반 녹음 — 렌더러의 표준 `MediaDevices` API를 사용하며 Node 권한 노출을 하지 않음

## 실제 검증 기록

| 검증 | 결과 |
| --- | --- |
| `python3 -m unittest discover -s tests -v` | 33건 통과 |
| Python 전체 모듈 syntax compile (bytecode 미생성) | 통과 |
| 프론트 TypeScript/lint | 통과 |
| realtime-server TypeScript | 통과 |
| Electron main / Node syntax check | 통과 |
| Ollama `qwen2.5:7b` 실제 분석 | JSON 요약·액션아이템·결정사항 생성 |
| faster-whisper `small` | 9초 음성에서 2개 문장 전사 |
| ECAPA diarization | 192차원 임베딩 2개와 `Speaker 1/2` 생성 |
| 실시간 분석 계약 | 잘못된 secret 401 / 올바른 secret 200 |
| DMG | arm64 생성, `codesign --verify --deep --strict` 통과 |
| 브라우저 UI smoke | 로그인·실데이터·문서 분석 화면 확인 |

## 배포 전 준비

1. Docker Desktop을 설치하고 PostgreSQL/Redis 포트가 비어 있는지 확인한다.
2. Python 3.11과 `python3 -m pip install -r backend/requirements.txt`를 준비한다.
3. Ollama와 `qwen2.5:7b`를 준비하면 LLM 분석을 사용할 수 있다.
4. DMG는 `/Applications`에 설치하고, 마이크 권한을 허용한다.
5. 실제 회의 음성으로 `DIARIZATION_CLUSTER_THRESHOLD`를 한 번 보정한다.

빌드 경로가 iCloud/Desktop인 경우 `./scripts/build-mac.sh`가 임시 외부 경로에서
프론트엔드를 빌드하므로 `dist`의 FileProvider EPERM을 피할 수 있다. Electron은
Python 의존성 누락을 기동 전에 검사하며, 설치 Mac에는 `backend/requirements.txt`가
설치된 Python을 `MEETING_AI_PYTHON`으로 지정해야 한다.

Apple 공증은 개발자 인증서가 없어 제공하지 않으며, 다른 Mac의 첫 실행은 우클릭 후
열기를 사용한다. 설치 파일은 다음 경로에 있다.

`dist-app/MeetingAI-1.0.0-arm64.dmg`

2026-08-31 빌드 SHA-256: `59dc74ab2881b0f90a90fdce6a1415b00ba188b03ecf8d2585a6d737c22959b3`
