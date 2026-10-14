/**
 * 실시간 발화(Transcript) 및 Phase 4 AI 분석 데이터 구조
 *
 * 흐름:
 *   Audio → STT → text chunk → Node.js → FastAPI
 *   → utterance 저장 + 화자 클러스터링 + 안건/재논의 판단
 *   → WebSocket TRANSCRIPT / TOPIC_* 이벤트 → 이 타입들로 수신
 */

/**
 * 화자 라벨
 *
 * 서버(FastAPI)가 화자 클러스터링으로 확정한 canonical 값이다.
 * "Speaker 1", "Speaker 2", ... 또는 화자를 식별할 수 없으면 "Unknown".
 */
export type SpeakerLabel = string;

export const UNKNOWN_SPEAKER = "Unknown";

/**
 * 회의 중 표시되는 발화 한 줄
 */
export type TranscriptLine = {
    /** 확정 발화는 utteranceId, 중간 발화는 chunkId 기반의 임시 키 */
    key: string;
    utteranceId: number | null;
    sttResultId: number | null;
    chunkId: string | null;
    sequence: number | null;
    speaker: SpeakerLabel;
    text: string;
    startMs: number | null;
    endMs: number | null;
    /** false면 아직 확정되지 않은 중간 인식 결과 */
    isFinal: boolean;
};

/**
 * TRANSCRIPT / TRANSCRIPT_PARTIAL 이벤트 payload
 */
export type TranscriptPayload = {
    speaker: SpeakerLabel;
    text: string;
    workspaceId: number | null;
    meetingId: number | null;
    chunkId: string | null;
    utteranceId?: number | null;
    sttResultId?: number | null;
    sequence?: number | null;
    startMs?: number | null;
    endMs?: number | null;
    isFinal?: boolean;
};

/**
 * TRANSCRIPT_CHUNK 전송 payload (Client → Server)
 */
export type TranscriptChunkPayload = {
    workspaceId: number;
    meetingId: number;
    meetingRoomId: number | null;
    chunkId: string;
    text: string;
    sttResultId?: number | null;
    sequence?: number | null;
    speakerLabel?: string | null;
    /** STT/Diarization 엔진이 만든 화자 embedding. 서버가 클러스터링에 사용한다. */
    speakerEmbedding?: number[] | null;
    startMs?: number | null;
    endMs?: number | null;
    language?: string | null;
    isFinal: boolean;
};

/**
 * 안건(Topic) 상태
 *
 * PROPOSED → DECIDED / DROPPED
 * DECIDED  → REVISITED (재논의 감지)
 * REVISITED → DECIDED / DROPPED
 */
export type TopicStatus = "PROPOSED" | "DECIDED" | "REVISITED" | "DROPPED";

/**
 * 회의 안건
 */
export type MeetingTopic = {
    topicId: number;
    meetingId: number | null;
    workspaceId: number | null;
    label: string;
    status: TopicStatus;
    /** 안건을 제안한 화자 */
    proposedBy: SpeakerLabel | null;
    /** 안건을 확정한 화자 */
    decidedBy: SpeakerLabel | null;
    /** 재논의를 유발한 화자 (누가 재논의했는지 추적) */
    revisitedBy: SpeakerLabel | null;
    utteranceId: number | null;
    /** 재논의 판단 근거가 된 유사도 */
    similarity: number | null;
    updatedAt: string;
};

/**
 * TOPIC_* 이벤트 payload
 */
export type TopicEventPayload = {
    workspaceId: number | null;
    meetingId: number | null;
    topicId: number | null;
    topicLabel: string | null;
    status: TopicStatus | null;
    proposedBy: SpeakerLabel | null;
    decidedBy: SpeakerLabel | null;
    revisitedBy: SpeakerLabel | null;
    speaker: SpeakerLabel | null;
    utteranceId: number | null;
    similarity: number | null;
    alertId: number | null;
    changedFields: string[] | null;
};

/**
 * 재논의 감지 기록
 *
 * "이전에 결정된 안건이 다시 논의되고 있습니다" 경고의 근거 데이터로,
 * 누가(speaker) 어떤 안건을(topicLabel) 얼마나 유사하게(similarity) 다시 꺼냈는지 담는다.
 */
export type RediscussionRecord = {
    topicId: number;
    topicLabel: string;
    /** 재논의한 화자 */
    speaker: SpeakerLabel;
    similarity: number | null;
    utteranceId: number | null;
    alertId: number | null;
    detectedAt: string;
};

/**
 * 발화 단위 분석 결과 (ANALYSIS_COMPLETED)
 */
export type UtteranceAnalysis = {
    workspaceId: number | null;
    meetingId: number | null;
    sttResultId: number | null;
    utteranceId: number | null;
    chunkId: string | null;
    result: Record<string, unknown> | null;
};

/**
 * 회의 단위 AI 분석 결과
 *
 * 본문은 WebSocket으로 내려오지 않는다.
 * AI_ANALYSIS_UPDATED 신호를 받으면
 * GET /workspaces/{workspaceId}/meetings/{meetingId}/ai 로 직접 조회한다.
 * (서버의 워크스페이스 권한 검사를 그대로 통과시키기 위함)
 */
export type AiAnalysis = {
    id: number;
    workspaceId: number;
    meetingId: number;
    summaryText: string;
    actionItems: unknown[];
    rediscussionReport: unknown[];
    createdAt: string;
    updatedAt: string;
};

export type ServerAiAnalysis = {
    id: number;
    workspace_id: number;
    meeting_id: number;
    summary_text: string;
    action_items: unknown[];
    rediscussion_report: unknown[];
    created_at: string;
    updated_at: string;
};
