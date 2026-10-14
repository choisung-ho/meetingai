// ============================================================
// server/services/alertService.js
// ============================================================
// 역할:
//   Alert 계층의 클라이언트 요청 처리용 서비스 흐름을 담당한다.
//   WebSocket Handler에서 받은 요청을 FastAPI Alert API 호출로 연결한다.
//
// 현재 범위:
//   - GET_ALERTS
//   - GET_ALERT
//   - ACKNOWLEDGE_ALERT
//   - DISMISS_ALERT
//   - RESOLVE_ALERT
//
// 원칙:
//   - Alert 생성은 클라이언트 직접 요청이 아니라 FastAPI 내부 생성 흐름으로 본다.
//   - Pub/Sub 기반 실시간 Alert 전송은 여기서 처리하지 않는다.
//   - Redis 캐시도 현재 단계에서는 사용하지 않는다.
//   - 실제 원본 데이터는 FastAPI/DB이다.
//
// 주의:
//   - WebSocket payload는 camelCase를 사용한다.
//   - FastAPI 요청 필드는 snake_case를 사용한다.
//   - FastAPI 실패 응답의 statusCode와 message는 임의 변환하지 않고 그대로 Handler로 올려보낸다.
// ============================================================

const { alertApi } = require('../fastapi');
const logger = require('../utils/logger');

