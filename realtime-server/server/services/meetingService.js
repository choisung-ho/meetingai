// ============================================================
// server/services/meetingService.js
// ============================================================
// 역할:
//   Meeting 계층의 서비스 흐름을 담당한다.
//   FastAPI Meeting API 호출 후, 생성 성공 시에만 Redis meetingStore에 캐시한다.
//
// 원칙:
//   - CREATE_MEETING 성공 시 Redis 캐시 저장
//   - GET_MEETINGS 조회 시 Redis 캐시 저장하지 않음
//   - 실제 원본 데이터는 FastAPI/DB
//
// 주의:
//   Meeting은 회의 시작/종료 세션이 아니라 회의 데이터/페이지 리소스이다.
//   회의 종료, 수정, 삭제는 아직 WebSocket 이벤트가 없으므로 여기서 구현하지 않는다.
// ============================================================

const { meetingApi } = require('../fastapi');
const meetingStore = require('../sessions/meetingStore');
const logger = require('../utils/logger');

class MeetingService {
    // ----------------------------------------------------------
    // createMeeting
    // Input  : { workspaceId, title, status }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 회의 데이터 생성을 요청한다.
    //   2. FastAPI가 DB에 저장하고 id를 반환한다.
    //   3. 성공 응답이면 Redis에 회의 정보를 캐시한다.
    // ----------------------------------------------------------
    async createMeeting({ workspaceId, title, status }) {
        logger.info(`Meeting 생성 요청: workspaceId=${workspaceId}, title=${title}`);

        try {
            const response = await meetingApi.createMeeting({
                workspaceId,
                title,
                status
            });

            if (response?.status === 'success' && response?.data?.id) {
                await meetingStore.cacheMeeting(workspaceId, response.data);

                logger.info(
                    `Meeting 생성 후 Redis 캐시 저장 완료: workspaceId=${workspaceId}, meetingId=${response.data.id}`
                );
            }

            return response;
        } catch (error) {
            logger.warn(
                `Meeting 생성 실패: workspaceId=${workspaceId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
            );

            throw error;
        }
    }

    // ----------------------------------------------------------
    // getMeetings
    // Input  : { workspaceId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   FastAPI에서 회의 목록을 조회해 그대로 반환한다.
    //   조회 결과는 화면 초기화/새로고침/재접속 시 갱신용이다.
    //   조회 결과를 Redis에 다시 저장하지 않는다.
    // ----------------------------------------------------------
    // ----------------------------------------------------------
    // getMeetings
    // Input  : { workspaceId }
    // Output : Promise<{
    //   workspaceId: number,
    //   page: number,
    //   size: number,
    //   meetings: Array<{
    //     id: number,
    //     title: string,
    //     status: "ACTIVE" | "ENDED",
    //     created_at?: string
    //   }>
    // }>
    // 역할  :
    //   FastAPI에서 회의 목록을 조회한 뒤 data 객체를 그대로 반환한다.
    //   조회 결과는 화면 초기화/새로고침/재접속 시 갱신용이다.
    //   조회 결과를 Redis에 다시 저장하지 않는다.
    // ----------------------------------------------------------
    async getMeetings({ workspaceId, page = 1, size = 20 }) {
        logger.info(`Meeting 목록 조회 요청: workspaceId=${workspaceId}`);

        try {
            const result = await meetingApi.getMeetings({
                workspaceId,
                page,
                size
            });

            if (result?.status !== 'success') {
                logger.warn(`Meeting 목록 조회 실패 응답: workspaceId=${workspaceId}`);

                return {
                    workspaceId,
                    page,
                    size,
                    meetings: []
                };
            }

            const data = result.data ?? {};

            return {
                workspaceId: data.workspaceId ?? workspaceId,
                page: data.page ?? page,
                size: data.size ?? size,
                meetings: Array.isArray(data.meetings) ? data.meetings : []
            };
        } catch (error) {
            logger.warn(
                `Meeting 목록 조회 실패: workspaceId=${workspaceId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
            );

            throw error;
        }
    }

    // ----------------------------------------------------------
    // getMeeting
    // Input  : { workspaceId, meetingId }
    // Output : Promise<Object | null>
    // 역할  :
    //   FastAPI에서 회의 상세 정보를 조회한다.
    //   FastAPI 응답이 success가 아니면 null을 반환한다.
    // ----------------------------------------------------------
    async getMeeting({ workspaceId, meetingId }) {
        logger.info(`Meeting 상세 조회 요청: workspaceId=${workspaceId}, meetingId=${meetingId}`);

        try {
            // FastAPI 응답 전체
            const result = await meetingApi.getMeeting({
                workspaceId,
                meetingId
            });

            // FastAPI 응답이 success가 아니면 빈 목록 구조 반환
            if (result?.status !== 'success') {
                logger.warn(`Meeting 상세 조회 실패 응답: workspaceId=${workspaceId}, meetingId=${meetingId}`);
                return null;
            }

            // FastAPI data 구조 그대로 반환
            return result.data;
        } catch (error) {
            logger.warn(
                `Meeting 상세 조회 실패: workspaceId=${workspaceId}, meetingId=${meetingId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
            );

            throw error;
        }
    }

    // ----------------------------------------------------------
    // deleteMeeting
    // Input  : { workspaceId, meetingId }
    // Output : Promise<{ status, data }>
    // 역할  :
    //   1. FastAPI에 회의 데이터 삭제를 요청한다.
    //   2. FastAPI가 DB에서 해당 회의를 삭제한다.
    //   3. 삭제 성공 응답이면 Redis에 캐시된 회의 정보도 삭제한다.
    //
    // 주의:
    //   meetingStore.removeMeeting(meetingId)는 Redis에 저장된 meeting detail을 먼저 조회해서
    //   기존 workspaceId를 찾은 뒤,
    //   meeting:detail:{meetingId},
    //   workspace:meetings:{workspaceId},
    //   workspace:activeMeetings:{workspaceId}
    //   에서 모두 제거한다.
    // ----------------------------------------------------------
    async deleteMeeting({ workspaceId, meetingId }) {
        logger.info(
            `Meeting 삭제 요청: workspaceId=${workspaceId}, meetingId=${meetingId}`
        );

        try {
            const response = await meetingApi.deleteMeeting({
                workspaceId,
                meetingId
            });

            if (response?.status === 'success') {
                await meetingStore.removeMeeting(meetingId);

                logger.info(
                    `Meeting 삭제 후 Redis 캐시 삭제 완료: workspaceId=${workspaceId}, meetingId=${meetingId}`
                );
            }

            return response;
        } catch (error) {
            logger.warn(
                `Meeting 삭제 실패: workspaceId=${workspaceId}, meetingId=${meetingId}, statusCode=${error?.statusCode ?? 'UNKNOWN'}, reason=${error?.message ?? 'UNKNOWN'}`
            );

            throw error;
        }
    }
}

module.exports = new MeetingService();
