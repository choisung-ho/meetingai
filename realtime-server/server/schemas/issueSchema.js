// ============================================================
// server/schemas/issueSchema.js
// ============================================================
// 역할:
//   Issue 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의하고,
//   클라이언트에게 보낼 ACK / Broadcast 응답 생성 함수를 제공한다.
//
// 대상 이벤트:
//   - CREATE_ISSUE
//   - GET_ISSUES
//   - UPDATE_ISSUE
//   - DELETE_ISSUE
//
// Issue 계층 책임:
//   - 회의 안건 생성
//   - 특정 회의의 안건 목록 조회
//   - 안건 수정
//   - 안건 삭제
//
// HTTP 서버 명세 기준:
//   POST   /issues
//   GET    /issues?meeting_id={meetingId}
//   PATCH  /issues/{issueId}
//   DELETE /issues/{issueId}
//
// 규칙:
//   - meetingId는 FastAPI의 meeting_id로 변환해서 전달한다.
//   - issueId는 FastAPI의 issue_id로 사용한다.
//   - workspaceId는 클라이언트 요청에서 받지 않는다.
//   - workspaceId는 FastAPI 응답 data.workspaceId를 사용한다.
// ============================================================


// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// CREATE_ISSUE
// Client → WebSocket Server
// ------------------------------------------------------------
const CREATE_ISSUE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'CREATE_ISSUE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'title'],
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
                },
                title: {
                    type: 'string',
                    minLength: 1
                },
                description: {
                    type: ['string', 'null']
                },
                status: {
                    type: 'string',
                    enum: ['OPEN', 'IN_PROGRESS', 'CLOSED'],
                    default: 'OPEN'
                },
                priority: {
                    type: ['string', 'null'],
                    enum: ['LOW', 'MEDIUM', 'HIGH', null]
                },
                dueDate: {
                    type: ['string', 'null']
                },
                assigneeId: {
                    type: ['integer', 'null']
                }
            }
        }
    }
};


// ------------------------------------------------------------
// GET_ISSUES
// Client → WebSocket Server
// ------------------------------------------------------------
const GET_ISSUES_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ISSUES'
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
// GET_ALL_ISSUES
// Client → WebSocket Server
// ------------------------------------------------------------
const GET_ALL_ISSUES_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ALL_ISSUES'
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
// UPDATE_ISSUE
// Client → WebSocket Server
// ------------------------------------------------------------
const UPDATE_ISSUE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'UPDATE_ISSUE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'issueId'],
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
                },
                issueId: {
                    type: 'integer'
                },
                title: {
                    type: 'string',
                    minLength: 1
                },
                description: {
                    type: ['string', 'null']
                },
                priority: {
                    type: ['string', 'null'],
                    enum: ['LOW', 'MEDIUM', 'HIGH', null]
                },
                dueDate: {
                    type: ['string', 'null']
                },
                assigneeId: {
                    type: ['integer', 'null']
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DELETE_ISSUE
// Client → WebSocket Server
// ------------------------------------------------------------
const DELETE_ISSUE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DELETE_ISSUE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'issueId'],
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
                },
                issueId: {
                    type: 'integer'
                }
            }
        }
    }
};

//--------추가-------------------------------------------------------------

// ------------------------------------------------------------
// GET_ISSUE
// Client → WebSocket Server
// 단일 issue 조회
// ------------------------------------------------------------
const GET_ISSUE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ISSUE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'issueId'],
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
                },
                issueId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// CHANGE_ISSUE_STATE
// Client → WebSocket Server
// issue 상태 전이 처리
// ------------------------------------------------------------
const CHANGE_ISSUE_STATE_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'CHANGE_ISSUE_STATE'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'issueId', 'toState', 'reason', 'evidence'],
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
                },
                issueId: {
                    type: 'integer'
                },
                toState: {
                    type: 'string',
                    enum: ['OPEN', 'IN_PROGRESS', 'CLOSED']
                },
                reason: {
                    type: ['string', 'null']
                },
                evidence: {
                    type: ['string', 'null']
                }
            }
        }
    }
};


// ------------------------------------------------------------
// GET_ISSUE_EVENTS
// Client → WebSocket Server
// 특정 issue의 상태 변경 이벤트 목록 조회
// ------------------------------------------------------------
const GET_ISSUE_EVENTS_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ISSUE_EVENTS'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'issueId'],
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
                },
                issueId: {
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
// CREATE_ISSUE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const createIssueAck = (requestId, issue) => ({
    type: 'CREATE_ISSUE_ACK',
    requestId,
    success: true,
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


// ------------------------------------------------------------
// GET_ISSUES_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getIssuesAck = (requestId, issues) => ({
    type: 'GET_ISSUES_ACK',
    requestId,
    success: true,
    payload: {
        issues: issues.map((issue) => ({
            id: issue.id,
            workspaceId: issue.workspaceId,
            meetingId: issue.meeting_id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            dueDate: issue.due_date,
            assigneeId: issue.assignee_id,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            deletedAt: issue.deleted_at
        }))
    }
});

