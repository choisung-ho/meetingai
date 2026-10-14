# Backend 프로젝트 폴더 구조

작성 기준: 현재 Backend 코드 기준

## 실행 기준

현재 FastAPI 서버의 실제 실행 진입점은 `app/main.py`입니다.

```bash
uvicorn app.main:app --reload
```

루트의 `main.py`는 초기 로그인 테스트용 레거시 파일입니다. 실제 서버 실행에는 사용하지 않습니다.

## 전체 구조

```text
Backend/
├── app/                              # FastAPI 애플리케이션 본문
│   ├── __init__.py                   # app 패키지 인식용 파일
│   ├── main.py                       # FastAPI 앱 생성, 라우터 등록, CORS, 공통 예외 처리, DB 초기화 진입점
│   ├── state.py                      # Meeting/Issue/Alert/Document/STT 상태 전이 규칙과 검증 함수
│   ├── api/                          # HTTP API 라우터 계층
│   │   ├── __init__.py               # api 패키지 인식용 파일
│   │   ├── auth.py                   # 회원가입, 로그인, 토큰 재발급, 현재 사용자 조회 API
│   │   ├── dependencies.py           # 인증 사용자 파싱, 워크스페이스 접근/권한 검증 공통 dependency
│   │   ├── workspaces.py             # 워크스페이스, 멤버, 초대, 회의 API
│   │   ├── issues.py                 # 이슈 목록/상세/생성/수정/상태변경/삭제/이벤트 조회 API
│   │   ├── alerts.py                 # 알림 목록/상세/생성/수정/확인/숨김/해결/삭제 API
│   │   ├── documents.py              # 문서 목록/상세/업로드/삭제 API
│   │   ├── stt_results.py            # STT 결과 목록/상세/생성/수정/삭제 API
│   │   ├── utterances.py             # 발화 목록/상세/생성/수정/삭제 API
│   │   └── realtime.py               # STT chunk, 접근 검증, 분석 요청/결과 callback API
│   ├── core/                         # 전역 설정과 공통 인프라 유틸
│   │   ├── __init__.py               # core 패키지 인식용 파일
│   │   ├── config.py                 # 환경변수 로딩, DB/선택적 Node.js Redis 접속 URL/CORS/JWT 설정
│   │   ├── security.py               # 비밀번호 해시, JWT 생성/검증, WebSocket 토큰 검증 helper
│   │   ├── limiter.py                # slowapi Rate Limit 설정과 key function
│   │   ├── logger.py                 # 공통 로거, 이메일/민감값 마스킹 helper
│   │   └── timezone.py               # KST 시간 생성/변환 helper
│   ├── db/                           # DB 연결 및 초기화 계층
│   │   └── database.py               # SQLAlchemy engine/session/Base, init_db(), 기본 마이그레이션 SQL
│   ├── models/                       # SQLAlchemy ORM 모델 계층
│   │   ├── __init__.py               # 모델 import/export 모음
│   │   ├── auth.py                   # 사용자 계정 테이블 모델
│   │   ├── workspace.py              # 워크스페이스 테이블 모델
│   │   ├── workspace_member.py       # 워크스페이스 멤버/role 테이블 모델
│   │   ├── workspace_invitation.py   # 워크스페이스 초대, 초대 token, 만료/상태 테이블 모델
│   │   ├── meeting.py                # 회의 테이블 모델
│   │   ├── issue.py                  # 이슈 테이블 모델
│   │   ├── issue_event.py            # 이슈 상태 변경 이벤트 이력 모델
│   │   ├── alert.py                  # 알림 테이블 모델
│   │   ├── document.py               # 업로드 문서 메타데이터 테이블 모델
│   │   ├── stt_result.py             # STT 처리 결과 테이블 모델
│   │   ├── utterance.py              # 발화 단위 텍스트 테이블 모델
│   │   ├── analysis_result.py         # 실시간 분석 callback 결과 모델
│   │   └── audit_log.py              # 감사 로그 테이블 모델
│   ├── schemas/                      # Pydantic 요청/응답 스키마 계층
│   │   ├── __init__.py               # 스키마 import/export 모음
│   │   ├── response.py               # 공통 ApiResponse wrapper
│   │   ├── validation.py             # 공통 문자열 제약, email/password/status/role 타입 정의
│   │   ├── auth.py                   # 회원가입/로그인/토큰/현재 사용자 응답 스키마
│   │   ├── workspace.py              # 워크스페이스/멤버/초대 요청·응답 스키마
│   │   ├── meeting.py                # 회의 생성/수정/응답 스키마
│   │   ├── issue.py                  # 이슈 생성/수정/상태변경/응답 스키마
│   │   ├── issue_event.py            # 이슈 이벤트 응답 스키마
│   │   ├── alert.py                  # 알림 생성/수정/응답 스키마
│   │   ├── document.py               # 문서 응답 스키마
│   │   ├── stt_result.py             # STT 결과 생성/수정/응답 스키마
│   │   ├── utterance.py              # 발화 생성/수정/응답 스키마
│   │   └── realtime.py               # STT chunk 및 분석 요청/결과 스키마
│   ├── services/                     # 비즈니스 로직/외부 연동 계층
│   │   ├── __init__.py               # services 패키지 인식용 파일
│   │   ├── issue_service.py          # 이슈 조회/생성/수정/상태변경/삭제와 이벤트 기록 로직
│   │   ├── meeting_service.py        # 회의 상태 변경 이벤트 payload 생성 및 Node.js Redis meeting.updated publish 로직
│   │   ├── alert_service.py          # 알림 DB 생성과 Node.js Redis publish 준비/발행 로직
│   │   ├── pubsub_service.py         # Node.js 서버 Redis Pub/Sub publish 공통 클라이언트 서비스
│   │   ├── realtime_service.py       # chunk 저장, DB context window, 분석 endpoint 전달
│   │   ├── context_buffer.py         # 단일 프로세스 fallback context buffer
│   │   ├── stt_service.py            # STT raw_text 저장 및 utterance 분리 생성 로직
│   │   └── ai_service.py             # AI 분석/추론 확장용 서비스 자리
│   ├── utils/                        # 도메인에 종속되지 않는 보조 유틸
│   │   ├── __init__.py               # utils 패키지 인식용 파일
│   │   └── audit.py                  # Audit Log 안전 기록 helper
│   └── websocket/                    # FastAPI WebSocket 관련 코드 위치
│       ├── manager.py                 # 호환용 FastAPI WebSocket 연결 관리자
│       └── routes.py                  # 호환용 FastAPI WebSocket endpoint
├── node-server/
│   ├── server.mjs                    # Node STT gateway, WebSocket, Redis replay/ACK
│   └── test/                         # Node JWT 계약 테스트
├── docs/                             # API 명세, 보안 점검, 구조 문서
│   ├── api_spec_current.md           # 현재 구현 기준 전체 API 명세
│   ├── client_api_updates_user_name_and_invitation.md  # 사용자 이름/초대자 정보 변경 명세
│   └── project_structure.md          # 현재 파일. 프로젝트 구조 설명 문서
├── scripts/                          # 개발/테스트용 스크립트
│   ├── test_alert_subscriber.mjs     # Node.js Redis alert.created 구독 테스트 스크립트
│   └── test_meeting_subscriber.mjs   # Node.js Redis meeting.updated 구독 테스트 스크립트
├── uploads/                          # 업로드 문서 저장 디렉터리
├── requirements.txt                  # Python 의존성 목록
├── docker-compose.yml                # Docker Compose 설정
├── README.md                         # 영문 README
├── README_KO.md                      # 한국어 README
├── .env                              # 로컬 환경변수. 비밀값 포함 가능, 커밋 금지
├── .env.example                      # 환경변수 예시 파일
├── package.json                      # Node.js gateway 실행/테스트 및 의존성 정보
├── package-lock.json                 # Node.js 의존성 lock 파일
└── main.py                           # 레거시 로그인 테스트 파일. 실제 앱 실행에는 app/main.py 사용
```

