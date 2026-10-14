// ============================================================
// server/schemas/documentSchema.js
// ============================================================
// 역할:
//   Document 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의하고,
//   클라이언트에게 보낼 ACK 응답 생성 함수와
//   Pub/Sub 기반 실시간 브로드캐스트 메시지 생성 함수를 제공한다.
//
// 대상 이벤트:
//   - GET_DOCUMENTS
//   - GET_WORKSPACE_DOCUMENTS
//   - GET_DOCUMENT
//   - DELETE_DOCUMENT
//   - DOCUMENT_UPLOADED
//   - DOCUMENT_DELETED
//   - DOCUMENT_PROCESSED
//
// Document 계층 책임:
//   - 특정 meeting에 연결된 문서 목록 조회
//   - 특정 workspace에 소속된 전체 문서 목록 조회
//   - 문서 단건 조회
//   - 문서 삭제
//   - Pub/Sub으로 수신한 문서 업로드/삭제 이벤트를 클라이언트에 전달
//
// FastAPI 명세 기준:
//   POST   /documents/upload?meeting_id={meeting_id}
//   POST   /documents/upload?workspace_id={workspace_id}
//   GET    /documents/?meeting_id={meeting_id}
//   GET    /documents/?workspace_id={workspace_id}
//   GET    /documents/{document_id}
//   DELETE /documents/{document_id}
//
// 규칙:
//   - documentId는 FastAPI의 document_id로 사용한다.
//   - GET_DOCUMENT, DELETE_DOCUMENT에서 FastAPI 호출에는 documentId만 사용한다.
//   - workspaceId는 WebSocket 서버의 workspace context 확인과
//     브로드캐스트 대상 계산을 위해 사용한다.
//   - meetingId, meetingRoomId는 회의 페이지 context 확인이 필요한 경우에만
//     선택적으로 사용한다.
//   - workspace 단위 문서는 응답에서 meetingId가 null이다.
//   - 클라이언트는 응답 payload의 meetingId 유무로
//     회의 문서와 workspace 문서를 구분할 수 있다.
//   - 파일 업로드는 multipart/form-data이므로 WebSocket JSON Schema로 검증하지 않는다.
//   - 업로드 완료 알림은 Redis Pub/Sub document.created 수신 후
//     DOCUMENT_UPLOADED 브로드캐스트로 클라이언트에 전달한다.
// ============================================================


// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// GET_DOCUMENTS
// Client → WebSocket Server
// 특정 meeting에 연결된 Document 목록 조회
//
// FastAPI:
//   GET /documents/?meeting_id={meeting_id}
//
// payload:
//   - workspaceId: WebSocket 서버의 workspace context 확인용
//   - meetingId: FastAPI meeting_id query parameter로 사용
//   - meetingRoomId: 현재 회의방 context 확인용
// ------------------------------------------------------------
const GET_DOCUMENTS_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_DOCUMENTS'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                }
            }
        }
    }
};

// ------------------------------------------------------------
// GET_WORKSPACE_DOCUMENTS
// Client → WebSocket Server
// 특정 workspace에 소속된 전체 Document 목록 조회
//
// FastAPI:
//   GET /documents/?workspace_id={workspace_id}
//
// 설명:
//   문서 탭/대시보드에서 사용하는 조회 요청이다.
//   meetingId가 있는 회의 문서와 meetingId가 null인 workspace 문서가 함께 반환된다.
//
// payload:
//   - workspaceId: FastAPI workspace_id query parameter로 사용
// ------------------------------------------------------------
const GET_WORKSPACE_DOCUMENTS_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_WORKSPACE_DOCUMENTS'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// GET_DOCUMENT
// Client → WebSocket Server
// Document 단건 조회
//
// FastAPI:
//   GET /documents/{document_id}
//
// 설명:
//   대시보드/문서 탭과 회의 페이지에서 공통으로 사용하는 단건 조회 이벤트이다.
//   FastAPI 단건 조회 호출에는 documentId만 사용한다.
//
// payload:
//   - workspaceId: WebSocket 서버의 workspace context 확인용
//   - documentId: FastAPI document_id path parameter로 사용
//   - meetingId: 회의 페이지 context 확인이 필요한 경우에만 선택적으로 사용
//   - meetingRoomId: 회의방 context 확인이 필요한 경우에만 선택적으로 사용
// ------------------------------------------------------------
const GET_DOCUMENT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_DOCUMENT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'documentId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                // meetingId와 meetingRoomId는 문서 탭/대시보드 단건 조회 시 필요하지 않다.
                // 회의 페이지에서 문서 단건 조회 context 확인이 필요한 경우에만 선택적으로 포함한다.
                // FastAPI 단건 조회 호출에는 documentId만 사용한다.
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                },
                documentId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DELETE_DOCUMENT
