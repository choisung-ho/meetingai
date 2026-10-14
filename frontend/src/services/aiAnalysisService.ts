import { parseApiError } from "./apiError";
import { authorizedFetch } from "./apiClient";
import type { AiAnalysis, ServerAiAnalysis } from "../types/transcript.types";

export class AiAnalysisApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "AiAnalysisApiError";
        this.status = status;
    }
}

function mapAiAnalysis(analysis: ServerAiAnalysis): AiAnalysis {
    return {
        id: analysis.id,
        workspaceId: analysis.workspace_id,
        meetingId: analysis.meeting_id,
        summaryText: analysis.summary_text ?? "",
        actionItems: analysis.action_items ?? [],
        rediscussionReport: analysis.rediscussion_report ?? [],
        createdAt: analysis.created_at,
        updatedAt: analysis.updated_at,
    };
}

/**
 * 회의 AI 분석 결과 조회
 * GET /workspaces/{workspace_id}/meetings/{meeting_id}/ai
 *
 * 서버가 워크스페이스 권한(VIEWER 이상)을 검사하므로,
 * 권한이 없으면 403이 그대로 내려온다.
 * 분석이 아직 없으면 404이며 이는 오류가 아니라 "결과 없음"으로 취급한다.
 */
export async function getAiAnalysis(
    workspaceId: number,
    meetingId: number
): Promise<AiAnalysis | null> {
    const response = await authorizedFetch(
        `/workspaces/${workspaceId}/meetings/${meetingId}/ai`,
        { method: "GET" }
    );

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const error = await parseApiError(response, "AI 분석 결과 조회에 실패했습니다.");
        throw new AiAnalysisApiError(error.status, error.message);
    }

    const rawData = await response.json();

    return mapAiAnalysis(rawData.data ?? rawData);
}

/**
 * 회의 AI 재분석 요청
 * POST /workspaces/{workspace_id}/meetings/{meeting_id}/ai/re-analyze
 */
export async function requestAiReanalysis(
    workspaceId: number,
    meetingId: number
): Promise<void> {
    const response = await authorizedFetch(
        `/workspaces/${workspaceId}/meetings/${meetingId}/ai/re-analyze`,
        { method: "POST" }
    );

    if (!response.ok) {
        const error = await parseApiError(response, "AI 재분석 요청에 실패했습니다.");
        throw new AiAnalysisApiError(error.status, error.message);
    }
}
