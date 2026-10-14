// ============================================================
// server/websocket/events/issueEvents.js
// ============================================================
// 역할:
//   Issue 계층에서 사용하는 WebSocket 이벤트 타입을 정의한다.
//   클라이언트가 서버로 보내는 요청 이벤트와,
//   서버가 클라이언트로 보내는 응답 이벤트를 분리해 관리한다.
// ============================================================

// Issue 계층: 클라이언트가 서버로 보내는 이벤트
const ISSUE_CLIENT_EVENTS = {
    CREATE_ISSUE: "CREATE_ISSUE",                 // 안건 생성 요청
    GET_ISSUES: "GET_ISSUES",                     // 안건 목록 조회 요청
    GET_ISSUE: "GET_ISSUE",                       // 단일 안건 조회 요청
    GET_ALL_ISSUES: "GET_ALL_ISSUES",
    GET_ISSUE_EVENTS: "GET_ISSUE_EVENTS",         // 특정 안건 상태 변경 이벤트 목록 조회 요청
    UPDATE_ISSUE: "UPDATE_ISSUE",                 // 안건 기본 정보 수정 요청
    CHANGE_ISSUE_STATE: "CHANGE_ISSUE_STATE",     // 안건 상태 변경 요청
    DELETE_ISSUE: "DELETE_ISSUE"                  // 안건 삭제 요청
};

// Issue 계층: 서버가 클라이언트로 보내는 이벤트
const ISSUE_SERVER_EVENTS = {
    CREATE_ISSUE_ACK: "CREATE_ISSUE_ACK",                 // 안건 생성 결과 응답
    GET_ISSUES_ACK: "GET_ISSUES_ACK",                     // 안건 목록 조회 결과 응답
    GET_ISSUE_ACK: "GET_ISSUE_ACK",                       // 단일 안건 조회 결과 응답
    GET_ALL_ISSUES_ACK: "GET_ALL_ISSUES_ACK",
    GET_ISSUE_EVENTS_ACK: "GET_ISSUE_EVENTS_ACK",         // 특정 안건 상태 변경 이벤트 목록 조회 결과 응답
    UPDATE_ISSUE_ACK: "UPDATE_ISSUE_ACK",                 // 안건 기본 정보 수정 결과 응답
    CHANGE_ISSUE_STATE_ACK: "CHANGE_ISSUE_STATE_ACK",     // 안건 상태 변경 결과 응답
    DELETE_ISSUE_ACK: "DELETE_ISSUE_ACK",                 // 안건 삭제 결과 응답

    ISSUE_CREATED: "ISSUE_CREATED",                       // 안건 생성 알림
    ISSUE_UPDATED: "ISSUE_UPDATED",                       // 안건 업데이트 알림
    ISSUE_STATE_CHANGED: "ISSUE_STATE_CHANGED",           // 안건 상태 변경 알림
    ISSUE_DELETED: "ISSUE_DELETED"                        // 안건 삭제 알림
};

module.exports = {
    ISSUE_CLIENT_EVENTS,
    ISSUE_SERVER_EVENTS
};