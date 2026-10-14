// ============================================================
// server/sessions/socketStore.js
// ============================================================
// 역할:
//   현재 Node.js 프로세스에 실제로 연결된 WebSocket 객체(ws)를
//   메모리 Map으로 관리하는 싱글톤 클래스.
//
// SRP: userId ↔ ws 객체 매핑 관리만 담당.
//
// 왜 Redis가 아닌 메모리인가:
//   ws 객체는 네트워크 연결 객체이므로 JSON 직렬화 불가.
//   Redis에 저장할 수 없어 프로세스 로컬 Map으로 관리한다.
//
// Input/Output 흐름:
//   addClient(userId, ws)    → void
//   removeClient(userId)     → void
//   getClient(userId)        → WebSocket | undefined
// ============================================================

// ----------------------------------------------------------
// normalizeUserId
// Input  : userId — 사용자 고유 ID (number 또는 string)
// Output : string | null
//
// 왜 필요한가:
//   JWT의 sub는 숫자(1)로 들어오고, Redis(sMembers)는 항상 문자열("1")을 돌려준다.
//   Map은 1과 "1"을 다른 키로 취급하므로 정규화하지 않으면
//   presence/회의방 브로드캐스트가 "socket 없음"으로 전부 실패한다.
// ----------------------------------------------------------
function normalizeUserId(userId) {
  if (userId === null || userId === undefined) {
    return null;
  }

  return String(userId);
}

class SocketStore {
  constructor() {
    /**
     * @private
     * @type {Map<string, import('ws')>}
     * key: userId(항상 문자열로 정규화), value: WebSocket 객체
     */
    this._clients = new Map();
  }

  // ----------------------------------------------------------
  // addClient
  // Input  : userId — 사용자 고유 ID
  //          ws     — 실제 WebSocket 객체
  // Output : void
  // ----------------------------------------------------------
  addClient(userId, ws) {
    const key = normalizeUserId(userId);

    if (key === null) {
      return;
    }

    this._clients.set(key, ws);
  }

  // ----------------------------------------------------------
  // removeClient
  // Input  : userId — 사용자 고유 ID
  // Output : void
  // ----------------------------------------------------------
  removeClient(userId, ws) {
    const key = normalizeUserId(userId);

    if (key === null) {
      return;
    }

    const current = this._clients.get(key);

    // 지금 저장된 socket이 닫힌 socket과 같을 때만 삭제
    if (current === ws) {
      this._clients.delete(key);
    }
  }

  // ----------------------------------------------------------
  // getClient
  // Input  : userId — 사용자 고유 ID
  // Output : WebSocket | undefined
  // ----------------------------------------------------------
  getClient(userId) {
    const key = normalizeUserId(userId);

    if (key === null) {
      return undefined;
    }

    return this._clients.get(key);
  }

  // ----------------------------------------------------------
  // hasClient
  // Input  : userId — 사용자 고유 ID
  // Output : boolean
  // ----------------------------------------------------------
  hasClient(userId) {
    const key = normalizeUserId(userId);

    if (key === null) {
      return false;
    }

    return this._clients.has(key);
  }

  // ----------------------------------------------------------
  // getClientCount
  // Input  : 없음
  // Output : number — 현재 접속 클라이언트 수
  // ----------------------------------------------------------
  getClientCount() {
    return this._clients.size;
  }

  // ----------------------------------------------------------
  // getAllClients
  // Input  : 없음
  // Output : WebSocket[] — 모든 ws 객체 배열
  // ----------------------------------------------------------
  getAllClients() {
    return Array.from(this._clients.values());
  }

  // ----------------------------------------------------------
  // getAllClientEntries
  // Input  : 없음
  // Output : [userId, ws][] — 전체 엔트리 배열 (디버깅용)
  // ----------------------------------------------------------
  getAllClientEntries() {
    return Array.from(this._clients.entries());
  }

  // ----------------------------------------------------------
  // getClients
  // Input  : 없음
  // Output : Map<string, WebSocket>
  // ----------------------------------------------------------
  getClients() {
    return this._clients;
  }

  // ----------------------------------------------------------
  // clearClients  (테스트/종료용)
  // Input  : 없음
  // Output : void
  // ----------------------------------------------------------
  clearClients() {
    this._clients.clear();
  }
}

// 싱글톤 — 프로세스 전역에서 동일 Map 공유
module.exports = new SocketStore();