class AlertService {
    // ----------------------------------------------------------
    // getAlerts
    // Input  : {
    //   meetingId,
    //   issueId,
    //   status,
    //   level
    // }
    // Output : Promise<Array>
    // 역할  :
    //   1. FastAPI에서 Alert 목록을 조회한다.
    //   2. 현재 WebSocket 명세 기준으로는 meetingId 중심으로 사용한다.
    //   3. 조회 결과 data 배열을 그대로 반환한다.
    //
    // FastAPI:
    //   GET /alerts/?meeting_id={meetingId}
    // ----------------------------------------------------------
    async getAlerts({
        meetingId,
        issueId,
        status,
        level
    }) {
        logger.info(
            `Alert 목록 조회 요청: meetingId=${meetingId}, issueId=${issueId ?? 'none'}, status=${status ?? 'none'}, level=${level ?? 'none'}`
        );

        const result = await alertApi.getAlerts({
            meeting_id: meetingId,
            issue_id: issueId,
            status,
            level
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Alert 목록 조회 실패 응답: meetingId=${meetingId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'Alert 목록 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        const alerts = Array.isArray(result.data) ? result.data : [];

        logger.info(
            `Alert 목록 조회 완료: meetingId=${meetingId}, count=${alerts.length}`
        );

        return alerts;
    }

    // ----------------------------------------------------------
    // getAlert
    // Input  : { alertId }
    // Output : Promise<Object>
    // 역할  :
    //   1. FastAPI에서 특정 Alert 상세 정보를 조회한다.
    //   2. 조회 성공 시 Alert 객체를 그대로 반환한다.
    //
    // FastAPI:
    //   GET /alerts/{alertId}
    // ----------------------------------------------------------
    async getAlert({ alertId }) {
        logger.info(`Alert 단일 조회 요청: alertId=${alertId}`);

        const result = await alertApi.getAlert({
            alert_id: alertId
        });

        if (result?.status !== 'success') {
            logger.warn(
                `Alert 단일 조회 실패 응답: alertId=${alertId}, statusCode=${result?.statusCode ?? 500}, message=${result?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(result?.message || 'Alert 조회에 실패했습니다.');
            error.statusCode = result?.statusCode || 500;
            error.response = result;

            throw error;
        }

        if (!result?.data?.id) {
            const error = new Error('조회된 Alert 데이터가 없습니다.');
            error.statusCode = 404;
            error.response = result;

            throw error;
        }

        logger.info(`Alert 단일 조회 완료: alertId=${result.data.id}`);

        return result.data;
    }

    // ----------------------------------------------------------
    // acknowledgeAlert
    // Input  : { alertId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 Alert 확인/읽음 처리를 요청한다.
    //   2. FastAPI에서 상태를 ACKNOWLEDGED로 변경한다.
    //   3. 성공 응답을 그대로 반환한다.
    //
    // FastAPI:
    //   PATCH /alerts/{alertId}/acknowledge
    // ----------------------------------------------------------
    async acknowledgeAlert({ alertId }) {
        logger.info(`Alert 확인/읽음 처리 요청: alertId=${alertId}`);

        const response = await alertApi.acknowledgeAlert({
            alert_id: alertId
        });

        if (response?.status !== 'success') {
            logger.warn(
                `Alert 확인/읽음 처리 실패 응답: alertId=${alertId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Alert 확인 처리에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        logger.info(
            `Alert 확인/읽음 처리 완료: alertId=${response?.data?.id ?? alertId}, status=${response?.data?.status ?? 'UNKNOWN'}`
        );

        return response;
    }

    // ----------------------------------------------------------
    // dismissAlert
    // Input  : { alertId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 Alert 숨김/무시 처리를 요청한다.
    //   2. FastAPI에서 상태를 DISMISSED로 변경한다.
    //   3. 성공 응답을 그대로 반환한다.
    //
    // FastAPI:
    //   PATCH /alerts/{alertId}/dismiss
    // ----------------------------------------------------------
    async dismissAlert({ alertId }) {
        logger.info(`Alert 숨김/무시 처리 요청: alertId=${alertId}`);

        const response = await alertApi.dismissAlert({
            alert_id: alertId
        });

        if (response?.status !== 'success') {
            logger.warn(
                `Alert 숨김/무시 처리 실패 응답: alertId=${alertId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Alert 숨김 처리에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        logger.info(
            `Alert 숨김/무시 처리 완료: alertId=${response?.data?.id ?? alertId}, status=${response?.data?.status ?? 'UNKNOWN'}`
        );

        return response;
    }

    // ----------------------------------------------------------
    // resolveAlert
    // Input  : { alertId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 Alert 해결 처리를 요청한다.
    //   2. FastAPI에서 상태를 RESOLVED로 변경한다.
    //   3. 성공 응답을 그대로 반환한다.
    //
    // FastAPI:
    //   PATCH /alerts/{alertId}/resolve
    // ----------------------------------------------------------
    async resolveAlert({ alertId }) {
        logger.info(`Alert 해결 처리 요청: alertId=${alertId}`);

        const response = await alertApi.resolveAlert({
            alert_id: alertId
        });

        if (response?.status !== 'success') {
            logger.warn(
                `Alert 해결 처리 실패 응답: alertId=${alertId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Alert 해결 처리에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        logger.info(
            `Alert 해결 처리 완료: alertId=${response?.data?.id ?? alertId}, status=${response?.data?.status ?? 'UNKNOWN'}`
        );

        return response;
    }

    // ----------------------------------------------------------
    // updateAlert
    // Input  : {
    //   alertId,
    //   meetingId,
    //   issueId,
    //   message,
    //   level,
    //   status
    // }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 Alert 일반 필드 수정을 요청한다.
    //   2. WebSocket payload의 camelCase를 FastAPI body의 snake_case로 변환한다.
    //   3. 성공 응답을 그대로 반환한다.
    //
    // FastAPI:
    //   PATCH /alerts/{alertId}
    // ----------------------------------------------------------
    async updateAlert({
        alertId,
        meetingId,
        issueId,
        message,
        level,
        status
    }) {
        logger.info(
            `Alert 일반 수정 요청: alertId=${alertId}, meetingId=${meetingId ?? 'none'}, issueId=${issueId ?? 'none'}, level=${level ?? 'none'}, status=${status ?? 'none'}`
        );

        const response = await alertApi.updateAlert({
            alert_id: alertId,
            meeting_id: meetingId,
            issue_id: issueId,
            message,
            level,
            status
        });

        if (response?.status !== 'success') {
            logger.warn(
                `Alert 일반 수정 실패 응답: alertId=${alertId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Alert 수정에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        logger.info(
            `Alert 일반 수정 완료: alertId=${response?.data?.id ?? alertId}, status=${response?.data?.status ?? 'UNKNOWN'}`
        );

        return response;
    }

        // ----------------------------------------------------------
    // deleteAlert
    // Input  : { alertId }
    // Output : Promise<{ deleted: true }>
    // 역할  :
    //   1. FastAPI에 Alert 삭제를 요청한다.
    //   2. FastAPI DELETE /alerts/{alertId}는 204 No Content 기준이다.
    //   3. 성공 시 Handler에서 ACK를 만들 수 있도록 deleted 값을 반환한다.
    //
    // FastAPI:
    //   DELETE /alerts/{alertId}
    // ----------------------------------------------------------
    async deleteAlert({ alertId }) {
        logger.info(`Alert 삭제 요청: alertId=${alertId}`);

        const response = await alertApi.deleteAlert({
            alert_id: alertId
        });

        if (response?.status !== 'success') {
            logger.warn(
                `Alert 삭제 실패 응답: alertId=${alertId}, statusCode=${response?.statusCode ?? 500}, message=${response?.message ?? 'UNKNOWN'}`
            );

            const error = new Error(response?.message || 'Alert 삭제에 실패했습니다.');
            error.statusCode = response?.statusCode || 500;
            error.response = response;

            throw error;
        }

        logger.info(`Alert 삭제 완료: alertId=${alertId}`);

        return {
            deleted: true
        };
    }
}

module.exports = new AlertService();
