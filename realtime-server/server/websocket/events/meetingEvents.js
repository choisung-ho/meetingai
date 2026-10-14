// ============================================================
// server/websocket/events/meetingEvents.js
// ============================================================
// 역할:
//   Meeting 계층에서 사용하는 WebSocket 이벤트 타입을 정의한다.
//
// Meeting 계층 책임:
//   - 미팅 데이터 생성 요청
//   - 미팅 목록 조회 요청
//
// 주의:
//   MeetingRoom은 "이미 존재하는 회의방에 참여/퇴장"하는 계층이고,
//   Meeting은 "회의 데이터 자체를 생성/조회"하는 계층이다.
// ============================================================

// Meeting 계층: 클라이언트가 서버로 보내는 이벤트
const MEETING_CLIENT_EVENTS = {
    CREATE_MEETING: "CREATE_MEETING",  // 새 미팅 생성 요청
    GET_MEETINGS: "GET_MEETINGS",       // 미팅 목록 조회 요청
    GET_MEETING: "GET_MEETING",        // 미팅 상세 조회 요청
    DELETE_MEETING: "DELETE_MEETING"    // 미팅 삭제 요청
};

// Meeting 계층: 서버가 클라이언트로 보내는 이벤트
const MEETING_SERVER_EVENTS = {
    CREATE_MEETING_ACK: "CREATE_MEETING_ACK", // 미팅 생성 성공 응답
    GET_MEETINGS_ACK: "GET_MEETINGS_ACK",     // 미팅 목록 조회 성공 응답
    GET_MEETING_ACK: "GET_MEETING_ACK",       // 미팅 상세 조회 성공 응답
    MEETING_CREATED: "MEETING_CREATED",        // 새 미팅 생성 브로드캐스트 알림
    DELETE_MEETING_ACK: "DELETE_MEETING_ACK", // 미팅 삭제 성공 응답
    MEETING_DELETED: "MEETING_DELETED"        // 미팅 삭제 브로드캐스트 알림
};

module.exports = {
    MEETING_CLIENT_EVENTS,
    MEETING_SERVER_EVENTS
};