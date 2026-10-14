// ============================================================
// server/handlers/documentHandler.js
// ============================================================
// 역할:
//   Document 계층 WebSocket 이벤트를 처리한다.
//   클라이언트 요청을 검증한 뒤 documentService를 호출하고,
//   요청한 클라이언트에게 ACK를 반환한다.
//
// 현재 범위:
//   - GET_DOCUMENTS
//   - GET_WORKSPACE_DOCUMENTS
//   - GET_DOCUMENT
//   - DELETE_DOCUMENT
//
// 원칙:
//   - Document 업로드는 이 Handler에서 처리하지 않는다.
//   - GET_DOCUMENTS, GET_WORKSPACE_DOCUMENTS, GET_DOCUMENT는 조회 요청이므로 broadcast 하지 않는다.
//   - DELETE_DOCUMENT는 FastAPI realtime.events 삭제 이벤트를 통해 관련 사용자에게 전파한다.
//   - workspace 문서와 meeting 문서는 별개로 처리한다.
//   - FastAPI 실패 응답의 statusCode/message는 임의 변환하지 않고 그대로 내려보낸다.
// ============================================================

const BaseHandler = require('./BaseHandler');
const documentService = require('../services/documentService');

const {
    GET_DOCUMENTS_SCHEMA,
    GET_WORKSPACE_DOCUMENTS_SCHEMA,
    GET_DOCUMENT_SCHEMA,
    DELETE_DOCUMENT_SCHEMA,

    getDocumentsAck,
    getWorkspaceDocumentsAck,
    getDocumentAck,
    deleteDocumentAck
} = require('../schemas/documentSchema');

class DocumentHandler extends BaseHandler {
    // ----------------------------------------------------------
    // GET_DOCUMENTS
    // Client → WebSocket Server
    // 특정 meeting에 연결된 Document 목록 조회
    //
    // FastAPI:
    //   GET /documents/?meeting_id={meetingId}
    // ----------------------------------------------------------
    async handleGetDocuments(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_DOCUMENTS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId;
        const meetingRoomId = message.payload.meetingRoomId ?? ws.meetingRoomId ?? null;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (meetingId === undefined || meetingId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ID',
                'payload.meetingId가 필요합니다.'
            );
            return;
        }

