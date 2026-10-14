/**
 * STT Result 요청/응답 타입
 *
 * v0.4.0부터 STT Result에는 document_id가 존재하지 않는다.
 * (문서는 workspace/meeting에 첨부되는 별개 리소스이고,
 *  STT Result는 meeting에 귀속되는 음성 인식 결과이다)
 */
export type CreateSttResultRequest = {
  meeting_id: number;
  language: string;
  raw_text: string;
};

/** POST /stt-results/ 는 생성된 STT Result 객체를 그대로 반환한다. */
export type ServerSttResult = {
  id: number;
  workspace_id: number;
  meeting_id: number;
  language: string | null;
  raw_text: string;
  status: string;
  created_at: string;
};

export type CreateSttResultResponse = {
  status: "success";
  data: ServerSttResult;
};

export type UpdateSttResultRequest = {
  language?: string;
  raw_text?: string;
  status?: string;
};

export type UpdateSttResultResponse = {
  status: "success";
  data: ServerSttResult;
};

export type SttResultCreatedPayload = {
  sttResultId: number;
  workspaceId: number;
  meetingId: number;
  status: string;
};

export type GetSttResultsPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
};

export type GetSttResultPayload = GetSttResultsPayload & {
  sttResultId: number;
};

export type DeleteSttResultPayload = GetSttResultPayload;

export type DeleteSttResultAckPayload = {
  sttResultId: number;
  deleted: boolean;
};

export type SttResultDeletedPayload = {
  workspaceId: number | null;
  meetingId: number | null;
  meetingRoomId: number | null;
  sttResultId: number;
  deleted: boolean;
};

export type SttResult = {
  id: number;
  workspaceId: number | null;
  meetingId: number | null;
  language: string;
  rawText: string;
  status: string;
  createdAt: string;
};

export type UpdateSttResultResult = SttResult;

export type SttResultUpdatedPayload = SttResult;

export type RawSttResult = {
  id: number;
  workspaceId?: number | null;
  workspace_id?: number | null;
  meetingId?: number | null;
  meeting_id?: number | null;
  documentId?: number | null;
  document_id?: number | null;
  language: string;
  rawText?: string;
  raw_text?: string;
  status: string;
  createdAt?: string;
  created_at?: string;
};

export type GetSttResultsAckPayload = {
  sttResults: RawSttResult[];
};

export type GetSttResultAckPayload = RawSttResult;
