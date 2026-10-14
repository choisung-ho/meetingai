import { create } from "zustand";

import {
    UNKNOWN_SPEAKER,
    type AiAnalysis,
    type MeetingTopic,
    type RediscussionRecord,
    type SpeakerLabel,
    type TopicEventPayload,
    type TranscriptLine,
    type TranscriptPayload,
    type UtteranceAnalysis,
} from "../types/transcript.types";

/** 화면에 유지하는 최대 발화 수 (오래된 발화는 잘라내 메모리/렌더 비용을 제한한다) */
const MAX_TRANSCRIPT_LINES = 500;

type TranscriptStore = {
    /** 확정 + 중간 발화가 시간순으로 쌓인다 */
    lines: TranscriptLine[];
    /** 회의에서 등장한 화자 목록 (등장 순서 유지) */
    speakers: SpeakerLabel[];
    /** 가장 최근에 발화한 화자 — "OOO 발언 중" 표시에 사용 */
    activeSpeaker: SpeakerLabel | null;
    /** 안건 목록 (topicId 기준) */
    topics: MeetingTopic[];
    /** 재논의 감지 기록 (최신순) */
    rediscussions: RediscussionRecord[];
    /** 마지막 발화 단위 분석 결과 */
    lastAnalysis: UtteranceAnalysis | null;
    /** 회의 단위 AI 분석 결과 */
    aiAnalysis: AiAnalysis | null;
    isAiAnalysisLoading: boolean;
    aiAnalysisErrorMessage: string | null;

    appendTranscript: (payload: TranscriptPayload) => void;
    appendPartialTranscript: (payload: TranscriptPayload) => void;
    applyTopicEvent: (eventType: string, payload: TopicEventPayload) => void;
    setTopics: (topics: MeetingTopic[]) => void;
    setLastAnalysis: (analysis: UtteranceAnalysis | null) => void;
    setAiAnalysis: (analysis: AiAnalysis | null) => void;
    setAiAnalysisLoading: (isLoading: boolean) => void;
    setAiAnalysisErrorMessage: (message: string | null) => void;
    resetTranscript: () => void;
};

function toLine(payload: TranscriptPayload, isFinal: boolean): TranscriptLine {
    const chunkId = payload.chunkId ?? null;
    const utteranceId = payload.utteranceId ?? null;

    return {
        key: isFinal
            ? `utterance-${utteranceId ?? chunkId ?? Math.random().toString(36).slice(2)}`
            : `partial-${chunkId ?? "unknown"}`,
        utteranceId,
        sttResultId: payload.sttResultId ?? null,
        chunkId,
        sequence: payload.sequence ?? null,
        speaker: payload.speaker || UNKNOWN_SPEAKER,
        text: payload.text ?? "",
        startMs: payload.startMs ?? null,
        endMs: payload.endMs ?? null,
        isFinal,
    };
}

function withSpeaker(speakers: SpeakerLabel[], speaker: SpeakerLabel) {
    if (!speaker || speakers.includes(speaker)) {
        return speakers;
    }

    return [...speakers, speaker];
}

function trimLines(lines: TranscriptLine[]) {
    return lines.length > MAX_TRANSCRIPT_LINES
        ? lines.slice(lines.length - MAX_TRANSCRIPT_LINES)
        : lines;
}

function upsertTopic(
    topics: MeetingTopic[],
    payload: TopicEventPayload
): MeetingTopic[] {
    if (payload.topicId === null) {
        return topics;
    }

    const existing = topics.find((topic) => topic.topicId === payload.topicId);

    const next: MeetingTopic = {
        topicId: payload.topicId,
        meetingId: payload.meetingId,
        workspaceId: payload.workspaceId,
        label: payload.topicLabel ?? existing?.label ?? "",
        status: payload.status ?? existing?.status ?? "PROPOSED",
        proposedBy: payload.proposedBy ?? existing?.proposedBy ?? null,
        decidedBy: payload.decidedBy ?? existing?.decidedBy ?? null,
        revisitedBy: payload.revisitedBy ?? existing?.revisitedBy ?? null,
        utteranceId: payload.utteranceId ?? existing?.utteranceId ?? null,
        similarity: payload.similarity ?? existing?.similarity ?? null,
        updatedAt: new Date().toISOString(),
    };

    return existing
        ? topics.map((topic) => (topic.topicId === next.topicId ? next : topic))
        : [...topics, next];
}