## 계층별 역할

| 폴더 | 역할 |
| --- | --- |
| `app/api/` | 클라이언트가 호출하는 HTTP 엔드포인트를 정의합니다. 인증, 권한 확인, 요청 검증 후 service/model 계층을 호출합니다. |
| `app/core/` | 환경 설정, 보안, 로깅, Rate Limit, 시간 처리처럼 앱 전체에서 공유하는 공통 기능을 둡니다. |
| `app/db/` | DB 연결, 세션 생성, 테이블 초기화와 최소 마이그레이션 처리를 담당합니다. |
| `app/models/` | 실제 DB 테이블 구조를 SQLAlchemy ORM 클래스로 정의합니다. |
| `app/schemas/` | API 요청/응답의 타입, 필수값, 문자열 길이, enum 값을 Pydantic으로 검증합니다. |
| `app/services/` | API 라우터에서 분리한 비즈니스 로직과 Node.js Redis/STT/AI 등 외부 연동 로직을 둡니다. |
| `app/utils/` | 특정 API에 묶이지 않는 보조 함수들을 둡니다. 현재는 감사 로그 기록 helper가 있습니다. |
| `app/websocket/` | FastAPI 내부 WebSocket 코드를 둘 위치입니다. 현재 실시간 WebSocket은 Node.js가 담당합니다. |
| `docs/` | 클라이언트/팀원 공유용 API 명세와 설계 문서를 둡니다. |
| `scripts/` | 서버 기능을 수동 테스트하거나 개발 중 확인하기 위한 스크립트를 둡니다. |
| `uploads/` | `POST /documents/upload`로 업로드된 파일이 저장됩니다. |