// ------------------------------------------------------------
// GET_ALL_ISSUES_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getAllIssuesAck = (requestId, issues) => ({
    type: 'GET_ALL_ISSUES_ACK',
    requestId,
    success: true,
    payload: {
        issues: issues.map((issue) => ({
            id: issue.id,
            workspaceId: issue.workspaceId,
            meetingId: issue.meeting_id,
            title: issue.title,
            description: issue.description,
            status: issue.status,
            priority: issue.priority,
            dueDate: issue.due_date,
            assigneeId: issue.assignee_id,
            createdAt: issue.created_at,
            updatedAt: issue.updated_at,
            deletedAt: issue.deleted_at
        }))
    }
});



// ------------------------------------------------------------
// UPDATE_ISSUE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const updateIssueAck = (requestId, issue) => ({
    type: 'UPDATE_ISSUE_ACK',
    requestId,
    success: true,
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


// ------------------------------------------------------------
// DELETE_ISSUE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const deleteIssueAck = (requestId, issue) => ({
    type: 'DELETE_ISSUE_ACK',
    requestId,
    success: true,
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});

//--------추가-------------------------------------------------------------
// ------------------------------------------------------------
// GET_ISSUE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getIssueAck = (requestId, issue) => ({
    type: 'GET_ISSUE_ACK',
    requestId,
    success: true,
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


// ------------------------------------------------------------
// CHANGE_ISSUE_STATE_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const changeIssueStateAck = (requestId, stateEvent) => ({
    type: 'CHANGE_ISSUE_STATE_ACK',
    requestId,
    success: true,
    payload: {
        issueId: stateEvent.issue_id,
        fromState: stateEvent.from_state,
        toState: stateEvent.to_state,
        eventType: stateEvent.event_type,
        changedAt: stateEvent.changed_at
    }
});

// ------------------------------------------------------------
// GET_ISSUE_EVENTS_ACK
// WebSocket Server → Client
// issue 상태 변경 이벤트 목록 조회 성공 응답
// ------------------------------------------------------------
const createGetIssueEventsAck = (requestId, events) => ({
    type: 'GET_ISSUE_EVENTS_ACK',
    requestId,
    success: true,
    payload: {
        events: events.map(event => ({
            id: event.id,
            issueId: event.issue_id,
            meetingId: event.meeting_id,
            eventType: event.event_type,
            fromState: event.from_state,
            toState: event.to_state,
            reason: event.reason,
            evidence: event.evidence,
            createdAt: event.created_at
        }))
    }
});


// ------------------------------------------------------------
// ISSUE_CREATED
// Server → 같은 Workspace 접속자 전체
// ------------------------------------------------------------
const issueCreatedBroadcast = (issue) => ({
    type: 'ISSUE_CREATED',
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


// ------------------------------------------------------------
// ISSUE_UPDATED
// Server → 같은 Workspace 접속자 전체
// ------------------------------------------------------------
const issueUpdatedBroadcast = (issue) => ({
    type: 'ISSUE_UPDATED',
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


// ------------------------------------------------------------
// ISSUE_DELETED
// Server → 같은 Workspace 접속자 전체
// ------------------------------------------------------------
const issueDeletedBroadcast = (issue) => ({
    type: 'ISSUE_DELETED',
    payload: {
        id: issue.id,
        workspaceId: issue.workspaceId,
        meetingId: issue.meeting_id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        priority: issue.priority,
        dueDate: issue.due_date,
        assigneeId: issue.assignee_id,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
        deletedAt: issue.deleted_at
    }
});


//--------추가-------------------------------------------------------------
// ------------------------------------------------------------
// ISSUE_STATE_CHANGED
// Server → 같은 Workspace 접속자 전체
// ------------------------------------------------------------
const issueStateChangedBroadcast = (issueStateEvent) => ({
    type: 'ISSUE_STATE_CHANGED',
    payload: {
        issueId: issueStateEvent.issue_id,
        fromState: issueStateEvent.from_state,
        toState: issueStateEvent.to_state,
        eventType: issueStateEvent.event_type,
        changedAt: issueStateEvent.changed_at
    }
});


module.exports = {
    CREATE_ISSUE_SCHEMA,
    GET_ISSUES_SCHEMA,
    GET_ALL_ISSUES_SCHEMA,
    UPDATE_ISSUE_SCHEMA,
    DELETE_ISSUE_SCHEMA,

    GET_ISSUE_SCHEMA,
    CHANGE_ISSUE_STATE_SCHEMA,
    GET_ISSUE_EVENTS_SCHEMA,


    createIssueAck,
    getIssuesAck,
    getAllIssuesAck,

    updateIssueAck,
    deleteIssueAck,

    getIssueAck,
    changeIssueStateAck,
    createGetIssueEventsAck,

    issueCreatedBroadcast,
    issueUpdatedBroadcast,
    issueDeletedBroadcast,

    issueStateChangedBroadcast
};