        if (meetingRoomId === undefined || meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                '회의방 안에서 Document 목록을 조회하려면 meetingRoomId가 필요합니다.'
            );
            return;
        }

        try {
            const documents = await documentService.getDocuments({
                meetingId
            });

            this.sendAck(
                ws,
                getDocumentsAck(message.requestId ?? null, documents)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Document 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_WORKSPACE_DOCUMENTS
    // Client → WebSocket Server
    // 특정 workspace에 소속된 전체 Document 목록 조회
    //
    // FastAPI:
    //   GET /documents/?workspace_id={workspaceId}
    // ----------------------------------------------------------
    async handleGetWorkspaceDocuments(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_WORKSPACE_DOCUMENTS_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        try {
            const documents = await documentService.getWorkspaceDocuments({
                workspaceId
            });

            this.sendAck(
                ws,
                getWorkspaceDocumentsAck(message.requestId ?? null, documents)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Workspace Document 목록 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }

    // ----------------------------------------------------------
    // GET_DOCUMENT
    // Client → WebSocket Server
    // Document 단건 조회
    //
    // FastAPI:
    //   GET /documents/{document_id}
    //
    // 기준:
    //   - FastAPI 호출에는 documentId만 사용한다.
    //   - workspaceId는 WebSocket context 확인용이다.
    //   - meetingId, meetingRoomId는 회의 페이지 context 확인이 필요한 경우에만 선택적으로 전달된다.
    //   - meetingId가 전달된 경우에는 회의 페이지 요청으로 보고 meetingRoomId도 필요하다.
    // ----------------------------------------------------------
    async handleGetDocument(wss, ws, message) {
        if (!this.validateOrReject(ws, message, GET_DOCUMENT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId ?? null;
        const meetingRoomId = message.payload.meetingRoomId ?? null;
        const documentId = message.payload.documentId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (documentId === undefined || documentId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_DOCUMENT_ID',
                'payload.documentId가 필요합니다.'
            );
            return;
        }

        // 회의 페이지 context 확인용
        // 대시보드 단건 조회에서는 meetingId를 보내지 않으므로 이 검사를 타지 않는다.
        // meetingId가 있으면 회의 페이지 요청이므로 meetingRoomId도 필요하다.
        if (meetingId !== null && meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                '회의 페이지에서 Document를 조회하려면 payload.meetingRoomId가 필요합니다.'
            );
            return;
        }

        try {
            const document = await documentService.getDocument({
                documentId
            });

            if (!document?.id) {
                this.sendError(
                    ws,
                    message.requestId,
                    404,
                    '요청한 Document를 찾을 수 없습니다.'
                );
                return;
            }

            this.sendAck(
                ws,
                getDocumentAck(message.requestId ?? null, document)
            );

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Document 조회에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }


    // DELETE_DOCUMENT
    // Client → WebSocket Server
    // Document 삭제
    //
    // FastAPI:
    //   DELETE /documents/{document_id}
    //
    // 기준:
    //   - FastAPI 호출에는 documentId만 사용한다.
    //   - workspaceId는 WebSocket context 확인 및 broadcast 대상 계산용이다.
    //   - meetingId, meetingRoomId는 회의 문서 삭제인 경우에만 선택적으로 전달된다.
    //   - meetingId가 있으면 meeting 문서 삭제로 본다.
    //   - meetingId가 없으면 workspace 문서 삭제로 본다.
    //   - workspace 문서 삭제와 meeting 문서 삭제는 별개로 broadcastService에서 분기한다.
    // ----------------------------------------------------------
    async handleDeleteDocument(wss, ws, message) {
        if (!this.validateOrReject(ws, message, DELETE_DOCUMENT_SCHEMA)) return;

        const workspaceId = message.payload.workspaceId;
        const meetingId = message.payload.meetingId ?? null;
        const meetingRoomId = message.payload.meetingRoomId ?? null;
        const documentId = message.payload.documentId;

        if (workspaceId === undefined || workspaceId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_WORKSPACE_ID',
                'payload.workspaceId가 필요합니다.'
            );
            return;
        }

        if (documentId === undefined || documentId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_DOCUMENT_ID',
                'payload.documentId가 필요합니다.'
            );
            return;
        }

        // meetingId가 있으면 회의 문서 삭제 요청이다.
        // 이 경우 meetingRoomId도 있어야 broadcastService가 meetingRoom 대상으로 전송할 수 있다.
        if (meetingId !== null && meetingRoomId === null) {
            this.sendError(
                ws,
                message.requestId,
                'MISSING_MEETING_ROOM_ID',
                '회의 문서를 삭제하려면 payload.meetingRoomId가 필요합니다.'
            );
            return;
        }

        try {
            await documentService.deleteDocument({
                documentId
            });

            this.sendAck(
                ws,
                deleteDocumentAck(message.requestId ?? null, documentId)
            );

            // FastAPI가 document.deleted를 realtime.events에 발행하고
            // RealtimeEventSubscriber가 canonical 브로드캐스트를 수행한다.
            // 여기서도 전송하면 요청자/회의 참가자에게 이벤트가 중복된다.

        } catch (error) {
            const errorCode = error?.statusCode ?? 500;
            const errorMessage = error?.message || 'Document 삭제에 실패했습니다.';

            this.sendError(
                ws,
                message.requestId,
                errorCode,
                errorMessage
            );
        }
    }
}

const documentHandler = new DocumentHandler();

module.exports = {
    handleGetDocuments: (wss, ws, msg) =>
        documentHandler.handleGetDocuments(wss, ws, msg),

    handleGetWorkspaceDocuments: (wss, ws, msg) =>
        documentHandler.handleGetWorkspaceDocuments(wss, ws, msg),

    handleGetDocument: (wss, ws, msg) =>
        documentHandler.handleGetDocument(wss, ws, msg),

    handleDeleteDocument: (wss, ws, msg) =>
        documentHandler.handleDeleteDocument(wss, ws, msg),

    DocumentHandler
};
