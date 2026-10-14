// ============================================================
// server/schemas/alertSchema.js
// ============================================================
// 역할:
//   Alert 계층 WebSocket 이벤트의 요청/응답 형식을 정의한다.
//   JSON Schema 형식으로 요청 메시지 구조를 정의하고,
//   클라이언트에게 보낼 ACK 응답 생성 함수를 제공한다.
//
// 대상 이벤트:
//   - GET_ALERTS
//   - GET_ALERT
//   - UPDATE_ALERT
//   - DELETE_ALERT
//   - ACKNOWLEDGE_ALERT
//   - DISMISS_ALERT
//   - RESOLVE_ALERT
//
// Alert 계층 책임:
//   - 알림 목록 조회
//   - 알림 단건 조회
//   - 알림 확인 처리
//   - 알림 숨김 처리
//   - 알림 해결 처리
//
// FastAPI 명세 기준:
//   GET    /alerts/
//   GET    /alerts/{alert_id}
//   PATCH  /alerts/{alert_id}
//   DELETE /alerts/{alert_id}
//   PATCH  /alerts/{alert_id}/acknowledge
//   PATCH  /alerts/{alert_id}/dismiss
//   PATCH  /alerts/{alert_id}/resolve
//
// 규칙:
//   - alertId는 FastAPI의 alert_id로 사용한다.
//   - meetingId는 FastAPI의 meeting_id로 변환해서 전달한다.
//   - issueId는 FastAPI의 issue_id로 변환해서 전달한다.
//   - 클라이언트가 직접 Alert를 생성하지 않으므로 POST /alerts/는 제외한다.
//   - Alert 생성 실시간 수신은 Redis alert.created 구독자와 연결한다.
// ============================================================


// ============================================================
// Request Schemas
// ============================================================

// ------------------------------------------------------------
// GET_ALERTS
// Client → WebSocket Server
// Alert 목록 조회
// ------------------------------------------------------------
const GET_ALERTS_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ALERTS'
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
                },
                status: {
                    type: 'string',
                    enum: ['PENDING', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED']
                }
            }
        }
    }
};


// ------------------------------------------------------------
// GET_ALERT
// Client → WebSocket Server
// Alert 단건 조회
// ------------------------------------------------------------
// ------------------------------------------------------------
// GET_ALERT
// Client → WebSocket Server
// Alert 단건 조회
// ------------------------------------------------------------
const GET_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'GET_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'meetingId', 'meetingRoomId', 'alertId'],
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
                alertId: {
                    type: 'integer'
                }
            }
        }
    }
};



//상태변경은 개인 성향이 강하기 때문에 공간단위 정보를 받지 않음


// ------------------------------------------------------------
// ACKNOWLEDGE_ALERT
// Client → WebSocket Server
// Alert 확인/읽음 처리
// ------------------------------------------------------------
const ACKNOWLEDGE_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'ACKNOWLEDGE_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['alertId'],
            additionalProperties: false,
            properties: {
                alertId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DISMISS_ALERT
// Client → WebSocket Server
// Alert 숨김/무시 처리
// ------------------------------------------------------------
const DISMISS_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DISMISS_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['alertId'],
            additionalProperties: false,
            properties: {
                alertId: {
                    type: 'integer'
                }
            }
        }
    }
};


// ------------------------------------------------------------
// RESOLVE_ALERT
// Client → WebSocket Server
// Alert 원인 해결 처리
// ------------------------------------------------------------
const RESOLVE_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'RESOLVE_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['alertId'],
            additionalProperties: false,
            properties: {
                alertId: {
                    type: 'integer'
                }
            }
        }
    }
};


//-----추가-----------------------------------------------------
// ------------------------------------------------------------
// UPDATE_ALERT
// Client → WebSocket Server
// Alert 일반 필드 수정
//
// FastAPI:
//   PATCH /alerts/{alert_id}
//
// 수정 가능 필드:
//   - meeting_id
//   - issue_id
//   - message
//   - level
//   - status
//
// workspaceId:
//   FastAPI body로 보내지 않는다.
//   Node 내부 권한 검증, 로그, 추후 브로드캐스트 확장용 context 값이다.
// ------------------------------------------------------------
const UPDATE_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'UPDATE_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['workspaceId', 'alertId'],
            additionalProperties: false,
            properties: {
                workspaceId: {
                    type: 'integer'
                },
                alertId: {
                    type: 'integer'
                },
                meetingId: {
                    type: 'integer'
                },
                issueId: {
                    type: 'integer'
                },
                message: {
                    type: 'string',
                    minLength: 1
                },
                level: {
                    type: 'string',
                    enum: ['info', 'warning', 'error']
                },
                status: {
                    type: 'string',
                    enum: ['PENDING', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED']
                }
            }
        }
    }
};


