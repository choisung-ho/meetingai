import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppIcon } from '../shared/ui/AppIcon';
import { UserStack } from '../shared/ui/UserStack';
import { getIssueStatusLabel } from '../shared/utils/issueStatusLabel';
import type { Meeting, NavPageItem, User, WorkspaceItem } from './DashboardPage';
import type { AlertItem } from '../types/alert.types';
import type { Issue, IssuePriority, IssueStatus } from '../types/meeting.types';
import type { DocumentMeta } from '../types/document.types';
import type { AiAnalysis, TranscriptLine } from '../types/transcript.types';

type MeetingSummaryPageProps = {
  user: User;
  participants: User[];
  meetings?: Meeting[];
  navigation: {
    mainMenu: NavPageItem[];
    weeklyMeeting: NavPageItem;
  };
  workspaces: {
    available: WorkspaceItem[];
    current: WorkspaceItem;
  };
  issues: {
    items: Issue[];
    isLoading: boolean;
    errorMessage: string | null;
  };
  documents: DocumentMeta[];
  transcriptLines: TranscriptLine[];
  aiAnalysis: AiAnalysis | null;
  isAiAnalysisLoading: boolean;
  aiAnalysisErrorMessage: string | null;
  alerts: {
    items: AlertItem[];
    isLoading: boolean;
    errorMessage: string | null;
  };
  actions: {
    updateIssueStatus: (issueId: number, status: Exclude<IssueStatus, 'OPEN'>) => void;
    updateIssue: (
      issueId: number,
      values: {
        title: string;
        description: string | null;
        priority: IssuePriority | null;
        dueDate: string | null;
        assigneeId: number | null;
      }
    ) => void;
    deleteIssue: (issueId: number) => void;
    openAlert?: (alertId: number) => void;
    backDashboard: () => void;
    openDashboardMenu: (menuId: string) => void;
    openLiveMeeting: () => void;
    openSettings: () => void;
    switchWorkspace: (workspaceId: string) => void;
    togglePage: (pageId: string) => void;
    addPage: (pageId: string) => void;
    openMeeting: (meetingId: string) => void;
    logout: () => void;
  };
};

const alertLevelLabel = {
  info: '정보',
  warning: '주의',
  error: '오류',
  success: '완료',
} satisfies Record<AlertItem['level'], string>;

const alertStatusLabel = {
  PENDING: '대기',
  ACKNOWLEDGED: '확인됨',
  DISMISSED: '무시됨',
  RESOLVED: '해결됨',
} satisfies Record<AlertItem['status'], string>;