// Client → WebSocket Server
// Document 삭제
//
// FastAPI:
//   DELETE /documents/{document_id}
//
// Response:
//   204 No Content
//
// 설명:
//   FastAPI 삭제 호출에는 documentId만 사용한다.
//   WebSocket 서버는 FastAPI의 204 응답을 받은 뒤 요청자에게 DELETE_DOCUMENT_ACK를 전송한다.
//   필요하면 관련 클라이언트에게 DOCUMENT_DELETED 브로드캐스트를 전송한다.
//
// payload:
//   - workspaceId: WebSocket 서버의 workspace context 확인 및 브로드캐스트 대상 계산용
//   - documentId: FastAPI document_id path parameter로 사용
//   - meetingId: 회의 문서 삭제 context 확인 또는 브로드캐스트 대상 계산이 필요한 경우에만 선택적으로 사용
//   - meetingRoomId: 회의방 context 확인이 필요한 경우에만 선택적으로 사용
// ------------------------------------------------------------
const DELETE_DOCUMENT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DELETE_DOCUMENT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'documentId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                // meetingId와 meetingRoomId는 문서 탭/대시보드 삭제 시 필요하지 않다.
                // 회의 페이지에서 문서 삭제 context 확인 또는 브로드캐스트 대상 계산이 필요한 경우에만 선택적으로 포함한다.
                // FastAPI 삭제 호출에는 documentId만 사용한다.
                meetingId: {
                    type: 'integer'
                },
                meetingRoomId: {
                    type: 'integer'
                },
                documentId: {
                    type: 'integer'
                }
            }
        }
    }
};



// ============================================================
// Response Builders
// ============================================================

// ------------------------------------------------------------
// normalizeDocument
// FastAPI 응답 필드명을 WebSocket 클라이언트 응답 필드명으로 변환
//
// 규칙:
//   - meeting_id가 null이면 workspace 단위 문서이므로 null을 그대로 보존한다.
//   - meeting_id가 number이면 회의 문서로 판단할 수 있다.
//   - 클라이언트는 meetingId 유무로 문서 종류를 구분한다.
// ------------------------------------------------------------
const normalizeMeetingId = (document) => {
    if (document.meeting_id !== undefined) {
        return document.meeting_id;
    }

    if (document.meetingId !== undefined) {
        return document.meetingId;
    }

    return null;
};

const normalizeDocument = (document) => ({
    id: document.id,
    workspaceId: document.workspace_id ?? document.workspaceId,
    meetingId: normalizeMeetingId(document),
    originalFilename: document.original_filename ?? document.originalFilename,
    storedFilename: document.stored_filename ?? document.storedFilename,
    contentType: document.content_type ?? document.contentType,
    fileSize: document.file_size ?? document.fileSize,
    storagePath: document.storage_path ?? document.storagePath,
    status: document.status,
    createdAt: document.created_at ?? document.createdAt
});

// ------------------------------------------------------------
// GET_DOCUMENTS_ACK
// Server → 요청한 Client
// 특정 meeting에 연결된 Document 목록 조회 응답
// ------------------------------------------------------------
const getDocumentsAck = (requestId, documents) => ({
    type: 'GET_DOCUMENTS_ACK',
    requestId,
    success: true,
    payload: {
        data: documents.map((document) => normalizeDocument(document))
    }
});


// ------------------------------------------------------------
// GET_DOCUMENT_ACK
// Server → 요청한 Client
// Document 단건 조회 응답
// ------------------------------------------------------------
const getDocumentAck = (requestId, document) => ({
    type: 'GET_DOCUMENT_ACK',
    requestId,
    success: true,
    payload: normalizeDocument(document)
});

