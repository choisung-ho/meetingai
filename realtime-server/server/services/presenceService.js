// ============================================================
// server/services/presenceService.js
// ============================================================
// 역할:
//   Presence 상태 처리 비즈니스 로직을 담당한다.
//   presenceStore(Redis CRUD), sessionStore(사용자 메타), workspaceStore/meetingRoomStore(참여자 목록)를
//   조합하여 클라이언트 화면에 전달할 Presence 목록을 생성한다.
//
// SRP: Presence 상태 변환 및 집계 로직만 담당.
//
// Input/Output 흐름:
//   markWorkspaceOnline(wId, userId)                    → PresenceData
//   removeWorkspacePresence(wId, userId)                → PresenceData | null
//   getWorkspacePresenceList(wId)                       → PresenceListItem[]
//   markMeetingRoomOnline(wId, meetingId, roomId, uid)  → PresenceData
//   removeMeetingRoomPresence(wId, meetingId, roomId, uid) → PresenceData | null
//   getMeetingRoomPresenceList(wId, meetingId, roomId)  → PresenceListItem[]
// ============================================================

const presenceStore = require('../sessions/presenceStore');
const sessionStore = require('../sessions/sessionStore');
const workspaceStore = require('../sessions/workspaceStore');
const meetingRoomStore = require('../sessions/meetingRoomStore');
const logger = require('../utils/logger');

/** Presence scope 상수 */
const PRESENCE_SCOPE = {
  WORKSPACE: 'workspace',
  MEETING_ROOM: 'meetingRoom',
  MEETING_SESSION: 'meetingSession'
};

/** Presence status 상수 */
const PRESENCE_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  AWAY: 'away',
  SPEAKING: 'speaking',
  MUTED: 'muted'
};

class PresenceService {
  // ----------------------------------------------------------
  // _markOnline  (private)
  // Input  : scopeType — PRESENCE_SCOPE 값
  //          scopeId   — 공간 식별자
  //          userId    — 사용자 고유 ID
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async _markOnline(scopeType, scopeId, userId) {
    const presence = await presenceStore.setUserPresence(scopeType, scopeId, userId, {
      status: PRESENCE_STATUS.ONLINE,
      lastSeenAt: new Date().toISOString()
    });

    logger.info(`Presence online: scope=${scopeType}:${scopeId}, userId=${userId}`);

    return presence;
  }

  // ----------------------------------------------------------
  // _removePresence  (private)
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async _removePresence(scopeType, scopeId, userId) {
    const removed = await presenceStore.removeUserPresence(scopeType, scopeId, userId);

    logger.info(`Presence 삭제: scope=${scopeType}:${scopeId}, userId=${userId}`);

    return removed;
  }

  // ----------------------------------------------------------
  // _buildMeetingRoomScopeId  (private)
  // Input  : workspaceId, meetingId, meetingRoomId
  // Output : string — workspace → meeting → meetingRoom 순서의 scopeId
  // ----------------------------------------------------------
  _buildMeetingRoomScopeId(workspaceId, meetingId, meetingRoomId) {
    return `${workspaceId}:${meetingId}:${meetingRoomId}`;
  }

  // ----------------------------------------------------------
  // _buildPresenceList  (private)
  // Input  : userIds    — 참여자 userId 배열
  //          scopeType  — PRESENCE_SCOPE 값
  //          scopeId    — 공간 식별자
  // Output : Promise<PresenceListItem[]>
  // ----------------------------------------------------------
  async _buildPresenceList(userIds, scopeType, scopeId) {
    const list = [];

    for (const userId of userIds) {
      const session = await sessionStore.getUserSession(userId);
      let presence = await presenceStore.getUserPresence(scopeType, scopeId, userId);

      // 참여자 목록에는 있지만 Presence가 없으면 online으로 기본 생성
      if (!presence) {
        presence = await this._markOnline(scopeType, scopeId, userId);
      }

      list.push({
        userId,
        name: session?.name ?? null,
        status: presence.status,
        joinedAt: presence.joinedAt,
        lastSeenAt: presence.lastSeenAt
      });
    }

    return list;
  }

  // ------ Workspace scope -------