## 파일별 핵심 역할

### app/main.py

- FastAPI 객체 `app`을 생성합니다.
- `issues`, `alerts`, `workspaces`, `documents`, `stt_results`, `utterances`, `auth` 라우터를 등록합니다.
- 앱 시작 시 `init_db()`를 실행합니다.
- HTTP 예외, 입력값 검증 오류, Rate Limit 오류의 공통 응답 형식을 정의합니다.
- CORS 설정을 등록합니다.

### app/state.py

- `Meeting`, `Issue`, `Alert`, `Document`, `STT Result`의 상태 전이 규칙을 정의합니다.
- `can_transition()`으로 상태 변경 가능 여부를 검사합니다.
- `allowed_states()`로 리소스별 허용 상태 목록을 제공합니다.
- 이슈/STT 파이프라인 이벤트 이름을 상태 전이에 맞춰 매핑합니다.

### app/api/dependencies.py

- Access Token을 읽어 현재 사용자를 `CurrentUser`로 만듭니다.
- 워크스페이스 멤버 여부를 확인합니다.
- `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` role 기준 권한 검사를 제공합니다.
- 워크스페이스 접근 권한이 없으면 `403`을 발생시킵니다.

### app/core/security.py

- 비밀번호 해시/검증을 처리합니다.
- Access Token, Refresh Token을 생성합니다.
- HTTP API와 WebSocket에서 사용할 JWT 검증 helper를 제공합니다.

### app/core/limiter.py

- 로그인/초대 API의 Rate Limit 설정을 담당합니다.
- 초대 API는 사용자 ID 기반 key로 제한합니다.

### app/db/database.py

- SQLAlchemy engine, SessionLocal, Base를 정의합니다.
- `get_db()` dependency로 요청별 DB 세션을 제공합니다.
- `init_db()`에서 테이블 생성과 기존 DB 보정 SQL을 실행합니다.

### app/services/pubsub_service.py

- `REDIS_URL`이 설정된 경우 Node.js 서버에 위치한 Redis로 publish하는 클라이언트 연결을 담당합니다.
- `alert.created`, `meeting.updated` 같은 이벤트를 Node.js 서버 Redis로 전달하는 선택적 publish 기반입니다.

### app/services/meeting_service.py

- Meeting 상태 변경 이벤트 payload를 생성합니다.
- Node.js 서버 Redis의 `meeting.updated` 채널로 `startedAt`, `endedAt`을 포함한 이벤트를 publish합니다.
- Node.js Redis publish 실패 또는 `REDIS_URL` 미설정은 로그로 남기며, 이미 성공한 DB 상태 변경은 되돌리지 않습니다.

### app/utils/audit.py

- Audit Log를 별도 DB 세션으로 안전하게 기록합니다.
- 감사 로그 기록 실패가 본 API 성공/실패에 영향을 주지 않도록 분리합니다.

## 정리 대상

아래 항목은 실행에는 필요하지 않거나 정리 후보입니다.

| 경로 | 이유 | 권장 처리 |
| --- | --- | --- |
| `__pycache__/` | Python 실행 캐시 | Git 제외, 필요 시 삭제 가능 |
| `app/**/__pycache__/` | Python 실행 캐시 | Git 제외, 필요 시 삭제 가능 |
| `.DS_Store` | macOS Finder 메타데이터 | Git 제외, 삭제 가능 |
| `app/.DS_Store` | macOS Finder 메타데이터 | Git 제외, 삭제 가능 |
| `.docx_render/` | DOCX 렌더링 검수 결과물 | 문서 검수 후 삭제 가능 |
| `main.py` | 초기 테스트용 레거시 엔트리포인트 | 혼동 방지를 위해 삭제 또는 `legacy_main.py`로 이동 권장 |
| `app/websocket/__pycache__/` | Python 실행 캐시 | 소스가 아니므로 필요 시 삭제 가능 |

## 권장 최종 구조

FastAPI 기준으로는 아래 구조를 유지하는 것이 좋습니다.

```text
Backend/
├── app/
│   ├── main.py
│   ├── state.py
│   ├── api/
│   ├── core/
│   ├── db/
│   ├── models/
│   ├── schemas/
│   ├── services/
│   ├── utils/
│   └── websocket/
├── docs/
├── scripts/
├── uploads/
├── requirements.txt
├── docker-compose.yml
├── README.md
├── README_KO.md
├── .env
└── .env.example
```

현재 실시간 WebSocket의 정상 진입점은 Node.js입니다. FastAPI의 `app/websocket/`은
단일 서버 호환 경로이며, 다중 instance·Redis Stream replay·ACK는 Node.js gateway를
사용해야 합니다.
