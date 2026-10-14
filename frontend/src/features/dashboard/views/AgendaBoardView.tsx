import React, { useEffect, useMemo, useRef, useState } from 'react';

type DashboardIssue = {
  id?: number | string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  dueDate?: string | null;
  priority?: string | null;
  assigneeId?: number | string | null;
  assigneeName?: string | null;
  meetingId?: number | string | null;
  meetingRoomId?: number | string | null;
  meetingTitle?: string | null;
  workspaceId?: number | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
};

type GetIssuePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
};

type IssueEvent = {
  id: number;
  issueId: number;
  meetingId: number;
  eventType: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  evidence: string | null;
  createdAt: string;
};

type AgendaBoardViewProps = {
  issues?: DashboardIssue[] | null;
  selectedIssueDetail?: DashboardIssue | null;
  issueEvents?: IssueEvent[] | null;
  isIssueDetailLoading?: boolean;
  isIssueEventsLoading?: boolean;
  actions?: {
    getIssue: (payload: GetIssuePayload) => void;
    getIssueEvents: (payload: GetIssuePayload) => void;
    updateIssueStatus: (
      issueId: number,
      status: 'IN_PROGRESS' | 'CLOSED',
      meetingId: number,
      meetingRoomId?: number
    ) => void;
    updateIssue: (
      issueId: number,
      meetingId: number,
      values: {
        title: string;
        description: string | null;
        priority: 'LOW' | 'MEDIUM' | 'HIGH' | null;
        dueDate: string | null;
        assigneeId: number | null;
      },
      meetingRoomId?: number
    ) => void;
    deleteIssue: (issueId: number, meetingId: number, meetingRoomId?: number) => void;
  };
};

type StatKey = 'total' | 'approved' | 'inProgress' | 'onHold' | 'rejected' | 'reopened';
type IssueEditForm = {
  title: string;
  description: string;
  priority: '' | 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate: string;
  assigneeId: string;
};

const stats: Array<{ key: StatKey; label: string; tone: string; symbol: string }> = [
  { key: 'total', label: '총 안건', tone: 'slate', symbol: '□' },
  { key: 'approved', label: '승인됨', tone: 'emerald', symbol: '✓' },
  { key: 'inProgress', label: '진행 중', tone: 'blue', symbol: '●' },
  { key: 'onHold', label: '보류', tone: 'amber', symbol: 'Ⅱ' },
  { key: 'rejected', label: '거절', tone: 'rose', symbol: '×' },
  { key: 'reopened', label: '재논의 발생', tone: 'violet', symbol: '↻' },
];

const statClass: Record<string, { icon: string; value: string }> = {
  slate: { icon: 'bg-slate-50 text-slate-500', value: 'text-slate-900' },
  emerald: { icon: 'bg-emerald-50 text-emerald-500', value: 'text-emerald-600' },
  blue: { icon: 'bg-blue-50 text-blue-500', value: 'text-blue-600' },
  amber: { icon: 'bg-amber-50 text-amber-500', value: 'text-amber-600' },
  rose: { icon: 'bg-rose-50 text-rose-500', value: 'text-rose-600' },
  violet: { icon: 'bg-violet-50 text-violet-500', value: 'text-violet-600' },
};

const statusClass: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-emerald-50 text-emerald-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  DISCUSSING: 'bg-blue-50 text-blue-700',
  ON_HOLD: 'bg-amber-50 text-amber-700',
  HOLD: 'bg-amber-50 text-amber-700',
  REJECTED: 'bg-rose-50 text-rose-700',
  REOPENED: 'bg-violet-50 text-violet-700',
  REDISCUSS: 'bg-violet-50 text-violet-700',
  OPEN: 'bg-slate-100 text-slate-600',
};

const priorityClass: Record<string, string> = {
  HIGH: 'bg-rose-50 text-rose-600',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-slate-100 text-slate-600',
};

const normalizeStatus = (status?: string | null) => String(status ?? '').toUpperCase();
const toPositiveNumber = (value?: number | string | null) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};
const getIssueKey = (issue: DashboardIssue, index: number) => String(issue.id ?? `issue-${index}`);
const getAssignee = (issue?: DashboardIssue | null) => {
  if (!issue) return '-';
  if (issue.assigneeName) return issue.assigneeName;
  if (issue.assigneeId !== null && issue.assigneeId !== undefined && String(issue.assigneeId) !== '') {
    return String(issue.assigneeId);
  }
  return '-';
};

