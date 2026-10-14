// ============================================================
// server/services/broadcastService.js
// ============================================================
// 역할:
//   특정 workspaceId 또는 meetingRoomId에 속한 여러 클라이언트에게
//   동일한 이벤트를 전송하는 브로드캐스트 서비스 클래스.
//
// SRP: 브로드캐스트 전송 로직만 담당.
//      Presence 목록 조회는 presenceService에 위임.
//      실제 전송은 MessageSender에 위임.
//
// 보안 적용:
//   - client가 실제 존재하는지 확인
//   - WebSocket 연결이 OPEN 상태인지 확인
//   - JWT 인증을 통과한 소켓인지 확인
// ============================================================

const MessageSender = require('../utils/MessageSender');
const socketStore = require('../sessions/socketStore');
const meetingRoomStore = require('../sessions/meetingRoomStore');
const presenceService = require('./presenceService');
const { createWorkspaceUsersUpdated } = require('../schemas/workspaceSchema');
const {
  createMeetingCreated,
  createMeetingDeleted
} = require('../schemas/meetingSchema');

const { createMeetingStatusChanged } = require('../schemas/meetingSessionSchema');
const { createMeetingRoomUsersUpdated } = require('../schemas/meetingRoomSchema');
const {
  issueCreatedBroadcast,
  issueUpdatedBroadcast,
  issueDeletedBroadcast,
  issueStateChangedBroadcast
} = require('../schemas/issueSchema');
const { alertCreatedBroadcast } = require('../schemas/alertSchema');
const {
  documentUploadedBroadcast,
  documentDeletedBroadcast,
  documentProcessedBroadcast
} = require('../schemas/documentSchema');
const {
  sttResultCreatedBroadcast,
  sttResultUpdatedBroadcast,
  sttResultDeletedBroadcast
} = require('../schemas/sttResultSchema');
const {
  transcriptBroadcast,
  transcriptPartialBroadcast,
  topicBroadcast,
  analysisCompletedBroadcast,
  aiAnalysisUpdatedBroadcast
} = require('../schemas/transcriptSchema');
const logger = require('../utils/logger');

class BroadcastService {
  // ----------------------------------------------------------
  // canSendToClient
  // Input  : client — socketStore에서 조회한 WebSocket 객체
  // Output : boolean
  //
  // 역할:
  //   브로드캐스트 전송 전에 해당 client에게 메시지를 보내도 되는지 검사한다.
  //
  // 보안 조건:
  //   1. client가 존재해야 함
  //   2. WebSocket 연결이 OPEN 상태여야 함
  //   3. JWT 인증을 통과한 소켓이어야 함
  // ----------------------------------------------------------
  canSendToClient(client) {
    return (
      client &&
      client.readyState === 1 &&
      client.isAuthenticated === true
    );
  }

