// ============================================================
// server/services/alertRealtimeService.js
// ============================================================
// 역할:
//   Redis Pub/Sub으로 수신한 alert.created payload를 받아
//   ALERT_CREATED WebSocket 브로드캐스트 흐름으로 넘긴다.
//
// 전제:
//   - alertSubscriber에서 JSON.parse 완료
//   - alertSubscriber에서 Pub/Sub 스키마 검증 완료
//   - alertSubscriber가 event.payload를 이 service로 전달함
//
// 현재 입력 형식:
// {
//   id: 1,
//   workspace_id: 5,
//   meeting_id: 7,
//   issue_id: 12,
//   message: '마감일이 가까운 안건입니다.',
//   level: 'info',
//   status: 'PENDING',
//   created_at: '2026-05-27T10:00:00+09:00'
// }
// ============================================================

const broadcastService = require('./broadcastService');
const logger = require('../utils/logger');

class AlertRealtimeService {
  // ----------------------------------------------------------
  // processAlertCreated
  // Input  : event — alertSubscriber에서 넘긴 event.payload
  // Output : Promise<void>
  //
  // 역할:
  //   검증 완료된 alert.created payload를 받아
  //   해당 meeting 접속자들에게 ALERT_CREATED를 브로드캐스트한다.
  // ----------------------------------------------------------
  async processAlertCreated(event) {
    try {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        logger.error('alert.created 처리 실패: event payload가 객체가 아님');
        return;
      }

      const alert = event;
      const workspaceId = alert.workspace_id;
      const meetingId = alert.meeting_id;

      if (workspaceId === undefined || workspaceId === null) {
        logger.error(
          `alert.created 처리 실패: workspace_id 없음, alertId=${alert.id ?? 'unknown'}`
        );
        return;
      }

      if (meetingId === undefined || meetingId === null) {
        logger.error(
          `alert.created 처리 실패: meeting_id 없음, alertId=${alert.id ?? 'unknown'}`
        );
        return;
      }

      if (alert.id === undefined || alert.id === null) {
        logger.error(
          `alert.created 처리 실패: alert id 없음, workspaceId=${workspaceId}, meetingId=${meetingId}`
        );
        return;
      }

      logger.info(
        `alert.created 이벤트 처리 시작: workspaceId=${workspaceId}, meetingId=${meetingId}, alertId=${alert.id}`
      );

      await broadcastService.broadcastAlertCreated(null, {
        workspaceId,
        meetingId,
        alert
      });

      logger.info(
        `alert.created 이벤트 처리 완료: workspaceId=${workspaceId}, meetingId=${meetingId}, alertId=${alert.id}`
      );
    } catch (error) {
      logger.error('alert.created 이벤트 처리 실패', error);
    }
  }
}

module.exports = new AlertRealtimeService();
