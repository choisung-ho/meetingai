import { authorizedFetch } from "./apiClient";
import { parseApiError } from "./apiError";
import type {
  DocumentMeta,
  DocumentProcessResult,
  RawDocumentFile,
} from "../types/document.types";

type UploadDocumentResponse = {
  status: string;
  data?: RawDocumentFile;
};

type UploadDocumentParams = {
  file: File;
  meetingId?: number | null;
  workspaceId?: number | null;
};

function isUploadDocumentResponse(
  value: RawDocumentFile | UploadDocumentResponse
): value is UploadDocumentResponse {
  return "status" in value && !("id" in value);
}

const toOptionalNumber = (value: number | null | undefined) =>
  value == null ? undefined : Number(value);

const toNullableNumber = (value: number | null | undefined) =>
  value == null ? null : Number(value);

export function toDocumentMeta(document: RawDocumentFile): DocumentMeta {
  const workspaceId = document.workspaceId ?? document.workspace_id;
  const meetingId = document.meetingId ?? document.meeting_id;

  return {
    id: Number(document.id),
    workspaceId: toOptionalNumber(workspaceId),
    meetingId: toNullableNumber(meetingId),
    originalFilename: document.originalFilename ?? document.original_filename ?? "",
    storedFilename: document.storedFilename ?? document.stored_filename ?? "",
    contentType: document.contentType ?? document.content_type ?? "",
    fileSize: Number(document.fileSize ?? document.file_size),
    storagePath: document.storagePath ?? document.storage_path ?? "",
    status: document.status,
    createdAt: document.createdAt ?? document.created_at ?? "",
  };
}

export async function uploadDocument({
  file,
  meetingId,
  workspaceId,
}: UploadDocumentParams): Promise<DocumentMeta | null> {
  if (meetingId == null && workspaceId == null) {
    throw new Error("meetingId 또는 workspaceId가 필요합니다.");
  }

  const query = new URLSearchParams();

  if (meetingId != null) {
    query.set("meeting_id", String(meetingId));
  }

  if (workspaceId != null) {
    query.set("workspace_id", String(workspaceId));
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await authorizedFetch(
    `/documents/upload?${query.toString()}`,
    {
      method: "POST",
      body: formData,
    }
  );

  if (!response.ok) {
    throw await parseApiError(response, "문서 업로드에 실패했습니다.");
  }

  const text = await response.text();
  if (!text) return null;

  const raw = JSON.parse(text) as RawDocumentFile | UploadDocumentResponse;
  const document = isUploadDocumentResponse(raw) ? raw.data : raw;

  return document ? toDocumentMeta(document) : null;
}

export async function processDocument(
  documentId: number
): Promise<DocumentProcessResult> {
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error("유효한 문서 ID가 필요합니다.");
  }

  const response = await authorizedFetch(`/documents/${documentId}/process`, {
    method: "POST",
  });

  if (!response.ok) {
    throw await parseApiError(response, "문서 분석을 시작하지 못했습니다.");
  }

  const raw = (await response.json()) as {
    status?: string;
    data?: {
      document_id?: number;
      documentId?: number;
      status?: string;
      chunk_count?: number;
      chunkCount?: number;
    };
  };
  const data = raw.data ?? {};

  return {
    documentId: Number(data.document_id ?? data.documentId ?? documentId),
    status: String(data.status ?? "PROCESSED"),
    chunkCount: Number(data.chunk_count ?? data.chunkCount ?? 0),
  };
}