/**
 * 실시간 발화 / 화자 / 안건 / 재논의 상태
 *
 * 회의방을 나가거나 다른 회의로 이동할 때는 resetTranscript()로 비운다.
 */
export const useTranscriptStore = create<TranscriptStore>((set) => ({
    lines: [],
    speakers: [],
    activeSpeaker: null,
    topics: [],
    rediscussions: [],
    lastAnalysis: null,
    aiAnalysis: null,
    isAiAnalysisLoading: false,
    aiAnalysisErrorMessage: null,

    appendTranscript: (payload) =>
        set((state) => {
            const line = toLine(payload, true);

            // 같은 발화가 두 경로(요청 응답 / Pub-Sub)로 들어올 수 있어 중복을 제거한다.
            const isDuplicate =
                line.utteranceId !== null &&
                state.lines.some(
                    (item) => item.isFinal && item.utteranceId === line.utteranceId
                );

            if (isDuplicate) {
                return state;
            }

            // 같은 chunk의 중간 발화가 남아 있으면 확정 발화로 대체한다.
            const withoutPartial = state.lines.filter(
                (item) => !(item.isFinal === false && item.chunkId === line.chunkId)
            );

            return {
                lines: trimLines([...withoutPartial, line]),
                speakers: withSpeaker(state.speakers, line.speaker),
                activeSpeaker: line.speaker,
            };
        }),

    appendPartialTranscript: (payload) =>
        set((state) => {
            const line = toLine(payload, false);
            const existingIndex = state.lines.findIndex(
                (item) => item.isFinal === false && item.chunkId === line.chunkId
            );

            const lines =
                existingIndex === -1
                    ? [...state.lines, line]
                    : state.lines.map((item, index) =>
                          index === existingIndex ? line : item
                      );

            return {
                lines: trimLines(lines),
                speakers: withSpeaker(state.speakers, line.speaker),
                activeSpeaker: line.speaker,
            };
        }),

    applyTopicEvent: (eventType, payload) =>
        set((state) => {
            const topics = upsertTopic(state.topics, payload);

            if (eventType !== "TOPIC_REVISITED" || payload.topicId === null) {
                return { topics };
            }

            const record: RediscussionRecord = {
                topicId: payload.topicId,
                topicLabel: payload.topicLabel ?? "",
                speaker: payload.revisitedBy ?? payload.speaker ?? UNKNOWN_SPEAKER,
                similarity: payload.similarity,
                utteranceId: payload.utteranceId,
                alertId: payload.alertId,
                detectedAt: new Date().toISOString(),
            };

            return {
                topics,
                rediscussions: [record, ...state.rediscussions],
            };
        }),

    setTopics: (topics) => set({ topics }),
    setLastAnalysis: (lastAnalysis) => set({ lastAnalysis }),
    setAiAnalysis: (aiAnalysis) => set({ aiAnalysis, aiAnalysisErrorMessage: null }),
    setAiAnalysisLoading: (isAiAnalysisLoading) => set({ isAiAnalysisLoading }),
    setAiAnalysisErrorMessage: (aiAnalysisErrorMessage) =>
        set({ aiAnalysisErrorMessage }),

    resetTranscript: () =>
        set({
            lines: [],
            speakers: [],
            activeSpeaker: null,
            topics: [],
            rediscussions: [],
            lastAnalysis: null,
            aiAnalysis: null,
            isAiAnalysisLoading: false,
            aiAnalysisErrorMessage: null,
        }),
}));