export const MeetingSummaryPageUI: React.FC<MeetingSummaryPageProps> = ({
  user,
  participants,
  meetings = [],
  navigation,
  workspaces,
  issues,
  alerts,
  documents,
  transcriptLines,
  aiAnalysis,
  isAiAnalysisLoading,
  aiAnalysisErrorMessage,
  actions,
}) => {
  const { meetingId } = useParams();
  const [activeTab, setActiveTab] = useState('개요');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [openDecisionMenu, setOpenDecisionMenu] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedMeeting = meetings.find((meeting) => meeting.id === meetingId) ?? meetings[0];
  const summaryTitle = selectedMeeting?.title || '-';
  const meetingDate = selectedMeeting?.createdAt ?? selectedMeeting?.created_at ?? selectedMeeting?.fetchedAt ?? null;
  const summaryTime = meetingDate ? formatDate(meetingDate) : '-';
  const summaryParticipants = selectedMeeting?.participants || participants;
  const aiSummary = aiAnalysis?.summaryText?.trim() ?? '';
  const meetingDocuments = documents.filter((document) => Number(document.meetingId) === Number(meetingId));
  const filteredTranscriptLines = transcriptLines.filter((line) => {
    const keyword = transcriptSearch.trim().toLowerCase();
    if (!keyword) return true;
    return `${line.speaker ?? ''} ${line.text}`.toLowerCase().includes(keyword);
  });
  const summaryDecisions = issues.items.map((issue) => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    status: getIssueStatusLabel(issue.status),
    mentionedDate: issue.createdAt ? formatDate(issue.createdAt) : issue.updatedAt ? formatDate(issue.updatedAt) : '-',
    deadline: issue.dueDate ? formatDate(issue.dueDate) : '-',
    priority: issue.priority || '-',
    owner: issue.assigneeId ? String(issue.assigneeId) : '-',
    dueDate: issue.dueDate,
    assigneeId: issue.assigneeId,
  }));

  const handleShare = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setNotice('회의 요약 링크를 클립보드에 복사했습니다.');
    } catch {
      setNotice('현재 환경에서는 링크를 복사할 수 없습니다.');
    }
  };

  const handleDownload = () => {
    const lines = [
      `회의 제목: ${summaryTitle}`,
      `일시: ${summaryTime}`,
      '',
      '핵심 의사결정',
      ...summaryDecisions.map((decision) => `- ${decision.title} (${decision.status})`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${summaryTitle || 'meeting-summary'}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('회의 요약 파일을 다운로드했습니다.');
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f8faff] font-sans text-slate-800">
      <DashboardSidebar user={user} navigation={navigation} workspaces={workspaces} actions={actions} />

      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[13px] font-bold text-slate-500">
              <span>회의록</span>
              <AppIcon src="/assets/icons/chevron-right.png" alt="" className="h-3.5 w-3.5" />
              <span>주간 회의</span>
              <AppIcon src="/assets/icons/chevron-right.png" alt="" className="h-3.5 w-3.5" />
              <span className="text-slate-700">{summaryTitle}</span>
            </div>

            <div className="flex items-center gap-3">
              <UserStack users={summaryParticipants} maxVisible={3} size="sm" />
              <button type="button" onClick={() => actions.openDashboardMenu('menu-8')} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm hover:bg-slate-50">
                <AppIcon src="/assets/icons/user-plus.png" alt="" className="h-4 w-4" />
                초대
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200">
                  <AppIcon src="/assets/icons/file-text.png" alt="" className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-[32px]">{summaryTitle}</h1>
                <AppIcon src="/assets/icons/star.png" alt="즐겨찾기" className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 text-[13px] font-bold text-slate-600">
                <StatusPill tone="green">회의 종료</StatusPill>
                <StatusPill tone="indigo">{aiAnalysis ? 'AI 분석 완료' : isAiAnalysisLoading ? 'AI 분석 중' : 'AI 분석 대기'}</StatusPill>
                <div className="flex items-center gap-1.5">
                  <AppIcon src="/assets/icons/calendar.png" alt="" className="h-4 w-4" />
                  {summaryTime}
                </div>
                <div className="flex items-center gap-1.5">
                  <AppIcon src="/assets/icons/users.png" alt="" className="h-4 w-4" />
                  참석자 {summaryParticipants.length}명
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <SummaryToolButton icon="upload" onClick={handleShare}>공유</SummaryToolButton>
              <SummaryToolButton icon="download" onClick={handleDownload}>다운로드</SummaryToolButton>
              <button type="button" onClick={actions.backDashboard} className="h-11 rounded-xl bg-indigo-600 px-7 text-[14px] font-black text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700">
                완료
              </button>
              <button type="button" onClick={() => actions.openDashboardMenu('menu-4')} aria-label="더보기" className="flex h-11 w-16 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50">
                <AppIcon src="/assets/icons/dots.png" alt="" className="h-5 w-5" />
              </button>
            </div>
          </div>
          {notice && <p className="mt-3 text-right text-xs font-bold text-emerald-600">{notice}</p>}
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(620px,1fr)_272px]">
          <section className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200">
              <div className="flex flex-wrap gap-1">
                {['개요', '회의록', '의사결정', '재논의 감지', '파일'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex h-12 items-center gap-2 border-b-2 px-3 text-[13px] font-black transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                  >
                    <TabIcon tab={tab} />
                    {tab}
                  </button>
                ))}
              </div>

              <label className="mb-2 flex h-10 w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-400 shadow-sm focus-within:border-indigo-300 focus-within:ring-3 focus-within:ring-indigo-100">
                <input
                  value={transcriptSearch}
                  onChange={(event) => setTranscriptSearch(event.target.value)}
                  placeholder="스크립트 검색..."
                  aria-label="스크립트 검색"
                  className="min-w-0 flex-1 bg-transparent text-[12px] font-bold text-slate-700 outline-none placeholder:text-slate-400"
                />
                <AppIcon src="/assets/icons/file-search.png" alt="" className="h-4 w-4 shrink-0" />
              </label>
            </div>

            <div className="space-y-4">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-[17px] font-black text-slate-900">
                  <AppIcon src="/assets/icons/sparkles.png" alt="" className="h-5 w-5 text-indigo-600" />
                  AI 요약
                </h2>
                {isAiAnalysisLoading ? (
                  <p className="text-[14px] font-semibold leading-7 text-slate-500">회의 내용을 분석하고 있습니다. 잠시 후 자동으로 갱신됩니다.</p>
                ) : aiAnalysisErrorMessage ? (
                  <p className="text-[14px] font-semibold leading-7 text-rose-500">{aiAnalysisErrorMessage}</p>
                ) : aiSummary ? (
                  <p className="whitespace-pre-wrap text-[14px] font-semibold leading-7 text-slate-600">{aiSummary}</p>
                ) : (
                  <p className="text-[14px] font-semibold leading-7 text-slate-500">아직 AI 요약이 생성되지 않았습니다. 회의 발화가 저장되면 자동으로 분석됩니다.</p>
                )}
              </section>

              {(activeTab === '개요' || activeTab === '회의록') && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[17px] font-black text-slate-900">회의록 <span className="ml-1 text-slate-500">{filteredTranscriptLines.length}건</span></h2>
                    <span className="text-[11px] font-bold text-slate-400">화자·시간 정보 포함</span>
                  </div>
                  {filteredTranscriptLines.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[13px] font-bold text-slate-400">저장된 발화가 없습니다.</div>
                  ) : (
                    <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                      {filteredTranscriptLines.map((line, index) => (
                        <div key={line.key || `summary-line-${index}`} className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <span className="min-w-[82px] text-[11px] font-black text-indigo-600">{line.speaker || 'Unknown'}</span>
                          <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] font-medium leading-6 text-slate-700">{line.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {(activeTab === '개요' || activeTab === '의사결정') && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[17px] font-black text-slate-900">핵심 의사결정 <span className="ml-1 text-slate-500">{summaryDecisions.length}건</span></h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('의사결정')}
                    className="text-[12px] font-black text-slate-500 hover:text-indigo-600"
                  >
                    전체 보기 &gt;
                  </button>
                </div>
                <div className="overflow-visible rounded-xl border border-slate-200">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1.3fr_.55fr_.9fr_.9fr_.55fr_1fr] bg-slate-50 px-4 py-3 text-[11px] font-black text-slate-500">
                      <span>안건</span><span>상태</span><span>언급 날짜</span><span>마감일</span><span>우선순위</span><span>담당자</span>
                    </div>
                    {summaryDecisions.map((decision) => (
                      <div key={decision.id} className="grid grid-cols-[1.3fr_.55fr_.9fr_.9fr_.55fr_1fr] items-center border-t border-slate-100 px-4 py-3 text-[12px] font-bold text-slate-600">
                        <span className="truncate text-[13px] text-slate-900">{decision.title}</span>
                        <DecisionBadge value={decision.status} />
                        <span>{decision.mentionedDate}</span>
                        <span className="flex items-center gap-1.5"><AppIcon src="/assets/icons/calendar.png" alt="" className="h-3.5 w-3.5" />{decision.deadline}</span>
                        <PriorityBadge value={decision.priority} />
                        <span className="relative flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">{decision.owner.charAt(0)}</span>
                          <span className="truncate">{decision.owner}</span>
                          <button
                            aria-label={`${decision.title} 안건 메뉴`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenDecisionMenu(openDecisionMenu === String(decision.id) ? null : String(decision.id));
                            }}
                            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                          >
                            <AppIcon src="/assets/icons/dots.png" alt="" className="h-4 w-4" />
                          </button>
                          {openDecisionMenu === String(decision.id) && (
                            <DecisionActionCard issue={decision} actions={actions} onClose={() => setOpenDecisionMenu(null)} />
                          )}
                        </span>
                      </div>
                    ))}
                    {summaryDecisions.length === 0 && (
                      <div className="border-t border-slate-100 px-4 py-10 text-center text-[13px] font-bold text-slate-400">등록된 안건이 없습니다.</div>
                    )}
                  </div>
                </div>
              </section>}

              {(activeTab === '개요' || activeTab === '재논의 감지') && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-[17px] font-black text-slate-900">재논의 감지 <span className="ml-1 text-slate-500">{alerts.items.length}건</span></h2>
                {alerts.errorMessage ? (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-[13px] font-bold text-rose-500">{alerts.errorMessage}</div>
                ) : alerts.isLoading ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 text-[13px] font-bold text-slate-500">재논의 알림을 불러오는 중입니다.</div>
                ) : alerts.items.length === 0 ? (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-5 py-4 text-[13px] font-bold text-slate-600">감지된 재논의가 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {alerts.items.map((alert) => (
                      <button key={alert.id} type="button" onClick={() => actions.openAlert?.(alert.id)} className="w-full overflow-hidden rounded-2xl border border-amber-100 bg-amber-50/70 text-left transition-colors hover:border-amber-200 hover:bg-amber-50">
                        <div className="flex items-start justify-between gap-3 border-b border-amber-100 px-5 py-3">
                          <div className="flex min-w-0 items-start gap-2 text-[13px] font-bold text-slate-700">
                            <AppIcon src="/assets/icons/alert.png" alt="" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <span className="break-words">{alert.message}</span>
                          </div>
                          <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-amber-600">{alertStatusLabel[alert.status]}</span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-4 bg-white/60 px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">{alertLevelLabel[alert.level]}</span>
                            <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500">안건 ID {alert.issueId}</span>
                          </div>
                          <span className="text-[12px] font-bold text-slate-500">{formatDate(alert.createdAt)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>}

              {activeTab === '파일' && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[17px] font-black text-slate-900">관련 파일 <span className="ml-1 text-slate-500">{meetingDocuments.length}건</span></h2>
                    <button type="button" onClick={() => actions.openDashboardMenu('menu-5')} className="text-[12px] font-black text-slate-500 hover:text-indigo-600">문서 탭 열기 &gt;</button>
                  </div>
                  {meetingDocuments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-[13px] font-bold text-slate-400">이 회의에 연결된 문서가 없습니다.</div>
                  ) : (
                    <div className="space-y-3">
                      {meetingDocuments.map((document) => (
                        <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <span className="min-w-0 truncate text-[13px] font-black text-slate-700">{document.originalFilename || document.storedFilename || `문서 ${document.id}`}</span>
                          <span className="shrink-0 text-[11px] font-bold text-slate-400">{formatDate(document.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <SummaryPanel title="회의 정보">
              <InfoLine label="일시">{summaryTime}</InfoLine>
              <div className="space-y-2">
                <p className="text-[11px] font-black text-slate-500">참석자</p>
                <UserStack users={summaryParticipants} maxVisible={4} size="sm" />
              </div>
              <InfoLine label="생성일">{summaryTime}</InfoLine>
              <InfoLine label="작성자">-</InfoLine>
              <InfoLine label="언어">-</InfoLine>
            </SummaryPanel>

            <SummaryPanel title="관련 파일" action="모두 보기" onAction={() => actions.openDashboardMenu('menu-5')}>
              <div className="space-y-3">
                {meetingDocuments.length === 0 ? (
                  <p className="text-[12px] font-bold leading-6 text-slate-600">관련 파일 없음</p>
                ) : meetingDocuments.slice(0, 5).map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate text-[12px] font-black text-slate-700">{document.originalFilename || document.storedFilename || `문서 ${document.id}`}</span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400">{formatDate(document.createdAt)}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => actions.openDashboardMenu('menu-5')} className="mt-4 h-10 w-full rounded-xl border border-slate-200 bg-white text-[12px] font-black text-slate-700 hover:bg-slate-50">문서 열어보기</button>
            </SummaryPanel>

            <SummaryPanel title="태그">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-black text-slate-600">태그 없음</span>
              </div>
            </SummaryPanel>

            <SummaryPanel title="메모">
              <p className="text-[12px] font-bold leading-6 text-slate-600">-</p>
            </SummaryPanel>
          </aside>
        </div>
      </main>
    </div>
  );
};

export const DashboardSidebar = ({
  user,
  navigation,
  workspaces,
  actions,
}: {
  user: User;
  navigation: MeetingSummaryPageProps['navigation'];
  workspaces: MeetingSummaryPageProps['workspaces'];
  actions: MeetingSummaryPageProps['actions'];
}) => {
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <aside className="z-20 flex h-screen w-[240px] shrink-0 flex-col border-r border-black/[0.03] bg-[#fbfbfa]">
      <div className="relative mb-1 p-3">
        <button onClick={() => setIsSwitcherOpen(!isSwitcherOpen)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-black/[0.05]">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[11px] font-black text-white shadow-sm">P</div>
          <span className="flex-1 truncate text-[14px] font-semibold text-slate-700">PICK - {workspaces.current.name}</span>
          <AppIcon src="/assets/icons/chevron-down.png" alt="open" className={`h-3 w-3 opacity-50 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
        </button>

        {isSwitcherOpen && (
          <div className="absolute left-3 top-12 z-50 w-[260px] rounded-xl border border-slate-100 bg-white py-2 shadow-[0_10px_30px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in duration-150">
            <div className="mb-1 px-3 py-1.5">
              <p className="px-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">워크스페이스</p>
            </div>
            <div className="max-h-[200px] space-y-0.5 overflow-y-auto px-2 scrollbar-hide">
              {workspaces.available.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => {
                    actions.switchWorkspace(workspace.id);
                    setIsSwitcherOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors ${workspace.id === workspaces.current.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-600 text-[10px] font-black text-white">P</span>
                    <span className={`text-[13px] font-bold ${workspace.id === workspaces.current.id ? 'text-indigo-600' : 'text-slate-700'}`}>PICK - {workspace.name}</span>
                  </span>
                  {workspace.id === workspaces.current.id && <AppIcon src="/assets/icons/check.png" alt="selected" className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 scrollbar-hide">
        <div className="space-y-1">
          {navigation.mainMenu.map((menu) => (
            <SummarySideMenuItem key={menu.id} item={menu} isActive={menu.id === 'menu-2'} onClick={() => actions.openDashboardMenu(menu.id)} />
          ))}
        </div>

        <div className="h-px w-full bg-black/[0.04]" />
        <div className="px-1">
          <SummaryPageRow item={navigation.weeklyMeeting} actions={actions} depth={0} />
        </div>
      </div>

      <div className="relative mt-auto border-t border-black/[0.03] p-3">
        <button onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/[0.05]">
          <img src={user.avatarUrl || 'https://i.pravatar.cc/150'} alt="profile" className="h-9 w-9 rounded-full border border-slate-200 object-cover" />
          <span className="flex-1 overflow-hidden">
            <span className="block truncate text-[13px] font-bold text-slate-800">{user.name}</span>
            <span className="block truncate text-[11px] font-medium text-slate-400">{user.teamName}</span>
          </span>
          <AppIcon src="/assets/icons/chevron-down.png" alt="more" className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${isProfileMenuOpen ? 'rotate-180' : 'group-hover:opacity-100'}`} />
        </button>

        {isProfileMenuOpen && (
          <div className="absolute bottom-16 left-3 z-50 w-[220px] rounded-xl border border-slate-100 bg-white py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.15)] animate-in fade-in zoom-in duration-150">
            <button
              onClick={() => {
                actions.openSettings();
                setIsProfileMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-slate-600 transition-colors hover:bg-slate-50"
            >
              <AppIcon src="/assets/icons/settings.png" alt="settings" className="h-4 w-4 opacity-70" />
              <span className="text-[13px] font-bold">설정</span>
            </button>
            <div className="mx-2 my-1 h-px bg-slate-100" />
            <button
              onClick={() => {
                actions.logout();
                setIsProfileMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-rose-500 transition-colors hover:bg-rose-50"
            >
              <AppIcon src="/assets/icons/log-out.png" alt="logout" className="h-4 w-4 opacity-70" />
              <span className="text-[13px] font-bold">로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

const SummarySideMenuItem = ({ item, isActive, onClick }: { item: NavPageItem; isActive: boolean; onClick: () => void }) => (
  <button onClick={onClick} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-black/[0.05]'}`}>
    {item.icon && <AppIcon src={item.icon} alt={item.title} className={`h-4 w-4 transition-opacity ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`} />}
    <span className="flex-1 text-[14px] font-bold tracking-tight">{item.title}</span>
    {item.badge && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-black text-indigo-600">{item.badge}</span>}
  </button>
);

const SummaryPageRow = ({ item, actions, depth }: { item: NavPageItem; actions: MeetingSummaryPageProps['actions']; depth: number }) => {
  const hasSubPages = item.subPages && item.subPages.length > 0;
  const [isExpanded, setIsExpanded] = useState(item.isExpanded ?? true);
  const bgClass = item.isActive ? 'bg-indigo-50/70' : 'hover:bg-black/[0.05]';
  const textClass = item.isActive ? 'text-indigo-600 font-bold' : 'text-slate-700 font-medium';

  return (
    <div className="w-full">
      <div className={`group/row mx-1 mb-0.5 flex cursor-pointer items-center justify-between rounded-lg py-1.5 pr-3 transition-colors ${bgClass}`} style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (hasSubPages) setIsExpanded((current) => !current);
              actions.togglePage(item.id);
            }}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/[0.1] ${hasSubPages ? 'visible' : 'invisible'}`}
          >
            <AppIcon src={`/assets/icons/${isExpanded ? 'triangle-down' : 'triangle-right'}.png`} alt="토글" className="h-2.5 w-2.5 opacity-60" />
          </button>
          <button onClick={() => actions.openMeeting(item.id)} className="flex flex-1 items-center gap-2 overflow-hidden text-left">
            {item.icon && <AppIcon src={item.icon} alt="아이콘" className="h-4 w-4 shrink-0" />}
            <span className={`truncate text-[13px] ${textClass}`}>{item.title}</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
          <button type="button" onClick={() => actions.openDashboardMenu('menu-2')} aria-label={`${item.title} 메뉴`} className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-black/[0.1]">
            <AppIcon src="/assets/icons/dots.png" alt="more" className="h-3.5 w-3.5 opacity-50" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              actions.addPage(item.id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-black/[0.1]"
          >
            <AppIcon src="/assets/icons/plus.png" alt="add" className="h-3.5 w-3.5 opacity-50" />
          </button>
        </div>
      </div>
      {isExpanded && hasSubPages && (
        <div className="mt-0.5 space-y-0.5">
          {item.subPages?.map((subPage) => <SummaryPageRow key={subPage.id} item={subPage} actions={actions} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
};

const SummaryPanel = ({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-5 flex items-center justify-between">
      <h2 className="text-[14px] font-black text-slate-900">{title}</h2>
      {action && onAction && (
        <button type="button" onClick={onAction} className="text-[11px] font-black text-slate-500 hover:text-indigo-600">
          {action}
        </button>
      )}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

const InfoLine = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1 text-[11px] font-black text-slate-500">{label}</p>
    <p className="text-[12px] font-bold leading-5 text-slate-600">{children}</p>
  </div>
);

const StatusPill = ({ tone, children }: { tone: 'green' | 'indigo'; children: React.ReactNode }) => (
  <span className={`rounded-full px-3 py-1.5 text-[12px] font-black ${tone === 'green' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>{children}</span>
);

const SummaryToolButton = ({ icon, children, onClick }: { icon: string; children: React.ReactNode; onClick?: () => void }) => (
  <button type="button" onClick={onClick} className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-black text-slate-600 shadow-sm hover:bg-slate-50">
    <AppIcon src={`/assets/icons/${icon}.png`} alt="" className="h-4 w-4" />
    {children}
  </button>
);

const TabIcon = ({ tab }: { tab: string }) => {
  const icon = tab === '개요' ? 'clipboard' : tab === '회의록' ? 'file-text' : tab === '의사결정' ? 'check' : tab === '재논의 감지' ? 'settings' : 'folder';
  return <AppIcon src={`/assets/icons/${icon}.png`} alt="" className="h-4 w-4" />;
};

const DecisionBadge = ({ value }: { value: string }) => (
  <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-black ${value === '승인' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>{value}</span>
);

const DecisionActionCard = ({
  issue,
  actions,
  onClose,
}: {
  issue: {
    id: number;
    title: string;
    description: string | null;
    priority: IssuePriority | string;
    dueDate: string | null;
    assigneeId: number | null;
  };
  actions: MeetingSummaryPageProps['actions'];
  onClose: () => void;
}) => {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: issue.title,
    description: issue.description ?? '',
    priority: ['LOW', 'MEDIUM', 'HIGH'].includes(String(issue.priority).toUpperCase()) ? String(issue.priority).toUpperCase() : '',
    dueDate: issue.dueDate ?? '',
    assigneeId: issue.assigneeId ? String(issue.assigneeId) : '',
  });

  const handleUpdateStatus = (event: React.MouseEvent<HTMLButtonElement>, status: Exclude<IssueStatus, 'OPEN'>) => {
    event.stopPropagation();
    actions.updateIssueStatus(Number(issue.id), status);
    onClose();
  };

  const handleEditIssue = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setEditErrorMessage(null);
    setIsEditOpen(true);
  };

  const handleSubmitEditIssue = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const title = editForm.title.trim();
    const dueDate = editForm.dueDate.trim();
    const assigneeId = editForm.assigneeId.trim();

    if (!title) {
      setEditErrorMessage('안건 제목은 비워둘 수 없습니다.');
      return;
    }
    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setEditErrorMessage('마감일은 YYYY-MM-DD 형식으로 입력해 주세요.');
      return;
    }
    if (assigneeId && (!/^\d+$/.test(assigneeId) || Number(assigneeId) <= 0)) {
      setEditErrorMessage('담당자 ID는 양의 정수로 입력해 주세요.');
      return;
    }

    actions.updateIssue(Number(issue.id), {
      title,
      description: editForm.description.trim() || null,
      priority: editForm.priority ? editForm.priority as IssuePriority : null,
      dueDate: dueDate || null,
      assigneeId: assigneeId ? Number(assigneeId) : null,
    });
    onClose();
  };

  const handleDeleteIssue = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const confirmed = window.confirm('이 안건을 삭제하시겠습니까?');
    if (!confirmed) return;

    actions.deleteIssue(Number(issue.id));
    onClose();
  };

  return (
    <div onClick={(event) => event.stopPropagation()} className={`absolute right-0 top-9 z-50 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.16)] ${isEditOpen ? 'w-[300px]' : 'w-[160px]'}`}>
      {isEditOpen ? (
        <form onSubmit={handleSubmitEditIssue} className="space-y-3 p-2">
          <div className="flex items-center justify-between"><p className="text-xs font-black text-slate-800">안건 수정</p><button type="button" onClick={() => setIsEditOpen(false)} className="text-lg leading-none text-slate-400" aria-label="수정 닫기">×</button></div>
          <input value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs font-bold outline-none focus:border-indigo-500" placeholder="안건 제목" autoFocus />
          <textarea value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} className="min-h-16 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-indigo-500" placeholder="설명" />
          <div className="grid grid-cols-2 gap-2"><select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value }))} className="h-8 rounded-lg border border-slate-200 bg-white px-1 text-xs font-bold"><option value="">우선순위 없음</option><option value="HIGH">높음</option><option value="MEDIUM">보통</option><option value="LOW">낮음</option></select><input type="date" value={editForm.dueDate} onChange={(event) => setEditForm((current) => ({ ...current, dueDate: event.target.value }))} className="h-8 rounded-lg border border-slate-200 px-1 text-xs font-bold" /></div>
          <input inputMode="numeric" value={editForm.assigneeId} onChange={(event) => setEditForm((current) => ({ ...current, assigneeId: event.target.value.replace(/[^0-9]/g, '') }))} className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs font-bold outline-none focus:border-indigo-500" placeholder="담당자 ID (선택)" />
          {editErrorMessage && <p className="text-[10px] font-bold text-rose-500" role="alert">{editErrorMessage}</p>}
          <div className="flex justify-end gap-1.5"><button type="button" onClick={() => setIsEditOpen(false)} className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-black text-slate-600">취소</button><button type="submit" className="h-8 rounded-lg bg-indigo-600 px-3 text-[11px] font-black text-white">저장</button></div>
        </form>
      ) : (<>
      <button onClick={(event) => { event.stopPropagation(); setIsStatusMenuOpen((prev) => !prev); }} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-black text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
        <AppIcon src="/assets/icons/clipboard.png" alt="" className="h-3.5 w-3.5" />
        상태 변경
      </button>
      {isStatusMenuOpen && (
        <div className="my-1 rounded-lg bg-slate-50 p-1">
          <button onClick={(event) => handleUpdateStatus(event, 'IN_PROGRESS')} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] font-black text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
            진행 중
          </button>
          <button onClick={(event) => handleUpdateStatus(event, 'CLOSED')} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] font-black text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
            승인
          </button>
        </div>
      )}
      <button onClick={handleEditIssue} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-black text-slate-700 transition-colors hover:bg-indigo-50 hover:text-indigo-600">
        <AppIcon src="/assets/icons/file-text.png" alt="" className="h-3.5 w-3.5" />
        안건 내용 수정
      </button>
      <button onClick={handleDeleteIssue} className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[12px] font-black text-rose-500 transition-colors hover:bg-rose-50">
        <AppIcon src="/assets/icons/close.png" alt="" className="h-3.5 w-3.5" />
        삭제
      </button>
      </>)}
    </div>
  );
};

const PriorityBadge = ({ value }: { value: string }) => (
  <span className={`w-fit rounded-md px-2 py-1 text-[11px] font-black ${value === '높음' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-600'}`}>{value}</span>
);

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hours}:${minutes}`;
};