const getIssuePayload = (issue?: DashboardIssue | null): GetIssuePayload | null => {
  const workspaceId = toPositiveNumber(issue?.workspaceId);
  const meetingId = toPositiveNumber(issue?.meetingId);
  const meetingRoomId = toPositiveNumber(issue?.meetingRoomId) ?? 1;
  const issueId = toPositiveNumber(issue?.id);

  if (!workspaceId || !meetingId || !meetingRoomId || !issueId) return null;

  return { workspaceId, meetingId, meetingRoomId, issueId };
};

const formatEventDate = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hour}:${minute}`;
};

export const AgendaBoardView: React.FC<AgendaBoardViewProps> = ({
  issues,
  selectedIssueDetail,
  issueEvents,
  isIssueDetailLoading = false,
  isIssueEventsLoading = false,
  actions,
}) => {
  const issueItems = useMemo(
    () => (Array.isArray(issues) ? issues.filter((issue): issue is DashboardIssue => Boolean(issue)) : []),
    [issues]
  );
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailExpanded, setIsDetailExpanded] = useState(true);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<IssueEditForm>({ title: '', description: '', priority: '', dueDate: '', assigneeId: '' });
  const requestedIssueKeyRef = useRef<string | null>(null);

  const visibleIssueItems = useMemo(
    () => issueItems.filter((issue) => {
      const matchesStatus = statusFilter === 'ALL' || normalizeStatus(issue.status) === statusFilter;
      const matchesPriority = priorityFilter === 'ALL' || normalizeStatus(issue.priority) === priorityFilter;
      return matchesStatus && matchesPriority;
    }),
    [issueItems, priorityFilter, statusFilter]
  );

  const selectedListIssue = useMemo(() => {
    if (visibleIssueItems.length === 0) return null;
    return (
      visibleIssueItems.find((issue, index) => getIssueKey(issue, index) === selectedIssueKey) ??
      visibleIssueItems[0]
    );
  }, [selectedIssueKey, visibleIssueItems]);

  const detailIssue =
    selectedIssueDetail &&
    selectedListIssue &&
    Number(selectedIssueDetail.id) === Number(selectedListIssue.id)
      ? selectedIssueDetail
      : selectedListIssue;

  const sortedIssueEvents = useMemo(
    () =>
      (Array.isArray(issueEvents) ? issueEvents : [])
        .filter((event) => Number(event.issueId) === Number(detailIssue?.id))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        ),
    [detailIssue?.id, issueEvents]
  );

  useEffect(() => {
    if (visibleIssueItems.length === 0) return;
    if (selectedIssueKey) return;

    const firstIssue = visibleIssueItems[0];
    const firstKey = getIssueKey(firstIssue, 0);
    const payload = getIssuePayload(firstIssue);
    if (payload && requestedIssueKeyRef.current !== firstKey) {
      requestedIssueKeyRef.current = firstKey;
      console.log('[GET_ISSUE:AUTO_SELECT_FIRST]', payload.issueId);
      actions?.getIssue(payload);
      actions?.getIssueEvents(payload);
    }
  }, [actions, selectedIssueKey, visibleIssueItems]);

  const issueStats = useMemo(() => {
    const countByStatus = (statuses: string[]) =>
      issueItems.filter((issue) => statuses.includes(normalizeStatus(issue.status))).length;

    return {
      total: issueItems.length,
      approved: countByStatus(['APPROVED', 'CLOSED']),
      inProgress: countByStatus(['IN_PROGRESS', 'DISCUSSING']),
      onHold: countByStatus(['ON_HOLD', 'HOLD']),
      rejected: countByStatus(['REJECTED']),
      reopened: countByStatus(['REOPENED', 'REDISCUSS']),
    };
  }, [issueItems]);

  const handleSelectIssue = (issue: DashboardIssue, index: number) => {
    const issueKey = getIssueKey(issue, index);
    const payload = getIssuePayload(issue);

    setSelectedIssueKey(issueKey);

    if (!payload || requestedIssueKeyRef.current === issueKey) return;

    requestedIssueKeyRef.current = issueKey;
    actions?.getIssue(payload);
    actions?.getIssueEvents(payload);
  };

  const handleStatusAction = (status: 'IN_PROGRESS' | 'CLOSED') => {
    const payload = getIssuePayload(detailIssue);
    if (!payload) return;

    actions?.updateIssueStatus(payload.issueId, status, payload.meetingId, payload.meetingRoomId);
  };

  const handleEditIssue = () => {
    const payload = getIssuePayload(detailIssue);
    if (!payload) return;
    setEditErrorMessage(null);
    setEditForm({
      title: detailIssue?.title ?? '',
      description: detailIssue?.description ?? '',
      priority: ['LOW', 'MEDIUM', 'HIGH'].includes(String(detailIssue?.priority ?? '').toUpperCase())
        ? String(detailIssue?.priority).toUpperCase() as IssueEditForm['priority']
        : '',
      dueDate: detailIssue?.dueDate ?? '',
      assigneeId: detailIssue?.assigneeId ? String(detailIssue.assigneeId) : '',
    });
    setIsEditModalOpen(true);
  };

  const handleSubmitEditIssue = () => {
    const payload = getIssuePayload(detailIssue);
    const title = editForm.title.trim();
    const dueDate = editForm.dueDate.trim();
    const assigneeId = editForm.assigneeId.trim();

    if (!payload) return;
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

    actions?.updateIssue(
      payload.issueId,
      payload.meetingId,
      {
        title,
        description: editForm.description.trim() || null,
        priority: editForm.priority || null,
        dueDate: dueDate || null,
        assigneeId: assigneeId ? Number(assigneeId) : null,
      },
      payload.meetingRoomId
    );
    setIsEditModalOpen(false);
  };

  const handleDeleteIssue = () => {
    const payload = getIssuePayload(detailIssue);
    if (!payload) return;
    if (!window.confirm('이 안건을 삭제하시겠습니까?')) return;

    actions?.deleteIssue(payload.issueId, payload.meetingId, payload.meetingRoomId);
    requestedIssueKeyRef.current = null;
  };

  return (
    <div className="w-full animate-in fade-in duration-200">
      <section className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((item) => (
          <div key={item.label} className="flex min-h-[66px] items-center justify-center gap-3 border-slate-100 px-2 xl:border-r xl:last:border-r-0">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${statClass[item.tone].icon}`}>
              {item.symbol}
            </span>
            <div>
              <p className="text-[12px] font-bold text-slate-500">{item.label}</p>
              <p className={`mt-0.5 text-2xl font-black ${statClass[item.tone].value}`}>{issueStats[item.key]}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <FilterSelect label="상태" value={statusFilter} onChange={setStatusFilter} options={[['ALL', '전체'], ['OPEN', '제안'], ['IN_PROGRESS', '진행 중'], ['CLOSED', '승인']]} />
          <FilterSelect label="기간" value="-" icon="calendar" />
          <FilterSelect label="담당자" value="-" icon="user" />
          <FilterSelect label="우선순위" value={priorityFilter} onChange={setPriorityFilter} options={[['ALL', '전체'], ['HIGH', '높음'], ['MEDIUM', '보통'], ['LOW', '낮음']]} />
          <button type="button" onClick={() => { setStatusFilter('ALL'); setPriorityFilter('ALL'); setSelectedIssueKey(null); requestedIssueKeyRef.current = null; }} className="mt-auto flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-black text-slate-600 transition-colors hover:bg-slate-50">
            <span className="text-base">↻</span>
            필터 초기화
          </button>
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-black text-slate-900">의사결정 목록 <span className="text-slate-500">({issueItems.length})</span></h2>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[38px_1.2fr_.65fr_.8fr_.65fr_.8fr_.8fr] bg-slate-50 px-4 py-3 text-[12px] font-black text-slate-500">
              <span />
              <span>안건</span>
              <span>상태</span>
              <span>마감일</span>
              <span>우선순위</span>
              <span>담당자</span>
              <span>관련 회의</span>
            </div>

            {visibleIssueItems.map((issue, index) => {
              const issueKey = getIssueKey(issue, index);
              const priority = String(issue.priority ?? '').toUpperCase();

              return (
                <button
                  key={issueKey}
                  onClick={() => handleSelectIssue(issue, index)}
                  className={`grid w-full grid-cols-[38px_1.2fr_.65fr_.8fr_.65fr_.8fr_.8fr] items-center border-t border-slate-100 px-4 py-3 text-left text-[13px] font-bold transition-colors hover:bg-slate-50 ${getIssueKey(selectedListIssue ?? {}, 0) === issueKey ? 'bg-indigo-50/50' : 'bg-white'}`}
                >
                  <span className="flex h-4 w-4 rounded border border-slate-300 bg-white" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-black text-slate-900">{issue.title || '-'}</span>
                    <span className="mt-0.5 block text-[12px] font-bold text-slate-500">-</span>
                  </span>
                  <StatusBadge status={issue.status} />
                  <span className="text-slate-600">{issue.dueDate || '-'}</span>
                  <PriorityBadge priority={priority || '-'} />
                  <span className="flex min-w-0 items-center gap-2 text-slate-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-black text-slate-400">{getAssignee(issue).charAt(0)}</span>
                    <span className="truncate">{getAssignee(issue)}</span>
                  </span>
                  <span className="truncate text-slate-600">{issue.meetingTitle || issue.meetingId || '-'}</span>
                </button>
              );
            })}

            {visibleIssueItems.length === 0 && (
              <div className="border-t border-slate-100 px-4 py-10 text-center text-[13px] font-bold text-slate-400">
                표시할 안건이 없습니다.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-black text-slate-900">상세 정보</h2>
              <button
                type="button"
                onClick={() => setIsDetailExpanded((expanded) => !expanded)}
                aria-expanded={isDetailExpanded}
                aria-label={isDetailExpanded ? '상세 정보 접기' : '상세 정보 펼치기'}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-transform hover:bg-slate-50"
              >
                <span className={isDetailExpanded ? '' : 'rotate-180'}>⌃</span>
              </button>
            </div>

            {!isDetailExpanded ? (
              <p className="py-4 text-center text-[12px] font-bold text-slate-400">상세 정보를 접었습니다.</p>
            ) : issueItems.length === 0 ? (
              <p className="py-8 text-center text-[13px] font-bold text-slate-400">안건을 선택하세요</p>
            ) : isIssueDetailLoading ? (
              <p className="py-8 text-center text-[13px] font-bold text-slate-400">상세 정보를 불러오는 중...</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <StatusBadge status={detailIssue?.status} />
                  <select value={normalizeStatus(detailIssue?.status)} onChange={(event) => {
                    const next = event.target.value;
                    if (next === 'IN_PROGRESS' || next === 'CLOSED') handleStatusAction(next);
                  }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] font-bold text-slate-500">
                    <option value="OPEN">제안</option>
                    <option value="IN_PROGRESS">진행 중</option>
                    <option value="CLOSED">승인</option>
                  </select>
                </div>

                <h3 className="mt-4 text-xl font-black text-slate-950">{detailIssue?.title || '-'}</h3>
                <p className="mt-1 text-[12px] font-bold text-slate-500">- · 중요도: {detailIssue?.priority || '-'}</p>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h4 className="mb-3 text-[13px] font-black text-slate-700">의사결정 정보</h4>
                  <InfoLine label="수정일" value={detailIssue?.updatedAt || '-'} />
                  <InfoLine label="생성일" value={detailIssue?.createdAt || '-'} />
                  <InfoLine label="마감일" value={detailIssue?.dueDate || '-'} />
                  <InfoLine label="담당자" value={getAssignee(detailIssue)} />
                  <InfoLine label="관련 회의" value={detailIssue?.meetingTitle || (detailIssue?.meetingId ? String(detailIssue.meetingId) : '-')} />
                  <div className="mt-3">
                    <p className="text-[12px] font-black text-slate-500">결정 내용</p>
                    <p className="mt-1 text-[13px] font-bold leading-6 text-slate-700">{detailIssue?.description || '-'}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <ActionButton label="수정" onClick={handleEditIssue} />
                  <ActionButton label="진행 중" onClick={() => handleStatusAction('IN_PROGRESS')} />
                  <ActionButton label="종료" onClick={() => handleStatusAction('CLOSED')} />
                  <ActionButton label="삭제" tone="danger" onClick={handleDeleteIssue} />
                </div>
              </>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[15px] font-black text-slate-900">재논의 이력</h2>
              <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-500">{sortedIssueEvents.length}</span>
            </div>
            {isIssueEventsLoading ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[12px] font-bold text-slate-500">
                상태 변경 이력을 불러오는 중...
              </p>
            ) : sortedIssueEvents.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[12px] font-bold text-slate-500">
                상태 변경 이력이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedIssueEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-rose-100 bg-rose-50 p-3">
                    <p className="text-[11px] font-black text-slate-500">{formatEventDate(event.createdAt)}</p>
                    <p className="mt-1 text-[12px] font-black text-slate-800">{event.eventType || '-'}</p>
                    <p className="mt-1 text-[12px] font-bold text-slate-600">
                      {event.fromState || '-'} → {event.toState || '-'}
                    </p>
                    <p className="mt-2 text-[12px] font-black text-slate-500">사유:</p>
                    <p className="text-[12px] font-bold text-slate-700">{event.reason || '-'}</p>
                    <p className="mt-2 text-[12px] font-black text-slate-500">근거:</p>
                    <p className="text-[12px] font-bold text-slate-700">{event.evidence || '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-[15px] font-black text-slate-900">다음 액션</h2>
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-[12px] font-bold text-slate-400">등록된 액션 아이템이 없습니다.</p>
          </section>
        </aside>
      </div>
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="안건 수정">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">안건 수정</h2>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="rounded-lg px-2 py-1 text-lg text-slate-400 hover:bg-slate-100" aria-label="닫기">×</button>
            </div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">제목</span><input value={editForm.title} onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-indigo-500" autoFocus /></label>
              <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">설명</span><textarea value={editForm.description} onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-indigo-500" /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">우선순위</span><select value={editForm.priority} onChange={(event) => setEditForm((current) => ({ ...current, priority: event.target.value as IssueEditForm['priority'] }))} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm font-bold outline-none focus:border-indigo-500"><option value="">미지정</option><option value="HIGH">높음</option><option value="MEDIUM">보통</option><option value="LOW">낮음</option></select></label>
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">마감일</span><input type="date" value={editForm.dueDate} onChange={(event) => setEditForm((current) => ({ ...current, dueDate: event.target.value }))} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-bold outline-none focus:border-indigo-500" /></label>
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">담당자 ID</span><input inputMode="numeric" value={editForm.assigneeId} onChange={(event) => setEditForm((current) => ({ ...current, assigneeId: event.target.value.replace(/[^0-9]/g, '') }))} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm font-bold outline-none focus:border-indigo-500" /></label>
              </div>
              {editErrorMessage && <p className="text-xs font-bold text-rose-500" role="alert">{editErrorMessage}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setIsEditModalOpen(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-black text-slate-600 hover:bg-slate-50">취소</button><button type="button" onClick={handleSubmitEditIssue} className="h-10 rounded-lg bg-indigo-600 px-5 text-xs font-black text-white hover:bg-indigo-700">저장</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

const FilterSelect = ({ label, value, icon, options, onChange }: { label: string; value: string; icon?: 'calendar' | 'user'; options?: Array<[string, string]>; onChange?: (value: string) => void }) => (
  <label className="block">
    <span className="mb-1.5 block text-[12px] font-black text-slate-500">{label}</span>
    <span className="flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700">
      <span className="flex items-center gap-2">
        {icon === 'calendar' && <span className="text-slate-400">□</span>}
        {icon === 'user' && <span className="text-slate-400">♙</span>}
        {options && onChange ? <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent outline-none">{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select> : value}
      </span>
      {!options && <span className="text-slate-400">⌄</span>}
    </span>
  </label>
);

const StatusBadge = ({ status }: { status?: string | null }) => {
  const normalizedStatus = normalizeStatus(status);
  const className = statusClass[normalizedStatus] ?? 'bg-slate-100 text-slate-500';

  return <span className={`w-fit rounded-md px-2.5 py-1 text-[11px] font-black ${className}`}>{status || '-'}</span>;
};

const PriorityBadge = ({ priority }: { priority?: string | null }) => {
  const normalizedPriority = String(priority ?? '').toUpperCase();
  const className = priorityClass[normalizedPriority] ?? 'bg-slate-100 text-slate-500';

  return <span className={`w-fit rounded-md px-2.5 py-1 text-[11px] font-black ${className}`}>{priority || '-'}</span>;
};

const InfoLine = ({ label, value }: { label: string; value: string }) => (
  <div className="mb-3 grid grid-cols-[82px_1fr] items-center gap-2 text-[12px]">
    <span className="font-black text-slate-500">{label}</span>
    <span className="truncate font-bold text-slate-700">{value}</span>
  </div>
);

const ActionButton = ({ label, tone = 'default', onClick }: { label: string; tone?: 'default' | 'danger'; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`h-9 rounded-lg border text-[12px] font-black transition-colors ${tone === 'danger' ? 'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
  >
    {label}
  </button>
);
