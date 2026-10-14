import { authorizedFetch } from "./apiClient";
import type {
  CreateSttResultRequest,
  CreateSttResultResponse,
  SttResultCreatedPayload,
  UpdateSttResultRequest,
  UpdateSttResultResponse,
  UpdateSttResultResult,
} from "../types/sttResult.types";

type CreateSttResultParams = {
  meetingId: number;
  language: string;
  rawText: string;
};

type UpdateSttResultParams = {
  sttResultId: number;
  language?: string;
  rawText?: string;
  status?: string;
};

/**
 * STT 처리 결과 생성
 * POST /stt-results/
 *
 * 원문을 문장 단위로 분리해 utterance까지 자동 생성한다.
 * v0.4.0부터 document_id는 요청/응답 어디에도 존재하지 않는다.
 */
export async function createSttResult({
  meetingId,
  language,
  rawText,
}: CreateSttResultParams): Promise<SttResultCreatedPayload> {
  const payload: CreateSttResultRequest = {
    meeting_id: meetingId,
    language,
    raw_text: rawText,
  };

  const response = await authorizedFetch("/stt-results/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text() || "STT result creation failed.");
  }

  const data = (await response.json()) as CreateSttResultResponse;

  return {
    sttResultId: Number(data.data.id),
    workspaceId: Number(data.data.workspace_id),
    meetingId: Number(data.data.meeting_id),
    status: data.data.status,
  };
}

export async function updateSttResult({
  sttResultId,
  language,
  rawText,
  status,
}: UpdateSttResultParams): Promise<UpdateSttResultResult> {
  const payload: UpdateSttResultRequest = {};

  if (language !== undefined) payload.language = language;
  if (rawText !== undefined) payload.raw_text = rawText;
  if (status !== undefined) payload.status = status;

  const response = await authorizedFetch(`/stt-results/${sttResultId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text() || "STT result update failed.");
  }

  const data = (await response.json()) as UpdateSttResultResponse;

  return {
    id: Number(data.data.id),
    workspaceId: Number(data.data.workspace_id),
    meetingId: Number(data.data.meeting_id),
    language: data.data.language ?? "",
    rawText: data.data.raw_text ?? "",
    status: data.data.status ?? "",
    createdAt: data.data.created_at ?? "",
  };
}
