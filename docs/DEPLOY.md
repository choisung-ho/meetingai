# 배포 가이드 (macOS)

## 결과물

| 항목 | 경로 |
| --- | --- |
| 설치 파일 | `dist-app/MeetingAI-1.0.0-arm64.dmg` (126MB) |
| 빌드 산출물 | `~/.meeting-ai-build/mac-arm64/MeetingAI.app` |

2026-08-31 검증 빌드 SHA-256: `59dc74ab2881b0f90a90fdce6a1415b00ba188b03ecf8d2585a6d737c22959b3`

DMG를 열고 `MeetingAI.app`을 `/Applications`로 끌어다 놓으면 설치됩니다.
앱을 실행하면 **백엔드와 실시간 서버가 자동으로 함께 실행**됩니다.
Electron은 시작 전에 PostgreSQL/Redis endpoint와 Python 모듈(`fastapi`, `uvicorn`,
`sqlalchemy`, `redis`, `faster_whisper`, `speechbrain`, `torch`, `torchaudio`, `av`)을 점검합니다. 누락된
모듈이 있으면 포트 timeout 대신 로그 위치와 설치 명령을 즉시 안내합니다.

> **주의**: 앱을 iCloud 동기화 폴더(바탕화면/문서)에 두지 마세요.
> macOS가 확장 속성을 붙여 코드 서명이 깨지고 앱이 실행되지 않습니다.
> `/Applications`에 두면 문제없습니다.

## 앱이 실행될 때 하는 일

```
MeetingAI.app 실행
 → PostgreSQL(5433) / Redis(6379) 연결 확인
 → 없으면 docker compose up -d 자동 시도
 → FastAPI 백엔드 기동 (127.0.0.1:8000)
 → Node 실시간 서버 기동 (127.0.0.1:8080)
 → 창 표시
```

앱 종료 시 두 서버도 함께 정리됩니다.
실행 로그는 `~/Library/Application Support/MeetingAI/logs/app.log`에 쌓입니다.

설치본의 실시간 서버는 기본적으로 `127.0.0.1:8080`에만 바인딩되어 외부 네트워크에
노출되지 않습니다. 원격 클라이언트가 접속하는 별도 서버 구성에서만
`MEETING_AI_REALTIME_HOST`와 `MEETING_AI_REALTIME_PORT`를 명시적으로 지정하세요.

## 사전 준비 (최초 1회)

### 1. 인프라

```bash
cd MeetingAI-App && docker compose up -d
```

기본 Compose 포트는 PostgreSQL `127.0.0.1:5433`, Redis `127.0.0.1:6379`로
loopback에만 노출됩니다. 외부 클라이언트가 필요한 서버 배포에서는 별도 네트워크·TLS
구성을 사용하고, 이 로컬 Compose를 인터넷에 직접 공개하지 마세요.

### 2. 파이썬 의존성

```bash
python3 -m pip install -r MeetingAI-App/backend/requirements.txt
```

### 3. 로컬 LLM (Ollama)

```bash
brew install ollama && ollama serve
```

앱 실행 시 Ollama가 꺼져 있으면 Electron이 `ollama serve`를 자동으로 실행합니다. 따라서 매번 별도로 `ollama serve`를 실행할 필요는 없습니다. Homebrew 서비스로 계속 실행하고 싶은 경우에만 아래 명령을 사용합니다.

```bash
brew services start ollama
```

모델이 없다면 앱이 최초 실행 때 아래 모델을 자동으로 받습니다. 네트워크가 제한된 환경에서는 미리 받아두는 것을 권장합니다.

```bash
ollama pull qwen2.5:7b
```

Ollama 실행 파일이 없거나 모델 다운로드가 실패하면 앱은 회의 기록/STT를 계속 제공하고 AI 요약만 규칙 기반으로 대체합니다. AI 요약까지 사용하려면 Ollama와 `qwen2.5:7b` 모델이 준비되어 있어야 합니다.

### 4. 실제 마이크·STT·화자 분리

