/**
 * 사용자 세션 데이터 타입 정의
 *
 * Input  : CONNECT_USER 이벤트 payload (name) + JWT 검증 값 (userId, orgId)
 * Output : Redis에 저장되는 UserSession 객체
 */

/** Redis에 저장되는 사용자 세션 메타데이터 */
export interface UserSession {
  /** 사용자 고유 식별자 */
  userId: string;
  /** 사용자 표시 이름 (선택값) */
  name: string | null;
  /** 현재 연결 상태 (online | offline | away) */
  status: string;
  /** WebSocket 연결 최초 등록 시각 (ISO 8601) */
  connectedAt: string;
  /** 마지막 활동 시각 (ISO 8601) — PING 처리 시 갱신 */
  lastSeenAt: string;
}

/**
 * connectUser 서비스 호출 입력 파라미터
 * userId, orgId는 JWT → ws에서 추출. name은 CONNECT_USER payload에서 수신.
 */
export interface ConnectUserInput {
  name?: string | null;
}

/** disconnectUser 서비스 반환값 */
export interface DisconnectUserResult {
  userId: string;
}

/** pingUser 서비스 반환값 */
export interface PingUserResult {
  userId: string | null;
}
