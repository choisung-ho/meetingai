import React from 'react';
import { AppIcon } from '../../../shared/ui/AppIcon';
import type { DocumentFile } from '../../../pages/DashboardPage.ui';
import type { DocumentMeta } from '../../../types/document.types';

type DocumentAnalysisViewProps = {
  documents: DocumentFile[];
  selectedDocument: DocumentMeta | null;
  onUpload: (file: File) => void;
  uploadState: {
    isUploading: boolean;
    uploadErrorMessage: string | null;
    processingDocumentId: number | null;
    errorMessage: string | null;
  };
  actions: {
    openDocumentDetail: (documentId: number) => void;
    closeDocumentDetail: () => void;
    deleteDocument: (documentId: number, meetingId?: number | null) => void;
    processDocument: (documentId: number) => Promise<void>;
  };
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
};

const detailRows = (document: DocumentMeta) => [
  { label: '문서명', value: document.originalFilename || '-' },
  { label: '파일 타입', value: document.contentType || '-' },
  { label: '파일 크기', value: formatFileSize(document.fileSize) },
  { label: '상태', value: document.status || '-' },
  { label: '업로드 일시', value: document.createdAt || '-' },
  {
    label: '연결 범위',
    value: document.meetingId == null ? '워크스페이스 문서' : '회의 연결 문서',
  },
  { label: '저장 파일명', value: document.storedFilename || '-' },
  { label: '저장 경로', value: document.storagePath || '-' },
];

export const DocumentAnalysisView: React.FC<DocumentAnalysisViewProps> = ({
  documents,
  selectedDocument,
  onUpload,
  uploadState,
  actions,
}) => {
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onUpload(file);
    }

    event.target.value = '';
  };

  const handleDeleteDocument = (
    event: React.MouseEvent<HTMLButtonElement>,
    document: DocumentFile
  ) => {
    event.stopPropagation();
    setOpenMenuId(null);

    if (!window.confirm('문서를 삭제하시겠습니까?')) return;

    actions.deleteDocument(Number(document.id), document.meetingId ?? null);
  };

  return (
    <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm min-h-[560px] animate-in fade-in duration-200 flex flex-col">
      <div onClick={() => uploadInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center bg-slate-50/50 mb-6 cursor-pointer hover:border-indigo-500 transition-colors">
        <input ref={uploadInputRef} type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleFileChange} />
        <p className={`text-xs font-bold ${uploadState.uploadErrorMessage ? 'text-rose-500' : 'text-slate-500'}`}>
          {uploadState.isUploading ? '문서를 업로드하는 중입니다...' : uploadState.uploadErrorMessage ?? 'PDF, DOCX, TXT, MD, CSV 문서를 선택해 업로드하세요.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="min-w-0">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 pl-1">문서 목록</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {documents?.map((document) => (
              <div
                key={document.id}
                role="button"
                tabIndex={0}
                onClick={() => actions.openDocumentDetail(Number(document.id))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    actions.openDocumentDetail(Number(document.id));
                  }
                }}
                className="relative p-4 border border-slate-100 bg-white rounded-xl shadow-sm hover:shadow transition-shadow cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenuId((prev) => prev === document.id ? null : document.id);
                  }}
                  className="absolute right-2 top-2 rounded-lg p-1.5 hover:bg-slate-100 transition-colors"
                  aria-label="문서 메뉴 열기"
                >
                  <AppIcon src="/assets/icons/dots.png" alt="" className="h-4 w-4 opacity-50" />
                </button>
                {openMenuId === document.id && (
                  <div
                    onClick={(event) => event.stopPropagation()}
                    className="absolute right-2 top-9 z-20 w-20 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={(event) => handleDeleteDocument(event, document)}
                      className="w-full px-3 py-2 text-left text-[12px] font-bold text-rose-500 hover:bg-rose-50"
                    >
                      삭제
                    </button>
                  </div>
                )}
                <AppIcon src={document.icon} alt="" className="mb-2 h-6 w-6 text-slate-500" />
                <h4 className="pr-8 text-xs font-bold text-slate-700 truncate">{document.name}</h4>
                <p className="text-[9px] text-slate-400 font-bold mt-1">등록: {document.date}</p>
              </div>
            ))}
            {documents.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-xs font-bold text-slate-400">
                아직 업로드된 문서가 없습니다.
              </p>
            )}
          </div>
        </section>

        <aside className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/60 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">상세 정보</h3>
            {selectedDocument && (
              <button
                type="button"
                onClick={actions.closeDocumentDetail}
                className="rounded-full p-1.5 hover:bg-white transition-colors"
                aria-label="문서 상세 닫기"
              >
                <AppIcon src="/assets/icons/close.png" alt="" className="h-4 w-4 opacity-50" />
              </button>
            )}
          </div>

          {!selectedDocument ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs font-bold text-slate-400">
              문서를 선택하면 상세 정보가 표시됩니다.
            </p>
          ) : (
            <div className="space-y-3">
              {detailRows(selectedDocument).map((row) => (
                <div key={row.label} className="rounded-xl bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{row.label}</p>
                  <p className="mt-1 break-words text-xs font-bold text-slate-700">{row.value}</p>
                </div>
              ))}
              {selectedDocument.status !== 'PROCESSED' && (
                <button
                  type="button"
                  onClick={() => void actions.processDocument(selectedDocument.id)}
                  disabled={uploadState.processingDocumentId !== null}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-xs font-black text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {uploadState.processingDocumentId === selectedDocument.id ? '분석 중...' : '문서 분석 시작'}
                </button>
              )}
              {selectedDocument.status === 'PROCESSED' && (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-600">분석이 완료되었습니다. RAG 검색에 사용할 수 있습니다.</p>
              )}
              {uploadState.errorMessage && (
                <p className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-500" role="alert">{uploadState.errorMessage}</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
