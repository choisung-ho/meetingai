export type DocumentFile = {
  id: number;
  workspaceId?: number;
  meetingId?: number | null;
  originalFilename: string;
  storedFilename: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
  status: string;
  createdAt: string;
};

export type DocumentMeta = DocumentFile;

export type DocumentProcessResult = {
  documentId: number;
  status: string;
  chunkCount: number;
};

export type RawDocumentFile = {
  id: number;
  workspace_id?: number;
  workspaceId?: number;
  meeting_id?: number | null;
  meetingId?: number | null;
  original_filename?: string;
  originalFilename?: string;
  stored_filename?: string;
  storedFilename?: string;
  content_type?: string;
  contentType?: string;
  file_size?: number;
  fileSize?: number;
  storage_path?: string;
  storagePath?: string;
  status: string;
  created_at?: string;
  createdAt?: string;
};

export type GetDocumentsPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
};

export type GetDocumentsAckPayload = {
  data: RawDocumentFile[];
};

export type GetWorkspaceDocumentsPayload = {
  workspaceId: number;
};

export type GetWorkspaceDocumentsAckPayload = {
  data: RawDocumentFile[];
};

export type GetDocumentPayload = {
  workspaceId: number;
  documentId: number;
  meetingId?: number;
  meetingRoomId?: number;
};

export type DeleteDocumentPayload = {
  workspaceId: number;
  documentId: number;
  meetingId?: number;
  meetingRoomId?: number;
};

export type DeleteDocumentAckPayload = {
  documentId: number;
  deleted: boolean;
};

export type DocumentDeletedPayload = {
  documentId: number;
  workspaceId: number;
  meetingId: number | null;
  deleted: boolean;
};

export type DocumentProcessedPayload = {
  documentId: number;
  workspaceId: number;
  meetingId: number | null;
  status: string;
  chunkCount: number;
};
