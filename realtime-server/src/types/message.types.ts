/**
 * WebSocket 통신 메시지 타입 정의
 *
 * Input  : 클라이언트가 서버로 전송하는 JSON 문자열을 파싱한 객체
 * Output : 서버가 클라이언트에 전송하는 JSON 직렬화 가능한 객체
 */

/** 클라이언트 → 서버 요청 메시지 구조 */
export interface WsMessage {
  /** 이벤트 타입 식별자 (예: CONNECT_USER, JOIN_WORKSPACE) */
  type: string;
  /** 요청 추적 ID — 클라이언트가 응답을 매핑할 때 사용 (선택값) */
  requestId: string | null;
  /** 이벤트별 실제 데이터 컨테이너 */
  payload: Record<string, unknown>;
}

/** 서버 → 클라이언트 응답 메시지 구조 */
export interface WsResponse {
  /** 이벤트 타입 식별자 (예: CONNECT_USER_ACK, ERROR) */
  type: string;
  /** 요청 추적 ID — 요청과 응답 쌍을 맞추기 위해 echo 전송 */
  requestId: string | null;
  /** 처리 성공 여부 */
  success: boolean;
  /** 응답 데이터 컨테이너 */
  payload: Record<string, unknown>;
}

/** 메시지 유효성 검증 결과 */
export interface ValidationResult {
  /** 검증 통과 여부 */
  valid: boolean;
  /** 실패 시 에러 코드 (예: MISSING_PAYLOAD, INVALID_TYPE) */
  errorCode?: string;
  /** 실패 시 사람이 읽을 수 있는 에러 메시지 */
  message?: string;
}

/** ERROR 응답 payload */
export interface ErrorPayload {
  errorCode: string;
  message: string;
}
