import { create } from "zustand";
import type { DocumentMeta, RawDocumentFile } from "../types/document.types";

type DocumentState = {
  documents: DocumentMeta[];
  selectedDocument: DocumentMeta | null;
  setDocuments: (documents: RawDocumentFile[]) => void;
  replaceDocumentsForMeeting: (
    meetingId: number,
    documents: RawDocumentFile[]
  ) => void;
  replaceDocumentsForWorkspace: (
    workspaceId: number,
    documents: RawDocumentFile[]
  ) => void;
  addDocument: (document: RawDocumentFile) => void;
  updateDocument: (documentId: number, values: Partial<DocumentMeta>) => void;
  removeDocument: (documentId: number) => void;
  setSelectedDocument: (document: RawDocumentFile | null) => void;
  resetDocuments: () => void;
};

const toOptionalNumber = (value: number | null | undefined) =>
  value == null ? undefined : Number(value);

const toNullableNumber = (value: number | null | undefined) =>
  value == null ? null : Number(value);

const normalizeDocument = (document: RawDocumentFile): DocumentMeta => {
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
};

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  selectedDocument: null,

  setDocuments: (documents) => {
    const nextById = new Map<number, DocumentMeta>();

    documents.forEach((document) => {
      const normalized = normalizeDocument(document);
      nextById.set(normalized.id, normalized);
    });

    set({ documents: Array.from(nextById.values()) });
  },

  replaceDocumentsForMeeting: (meetingId, documents) => {
    const targetMeetingId = Number(meetingId);
    const nextDocuments = documents.map(normalizeDocument);

    set((state) => {
      const nextById = new Map<number, DocumentMeta>();

      state.documents
        .filter((document) => Number(document.meetingId) !== targetMeetingId)
        .forEach((document) => {
          nextById.set(document.id, document);
        });

      nextDocuments.forEach((document) => {
        nextById.set(document.id, document);
      });

      return { documents: Array.from(nextById.values()) };
    });
  },

  replaceDocumentsForWorkspace: (workspaceId, documents) => {
    const targetWorkspaceId = Number(workspaceId);
    const nextDocuments = documents.map(normalizeDocument);

    set((state) => {
      const nextById = new Map<number, DocumentMeta>();

      state.documents
        .filter((document) => Number(document.workspaceId) !== targetWorkspaceId)
        .forEach((document) => {
          nextById.set(document.id, document);
        });

      nextDocuments.forEach((document) => {
        nextById.set(document.id, document);
      });

      return { documents: Array.from(nextById.values()) };
    });
  },

  addDocument: (document) => {
    const normalized = normalizeDocument(document);

    set((state) => {
      if (state.documents.some((item) => item.id === normalized.id)) {
        return state;
      }

      return { documents: [...state.documents, normalized] };
    });
  },

  updateDocument: (documentId, values) => {
    const targetDocumentId = Number(documentId);

    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === targetDocumentId ? { ...document, ...values } : document
      ),
      selectedDocument:
        state.selectedDocument?.id === targetDocumentId
          ? { ...state.selectedDocument, ...values }
          : state.selectedDocument,
    }));
  },

  removeDocument: (documentId) => {
    const targetDocumentId = Number(documentId);

    set((state) => ({
      documents: state.documents.filter(
        (document) => Number(document.id) !== targetDocumentId
      ),
      selectedDocument:
        state.selectedDocument &&
        Number(state.selectedDocument.id) === targetDocumentId
          ? null
          : state.selectedDocument,
    }));
  },

  setSelectedDocument: (document) =>
    set({
      selectedDocument: document ? normalizeDocument(document) : null,
    }),

  resetDocuments: () => set({ documents: [], selectedDocument: null }),
}));