1. 앱을 `/Applications`에 설치합니다.
2. 회의 화면에서 `회의 시작`을 누릅니다.
3. macOS 마이크 권한을 허용합니다. 이미 거부했다면 **시스템 설정 → 개인정보 보호 및 보안 → 마이크 → MeetingAI**를 켭니다.
4. 회의 중 실제 음성이 녹음됩니다.
5. `회의 종료`를 누르면 녹음 파일이 서버의 로컬 `faster-whisper` STT와 `speechbrain` ECAPA 화자 임베딩 모델로 처리됩니다.
6. 처리 완료 후 실시간 회의록과 음성 텍스트 탭에 `Speaker 1`, `Speaker 2`, `Unknown` 발화가 표시됩니다.

화자 분리는 최소 400ms 이상인 STT 구간을 대상으로 하며, 현재 기준값은 `DIARIZATION_CLUSTER_THRESHOLD=0.85`입니다. 실제 회의 녹음에서 화자가 과도하게 나뉘면 값을 낮추고, 서로 다른 화자가 하나로 합쳐지면 값을 높여 재보정해야 합니다. STT는 회의 종료 시 전체 녹음을 한 번에 처리해 화자 클러스터를 안정화합니다. `STT_TEMPERATURE`, `STT_INITIAL_PROMPT`, `STT_CONDITION_ON_PREVIOUS_TEXT`, VAD 및 filler 제거 옵션은 `backend/.env`에서 조정할 수 있습니다.

## AI 기능 구성

전부 **로컬에서 처리**되며 회의 내용이 외부로 전송되지 않습니다.

| 기능 | 사용 모델 | 설정 키 |
| --- | --- | --- |
| 음성 인식(STT) | faster-whisper `small` | `STT_MODEL` |
| 화자 분리 | speechbrain ECAPA-TDNN (192차원) | `DIARIZATION_MODEL` |
| 의미 임베딩 | `intfloat/multilingual-e5-small` (384차원) | `EMBEDDING_MODEL` |
| 회의 요약·액션아이템 | Ollama `qwen2.5:7b` | `LLM_MODEL` |

설정은 `backend/.env`에서 바꿉니다.

### 정확도 튜닝

| 설정 | 기본값 | 의미 |
| --- | --- | --- |
| `REDISCUSSION_SIMILARITY_THRESHOLD` | `0.90` | 재논의로 판단할 최소 의미 유사도. 실측(유사 0.908~0.954 / 무관 0.785~0.861) 기준. 놓치면 낮추고, 과탐지되면 높입니다. |
| `DIARIZATION_CLUSTER_THRESHOLD` | `0.85` | 같은 화자로 묶을 최소 음성 유사도. 화자가 과하게 나뉘면 낮추고, 서로 뭉치면 높입니다. |
| `STT_MODEL` | `small` | `base`(빠름) / `small`(권장) / `large-v3`(정확, 느림) |

## 사용 흐름

### A. 녹음 파일 업로드

```
POST /workspaces/{workspace_id}/meetings/{meeting_id}/audio/transcribe
```

`.wav .mp3 .m4a .mp4 .webm .ogg .flac .aac` (최대 200MB)

전사 → 화자 분리 → 발화 저장 → 안건 추출 → 재논의 탐지가 한 번에 수행됩니다.

### B. 실시간 회의

회의방 입장 후 WebSocket으로 `TRANSCRIPT_CHUNK`를 보내면
발화가 저장되고 `TRANSCRIPT` / `TOPIC_*` / `ALERT_CREATED` 이벤트가 회의방에 전달됩니다.

### C. AI 요약

회의를 `ENDED`로 바꾸면 요약·액션아이템·재논의 리포트가 자동 생성되고,
`AI_ANALYSIS_UPDATED` 이벤트가 발행됩니다.

```
GET /workspaces/{workspace_id}/meetings/{meeting_id}/ai
```

수동 재분석:

```
POST /workspaces/{workspace_id}/meetings/{meeting_id}/ai/re-analyze
```

