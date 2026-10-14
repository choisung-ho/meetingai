# Notion 명세 ↔ 최종 구현 대조표

검증일: 2026-08-31  
참조: `Project Docs/ 프로젝트 문서 및 새 데이터 소스`, `파트분배`, `MVP 완료 기준`,
`WebSocket 이벤트 명세서`, `websocket 규약`, `redis 명세`, `상태 전이표`, `❗ 플랜아이`

이 문서는 Notion에 기록된 담당 범위와 현재 통합 앱(`backend` + `realtime-server` +
`frontend`)의 실제 구현을 마지막으로 대조한 결과다.

## 단계별 적용 결과

### Phase 3 — 실시간 연결

- [x] `TRANSCRIPT_CHUNK`를 Node WebSocket에서 수신하고 FastAPI
      `/realtime/meetings/{meeting_id}/chunks`로 전달
- [x] `is_final=false` 중간 발화는 저장하지 않고 `TRANSCRIPT_PARTIAL`로 즉시 전달
- [x] 확정 발화는 `source_chunk_id`/sequence 중복을 DB와 advisory lock으로 차단
- [x] 최근 N개·최대 글자 수 context window 유지
- [x] `workspace_id`/`meeting_id`/`meetingRoomId` context 불일치 요청 차단
- [x] 문서·STT·발화·분석 이벤트를 Redis `realtime.events`와 Stream에 기록
- [x] Node의 단일 `realtimeEventSubscriber`가 canonical 이벤트를 WebSocket으로 변환
      (전용 subscriber 중복 실행 제거)

### Phase 4 — AI/RAG·화자

- [x] TXT/MD/CSV/DOCX/PDF 파싱, chunk overlap, 문장 임베딩
- [x] pgvector HNSW 검색 + 확장 미설치 시 Python cosine 폴백
- [x] 임베딩 모델 로드 실패 시에도 선언된 벡터 차원을 유지하는 hash 폴백
- [x] 상태 머신 기반 안건·결정·재논의 탐지와 `TOPIC_*`/`ALERT_CREATED` 이벤트
- [x] faster-whisper 회의 prompt·VAD·이전 문맥 유지·filler 후처리
- [x] ECAPA-TDNN 구간 임베딩, average-linkage clustering, `Speaker N`/`Unknown` 라벨
- [x] MediaRecorder WebM/Opus 입력에 PyAV 디코더 fallback 적용
- [x] Ollama 요약·액션아이템·결정사항과 규칙 기반 fallback

### 보안·배포

- [x] JWT/workspace 권한 검증, 내부 분석 secret, signed audio URL(만료·1회 사용)
- [x] 회의 원문·embedding·토큰을 로그에서 마스킹
- [x] Redis 장애 시 DB 저장은 유지하고 `/health`에서 DB/Redis를 별도 표시
- [x] Electron sandbox(`nodeIntegration=false`, `contextIsolation=true`), 사용자 데이터
      외부 저장, 설치별 비밀키(600 권한)
- [x] Electron 시작 전 DB/Redis endpoint와 Python 필수 모듈을 점검하고 오류 안내
- [x] 설치본 WebSocket을 `127.0.0.1`에만 바인딩해 외부 네트워크 노출 차단
- [x] 데스크톱 Compose의 PostgreSQL/Redis 포트를 `127.0.0.1`에만 바인딩
- [x] macOS arm64 DMG 생성 및 hdiutil/codesign deep·strict 검증
- [x] Windows `.exe`는 요청 범위에서 제외

## 운영자가 반드시 준비할 항목

1. Docker Desktop의 PostgreSQL(pgvector)·Redis 또는 동일 endpoint를 준비한다.
2. Python 3.11에 `backend/requirements.txt`를 설치하고 `MEETING_AI_PYTHON`으로 지정한다.
3. LLM까지 사용하려면 Ollama와 `qwen2.5:7b`를 설치한다(미설치 시 규칙 기반 fallback).
4. 실제 회의 녹음으로 `DIARIZATION_CLUSTER_THRESHOLD`를 보정한다. 합성음 검증은
   엔진 경로 확인용이며 실제 회의실 정확도를 보증하지 않는다.
5. 외부 인터넷 배포가 필요한 경우 TLS 종료·reverse proxy·인증서 갱신은 운영 인프라에서
   적용한다. 데스크톱 설치본의 FastAPI/WS는 로컬 loopback으로만 바인딩된다.

## 명시된 현재 범위

마이크는 회의 중 MediaRecorder로 계속 수집하고 회의 종료 시 전체 파일을 STT·화자
분리한다. 회의 중 즉시 반영되는 텍스트는 브라우저/외부 STT가 `TRANSCRIPT_CHUNK`로
보낸다. 원본 마이크의 단어 단위 스트리밍 STT는 CPU 기반 오프라인 diarization 품질을
보존하기 위해 다음 고도화 범위로 남겨 두었다.