  // ----------------------------------------------------------
  // broadcastWorkspaceUsersUpdated
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          workspaceId — 참여자 목록을 갱신할 워크스페이스 ID
  // Output : Promise<void>
  // ----------------------------------------------------------
  async broadcastWorkspaceUsersUpdated(ws, workspaceId) {
    if (!workspaceId) {
      logger.error('WORKSPACE_USERS_UPDATED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    const users = await presenceService.getWorkspacePresenceList(workspaceId);

    logger.info(`WORKSPACE_USERS_UPDATED 생성: workspaceId=${workspaceId}, users=${users.length}명`);

    const response = createWorkspaceUsersUpdated({ workspaceId, users });

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(`브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, userId=${user.userId}`);
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패 , workspaceId=${workspaceId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(`WORKSPACE_USERS_UPDATED 완료: workspaceId=${workspaceId}, count=${users.length}`);
  }

  // ----------------------------------------------------------
  // broadcastMeetingCreated
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          workspaceId — 미팅이 생성된 워크스페이스 ID
  //          meeting     — 생성된 미팅 데이터
  // Output : Promise<void>
  // ----------------------------------------------------------
  async broadcastMeetingCreated(ws, { workspaceId, meeting }) {
    if (!workspaceId) {
      logger.error('MEETING_CREATED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (!meeting) {
      logger.error(`MEETING_CREATED 브로드캐스트 실패: meeting 데이터 없음, workspaceId=${workspaceId}`);
      return;
    }

    const users = await presenceService.getWorkspacePresenceList(workspaceId);

    logger.info(
      `MEETING_CREATED 생성: workspaceId=${workspaceId}, meetingId=${meeting.id}, users=${users.length}명`
    );

    const response = createMeetingCreated({
      workspaceId,
      ...meeting
    });

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `MEETING_CREATED 완료: workspaceId=${workspaceId}, meetingId=${meeting.id}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastMeetingStatusChanged
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          workspaceId — 상태가 변경된 미팅이 속한 워크스페이스 ID
  //          meeting     — 상태가 변경된 미팅 데이터
  // Output : Promise<void>
  //
  // 역할:
  //   회의 시작/종료 후 같은 Workspace 접속자 전체에게
  //   MEETING_STATUS_CHANGED 이벤트를 전송한다.
  // ----------------------------------------------------------
  async broadcastMeetingStatusChanged(ws, { workspaceId, meeting }) {
    if (!workspaceId) {
      logger.error('MEETING_STATUS_CHANGED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (!meeting) {
      logger.error(`MEETING_STATUS_CHANGED 브로드캐스트 실패: meeting 데이터 없음, workspaceId=${workspaceId}`);
      return;
    }

    const users = await presenceService.getWorkspacePresenceList(workspaceId);

    const meetingId = meeting.id ?? meeting.meetingId ?? meeting.meeting_id ?? null;

    logger.info(
      `MEETING_STATUS_CHANGED 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, status=${meeting.status}, users=${users.length}명`
    );

    const response = createMeetingStatusChanged({
      workspaceId,
      ...meeting
    });

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패 , workspaceId=${workspaceId}, userId=${user.userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `MEETING_STATUS_CHANGED 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, status=${meeting.status}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastMeetingRoomUsersUpdated
  // Input  : ws            — 요청을 보낸 WebSocket 객체
  //          workspaceId   — 회의방이 속한 워크스페이스 ID
  //          meetingId     — 실제 생성된 회의 고유 ID
  //          meetingRoomId — 참여자 목록을 갱신할 회의방 접속 상태 ID
  // Output : Promise<void>
  // ----------------------------------------------------------
  async broadcastMeetingRoomUsersUpdated(ws, { workspaceId, meetingId, meetingRoomId }) {
    if (!workspaceId) {
      logger.error('MEETING_ROOM_USERS_UPDATED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (!meetingId) {
      logger.error('MEETING_ROOM_USERS_UPDATED 브로드캐스트 실패: meetingId 없음');
      return;
    }

    if (!meetingRoomId) {
      logger.error('MEETING_ROOM_USERS_UPDATED 브로드캐스트 실패: meetingRoomId 없음');
      return;
    }

    const users = await presenceService.getMeetingRoomPresenceList(
      workspaceId,
      meetingId,
      meetingRoomId
    );

    logger.info(
      `MEETING_ROOM_USERS_UPDATED 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, users=${users.length}명`
    );

    const response = createMeetingRoomUsersUpdated({
      workspaceId,
      meetingId,
      meetingRoomId,
      users
    });

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패 , workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `MEETING_ROOM_USERS_UPDATED 완료: meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastMeetingDeleted
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          workspaceId — 미팅이 삭제된 워크스페이스 ID
  //          meetingId   — 삭제된 미팅 ID
  // Output : Promise<void>
  // ----------------------------------------------------------
  async broadcastMeetingDeleted(ws, { workspaceId, id }) {
    if (!workspaceId) {
      logger.error('MEETING_DELETED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (id === undefined || id === null) {
      logger.error(`MEETING_DELETED 브로드캐스트 실패: id 없음, workspaceId=${workspaceId}`);
      return;
    }

    const users = await presenceService.getWorkspacePresenceList(workspaceId);

    logger.info(
      `MEETING_DELETED 생성: workspaceId=${workspaceId}, id=${id}, users=${users.length}명`
    );

    const response = createMeetingDeleted({
      workspaceId,
      id
    });

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}, userId=${user.userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `MEETING_DELETED 완료: workspaceId=${workspaceId}, id=${id}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // _resolveIssueBroadcastContext  (private)
  // Input  : ws      — 요청을 보낸 WebSocket 객체
  //          issue   — FastAPI 응답 issue 데이터
  //          context — Handler에서 보강한 workspaceId/meetingId/meetingRoomId
  // Output : { workspaceId, meetingId, meetingRoomId }
  // 역할  : FastAPI 응답에는 meetingRoomId가 없을 수 있으므로
  //         Node WebSocket context 또는 handler context 값으로 보강한다.
  // ----------------------------------------------------------
  _resolveIssueBroadcastContext(ws, issue = {}, context = {}) {
    const workspaceId =
      issue?.workspaceId ??
      context?.workspaceId ??
      ws?.workspaceId ??
      null;

    const meetingId =
      issue?.meetingId ??
      issue?.meeting_id ??
      context?.meetingId ??
      context?.meeting_id ??
      ws?.meetingId ??
      null;

    const meetingRoomId =
      issue?.meetingRoomId ??
      issue?.meeting_room_id ??
      context?.meetingRoomId ??
      context?.meeting_room_id ??
      ws?.meetingRoomId ??
      null;

    return { workspaceId, meetingId, meetingRoomId };
  }

  // ----------------------------------------------------------
  // _broadcastIssue  (private)
  // Input  : eventName        — 로그에 사용할 이벤트명
  //          ws               — 요청을 보낸 WebSocket 객체
  //          issue            — FastAPI 응답 issue 데이터
  //          context          — Handler에서 보강한 context
  //          createResponseFn — issueSchema의 브로드캐스트 응답 생성 함수
  // Output : Promise<void>
  // 역할  : Issue 생성/수정/삭제 브로드캐스트 공통 처리
  //         Issue 이벤트는 workspace 전체 fallback 없이
  //         반드시 특정 meetingRoom 사용자에게만 전송한다.
  // ----------------------------------------------------------
  async _broadcastIssue(eventName, ws, issue = {}, context = {}, createResponseFn) {
    const id = issue?.id ?? issue?.issue_id;
    const { workspaceId, meetingId, meetingRoomId } = this._resolveIssueBroadcastContext(
      ws,
      issue,
      context
    );

    if (!workspaceId) {
      logger.error(`${eventName} 브로드캐스트 실패: workspaceId 없음`);
      return;
    }

    if (id === undefined || id === null) {
      logger.error(`${eventName} 브로드캐스트 실패: id 없음, workspaceId=${workspaceId}`);
      return;
    }

    // 회의방 단위 Issue 브로드캐스트이므로 meetingId는 필수
    if (meetingId === undefined || meetingId === null) {
      logger.warn(
        `${eventName} 브로드캐스트 차단: meetingId 없음. workspace 전체 전송 방지. workspaceId=${workspaceId}, id=${id}`
      );
      return;
    }

    // 회의방 단위 Issue 브로드캐스트이므로 meetingRoomId는 필수
    if (meetingRoomId === undefined || meetingRoomId === null) {
      logger.warn(
        `${eventName} 브로드캐스트 차단: meetingRoomId 없음. workspace 전체 전송 방지. workspaceId=${workspaceId}, meetingId=${meetingId}, id=${id}`
      );
      return;
    }

    const broadcastIssue = {
      ...issue,
      workspaceId,
      meetingId,
      meetingRoomId
    };

    const users = await presenceService.getMeetingRoomPresenceList(
      workspaceId,
      meetingId,
      meetingRoomId
    );

    logger.info(
      `${eventName} 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, id=${id}, users=${users.length}명`
    );

    const response = createResponseFn(broadcastIssue);

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${user.userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `${eventName} 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, id=${id}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // ISSUE_CREATED 브로드캐스트
  // 해당 meetingRoomId에 접속 중인 사용자에게만 ISSUE_CREATED 전송
  // meetingRoomId가 없으면 workspace fallback 없이 브로드캐스트 차단
  // ----------------------------------------------------------
  async broadcastIssueCreated(ws, issue = {}, context = {}) {
    return this._broadcastIssue(
      'ISSUE_CREATED',
      ws,
      issue,
      context,
      issueCreatedBroadcast
    );
  }

  // ----------------------------------------------------------
  // ISSUE_UPDATED 브로드캐스트
  // 해당 meetingRoomId에 접속 중인 사용자에게만 ISSUE_UPDATED 전송
  // meetingRoomId가 없으면 workspace fallback 없이 브로드캐스트 차단
  // ----------------------------------------------------------
  async broadcastIssueUpdated(ws, issue = {}, context = {}) {
    return this._broadcastIssue(
      'ISSUE_UPDATED',
      ws,
      issue,
      context,
      issueUpdatedBroadcast
    );
  }

  // ----------------------------------------------------------
  // ISSUE_STATE_CHANGED 브로드캐스트
  // 해당 meetingRoomId에 접속 중인 사용자에게만 ISSUE_STATE_CHANGED 전송
  // meetingRoomId가 없으면 workspace fallback 없이 브로드캐스트 차단
  // ----------------------------------------------------------
  async broadcastIssueStateChanged(ws, stateEvent = {}, context = {}) {
    return this._broadcastIssue(
      'ISSUE_STATE_CHANGED',
      ws,
      stateEvent,
      context,
      issueStateChangedBroadcast
    );
  }

  // ----------------------------------------------------------
  // ISSUE_DELETED 브로드캐스트
  // 해당 meetingRoomId에 접속 중인 사용자에게만 ISSUE_DELETED 전송
  // meetingRoomId가 없으면 workspace fallback 없이 브로드캐스트 차단
  // ----------------------------------------------------------
  async broadcastIssueDeleted(ws, issue = {}, context = {}) {
    return this._broadcastIssue(
      'ISSUE_DELETED',
      ws,
      issue,
      context,
      issueDeletedBroadcast
    );
  }

  // ----------------------------------------------------------
  // broadcastAlertCreated
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //                       Pub/Sub 서버 발생 이벤트에서는 null 가능
  //          workspaceId — 워크스페이스 ID
  //          meetingId   — 회의 ID
  //          alert       — FastAPI에서 생성된 Alert 데이터
  // Output : Promise<void>
  //
  // 역할:
  //   Redis Pub/Sub alert.created 수신 후
  //   해당 meeting에 접속 중인 모든 meetingRoom 사용자에게
  //   ALERT_CREATED 이벤트를 전송한다.
  //
  // 기준:
  //   meetingRoomId 없이 workspaceId + meetingId 기준으로 전송
  // ----------------------------------------------------------
  async broadcastAlertCreated(ws, { workspaceId, meetingId, alert }) {
    if (!workspaceId) {
      logger.error('ALERT_CREATED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (!meetingId) {
      logger.error(
        `ALERT_CREATED 브로드캐스트 실패: meetingId 없음, workspaceId=${workspaceId}`
      );
      return;
    }

    if (!alert) {
      logger.error(
        `ALERT_CREATED 브로드캐스트 실패: alert 데이터 없음, workspaceId=${workspaceId}, meetingId=${meetingId}`
      );
      return;
    }

    const userIds = await meetingRoomStore.getMeetingUsers(workspaceId, meetingId);

    logger.info(
      `ALERT_CREATED 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, alertId=${alert.id}, users=${userIds.length}명`
    );

    const response = alertCreatedBroadcast(alert);

    for (const userId of userIds) {
      const client = socketStore.getClient(userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, meetingId=${meetingId}, userId=${userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}, meetingId=${meetingId}, userId=${userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `ALERT_CREATED 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, alertId=${alert.id}, count=${userIds.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastDocumentUploaded
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //                       Pub/Sub 서버 발생 이벤트에서는 null 가능
  //          workspaceId — 워크스페이스 ID
  //          meetingId   — 회의 ID. workspace 문서인 경우 null 가능
  //          document    — FastAPI에서 업로드 완료된 Document 데이터
  // Output : Promise<void>
  //
  // 역할:
  //   Redis Pub/Sub document.created 수신 후
  //   관련 Client에게 DOCUMENT_UPLOADED 이벤트를 전송한다.
  //
  // 기준:
  //   - workspace 문서 업로드: workspaceId 기준 사용자에게 전송한다.
  //   - meeting 문서 업로드: meetingId 기준 회의 접속 사용자에게 전송한다.
  //   - workspace 문서와 meeting 문서는 별개이므로 서로에게 전송하지 않는다.
  //   - meetingRoomId 없이 workspaceId + meetingId 기준으로 전송한다.
  // ----------------------------------------------------------
  async broadcastDocumentUploaded(ws, { workspaceId, meetingId = null, document } = {}) {
    const resolvedWorkspaceId =
      workspaceId ??
      document?.workspaceId ??
      document?.workspace_id ??
      ws?.workspaceId ??
      null;

    const resolvedMeetingId =
      document?.meeting_id !== undefined
        ? document.meeting_id
        : meetingId ?? document?.meetingId ?? null;

    if (!resolvedWorkspaceId) {
      logger.error('DOCUMENT_UPLOADED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (!document) {
      logger.error(
        `DOCUMENT_UPLOADED 브로드캐스트 실패: document 데이터 없음, workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId ?? 'null'}`
      );
      return;
    }

    if (document.id === undefined || document.id === null) {
      logger.error(
        `DOCUMENT_UPLOADED 브로드캐스트 실패: document id 없음, workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId ?? 'null'}`
      );
      return;
    }

    const broadcastDocument = {
      ...document,
      workspace_id:
        document.workspace_id ??
        document.workspaceId ??
        resolvedWorkspaceId,
      meeting_id:
        document.meeting_id !== undefined
          ? document.meeting_id
          : document.meetingId !== undefined
            ? document.meetingId
            : resolvedMeetingId
    };

    const response = documentUploadedBroadcast(broadcastDocument);

    let userIds = [];

    if (resolvedMeetingId !== undefined && resolvedMeetingId !== null) {
      // meeting 문서 업로드
      // 같은 meeting에 접속 중인 사용자에게만 전송한다.
      userIds = await meetingRoomStore.getMeetingUsers(
        resolvedWorkspaceId,
        resolvedMeetingId
      );

      logger.info(
        `DOCUMENT_UPLOADED meeting 문서 대상 생성: workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId}, documentId=${document.id}, users=${userIds.length}명`
      );
    } else {
      // workspace 문서 업로드
      // workspace 문서 탭/대시보드 사용자에게만 전송한다.
      const workspaceUsers = await presenceService.getWorkspacePresenceList(
        resolvedWorkspaceId
      );

      userIds = workspaceUsers
        .map((user) => user.userId)
        .filter((userId) => userId !== undefined && userId !== null);

      logger.info(
        `DOCUMENT_UPLOADED workspace 문서 대상 생성: workspaceId=${resolvedWorkspaceId}, documentId=${document.id}, users=${userIds.length}명`
      );
    }

    for (const userId of userIds) {
      const client = socketStore.getClient(userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId ?? 'null'}, userId=${userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId ?? 'null'}, userId=${userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `DOCUMENT_UPLOADED 완료: workspaceId=${resolvedWorkspaceId}, meetingId=${resolvedMeetingId ?? 'null'}, documentId=${document.id}, count=${userIds.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastDocumentProcessed
  // Input  : document.processed realtime event
  // Output : Promise<void>
  //
  // 역할:
  //   문서 분석 완료 상태를 업로드/회의 화면의 모든 관련 클라이언트에
  //   전달한다. meeting_id가 null이면 workspace presence, 값이 있으면
  //   해당 meeting room 참여자를 대상으로 한다.
  // ----------------------------------------------------------
  async broadcastDocumentProcessed({
    workspaceId,
    meetingId = null,
    documentId,
    status,
    chunkCount = 0
  } = {}) {
    if (!workspaceId || !documentId) {
      logger.error(
        `DOCUMENT_PROCESSED 브로드캐스트 실패: workspaceId/documentId 없음 workspaceId=${workspaceId ?? 'null'} documentId=${documentId ?? 'null'}`
      );
      return;
    }

    const response = documentProcessedBroadcast({
      documentId,
      workspaceId,
      meetingId,
      status,
      chunkCount
    });

    const userIds = meetingId !== null && meetingId !== undefined
      ? await meetingRoomStore.getMeetingUsers(workspaceId, meetingId)
      : (await presenceService.getWorkspacePresenceList(workspaceId))
          .map((user) => user.userId)
          .filter((userId) => userId !== undefined && userId !== null);

    for (const userId of userIds) {
      const client = socketStore.getClient(userId);
      if (!this.canSendToClient(client)) continue;
      MessageSender.sendJson(client, response);
    }

    logger.info(
      `DOCUMENT_PROCESSED 완료: workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, documentId=${documentId}, status=${status}, count=${userIds.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastDocumentDeleted
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          document    — 삭제된 Document 정보
  //          context     — Handler에서 전달한 workspaceId/meetingId/meetingRoomId
  // Output : Promise<void>
  //
  // 역할:
  //   DELETE_DOCUMENT 처리 후 관련 Client에게 DOCUMENT_DELETED 이벤트를 전송한다.
  //
  // 기준:
  //   - workspace 문서 삭제: workspaceId 기준 사용자에게 전송한다.
  //   - meeting 문서 삭제: meetingRoomId 기준 사용자에게 전송한다.
  //   - workspace 문서와 meeting 문서는 별개이므로 서로에게 전송하지 않는다.
  //   - 조회 요청은 브로드캐스트하지 않는다.
  //   - 삭제 성공 후에만 브로드캐스트한다.
  // ----------------------------------------------------------
  async broadcastDocumentDeleted(ws, document = {}, context = {}) {
    const workspaceId =
      document.workspaceId ??
      context.workspaceId ??
      null;

    const meetingId =
      Object.prototype.hasOwnProperty.call(document, 'meetingId')
        ? document.meetingId
        : context.meetingId ?? null;

    const meetingRoomId =
      Object.prototype.hasOwnProperty.call(context, 'meetingRoomId')
        ? context.meetingRoomId
        : null;

    const documentId =
      document.documentId ??
      context.documentId ??
      null;

    if (!workspaceId) {
      logger.error('DOCUMENT_DELETED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (documentId === undefined || documentId === null) {
      logger.error(
        `DOCUMENT_DELETED 브로드캐스트 실패: documentId 없음, workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, meetingRoomId=${meetingRoomId ?? 'null'}`
      );
      return;
    }

    const response = documentDeletedBroadcast({
      documentId,
      workspaceId,
      meetingId: meetingId ?? null
    });

    let users = [];

    if (meetingId !== undefined && meetingId !== null) {
      if (meetingRoomId === undefined || meetingRoomId === null) {
        // FastAPI의 document.deleted 이벤트에는 특정 room id가 포함되지
        // 않는다. 이 경우 회의 전체 접속자를 대상으로 전파한다.
        users = (await meetingRoomStore.getMeetingUsers(workspaceId, meetingId))
          .map((userId) => ({ userId }));
      } else {
        users = await presenceService.getMeetingRoomPresenceList(
          workspaceId,
          meetingId,
          meetingRoomId
        );
      }

      logger.info(
        `DOCUMENT_DELETED meeting 문서 대상 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, documentId=${documentId}, users=${users.length}명`
      );
    } else {
      users = await presenceService.getWorkspacePresenceList(workspaceId);

      logger.info(
        `DOCUMENT_DELETED workspace 문서 대상 생성: workspaceId=${workspaceId}, documentId=${documentId}, users=${users.length}명`
      );
    }

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, meetingRoomId=${meetingRoomId ?? 'null'}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, meetingRoomId=${meetingRoomId ?? 'null'}, userId=${user.userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `DOCUMENT_DELETED 완료: workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, meetingRoomId=${meetingRoomId ?? 'null'}, documentId=${documentId}, count=${users.length}`
    );
  }

  // ----------------------------------------------------------
  // broadcastSttResultDeleted
  // Input  : ws          — 요청을 보낸 WebSocket 객체
  //          sttResult   — 삭제된 STT Result 정보
  //          context     — Handler에서 전달한 workspaceId/meetingId/meetingRoomId
  // Output : Promise<void>
  //
  // 역할:
  //   DELETE_STT_RESULT 처리 후 관련 Client에게 STT_RESULT_DELETED 이벤트를 전송한다.
  //
  // 기준:
  //   - STT Result는 회의/회의방 context에 종속된 데이터로 본다.
  //   - meetingRoomId 기준 사용자에게 전송한다.
  //   - 조회 요청은 브로드캐스트하지 않는다.
  //   - 삭제 성공 후에만 브로드캐스트한다.
  // ----------------------------------------------------------
  async broadcastSttResultDeleted(ws, sttResult = {}, context = {}) {
    const workspaceId =
      sttResult.workspaceId ??
      context.workspaceId ??
      null;

    const meetingId =
      sttResult.meetingId ??
      context.meetingId ??
      null;

    const meetingRoomId =
      sttResult.meetingRoomId ??
      context.meetingRoomId ??
      null;

    const sttResultId =
      sttResult.sttResultId ??
      context.sttResultId ??
      null;

    if (!workspaceId) {
      logger.error('STT_RESULT_DELETED 브로드캐스트 실패: workspaceId 없음');
      return;
    }

    if (meetingId === undefined || meetingId === null) {
      logger.error(
        `STT_RESULT_DELETED 브로드캐스트 실패: meetingId 없음, workspaceId=${workspaceId}, meetingRoomId=${meetingRoomId ?? 'null'}, sttResultId=${sttResultId ?? 'null'}`
      );
      return;
    }

    if (sttResultId === undefined || sttResultId === null) {
      logger.error(
        `STT_RESULT_DELETED 브로드캐스트 실패: sttResultId 없음, workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}`
      );
      return;
    }

    const response = sttResultDeletedBroadcast({
      workspaceId,
      meetingId,
      meetingRoomId,
      sttResultId
    });

    const users = meetingRoomId === undefined || meetingRoomId === null
      ? (await meetingRoomStore.getMeetingUsers(workspaceId, meetingId)).map((userId) => ({ userId }))
      : await presenceService.getMeetingRoomPresenceList(
          workspaceId,
          meetingId,
          meetingRoomId
        );

    logger.info(
      `STT_RESULT_DELETED 대상 생성: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}, users=${users.length}명`
    );

    for (const user of users) {
      const client = socketStore.getClient(user.userId);

      if (!client) {
        logger.info(
          `브로드캐스트 대상 socket 없음: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${user.userId}`
        );
        continue;
      }

      if (!this.canSendToClient(client)) {
        logger.warn(
          `브로드캐스트 차단: 인증 실패, workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, userId=${user.userId}`
        );
        continue;
      }

      MessageSender.sendJson(client, response);
    }

    logger.info(
      `STT_RESULT_DELETED 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}, sttResultId=${sttResultId}, count=${users.length}`
    );
  }

  // FastAPI의 STT 생성 이벤트를 해당 회의 접속자에게 전달한다.
  async broadcastSttResultCreated({ workspaceId, meetingId, sttResultId, status, utteranceCount }) {
    if (!workspaceId || !meetingId || !sttResultId) {
      logger.warn('STT_RESULT_CREATED 브로드캐스트 실패: 필수 식별자 없음');
      return 0;
    }

    const users = await meetingRoomStore.getMeetingUsers(workspaceId, meetingId);
    const response = sttResultCreatedBroadcast({
      workspaceId,
      meetingId,
      stt_result_id: sttResultId,
      status,
      utterance_count: utteranceCount,
    });

    let sent = 0;
    for (const userId of users) {
      const client = socketStore.getClient(userId);
      if (!this.canSendToClient(client)) continue;
      MessageSender.sendJson(client, response);
      sent += 1;
    }
    logger.info(`STT_RESULT_CREATED 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, sttResultId=${sttResultId}, count=${sent}`);
    return sent;
  }

  // FastAPI의 STT 수정 이벤트를 해당 회의 접속자에게 전달한다.
  async broadcastSttResultUpdated({ workspaceId, meetingId, sttResultId, status, changedFields }) {
    if (!workspaceId || !meetingId || !sttResultId) {
      logger.warn('STT_RESULT_UPDATED 브로드캐스트 실패: 필수 식별자 없음');
      return 0;
    }

    const users = await meetingRoomStore.getMeetingUsers(workspaceId, meetingId);
    const response = sttResultUpdatedBroadcast({
      id: sttResultId,
      workspace_id: workspaceId,
      meeting_id: meetingId,
      language: '',
      raw_text: '',
      status: status ?? '',
      created_at: '',
      changed_fields: changedFields ?? [],
    });

    let sent = 0;
    for (const userId of users) {
      const client = socketStore.getClient(userId);
      if (!this.canSendToClient(client)) continue;
      MessageSender.sendJson(client, response);
      sent += 1;
    }
    logger.info(`STT_RESULT_UPDATED 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, sttResultId=${sttResultId}, count=${sent}`);
    return sent;
  }

  // ----------------------------------------------------------
  // broadcastToMeeting  (실시간 발화 / AI 분석 공통 전송기)
  // Input  : workspaceId — 워크스페이스 ID
  //          meetingId   — 회의 ID
  //          response    — 전송할 WsResponse 객체
  //          eventName   — 로그용 이벤트 이름
  // Output : Promise<number> — 실제 전송한 클라이언트 수
  //
  // 역할:
  //   회의방에 접속한 사용자 전원에게 동일 이벤트를 전달한다.
  //   TRANSCRIPT / TOPIC_* / ANALYSIS_COMPLETED 처럼
  //   초당 여러 건 발생할 수 있는 이벤트가 공통으로 사용한다.
  //
  // 주의:
  //   실시간 발화는 빈도가 높으므로 성공 로그는 한 줄로만 남긴다.
  // ----------------------------------------------------------
  async broadcastToMeeting({ workspaceId, meetingId, response, eventName }) {
    if (!workspaceId || !meetingId) {
      logger.error(
        `${eventName} 브로드캐스트 실패: workspaceId 또는 meetingId 없음 (workspaceId=${workspaceId}, meetingId=${meetingId})`
      );
      return 0;
    }

    const userIds = await meetingRoomStore.getMeetingUsers(workspaceId, meetingId);
    let sentCount = 0;

    for (const userId of userIds) {
      const client = socketStore.getClient(userId);

      if (!client || !this.canSendToClient(client)) {
        continue;
      }

      MessageSender.sendJson(client, response);
      sentCount += 1;
    }

    logger.info(
      `${eventName} 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, count=${sentCount}`
    );

    return sentCount;
  }

  // ----------------------------------------------------------
  // broadcastTranscript
  // Input  : workspaceId, meetingId, chunkId, utterance
  // Output : Promise<number>
  //
  // 역할:
  //   확정된 발화를 speaker 포함 형태로 회의방에 전달한다.
  //   payload 최상단에 speaker와 text가 들어간다.
  // ----------------------------------------------------------
  async broadcastTranscript({ workspaceId, meetingId, chunkId, utterance }) {
    return this.broadcastToMeeting({
      workspaceId,
      meetingId,
      response: transcriptBroadcast({ workspaceId, meetingId, chunkId, utterance }),
      eventName: 'TRANSCRIPT'
    });
  }

  // ----------------------------------------------------------
  // broadcastTranscriptPartial
  //   저장되지 않는 중간 인식 결과를 회의방에 전달한다.
  // ----------------------------------------------------------
  async broadcastTranscriptPartial({ workspaceId, meetingId, chunkId, speaker, text }) {
    return this.broadcastToMeeting({
      workspaceId,
      meetingId,
      response: transcriptPartialBroadcast({
        workspaceId,
        meetingId,
        chunkId,
        speaker,
        text
      }),
      eventName: 'TRANSCRIPT_PARTIAL'
    });
  }

  // ----------------------------------------------------------
  // broadcastTopicEvent
  // Input  : serverEventType — TOPIC_CREATED / TOPIC_REVISITED 등
  //          event           — FastAPI realtime.events payload
  // Output : Promise<number>
  //
  // 역할:
  //   Phase 4 안건/재논의 이벤트를 회의방에 전달한다.
  //   재논의 이벤트에는 누가 재논의했는지(revisitedBy)가 포함된다.
  // ----------------------------------------------------------
  async broadcastTopicEvent(serverEventType, event = {}) {
    return this.broadcastToMeeting({
      workspaceId: event.workspace_id,
      meetingId: event.meeting_id,
      response: topicBroadcast(serverEventType, event),
      eventName: serverEventType
    });
  }

  // ----------------------------------------------------------
  // broadcastAnalysisCompleted
  //   발화 단위 분석 결과를 회의방에 전달한다.
  // ----------------------------------------------------------
  async broadcastAnalysisCompleted(event = {}) {
    return this.broadcastToMeeting({
      workspaceId: event.workspace_id,
      meetingId: event.meeting_id,
      response: analysisCompletedBroadcast(event),
      eventName: 'ANALYSIS_COMPLETED'
    });
  }

  // ----------------------------------------------------------
  // broadcastAiAnalysisUpdated
  //   회의 단위 AI 분석(요약/액션아이템/재논의 리포트) 갱신을 전달한다.
  // ----------------------------------------------------------
  async broadcastAiAnalysisUpdated(event = {}) {
    return this.broadcastToMeeting({
      workspaceId: event.workspace_id,
      meetingId: event.meeting_id,
      response: aiAnalysisUpdatedBroadcast(event),
      eventName: 'AI_ANALYSIS_UPDATED'
    });
  }
}

module.exports = new BroadcastService();