## 다시 빌드하기

```bash
cd MeetingAI-App && ./scripts/build-mac.sh
```

이 스크립트는 iCloud 동기화 밖(`~/.meeting-ai-build`)에서 빌드한 뒤
DMG만 `dist-app/`으로 가져옵니다. 동기화 폴더 안에서 직접 빌드하면
코드 서명이 깨져 앱이 실행되지 않습니다.

## 설치본의 보안 처리

- **비밀키는 번들에 넣지 않습니다.** 개발용 `backend/.env`, `realtime-server/.env`는
  DMG에서 제외되며, 앱이 최초 실행 시 그 컴퓨터 전용 무작위 키를 만들어
  `~/Library/Application Support/MeetingAI/secrets.json`(600 권한)에 저장하고
  두 서버에 환경변수로 주입합니다. 설치본을 뜯어도 JWT를 위조할 수 없습니다.
- **사용자 파일은 앱 번들 밖에 저장합니다.**
  업로드 문서/녹음은 `~/Library/Application Support/MeetingAI/uploads/`에 들어갑니다.
  번들 안에 쓰면 코드 서명이 깨져 다음 실행부터 앱이 차단됩니다.
  같은 이유로 백엔드는 `PYTHONDONTWRITEBYTECODE=1`로 실행되어 `__pycache__`를 만들지 않습니다.

## 최종 확인 결과

- FastAPI 단위 테스트 33건 통과
- Python 컴파일, 프론트 타입체크/린트, realtime-server 타입체크 통과
- Ollama `qwen2.5:7b` 실제 JSON 요약·액션아이템·결정사항 생성 확인
- 실제 음성 파일(STT 모델 `small`) 전사와 ECAPA 192차원 임베딩/2개 화자 클러스터링 확인
- macOS arm64 DMG 생성, `hdiutil verify` 및 `codesign --verify --deep --strict` 통과 (2026-08-31)
- Windows `.exe`는 요청 범위에서 제외하고 생성하지 않음

상세 항목과 실행 명령은 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)에 있습니다.

## 알려진 제약

- **Apple 공증(notarization) 없음**: 개발자 인증서가 없어 ad-hoc 서명만 되어 있습니다.
  다른 Mac에서 처음 열 때 "확인되지 않은 개발자" 경고가 나오며,
  우클릭 → 열기로 실행하거나 개발자 계정으로 공증해야 합니다.
- **Intel Mac 미지원**: arm64로만 빌드했습니다. 필요하면
  `package.json`의 `mac.target.arch`에 `x64`를 추가하세요.
- **화자 분리 정확도 미검증**: ECAPA는 실제 사람 음성으로 학습된 모델입니다.
  이번 기능 점검에서는 서로 다른 음성 합성 입력에서 두 임베딩과 `Speaker 1/2`
  클러스터가 생성되는 것까지 확인했습니다. 실제 회의실 음향·겹침 발화에 대한
  정확도 보증은 아니므로 운영 시작 후 `DIARIZATION_CLUSTER_THRESHOLD`를 재보정해야 합니다.
- **마이크 STT 표시 시점**: 마이크 녹음은 회의 중 계속 수집되고, 녹음 파일 전체를
  회의 종료 시 한 번에 STT/화자 분리합니다. 회의 중 즉시 반영되는 텍스트는
  외부/브라우저 STT가 `TRANSCRIPT_CHUNK`로 보낸 확정·중간 chunk이며, 원본 마이크의
  단어 단위 스트리밍 전사는 CPU 기반 오프라인 diarization 품질을 보존하기 위해
  현재 릴리즈의 범위에서 제외했습니다.
- **PostgreSQL 위치**: 현재 `backend/.env`는 로컬 PostgreSQL 18(`5432/meeting_ai_phase1`)을 봅니다.
  이 DB에는 pgvector가 없어 유사도 검색이 Python 폴백으로 동작합니다.
  네이티브 벡터 검색이 필요하면 compose의 pgvector DB(5433)로 전환하세요.
