import { useCallback, useState } from "react";
import { uploadDocument } from "../services/documentApi";
import { useDocumentStore } from "../store/documentStore";

type UseUploadParams = {
  meetingId?: number | null;
  workspaceId?: number | null;
};

export function useUpload({ meetingId, workspaceId }: UseUploadParams) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const addDocument = useDocumentStore((state) => state.addDocument);

  const attachFile = useCallback(
    async (file: File) => {
      if (!meetingId && !workspaceId) return;

      try {
        setIsUploading(true);
        setUploadError(null);
        const document = await uploadDocument({
          file,
          meetingId,
          workspaceId,
        });

        if (document) {
          addDocument(document);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "문서 업로드에 실패했습니다.";
        setUploadError(message);
        console.error("[DOCUMENT_UPLOAD:FAILED]", error);
      } finally {
        setIsUploading(false);
      }
    },
    [addDocument, meetingId, workspaceId]
  );

  return {
    attachFile,
    isUploading,
    uploadError,
  };
}
