// ============================================================
// server/handlers/transcriptHandler.js
// ============================================================
// 역할:
//   실시간 발화(STT text chunk) WebSocket 이벤트를 처리한다.
//
// 담당 이벤트:
//   - TRANSCRIPT_CHUNK  (Client → Server)
//
// 전체 흐름:
//   Audio → STT → text chunk
//   → Client (TRANSCRIPT_CHUNK)
//   → Node.js (이 핸들러)
//   → FastAPI POST /realtime/meetings/{id}/chunks
//   → utterance 저장 + 화자 클러스터링 + 안건/재논의 판단
//   → 요청 Client에 TRANSCRIPT_CHUNK_ACK
//   → FastAPI realtime.events 단일 이벤트 → RealtimeEventSubscriber
//   → 회의방 참여자에게 TRANSCRIPT broadcast
//   → Client 실시간 반영
//
// 원칙:
//   - isFinal=false는 저장하지 않고 TRANSCRIPT_PARTIAL만 broadcast 한다.
//   - 회의방에 입장하지 않은 사용자는 chunk를 보낼 수 없다.
//   - 중복 chunk(analysis_status=duplicate)는 다시 broadcast 하지 않는다.
//   - FastAPI 실패 응답의 statusCode/message는 그대로 클라이언트에 내려보낸다.
//   - 확정 이벤트는 Redis canonical 경로에서만 전송해 중복을 방지한다.
//
// 참고:
//   FastAPI도 Redis realtime.events에 이벤트를 발행하므로,
//   안건/재논의(topic.*) 이벤트는 realtimeEventSubscriber가 받아 broadcast 한다.
//   이 핸들러는 요청 경로에서 즉시 확인 가능한 발화만 broadcast 한다.
// ============================================================

const BaseHandler = require('./BaseHandler');
const transcriptService = require('../services/transcriptService');
const broadcastService = require('../services/broadcastService');
const meetingRoomStore = require('../sessions/meetingRoomStore');
const logger = require('../utils/logger');

const {
  TRANSCRIPT_CHUNK_SCHEMA,
  transcriptChunkAck,
  UNKNOWN_SPEAKER
} = require('../schemas/transcriptSchema');

class TranscriptHandler extends BaseHandler {
  // ----------------------------------------------------------
  // TRANSCRIPT_CHUNK
  // Client → WebSocket Server
  //
  // payload:
  //   workspaceId, meetingId, chunkId, text 는 필수
  //   speakerEmbedding은 화자 분리(clustering)를 위해 선택적으로 전달한다.
  // ----------------------------------------------------------
  async handleTranscriptChunk(wss, ws, message) {
    if (!this.validateOrReject(ws, message, TRANSCRIPT_CHUNK_SCHEMA)) return;

    const payload = message.payload;
    const workspaceId = payload.workspaceId;
    const meetingId = payload.meetingId;
    const meetingRoomId = payload.meetingRoomId ?? ws.meetingRoomId ?? null;
    const isFinal = payload.isFinal !== false;

    // 소켓이 현재 참여 중인 workspace/meeting context와 요청 값을
    // 비교한다. FastAPI 권한 검증만으로는 Node가 잘못된 workspace ID로
    // 브로드캐스트하는 혼동/교차 공간 노출을 막을 수 없다.
    if (
      (ws.workspaceId != null && Number(ws.workspaceId) !== Number(workspaceId)) ||
      (ws.meetingId != null && Number(ws.meetingId) !== Number(meetingId)) ||
      (ws.meetingRoomId != null && Number(ws.meetingRoomId) !== Number(meetingRoomId))
    ) {
      logger.warn(
        `TRANSCRIPT_CHUNK 차단: socket context 불일치 userId=${ws.userId}, workspaceId=${workspaceId}, meetingId=${meetingId}, meetingRoomId=${meetingRoomId}`
      );
      this.sendError(
        ws,
        message.requestId,
        'CONTEXT_MISMATCH',
        '현재 참여 중인 회의방 context와 요청 context가 일치하지 않습니다.'
      );
      return;
    }

    // 회의방 참여자만 발화를 보낼 수 있다 (권한 없는 회의방 전송 차단)
    if (meetingRoomId === null || meetingRoomId === undefined) {
      this.sendError(
        ws,
        message.requestId,
        'MISSING_MEETING_ROOM_ID',
        '발화를 전송하려면 먼저 회의방에 입장해야 합니다.'
      );
      return;
    }

    const isParticipant = await meetingRoomStore.isUserInMeetingRoom(
      workspaceId,
      meetingId,
      meetingRoomId,
      ws.userId
    );

    if (!isParticipant) {
      logger.warn(
        `TRANSCRIPT_CHUNK 차단: 회의방 미참여 userId=${ws.userId}, workspaceId=${workspaceId}, meetingId=${meetingId}`
      );
      this.sendError(
        ws,
        message.requestId,
        'NOT_IN_MEETING_ROOM',
        '해당 회의방에 참여한 사용자만 발화를 전송할 수 있습니다.'
      );
      return;
    }

    // 중간 인식 결과: 저장하지 않고 회의방에만 즉시 반영한다.
    if (!isFinal) {
      await broadcastService.broadcastTranscriptPartial({
        workspaceId,
        meetingId,
        chunkId: payload.chunkId,
        speaker: payload.speakerLabel || UNKNOWN_SPEAKER,
        text: payload.text
      });

      this.sendAck(
        ws,
        transcriptChunkAck(message.requestId ?? null, {
          chunk_id: payload.chunkId,
          analysis_status: 'partial'
        })
      );
      return;
    }

    try {
      const result = await transcriptService.sendChunk({
        workspaceId,
        meetingId,
        payload
      });

      this.sendAck(ws, transcriptChunkAck(message.requestId ?? null, result));

      // 중복 chunk는 이미 broadcast 된 발화이므로 다시 보내지 않는다.
      if (result.analysis_status === 'duplicate') {
        logger.info(
          `TRANSCRIPT_CHUNK 중복 무시: meetingId=${meetingId}, chunkId=${payload.chunkId}`
        );
        return;
      }

      // 확정 발화/분석 결과는 FastAPI가 realtime.events에 한 번만
      // 발행하고 RealtimeEventSubscriber가 브로드캐스트한다. 여기서
      // 다시 전송하면 같은 chunk가 클라이언트에 중복 표시된다.
    } catch (error) {
      const errorCode = error?.statusCode ?? 500;
      const errorMessage = error?.message || 'STT chunk 처리에 실패했습니다.';

      logger.error(
        `TRANSCRIPT_CHUNK 처리 실패: meetingId=${meetingId}, chunkId=${payload.chunkId}, reason=${errorMessage}`
      );

      this.sendError(ws, message.requestId, errorCode, errorMessage);
    }
  }
}

const transcriptHandler = new TranscriptHandler();

module.exports = {
  handleTranscriptChunk: (wss, ws, msg) =>
    transcriptHandler.handleTranscriptChunk(wss, ws, msg),

  TranscriptHandler
};
