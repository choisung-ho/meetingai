import { useState } from "react";
import type { ReactNode } from "react";
import type { AudioUtterance } from "../services/audioService";
import { DashboardSidebar } from "./MeetingSummaryPage.ui";
import { AppIcon } from "../shared/ui/AppIcon";
import type { AlertItem } from "../types/alert.types";
import type { DocumentMeta } from "../types/document.types";
import type { Issue, IssuePriority, IssueStatus, WebSocketMeeting } from "../types/meeting.types";
import type { SttResult } from "../types/sttResult.types";
import type { AiAnalysis } from "../types/transcript.types";
import type { NavPageItem, User, WorkspaceItem } from "./DashboardPage";

export type MeetingRecordDetailData = {
  meetingId: number;
  workspaceId: number | null;
  meetingRoomId: number | null;
  meeting: WebSocketMeeting | null;
  sttResults: SttResult[];
  utterances: AudioUtterance[];
  utteranceErrorMessage: string | null;
  selectedSttResult: SttResult | null;
  issues: Issue[];
  alerts: AlertItem[];
  documents: DocumentMeta[];
  participantCount: number;
  aiAnalysis: AiAnalysis | null;
  isAiAnalysisLoading: boolean;
  aiAnalysisErrorMessage: string | null;
};

export type MeetingRecordDetailPageUIProps = {
  record: MeetingRecordDetailData;
  actions: {
    backToList: () => void;
    openDashboardMenu: (menuId: string) => void;
    openSettings: () => void;
    switchWorkspace: (workspaceId: string) => void;
    togglePage: (pageId: string) => void;
    addPage: (pageId: string) => void;
    openMeeting: (meetingId: string) => void;
    openSttResult: (sttResultId: number) => void;
    deleteSttResult: (sttResultId: number) => void;
    editSttResult: (params: {
      sttResultId: number;
      language: string;
      rawText: string;
      status: string;
    }) => Promise<SttResult>;
    reAnalyze?: () => Promise<void>;
    updateIssueStatus?: (issueId: number, status: Exclude<IssueStatus, "OPEN">) => void;
    updateIssue?: (issueId: number, values: { title: string; description: string | null; priority: IssuePriority | null; dueDate: string | null; assigneeId: number | null }) => void;
    deleteIssue?: (issueId: number) => void;
    logout: () => void;
  };
  sidebar: {
    user: User;
    navigation: {
      mainMenu: NavPageItem[];
      weeklyMeeting: NavPageItem;
    };
    workspaces: {
      available: WorkspaceItem[];
      current: WorkspaceItem;
    };
  };
};

const tabs = ["전체", "스마트 요약", "타임라인", "발화자별", "재논의 구간", "Q&A"];

const EMPTY_VALUE = "표시할 데이터가 없습니다.";

function readableActionItem(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const item = value as Record<string, unknown>;
  return String(
    item.task ?? item.title ?? item.action ?? item.description ?? item.text ?? ""
  ).trim();
}

