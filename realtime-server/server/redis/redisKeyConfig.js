// ============================================================
// server/redis/redisKeyConfig.js
// Redis key 생성 규칙과 TTL 값을 한 곳에서 관리한다.
// ============================================================

const REDIS_PREFIX = {
  // 사용자 세션 정보 저장용
  SESSION_USER: 'session:user:',

  // 사용자 위치/presence 상태 저장용
  PRESENCE: 'presence:',

  // 워크스페이스별 현재 참여자 목록 저장용
  WORKSPACE_PARTICIPANTS: 'workspace:participants:',

  // 회의방별 현재 참여자 목록 저장용
  MEETING_ROOM_PARTICIPANTS: 'meetingRoom:participants:',

  // 회의 상세 정보 캐시 저장용
  MEETING_DETAIL: 'meeting:detail:',

  // 워크스페이스별 전체 회의 id 목록 저장용
  WORKSPACE_MEETINGS: 'workspace:meetings:',

  // 워크스페이스별 ACTIVE 회의 id 목록 저장용
  WORKSPACE_ACTIVE_MEETINGS: 'workspace:activeMeetings:',

  // 이슈 상세 정보 캐시 저장용
  ISSUE_DETAIL: 'issue:detail:',

  // 회의별 전체 이슈 id 목록 저장용
  MEETING_ISSUES: 'meeting:issues:',

  // 회의별 삭제되지 않은 활성 이슈 id 목록 저장용
  MEETING_ACTIVE_ISSUES: 'meeting:activeIssues:',

  // 회의별 상태값 기준 이슈 id 목록 저장용
  MEETING_ISSUE_STATUS: 'meeting:issueStatus:',

  // 보안/감사 로그 큐 저장용
  AUDIT_LOG_QUEUE: 'audit_log_queue'
};

const REDIS_TTL = {
  // 사용자 세션 TTL: 6시간
  SESSION_SECONDS: 60 * 60 * 6,

  // Presence TTL: 현재 presenceStore에서 사용 안 함
  PRESENCE_SECONDS: 60 * 5,

  // 회의 상세 캐시 TTL: 30분
  MEETING_DETAIL_SECONDS: 60 * 30,

  // 이슈 상세 캐시 TTL: 30분
  ISSUE_DETAIL_SECONDS: 60 * 30
};

const REDIS_KEYS = {
  // 사용자 세션 key 생성용
  sessionUser(userId) {
    return `${REDIS_PREFIX.SESSION_USER}${userId}`;
  },

  // 전체 사용자 세션 key 검색용
  sessionUserPattern() {
    return `${REDIS_PREFIX.SESSION_USER}*`;
  },

  // 특정 scope 안의 사용자 presence key 생성용
  presence(scopeType, scopeId, userId) {
    return `${REDIS_PREFIX.PRESENCE}${scopeType}:${scopeId}:${userId}`;
  },

  // 특정 scope의 전체 presence key 검색용
  presenceScopePattern(scopeType, scopeId) {
    return `${REDIS_PREFIX.PRESENCE}${scopeType}:${scopeId}:*`;
  },

  // 특정 사용자의 모든 presence key 검색용
  presenceUserPattern(userId) {
    return `${REDIS_PREFIX.PRESENCE}*:*:${userId}`;
  },

  // 전체 presence key 검색용
  presenceAllPattern() {
    return `${REDIS_PREFIX.PRESENCE}*`;
  },

  // 워크스페이스 참여자 Set key 생성용
  workspaceParticipants(workspaceId) {
    return `${REDIS_PREFIX.WORKSPACE_PARTICIPANTS}${workspaceId}`;
  },

  // 전체 워크스페이스 참여자 Set key 검색용
  workspaceParticipantsPattern() {
    return `${REDIS_PREFIX.WORKSPACE_PARTICIPANTS}*`;
  },

  // 회의방 참여자 Set key 생성용
  meetingRoomParticipants(workspaceId, meetingId, meetingRoomId) {
    return `${REDIS_PREFIX.MEETING_ROOM_PARTICIPANTS}${workspaceId}:${meetingId}:${meetingRoomId}`;
  },

  // 전체 회의방 참여자 Set key 검색용
  meetingRoomParticipantsPattern() {
    return `${REDIS_PREFIX.MEETING_ROOM_PARTICIPANTS}*`;
  },

  // 특정 워크스페이스 안의 회의방 참여자 Set key 검색용
  workspaceMeetingRoomsPattern(workspaceId) {
    return `${REDIS_PREFIX.MEETING_ROOM_PARTICIPANTS}${workspaceId}:*`;
  },

  // 회의 상세 캐시 key 생성용
  meetingDetail(meetingId) {
    return `${REDIS_PREFIX.MEETING_DETAIL}${meetingId}`;
  },

  // 전체 회의 상세 캐시 key 검색용
  meetingDetailPattern() {
    return `${REDIS_PREFIX.MEETING_DETAIL}*`;
  },

  // 워크스페이스별 전체 회의 id Set key 생성용
  workspaceMeetings(workspaceId) {
    return `${REDIS_PREFIX.WORKSPACE_MEETINGS}${workspaceId}`;
  },

  // 워크스페이스별 ACTIVE 회의 id Set key 생성용
  workspaceActiveMeetings(workspaceId) {
    return `${REDIS_PREFIX.WORKSPACE_ACTIVE_MEETINGS}${workspaceId}`;
  },

  // 이슈 상세 캐시 key 생성용
  issueDetail(issueId) {
    return `${REDIS_PREFIX.ISSUE_DETAIL}${issueId}`;
  },

  // 전체 이슈 상세 캐시 key 검색용
  issueDetailPattern() {
    return `${REDIS_PREFIX.ISSUE_DETAIL}*`;
  },

  // 회의별 전체 이슈 id Set key 생성용
  meetingIssues(meetingId) {
    return `${REDIS_PREFIX.MEETING_ISSUES}${meetingId}`;
  },

  // 회의별 활성 이슈 id Set key 생성용
  meetingActiveIssues(meetingId) {
    return `${REDIS_PREFIX.MEETING_ACTIVE_ISSUES}${meetingId}`;
  },

  // 회의별 상태별 이슈 id Set key 생성용
  meetingIssueStatus(meetingId, status) {
    return `${REDIS_PREFIX.MEETING_ISSUE_STATUS}${meetingId}:${status}`;
  },

  // 감사 로그 큐 key 생성용
  auditLogQueue() {
    return REDIS_PREFIX.AUDIT_LOG_QUEUE;
  },

  //정확히 이 회의의 회의방 참여자
  meetingRoomParticipantsByMeetingPattern(workspaceId, meetingId) {
    return `${REDIS_PREFIX.MEETING_ROOM_PARTICIPANTS}${workspaceId}:${meetingId}:*`;
  }
};

module.exports = {
  REDIS_PREFIX,
  REDIS_KEYS,
  REDIS_TTL
};