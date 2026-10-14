// ============================================================
// server/schemas/authSchema.js
// ============================================================
// 역할:
//   WebSocket 인증 관련 응답 객체를 생성한다.
//
// 현재 담당:
//   - SESSION_EXPIRED: Access Token 만료로 연결 종료 전
//     클라이언트에게 보내는 서버 알림 메시지
//
// 추후 확장 예정:
//   - AUTH_REFRESH 요청 스키마
//   - AUTH_REFRESH_ACK 응답 생성
// ============================================================

// ------------------------------------------------------------
// createSessionExpiredResponse
// Input  : 없음
// Output : SESSION_EXPIRED 응답 객체
//
// Access Token 만료로 WebSocket 연결을 종료하기 전에
// 클라이언트에게 보내는 서버 알림 메시지.
// ------------------------------------------------------------
function createSessionExpiredResponse() {
  return {
    type: 'SESSION_EXPIRED',
    success: false,
    payload: {
      message: '인증 시간이 만료되어 연결이 종료됩니다. 재로그인이 필요합니다.'
    }
  };
}

module.exports = {
  createSessionExpiredResponse
};