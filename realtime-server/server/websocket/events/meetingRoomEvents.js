// MeetingRoom 계층: 클라이언트가 서버로 보내는 이벤트
const MEETING_ROOM_CLIENT_EVENTS = {
  JOIN_MEETING_ROOM: "JOIN_MEETING_ROOM",       //사용자가 회의실에 참여
  LEAVE_MEETING_ROOM: "LEAVE_MEETING_ROOM"      //사용자가 회의실에서 퇴장
};

// MeetingRoom 계층: 서버가 클라이언트로 보내는 이벤트
const MEETING_ROOM_SERVER_EVENTS = {
  JOIN_MEETING_ROOM_ACK: "JOIN_MEETING_ROOM_ACK",   //회의실 참여 성공 응답 
  LEAVE_MEETING_ROOM_ACK: "LEAVE_MEETING_ROOM_ACK",  //회의실 퇴장 성공 응답
  MEETING_ROOM_USERS_UPDATED: "MEETING_ROOM_USERS_UPDATED" //회의실 참여자 목록 업데이트 알림
};

module.exports = {
  MEETING_ROOM_CLIENT_EVENTS,
  MEETING_ROOM_SERVER_EVENTS
};
