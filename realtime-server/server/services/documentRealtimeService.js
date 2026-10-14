// ============================================================
// server/services/documentRealtimeService.js
// ============================================================
// 역할:
//   Redis Pub/Sub으로 수신한 document.uploaded payload를 받아
//   DOCUMENT_UPLOADED WebSocket 브로드캐스트 흐름으로 넘긴다.
//
// 전제:
//   - documentSubscriber에서 JSON.parse 완료
//   - documentSubscriber에서 Pub/Sub 공통/세부 스키마 검증 완료
//   - documentSubscriber가 event.payload를 이 service로 전달함
//
// 현재 입력 형식:
// {
//   id: 1,
//   workspace_id: 5,
//   meeting_id: 78 | null,
//   original_filename: '회의자료.pdf',
//   stored_filename: 'uuid-file.pdf',
//   content_type: 'application/pdf',
//   file_size: 12345,
//   storage_path: 'documents/uuid-file.pdf',
//   status: 'UPLOADED',
//   created_at: '2026-06-08T12:00:00'
// }
//
// 기준:
//   - meeting_id가 number이면 meeting 문서이다.
//   - meeting_id가 null이면 workspace/대시보드 문서이다.
//   - 이 service는 meeting_id 유무로 실패 처리하지 않는다.
//   - 실제 전송 대상 분기는 broadcastService.broadcastDocumentUploaded에서 처리한다.
// ============================================================

const broadcastService = require('./broadcastService');
const logger = require('../utils/logger');

class DocumentRealtimeService {
  // ----------------------------------------------------------
  // processDocumentUploaded
  // Input  : event — documentSubscriber에서 넘긴 event.payload
  // Output : Promise<void>
  //
  // 역할:
  //   검증 완료된 document.uploaded payload를 받아
  //   DOCUMENT_UPLOADED 브로드캐스트 흐름으로 넘긴다.
  //
  // 기준:
  //   - meeting_id가 number이면 meeting 문서 업로드 이벤트이다.
  //   - meeting_id가 null이면 workspace 문서 업로드 이벤트이다.
  //   - meeting_id가 null이어도 정상 처리한다.
  // ----------------------------------------------------------
  async processDocumentUploaded(event) {
    try {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        logger.error('document.uploaded 처리 실패: event payload가 객체가 아님');
        return;
      }

      const document = event;
      const workspaceId = document.workspace_id;
      const meetingId =
        document.meeting_id !== undefined
          ? document.meeting_id
          : null;

      if (workspaceId === undefined || workspaceId === null) {
        logger.error(
          `document.uploaded 처리 실패: workspace_id 없음, documentId=${document.id ?? 'unknown'}`
        );
        return;
      }

      if (document.id === undefined || document.id === null) {
        logger.error(
          `document.uploaded 처리 실패: document id 없음, workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}`
        );
        return;
      }

      const documentScope =
        meetingId === undefined || meetingId === null
          ? 'workspace'
          : 'meeting';

      logger.info(
        `document.uploaded 이벤트 처리 시작: scope=${documentScope}, workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, documentId=${document.id}`
      );

      await broadcastService.broadcastDocumentUploaded(null, {
        workspaceId,
        meetingId,
        document
      });

      logger.info(
        `document.uploaded 이벤트 처리 완료: scope=${documentScope}, workspaceId=${workspaceId}, meetingId=${meetingId ?? 'null'}, documentId=${document.id}`
      );
    } catch (error) {
      logger.error('document.uploaded 이벤트 처리 실패', error);
    }
  }
}

module.exports = new DocumentRealtimeService();
