# Phase 4 보안 위험 검토 및 운영 점검표

## 결론

현재 구현은 Workspace 권한 분리, AI 결과 접근 통제, 원본 음성 signed URL,
감사 로그, 민감 payload redaction을 적용했다. 다만 실제 보안 사고는 코드 자체보다
Redis 노출, secret 관리 실패, signed URL 유출, 개발 중 민감 로그 출력에서 발생할
가능성이 높다.

```text
코드 레벨 권한 통제: 양호
원본 음성 접근 제어: 양호
AI 결과 접근 제어: 양호
로그 민감정보 방어: 양호하나 팀 규칙 필요
Redis·네트워크·Secret 운영 설정: 반드시 보강 필요
```

## 1. Redis의 회의 데이터 노출

### 위험

실시간 Redis 이벤트와 Stream에는 발언 원문, 화자 라벨, 분석 결과가 포함될 수 있다.
Stream은 기본적으로 최근 10,000개 이벤트를 보관한다. Redis가 외부에 노출되거나
인증 없이 운영되면 회의 본문과 AI 결과가 유출될 수 있다.

### 필수 대응

- Redis 포트를 인터넷에 공개하지 않는다.
- FastAPI와 Node.js만 접근 가능한 내부 Docker network 또는 VPC subnet에 둔다.
- Redis ACL 또는 비밀번호를 설정한다.
- 운영 환경에서 Redis TLS 사용 여부를 검토한다.
- `REALTIME_STREAM_MAXLEN`과 Stream 삭제/보관 정책을 정한다.
- Redis 백업과 모니터링 로그에도 회의 데이터가 포함될 수 있음을 고려한다.

## 2. Signed URL 유출

### 현재 방어

- 원본 음성 링크 발급은 `MEMBER` 이상만 가능하다.
- 링크는 HMAC 서명과 만료 시간으로 검증한다.
- Redis `SET NX`로 링크당 한 번만 다운로드를 허용한다.
- 실제 storage path는 API 응답에 포함하지 않는다.

### 잔여 위험

유효한 링크가 사용되기 전에 다른 사람에게 유출되면, 먼저 접근한 사람이 다운로드할
수 있다. Signed URL은 발급 이후 링크 보유자를 다시 식별하지 않는 bearer credential이다.

### 필수 대응

- HTTPS만 사용한다.
- signed URL을 브라우저 로그, 분석 도구, 채팅, 오류 메시지에 남기지 않는다.
- `AUDIO_SIGNED_URL_TTL_SECONDS`를 필요 이상으로 길게 설정하지 않는다.
- 더 강한 통제가 필요하면 다운로드 endpoint에서도 JWT/세션을 재검증한다.

## 3. AI 분석 결과 callback 위조

### 현재 방어

`POST /workspaces/{workspace_id}/meetings/{meeting_id}/ai/result`는
`X-AI-Result-Secret`이 `AI_RESULT_CALLBACK_SECRET`과 일치할 때만 결과를 저장한다.
secret이 설정되지 않은 경우 요청을 거부한다.

### 필수 대응

- `AI_RESULT_CALLBACK_SECRET`은 32자 이상의 독립 난수로 설정한다.
- JWT `SECRET_KEY`, `AUDIO_SIGNING_SECRET`과 같은 값을 사용하지 않는다.
- 주기적인 secret rotation 정책을 만든다.
- 가능하면 callback 호출 서버 IP allowlist 또는 mTLS를 추가한다.
- `AI_REANALYSIS_URL`은 HTTPS 또는 내부 네트워크 주소만 사용한다.

## 4. 로그의 민감정보 유출

### 현재 방어

`sanitize_log_payload()`와 logger filter가 다음 구조화된 필드를 redaction한다.

- transcript, `raw_text`, `text`
- `summary_text`, `action_items`, `rediscussion_report`, `result`
- password, access/refresh token
- speaker embedding, audio payload, storage path, signed URL, signature
- Pydantic validation error의 `input`

### 잔여 위험

직접 문자열 보간을 사용하면 민감정보가 필터를 우회할 수 있다.

```python
# 금지
logger.info(f"transcript={raw_text}")
```

### 팀 규칙

- 회의 원문, AI 결과 전문, 실명 화자 매핑, 음성 바이트, storage path, signed URL을 로그에 기록하지 않는다.
- 로그에는 resource ID, workspace ID, 상태 코드, 길이, 처리 결과만 기록한다.
- 새 API의 오류 로그를 작성할 때는 `sanitize_log_payload()`를 사용한다.
- 코드 리뷰에서 문자열 보간 기반 logger 호출을 확인한다.

## 5. 데이터베이스 및 파일 저장소

### 확인 항목

- PostgreSQL 계정은 애플리케이션별 최소 권한으로 분리한다.
- DB backup, dump, 개발용 복사본의 접근 권한과 암호화를 관리한다.
- 운영 환경의 `DATABASE_URL`과 `.env`는 커밋하거나 공유하지 않는다.
- `audio_storage_path`는 `AUDIO_STORAGE_ROOT` 내부 경로만 허용한다.
- 음성 파일과 업로드 문서의 저장소 접근 권한을 서버 프로세스 최소 권한으로 제한한다.
- Workspace RLS를 운영에서 사용할지 결정하고, 사용 시 모든 쿼리 경로를 점검한다.

## 6. 프론트엔드 및 AI 출력

### 위험

AI summary, action item, 재논의 결과에는 신뢰할 수 없는 문자가 포함될 수 있다. 이를
HTML로 그대로 렌더링하면 XSS가 발생할 수 있다.

### 대응

- 프론트엔드는 AI 결과를 기본적으로 text node로 렌더링한다.
- HTML 렌더링이 필요하면 신뢰할 수 있는 sanitizer를 적용한다.
- AI 결과를 다시 프롬프트에 넣을 때는 데이터와 명령을 분리하고, system prompt에
  외부 문서의 명령을 따르지 않도록 명시한다.

## 배포 전 필수 점검

- [ ] `AI_REANALYSIS_URL` 설정
- [ ] `AI_RESULT_CALLBACK_SECRET` 설정 및 독립 난수 확인
- [ ] `AUDIO_SIGNING_SECRET` 설정 및 독립 난수 확인
- [ ] Redis 비공개 네트워크, 인증/ACL 설정
- [ ] Redis Stream 보관 정책 설정
- [ ] HTTPS 적용
- [ ] 녹음 저장 파이프라인이 `audio_storage_path`를 안전하게 기록하는지 확인
- [ ] DB backup 및 `.env` 접근 권한 점검
- [ ] 프론트 AI 결과 렌더링 XSS 점검
- [ ] 민감정보 logger 문자열 보간 금지 코드 리뷰

## 사고 대응 우선순위

1. Redis 또는 signed URL 유출 의심 시: Redis 접근 차단, secret rotation, Stream 정리
2. AI callback 위조 의심 시: callback secret rotation, 해당 Meeting AI 결과 감사
3. 민감 로그 발견 시: 로그 접근 차단, 보관 위치 확인, 해당 버전 배포 중단 및 redaction 보강
4. 음성 파일 노출 시: 파일 접근 차단, signed URL secret rotation, 발급 감사 로그 조사