  // ----------------------------------------------------------
  // markWorkspaceOnline
  // Input  : workspaceId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markWorkspaceOnline(workspaceId, userId) {
    return this._markOnline(PRESENCE_SCOPE.WORKSPACE, workspaceId, userId);
  }

  // ----------------------------------------------------------
  // markWorkspaceOffline
  // Input  : workspaceId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markWorkspaceOffline(workspaceId, userId) {
    const presence = await presenceStore.updateUserPresenceStatus(
      PRESENCE_SCOPE.WORKSPACE,
      workspaceId,
      userId,
      PRESENCE_STATUS.OFFLINE
    );

    logger.info(`Workspace offline: workspaceId=${workspaceId}, userId=${userId}`);

    return presence;
  }

  // ----------------------------------------------------------
  // removeWorkspacePresence
  // Input  : workspaceId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async removeWorkspacePresence(workspaceId, userId) {
    return this._removePresence(PRESENCE_SCOPE.WORKSPACE, workspaceId, userId);
  }

  // ----------------------------------------------------------
  // getWorkspacePresenceList
  // Input  : workspaceId — 워크스페이스 고유 ID
  // Output : Promise<PresenceListItem[]> — 화면 표시용 참여자 목록
  // ----------------------------------------------------------
  async getWorkspacePresenceList(workspaceId) {
    const userIds = await workspaceStore.getWorkspaceUsers(workspaceId);

    return this._buildPresenceList(userIds, PRESENCE_SCOPE.WORKSPACE, workspaceId);
  }

  // ------ MeetingRoom scope -------

  // ----------------------------------------------------------
  // markMeetingRoomOnline
  // Input  : workspaceId, meetingId, meetingRoomId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markMeetingRoomOnline(workspaceId, meetingId, meetingRoomId, userId) {
    const scopeId = this._buildMeetingRoomScopeId(workspaceId, meetingId, meetingRoomId);

    return this._markOnline(PRESENCE_SCOPE.MEETING_ROOM, scopeId, userId);
  }

  // ----------------------------------------------------------
  // markMeetingRoomOffline
  // Input  : workspaceId, meetingId, meetingRoomId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markMeetingRoomOffline(workspaceId, meetingId, meetingRoomId, userId) {
    const scopeId = this._buildMeetingRoomScopeId(workspaceId, meetingId, meetingRoomId);

    const presence = await presenceStore.updateUserPresenceStatus(
      PRESENCE_SCOPE.MEETING_ROOM,
      scopeId,
      userId,
      PRESENCE_STATUS.OFFLINE
    );

    logger.info(`MeetingRoom offline: scopeId=${scopeId}, userId=${userId}`);

    return presence;
  }

  // ----------------------------------------------------------
  // removeMeetingRoomPresence
  // Input  : workspaceId, meetingId, meetingRoomId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async removeMeetingRoomPresence(workspaceId, meetingId, meetingRoomId, userId) {
    const scopeId = this._buildMeetingRoomScopeId(workspaceId, meetingId, meetingRoomId);

    return this._removePresence(PRESENCE_SCOPE.MEETING_ROOM, scopeId, userId);
  }

  // ----------------------------------------------------------
  // getMeetingRoomPresenceList
  // Input  : workspaceId, meetingId, meetingRoomId
  // Output : Promise<PresenceListItem[]>
  // ----------------------------------------------------------
  async getMeetingRoomPresenceList(workspaceId, meetingId, meetingRoomId) {
    const userIds = await meetingRoomStore.getMeetingRoomUsers(
      workspaceId,
      meetingId,
      meetingRoomId
    );

    const scopeId = this._buildMeetingRoomScopeId(workspaceId, meetingId, meetingRoomId);

    return this._buildPresenceList(userIds, PRESENCE_SCOPE.MEETING_ROOM, scopeId);
  }

  // ------ 범용 메서드 -------

  // ----------------------------------------------------------
  // markOnline
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markOnline(scopeType, scopeId, userId) {
    return this._markOnline(scopeType, scopeId, userId);
  }

  // ----------------------------------------------------------
  // markOffline
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markOffline(scopeType, scopeId, userId) {
    return presenceStore.updateUserPresenceStatus(
      scopeType,
      scopeId,
      userId,
      PRESENCE_STATUS.OFFLINE
    );
  }

  // ----------------------------------------------------------
  // markAway
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markAway(scopeType, scopeId, userId) {
    return presenceStore.updateUserPresenceStatus(
      scopeType,
      scopeId,
      userId,
      PRESENCE_STATUS.AWAY
    );
  }

  // ----------------------------------------------------------
  // markSpeaking
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markSpeaking(scopeType, scopeId, userId) {
    return presenceStore.updateUserPresenceStatus(
      scopeType,
      scopeId,
      userId,
      PRESENCE_STATUS.SPEAKING
    );
  }

  // ----------------------------------------------------------
  // markMuted
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData>
  // ----------------------------------------------------------
  async markMuted(scopeType, scopeId, userId) {
    return presenceStore.updateUserPresenceStatus(
      scopeType,
      scopeId,
      userId,
      PRESENCE_STATUS.MUTED
    );
  }

  // ----------------------------------------------------------
  // removePresence
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async removePresence(scopeType, scopeId, userId) {
    return this._removePresence(scopeType, scopeId, userId);
  }

  // ----------------------------------------------------------
  // updateLastSeen
  // Input  : scopeType, scopeId, userId
  // Output : Promise<PresenceData|null>
  // ----------------------------------------------------------
  async updateLastSeen(scopeType, scopeId, userId) {
    return presenceStore.updatePresenceLastSeen(scopeType, scopeId, userId);
  }

  // ----------------------------------------------------------
  // getPresenceList
  // Input  : scopeType, scopeId
  // Output : Promise<PresenceData[]>
  // ----------------------------------------------------------
  async getPresenceList(scopeType, scopeId) {
    return presenceStore.getPresenceList(scopeType, scopeId);
  }

  // ----------------------------------------------------------
  // removeUserFromAllPresence
  // Input  : userId — 사용자 고유 ID
  // Output : Promise<number>
  // ----------------------------------------------------------
  async removeUserFromAllPresence(userId) {
    return presenceStore.removeUserFromAllPresence(userId);
  }
}

const presenceService = new PresenceService();

// PRESENCE_SCOPE, PRESENCE_STATUS 상수도 함께 노출
presenceService.PRESENCE_SCOPE = PRESENCE_SCOPE;
presenceService.PRESENCE_STATUS = PRESENCE_STATUS;

module.exports = presenceService;
