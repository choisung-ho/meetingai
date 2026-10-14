// ============================================================
// server/fastapi/tokenStore.js
// ============================================================
// 역할:
//   WebSocket 메시지 처리 흐름 안에서 Access Token을 안전하게 전달한다.
//   AsyncLocalStorage를 사용하여 동시 접속 유저 간 토큰이 섞이지 않도록 보장한다.
//
// 동작 원리:
//   connectionHandler에서 ws.on('message') 콜백을 tokenStore.run(token, fn)으로 감싸면,
//   해당 비동기 흐름 전체(messageRouter → handler → fastApiClient)에서
//   tokenStore.getToken()으로 토큰을 꺼낼 수 있다.
//
// 사용 예:
//   // connectionHandler.js
//   tokenStore.run(ws.token, () => messageRouter.route(wss, ws, rawMessage));
//
//   // fastApiClient.js
//   const token = tokenStore.getToken(); // → 'eyJhbGci...'
// ============================================================

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

module.exports = {
  /**
   * token을 컨텍스트에 실어 fn을 실행한다.
   * fn 안의 모든 비동기 흐름에서 getToken()으로 꺼낼 수 있다.
   *
   * @param {string|null} token - Access Token
   * @param {Function} fn - 실행할 함수
   */
  run: (token, fn) => storage.run(token, fn),

  /**
   * 현재 비동기 컨텍스트의 Access Token을 반환한다.
   * 컨텍스트 밖에서 호출하면 null을 반환한다.
   *
   * @returns {string|null}
   */
  getToken: () => storage.getStore() ?? null
};