function extractKeywords(utterances: AudioUtterance[], sttResults: SttResult[]) {
  const stopWords = new Set([
    "그리고",
    "그런데",
    "그래서",
    "대한",
    "이번",
    "회의",
    "것이",
    "있는",
    "합니다",
    "입니다",
    "으로",
    "에서",
    "하는",
    "하면",
  ]);
  const counts = new Map<string, number>();
  const source = utterances.length > 0
    ? utterances.map((item) => item.text)
    : sttResults.map((item) => item.rawText);

  source
    .join(" ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !stopWords.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, 6)
    .map(([word]) => word);
}

function formatUtteranceOffset(value: number | null | undefined, index: number) {
  if (value == null || !Number.isFinite(value)) {
    return `#${String(index + 1).padStart(3, "0")}`;
  }

  const totalSeconds = Math.max(Math.floor(value / 1000), 0);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function groupUtterances(utterances: AudioUtterance[]) {
  return utterances.reduce<Map<string, AudioUtterance[]>>((groups, utterance) => {
    const speaker = utterance.speaker_label?.trim() || "Unknown";
    const current = groups.get(speaker) ?? [];
    current.push(utterance);
    groups.set(speaker, current);
    return groups;
  }, new Map());
}

export function MeetingRecordDetailPageUI({
  record,
  actions,
  sidebar,
}: MeetingRecordDetailPageUIProps) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [closedSttResultId, setClosedSttResultId] = useState<number | null>(null);
  const [editingSttResult, setEditingSttResult] = useState<SttResult | null>(null);
  const title = record.meeting?.title?.trim() || `회의 ${record.meetingId}`;
  const dateLabel = formatDate(record.meeting?.scheduledAt ?? record.meeting?.startedAt ?? record.meeting?.createdAt);
  const timeLabel = formatTimeRange(record.meeting?.startedAt, record.meeting?.endedAt);
  const statusLabel = record.meeting?.status ?? "-";
  const keywords = extractKeywords(record.utterances, record.sttResults);
  const actionItems = [
    ...record.issues.map((issue) => issue.title),
    ...(record.aiAnalysis?.actionItems ?? []).map(readableActionItem),
  ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index);
  const speakerGroups = groupUtterances(record.utterances);

  console.log("[MEETING_RECORD_DETAIL:UI_STT]", {
    count: record.sttResults.length,
    sttResults: record.sttResults,
  });

  const isSttModalOpen = Boolean(
    record.selectedSttResult && Number(record.selectedSttResult.id) !== closedSttResultId
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8faff] font-sans text-slate-800">
      <DashboardSidebar
        user={sidebar.user}
        navigation={sidebar.navigation}
        workspaces={sidebar.workspaces}
        actions={{
          openDashboardMenu: actions.openDashboardMenu,
          openLiveMeeting: actions.backToList,
          openSettings: actions.openSettings,
          switchWorkspace: actions.switchWorkspace,
          togglePage: actions.togglePage,
          addPage: actions.addPage,
          openMeeting: actions.openMeeting,
          logout: actions.logout,
          backDashboard: actions.backToList,
          openAlert: (alertId) => {
            actions.openDashboardMenu(`menu-4&alertId=${encodeURIComponent(String(alertId))}`);
          },
          updateIssueStatus: actions.updateIssueStatus ?? (() => undefined),
          updateIssue: actions.updateIssue ?? (() => undefined),
          deleteIssue: actions.deleteIssue ?? (() => undefined),
        }}
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
        <div className="mx-auto max-w-[1500px]">
          <button onClick={actions.backToList} className="mb-6 flex items-center gap-2 text-[14px] font-black text-slate-500 hover:text-indigo-600">
            <span className="text-xl leading-none">&larr;</span>
            회의록 목록으로
          </button>

          <section className="mb-7">
            <div className="flex items-center gap-3">
              <h1 className="text-[30px] font-black tracking-tight text-slate-950">{title}</h1>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-5 text-[14px] font-bold text-slate-500">
              <Meta icon="calendar" label={`${dateLabel} ${timeLabel}`} />
              <Meta icon="users" label={`참석자 ${record.participantCount}명`} />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Badge tone={record.meeting?.status === "ENDED" ? "green" : undefined}>{statusLabel}</Badge>
              <Badge>핵심 의사결정 {record.issues.length || "-"}</Badge>
              <Badge>재논의 감지 {record.alerts.length || "-"}</Badge>
              <Badge>액션 아이템 {actionItems.length || "-"}</Badge>
            </div>
          </section>

          <section className="mb-6">
            <div className="flex items-center gap-8">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-4 pb-4 text-[14px] font-black transition-colors ${
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-[minmax(520px,1.35fr)_minmax(360px,.9fr)_300px] gap-4">
            {activeTab === "발화자별" ? (
              <SpeakerPanel groups={speakerGroups} />
            ) : activeTab === "타임라인" ? (
              <TimelinePanel utterances={record.utterances} sttResults={record.sttResults} />
            ) : activeTab === "재논의 구간" ? (
              <RediscussionPanel alerts={record.alerts} />
            ) : activeTab === "Q&A" ? (
              <QnaPanel />
            ) : (
              <TranscriptPanel
                sttResults={record.sttResults}
                utterances={record.utterances}
                utteranceErrorMessage={record.utteranceErrorMessage}
                onOpenSttResult={actions.openSttResult}
                onDeleteSttResult={actions.deleteSttResult}
                onEditSttResult={setEditingSttResult}
              />
            )}

            <div className="space-y-4">
              <Card
                title="AI 요약"
                icon="sparkles"
                action={actions.reAnalyze ? (
                  <button
                    type="button"
                    onClick={() => void actions.reAnalyze?.()}
                    disabled={record.isAiAnalysisLoading}
                    className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                  >
                    {record.isAiAnalysisLoading ? "분석 중" : "재분석"}
                  </button>
                ) : undefined}
              >
                {record.isAiAnalysisLoading ? (
                  <p className="text-[13px] font-bold text-slate-500">AI가 회의 내용을 분석하고 있습니다.</p>
                ) : record.aiAnalysisErrorMessage ? (
                  <p className="text-[13px] font-bold text-rose-500">{record.aiAnalysisErrorMessage}</p>
                ) : record.aiAnalysis?.summaryText ? (
                  <p className="whitespace-pre-wrap text-[13px] font-bold leading-6 text-slate-700">{record.aiAnalysis.summaryText}</p>
                ) : (
                  <EmptyValue message="아직 생성된 AI 분석이 없습니다." />
                )}
              </Card>

              <Card title="핵심 키워드">
                {keywords.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {keywords.map((keyword) => (
                      <span key={keyword} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-[12px] font-black text-indigo-600">#{keyword}</span>
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </Card>

              <Card title="액션 아이템">
                {actionItems.length > 0 ? (
                  <ul className="space-y-2">
                    {actionItems.slice(0, 6).map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[13px] font-bold leading-5 text-slate-700">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyValue />
                )}
              </Card>
            </div>

            <aside className="space-y-4">
              <Card title="회의 정보">
                <InfoLine label="회의 ID" value={String(record.meetingId)} />
                <InfoLine label="워크스페이스 ID" value={formatOptionalNumber(record.workspaceId)} />
                <InfoLine label="회의방 ID" value={formatOptionalNumber(record.meetingRoomId)} />
                <InfoLine label="일시" value={`${dateLabel} ${timeLabel}`} />
                <InfoLine label="참석자" value={`${record.participantCount}명`} />
              </Card>

              <Card title="재논의 감지">
                {record.alerts.length > 0 ? (
                  <div className="space-y-3">
                    {record.alerts.slice(0, 3).map((alert) => (
                      <div key={alert.id} className="rounded-xl bg-rose-50 p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-black text-rose-600">{alertLevelLabel[alert.level]}</span>
                          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-black text-slate-500">{alertStatusLabel[alert.status]}</span>
                        </div>
                        <p className="text-[13px] font-black leading-5 text-slate-800">{alert.message || "-"}</p>
                        <p className="mt-2 text-[11px] font-bold text-slate-400">{formatDateTime(alert.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </Card>

              <Card title="핵심 의사결정">
                {record.issues.length > 0 ? (
                  <div className="space-y-3">
                    {record.issues.map((issue) => (
                      <div key={issue.id} className="flex items-start gap-2 text-[13px] font-black text-slate-700">
                        <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <AppIcon src="/assets/icons/check.png" alt="" className="h-3 w-3" />
                        </span>
                        {issue.title || "-"}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </Card>

              <Card title="관련 파일">
                {record.documents.length > 0 ? (
                  <div className="space-y-4">
                    {record.documents.map((file) => (
                      <div key={file.id} className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                          <AppIcon src="/assets/icons/file-text.png" alt="" className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-black text-slate-700">{file.originalFilename || "-"}</p>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">{formatDate(file.createdAt)} 업로드</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </Card>
            </aside>
          </div>
        </div>
      </main>

      {isSttModalOpen && record.selectedSttResult && (
        <SttResultModal
          sttResult={record.selectedSttResult}
          onClose={() => setClosedSttResultId(Number(record.selectedSttResult?.id))}
        />
      )}

      {editingSttResult && (
        <SttResultEditModal
          sttResult={editingSttResult}
          onClose={() => setEditingSttResult(null)}
          onSave={actions.editSttResult}
        />
      )}
    </div>
  );
}


const Meta = ({ icon, label }: { icon: string; label: string }) => (
  <span className="flex items-center gap-2">
    <AppIcon src={`/assets/icons/${icon}.png`} alt="" className="h-4 w-4 text-slate-500" />
    {label}
  </span>
);

const Badge = ({ children, tone }: { children: ReactNode; tone?: "green" }) => (
  <span className={`rounded-xl px-4 py-2 text-[13px] font-black ${tone === "green" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
    {children}
  </span>
);

const Card = ({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children: ReactNode;
  icon?: string;
  action?: ReactNode;
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {icon && <AppIcon src={`/assets/icons/${icon}.png`} alt="" className="h-5 w-5 text-indigo-600" />}
        <h2 className="text-[17px] font-black text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const TranscriptPanel = ({
  sttResults,
  utterances,
  utteranceErrorMessage,
  onOpenSttResult,
  onDeleteSttResult,
  onEditSttResult,
}: {
  sttResults: SttResult[];
  utterances: AudioUtterance[];
  utteranceErrorMessage: string | null;
  onOpenSttResult: (sttResultId: number) => void;
  onDeleteSttResult: (sttResultId: number) => void;
  onEditSttResult: (sttResult: SttResult) => void;
}) => {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const deleteSttResult = (sttResultId: number) => {
    const confirmed = window.confirm("이 STT 결과를 삭제할까요?");
    if (!confirmed) return;

    try {
      onDeleteSttResult(sttResultId);
      setOpenMenuId(null);
    } catch (error) {
      console.error("[DELETE_STT_RESULT:UI_FAILED]", error);
    }
  };

  return (
    <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
        <h2 className="text-[16px] font-black text-slate-900">회의 내용</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {utteranceErrorMessage && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-700">{utteranceErrorMessage}</p>
        )}
        {sttResults.length > 0 ? (
          <div className="space-y-5">
            {sttResults.map((line) => {
              const lineUtterances = utterances.filter(
                (utterance) => Number(utterance.stt_result_id) === Number(line.id)
              );

              return (
                <div
                  key={line.id}
                  onClick={() => onOpenSttResult(line.id)}
                  className="relative grid w-full cursor-pointer grid-cols-[76px_1fr_36px] gap-4 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="pt-1 text-[13px] font-black text-slate-400">{formatTime(line.createdAt)}</span>
                  <div className="space-y-3">
                    {lineUtterances.length > 0 ? lineUtterances.map((utterance, index) => (
                      <div key={utterance.id}>
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-[14px] font-black text-slate-900">{utterance.speaker_label?.trim() || "Unknown"}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">{formatUtteranceOffset(utterance.start_ms, index)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[13px] font-bold leading-6 text-slate-700">{utterance.text || "-"}</p>
                      </div>
                    )) : (
                      <>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-[14px] font-black text-slate-900">Unknown</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">{line.language || "-"}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-[13px] font-bold leading-6 text-slate-700">{line.rawText || "-"}</p>
                      </>
                    )}
                  </div>
                  <div className="relative flex justify-end">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuId((current) => (current === line.id ? null : line.id));
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[18px] font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="STT 메뉴"
                  >
                    ...
                  </button>

                    {openMenuId === line.id && (
                    <div
                      onClick={(event) => event.stopPropagation()}
                      className="absolute right-0 top-9 z-20 w-24 rounded-xl border border-slate-100 bg-white py-1 shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() => deleteSttResult(line.id)}
                        className="w-full px-3 py-2 text-left text-[13px] font-black text-rose-600 hover:bg-rose-50"
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          onEditSttResult(line);
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] font-black text-indigo-600 hover:bg-indigo-50"
                      >
                        수정
                      </button>
                    </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[14px] font-black text-slate-400">-</div>
        )}
      </div>
    </section>
  );
};

const SpeakerPanel = ({ groups }: { groups: Map<string, AudioUtterance[]> }) => (
  <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
      <h2 className="text-[16px] font-black text-slate-900">발화자별 기록</h2>
    </div>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
      {[...groups.entries()].map(([speaker, lines]) => (
        <section key={speaker} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[14px] font-black text-slate-900">{speaker}</h3>
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-500">{lines.length}개 발화</span>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={line.id} className="grid grid-cols-[52px_1fr] gap-3 text-[13px]">
                <span className="pt-0.5 font-black text-slate-400">{formatUtteranceOffset(line.start_ms, index)}</span>
                <p className="whitespace-pre-wrap font-bold leading-6 text-slate-700">{line.text || "-"}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      {groups.size === 0 && <EmptyValue message="화자별 발화가 아직 저장되지 않았습니다." />}
    </div>
  </section>
);

const TimelinePanel = ({
  utterances,
  sttResults,
}: {
  utterances: AudioUtterance[];
  sttResults: SttResult[];
}) => (
  <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
      <h2 className="text-[16px] font-black text-slate-900">회의 타임라인</h2>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
      {utterances.length > 0 ? (
        <div className="relative space-y-4 before:absolute before:bottom-0 before:left-[19px] before:top-0 before:w-px before:bg-indigo-100">
          {utterances.map((utterance, index) => (
            <div key={utterance.id} className="relative flex gap-4">
              <span className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-indigo-500 shadow" />
              <div className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="text-[12px] font-black text-indigo-600">{utterance.speaker_label?.trim() || "Unknown"}</span>
                  <span className="text-[11px] font-black text-slate-400">{formatUtteranceOffset(utterance.start_ms, index)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] font-bold leading-6 text-slate-700">{utterance.text || "-"}</p>
              </div>
            </div>
          ))}
        </div>
      ) : sttResults.length > 0 ? (
        <div className="space-y-4">
          {sttResults.map((result) => (
            <div key={result.id} className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[12px] font-black text-indigo-600">Unknown</span>
                <span className="text-[11px] font-black text-slate-400">{formatTime(result.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] font-bold leading-6 text-slate-700">{result.rawText || "-"}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyValue message="저장된 타임라인이 없습니다." />
      )}
    </div>
  </section>
);

const RediscussionPanel = ({ alerts }: { alerts: AlertItem[] }) => (
  <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
      <h2 className="text-[16px] font-black text-slate-900">재논의 구간</h2>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5">
      {alerts.length > 0 ? alerts.map((alert) => (
        <article key={alert.id} className="rounded-xl border border-rose-100 bg-rose-50/70 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-rose-600">{alertLevelLabel[alert.level]}</span>
            <span className="rounded-md bg-white px-2 py-1 text-[11px] font-black text-slate-500">{alertStatusLabel[alert.status]}</span>
          </div>
          <p className="text-[13px] font-black leading-6 text-slate-800">{alert.message || "재논의 가능성이 감지되었습니다."}</p>
          <p className="mt-2 text-[11px] font-bold text-slate-400">{formatDateTime(alert.createdAt)}</p>
        </article>
      )) : <EmptyValue message="감지된 재논의 구간이 없습니다." />}
    </div>
  </section>
);

const QnaPanel = () => (
  <section className="flex min-h-[720px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-100 px-4">
      <h2 className="text-[16px] font-black text-slate-900">Q&A</h2>
    </div>
    <div className="flex flex-1 items-center justify-center px-4 py-5">
      <EmptyValue message="이 회의에 저장된 Q&A가 없습니다." />
    </div>
  </section>
);

const SttResultModal = ({
  sttResult,
  onClose,
}: {
  sttResult: SttResult;
  onClose: () => void;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
    <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-[20px] font-black text-slate-950">STT 상세</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[18px] font-black text-slate-500 hover:bg-slate-200"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div className="mb-5 rounded-xl bg-slate-50 p-4">
        <p className="mb-2 text-[12px] font-black text-slate-500">원문</p>
        <p className="whitespace-pre-wrap text-[14px] font-bold leading-6 text-slate-800">
          {sttResult.rawText || "-"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-5">
        <InfoLine label="언어" value={sttResult.language || "-"} />
        <InfoLine label="상태" value={sttResult.status || "-"} />
        <InfoLine label="생성 시각" value={formatDateTime(sttResult.createdAt)} />
        <InfoLine label="STT 결과 ID" value={formatOptionalNumber(sttResult.id)} />
        <InfoLine label="회의 ID" value={formatOptionalNumber(sttResult.meetingId)} />
        <InfoLine label="워크스페이스 ID" value={formatOptionalNumber(sttResult.workspaceId)} />
      </div>
    </section>
  </div>
);

const SttResultEditModal = ({
  sttResult,
  onClose,
  onSave,
}: {
  sttResult: SttResult;
  onClose: () => void;
  onSave: (params: {
    sttResultId: number;
    language: string;
    rawText: string;
    status: string;
  }) => Promise<SttResult>;
}) => {
  const [rawText, setRawText] = useState(sttResult.rawText || "");
  const [language, setLanguage] = useState(sttResult.language || "ko");
  const [status, setStatus] = useState(sttResult.status || "PENDING");
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const sttResultId = Number(sttResult.id);
    const nextRawText = rawText.trim();
    const nextLanguage = language.trim() || "ko";
    const nextStatus = status.trim() || sttResult.status || "PENDING";

    if (!Number.isFinite(sttResultId) || sttResultId <= 0) {
      console.warn("[STT_RESULT:UPDATE_BLOCKED]", "missing sttResultId");
      return;
    }

    if (!nextRawText) {
      console.warn("[STT_RESULT:UPDATE_BLOCKED]", "empty rawText");
      return;
    }

    try {
      setIsSaving(true);
      await onSave({
        sttResultId,
        language: nextLanguage,
        rawText: nextRawText,
        status: nextStatus,
      });
      onClose();
    } catch (error) {
      console.error("[STT_RESULT:UPDATE_FAILED]", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-[20px] font-black text-slate-950">STT 수정</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[18px] font-black text-slate-500 hover:bg-slate-200"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-[12px] font-black text-slate-500">원문</span>
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="min-h-36 w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] font-bold leading-6 text-slate-800 outline-none focus:border-indigo-400"
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-2 block text-[12px] font-black text-slate-500">언어</span>
              <input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-[14px] font-bold text-slate-800 outline-none focus:border-indigo-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[12px] font-black text-slate-500">상태</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 text-[14px] font-bold text-slate-800 outline-none focus:border-indigo-400"
              >
                <option value="PENDING">PENDING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-[13px] font-black text-slate-600 hover:bg-slate-200"
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-black text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            저장
          </button>
        </div>
      </section>
    </div>
  );
};

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <div className="mb-4 last:mb-0">
    <p className="text-[12px] font-black text-slate-500">{label}</p>
    <p className="mt-1 text-[13px] font-black text-slate-700">{value || "-"}</p>
  </div>
);

const EmptyValue = ({ message = EMPTY_VALUE }: { message?: string }) => (
  <p className="text-[14px] font-black text-slate-400">{message}</p>
);

const alertLevelLabel = {
  info: "정보",
  warning: "주의",
  error: "위험",
  success: "완료",
};

const alertStatusLabel = {
  PENDING: "대기",
  ACKNOWLEDGED: "확인",
  DISMISSED: "무시",
  RESOLVED: "해결",
};

const formatOptionalNumber = (value: number | null) =>
  value && Number.isFinite(value) && value > 0 ? String(value) : "-";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const formatTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const formatTimeRange = (startedAt?: string | null, endedAt?: string | null) => {
  const start = formatTime(startedAt);
  const end = formatTime(endedAt);
  if (start === "-" && end === "-") return "-";
  return `${start} ~ ${end}`;
};