// ------------------------------------------------------------
// GET_WORKSPACE_DOCUMENTS_ACK
// Server → 요청한 Client
//
// FastAPI:
//   GET /documents/?workspace_id={workspace_id}
//
// 설명:
//   특정 workspace의 전체 Document 목록 조회 응답이다.
//   meetingId가 있는 회의 문서와 meetingId가 null인 workspace 문서가 함께 포함될 수 있다.
// ------------------------------------------------------------
const getWorkspaceDocumentsAck = (requestId, documents) => ({
    type: 'GET_WORKSPACE_DOCUMENTS_ACK',
    requestId,
    success: true,
    payload: {
        data: documents.map((document) => normalizeDocument(document))
    }
});


// ------------------------------------------------------------
// DELETE_DOCUMENT_ACK
// Server → 요청한 Client
//
// FastAPI DELETE /documents/{document_id}는 204 No Content라서
// 응답 body 없이 성공 여부만 확인한다.
// WebSocket 클라이언트에게는 DELETE_DOCUMENT_ACK로 삭제 완료를 알린다.
// ------------------------------------------------------------
const deleteDocumentAck = (requestId, documentId) => ({
    type: 'DELETE_DOCUMENT_ACK',
    requestId,
    success: true,
    payload: {
        documentId,
        deleted: true
    }
});


// ============================================================
// Pub/Sub Broadcast Builders
// ============================================================

// ------------------------------------------------------------
// DOCUMENT_UPLOADED
// Redis Pub/Sub document.created 수신 후
// WebSocket Server → 관련 Client
//
// FastAPI에서 Document 업로드 완료 후 document.created가 publish되면 사용한다.
// payload의 meetingId 유무로 workspace 문서와 meeting 문서를 구분한다.
//
// meetingId가 number:
//   회의 문서
//
// meetingId가 null:
//   workspace 단위 문서
// ------------------------------------------------------------
const documentUploadedBroadcast = (document) => ({
    type: 'DOCUMENT_UPLOADED',
    payload: normalizeDocument(document)
});


// ------------------------------------------------------------
// DOCUMENT_DELETED
// Redis Pub/Sub document.deleted 수신 후 또는
// Node DELETE_DOCUMENT 처리 후 관련 Client에게 전송한다.
//
// FastAPI DELETE 응답:
//   204 No Content
//
// WebSocket 요청자 응답:
//   DELETE_DOCUMENT_ACK
//
// WebSocket 관련 Client 브로드캐스트:
//   DOCUMENT_DELETED
//
// payload:
//   - documentId: 삭제된 문서 ID
//   - workspaceId: 문서가 속한 workspace ID
//   - meetingId: 회의 문서이면 number, workspace 문서이면 null
//   - deleted: 삭제 여부
// ------------------------------------------------------------
const documentDeletedBroadcast = ({ documentId, workspaceId, meetingId = null }) => ({
    type: 'DOCUMENT_DELETED',
    payload: {
        documentId,
        workspaceId,
        meetingId,
        deleted: true
    }
});

// ------------------------------------------------------------
// DOCUMENT_PROCESSED
// realtime.events의 document.processed 수신 후
// WebSocket Server → 관련 Client
// ------------------------------------------------------------
const documentProcessedBroadcast = ({
    documentId,
    workspaceId,
    meetingId = null,
    status,
    chunkCount = 0
}) => ({
    type: 'DOCUMENT_PROCESSED',
    payload: {
        documentId,
        workspaceId,
        meetingId,
        status,
        chunkCount
    }
});


// ============================================================
// module exports
// ============================================================

module.exports = {
    GET_DOCUMENTS_SCHEMA,
    GET_DOCUMENT_SCHEMA,
    GET_WORKSPACE_DOCUMENTS_SCHEMA,
    DELETE_DOCUMENT_SCHEMA,

    getDocumentsAck,
    getDocumentAck,
    getWorkspaceDocumentsAck,
    deleteDocumentAck,

    documentUploadedBroadcast,

    documentDeletedBroadcast,
    documentProcessedBroadcast
};