// ------------------------------------------------------------
// DELETE_ALERT
// Client → WebSocket Server
// Alert 삭제
//
// FastAPI:
//   DELETE /alerts/{alert_id}
//
// Response:
//   204 No Content
// ------------------------------------------------------------
const DELETE_ALERT_SCHEMA = {
    type: 'object',
    required: ['type', 'requestId', 'payload'],
    additionalProperties: false,
    properties: {
        type: {
            type: 'string',
            const: 'DELETE_ALERT'
        },
        requestId: {
            type: 'string',
            minLength: 1
        },
        payload: {
            type: 'object',
            required: ['alertId'],
            additionalProperties: false,
            properties: {
                alertId: {
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
// normalizeAlert
// FastAPI 응답 필드명을 WebSocket 클라이언트 응답 필드명으로 변환
// ------------------------------------------------------------
const normalizeAlert = (alert) => ({
    id: alert.id,
    workspaceId: alert.workspace_id,
    meetingId: alert.meeting_id,
    issueId: alert.issue_id,
    message: alert.message,
    level: alert.level,
    status: alert.status,
    createdAt: alert.created_at
});


// ------------------------------------------------------------
// GET_ALERTS_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getAlertsAck = (requestId, alerts) => ({
    type: 'GET_ALERTS_ACK',
    requestId,
    success: true,
    payload: {
        alerts: alerts.map((alert) => normalizeAlert(alert))
    }
});


// ------------------------------------------------------------
// GET_ALERT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const getAlertAck = (requestId, alert) => ({
    type: 'GET_ALERT_ACK',
    requestId,
    success: true,
    payload: normalizeAlert(alert)
});


// ------------------------------------------------------------
// ACKNOWLEDGE_ALERT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const acknowledgeAlertAck = (requestId, alert) => ({
    type: 'ACKNOWLEDGE_ALERT_ACK',
    requestId,
    success: true,
    payload: normalizeAlert(alert)
});


// ------------------------------------------------------------
// DISMISS_ALERT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const dismissAlertAck = (requestId, alert) => ({
    type: 'DISMISS_ALERT_ACK',
    requestId,
    success: true,
    payload: normalizeAlert(alert)
});


// ------------------------------------------------------------
// RESOLVE_ALERT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const resolveAlertAck = (requestId, alert) => ({
    type: 'RESOLVE_ALERT_ACK',
    requestId,
    success: true,
    payload: normalizeAlert(alert)
});


//---추가-------------------------------------------------------
// ------------------------------------------------------------
// UPDATE_ALERT_ACK
// Server → 요청한 Client
// ------------------------------------------------------------
const updateAlertAck = (requestId, alert) => ({
    type: 'UPDATE_ALERT_ACK',
    requestId,
    success: true,
    payload: normalizeAlert(alert)
});


// ------------------------------------------------------------
// DELETE_ALERT_ACK
// Server → 요청한 Client
//
// FastAPI DELETE /alerts/{alert_id}는 204 No Content라서
// 응답 body 없이 alertId만 내려준다.
// ------------------------------------------------------------
const deleteAlertAck = (requestId, alertId) => ({
    type: 'DELETE_ALERT_ACK',
    requestId,
    success: true,
    payload: {
        alertId,
        deleted: true
    }
});


// ============================================================
// Pub/Sub Broadcast Builder
// ============================================================

// ------------------------------------------------------------
// ALERT_CREATED
// Redis Pub/Sub alert.created 수신 후
// WebSocket Server → 관련 Client
//
// 현재 FastAPI는 PUBLISH_READY alert.created 로그만 남기는 단계.
// 실제 Redis publish 연결 후 사용할 예정.
// ------------------------------------------------------------
const alertCreatedBroadcast = (alert) => ({
    type: 'ALERT_CREATED',
    payload: normalizeAlert(alert)
});


// ============================================================
// module exports
// ============================================================

module.exports = {
    GET_ALERTS_SCHEMA,
    GET_ALERT_SCHEMA,
    ACKNOWLEDGE_ALERT_SCHEMA,
    DISMISS_ALERT_SCHEMA,
    RESOLVE_ALERT_SCHEMA,
    UPDATE_ALERT_SCHEMA,
    DELETE_ALERT_SCHEMA,

    getAlertsAck,
    getAlertAck,
    acknowledgeAlertAck,
    dismissAlertAck,
    resolveAlertAck,
    updateAlertAck,
    deleteAlertAck,

    alertCreatedBroadcast
};
