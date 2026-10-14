// ============================================================
// server/utils/slogger.js
// ============================================================
// 역할:
//   보안 관련 실시간 이벤트를 Redis 감사 로그 큐에 적재한다.
//   성호 님의 파이썬 워커가 RPOP으로 가져가 DB에 Append-Only 저장한다.
//
// 로그 규격 (RealtimeAuditLog):
//   timestamp : ISO 8601
//   action    : 수행된 작업 (예: JOIN_MEETING_ROOM, CREATE_ISSUE)
//   userId    : JWT sub 클레임에서 온 사용자 ID
//   status    : 'SUCCESS' | 'FAILURE'
//   metadata  : 민감 정보(JWT, 비밀번호) 제외한 부가 정보
//
// Redis 구조:
//   Key  : audit_log_queue
//   Type : List
//   적재 : LPUSH (워커가 RPOP으로 소비)
// ============================================================

const RedisManager = require('../redis/RedisManager');

/**
 * 보안 이벤트를 Redis 감사 로그 큐에 적재한다.
 *
 * @param {{ action: string, userId: string, status: 'SUCCESS'|'FAILURE', metadata?: object }} logData
 */
const auditLogger = async (logData) => {
    try {
        const fullLog = {
            ...logData,
            timestamp: new Date().toISOString()
        };

        // Redis 리스트 맨 앞에 추가 (성호 님의 워커가 RPOP으로 가져감)
        await RedisManager.getClient().lPush('audit_log_queue', JSON.stringify(fullLog));

        console.log(`[보안 감사 로그] action=${fullLog.action} | userId=${fullLog.userId} | status=${fullLog.status}`);
    } catch (error) {
        console.error('[보안 에러] 감사 로그 적재 실패:', error);
    }
};

module.exports = { auditLogger };
