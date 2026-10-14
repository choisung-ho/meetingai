import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../../../shared/ui/AppIcon';
import type { AlertItem, AlertLevel, AlertStatus, GetAlertPayload, GetAlertsPayload, UpdateAlertPayload } from '../../../types/alert.types';

type AlertCenterState = {
  items: AlertItem[];
  selectedAlertId: number | null;
  detail: AlertItem | null;
  isLoading: boolean;
  isDetailLoading: boolean;
  isAcknowledgeLoading: boolean;
  isDismissLoading: boolean;
  isResolveLoading: boolean;
  isUpdateLoading: boolean;
  isDeleteLoading: boolean;
  errorMessage: string | null;
  detailErrorMessage: string | null;
  acknowledgeErrorMessage: string | null;
  dismissErrorMessage: string | null;
  resolveErrorMessage: string | null;
  updateErrorMessage: string | null;
  deleteErrorMessage: string | null;
  workspaceId: number | null;
  meetingId: number | null;
  meetingRoomId: number | null;
  isSocketConnected: boolean;
};

type AlertCenterViewProps = {
  alertCenter?: AlertCenterState;
  meetings?: MeetingSource[];
  onGetAlerts?: (payload: GetAlertsPayload) => void;
  onGetAlert?: (payload: GetAlertPayload) => void;
  onAcknowledgeAlert?: (alertId: number) => void;
  onDismissAlert?: (alertId: number) => void;
  onResolveAlert?: (alertId: number) => void;
  onUpdateAlert?: (payload: UpdateAlertPayload) => void;
  onDeleteAlert?: (alertId: number) => void;
};

type TabItem = {
  label: string;
  status?: AlertStatus;
};

type MeetingOption = {
  value: string;
  label: string;
};

type MeetingSource = {
  id: string | number;
  name?: string | null;
  title?: string | null;
};

type AlertWithMeetingLabel = AlertItem & {
  meetingName?: string | null;
  meetingTitle?: string | null;
};

type AlertEditForm = {
  message: string;
  level: AlertLevel;
  status: AlertStatus;
  meetingId: string;
  issueId: string;
};

type AlertEditState = {
  alertId: number;
  form: AlertEditForm;
  status: 'editing' | 'saving';
};

const tabs: TabItem[] = [
  { label: '전체' },
  { label: '논의 중', status: 'PENDING' },
  { label: '확인됨', status: 'ACKNOWLEDGED' },
  { label: '해결됨', status: 'RESOLVED' },
  { label: '무시됨', status: 'DISMISSED' },
];

const levelClass = {
  info: 'bg-sky-50 text-sky-600 before:bg-sky-500',
  warning: 'bg-orange-50 text-orange-500 before:bg-orange-500',
  error: 'bg-rose-50 text-rose-500 before:bg-rose-500',
  success: 'bg-emerald-50 text-emerald-600 before:bg-emerald-500',
};

const levelLabel = {
  info: '정보',
  warning: '주의',
  error: '오류',
  success: '완료',
};

const statusClass = {
  PENDING: 'bg-violet-50 text-violet-600',
  ACKNOWLEDGED: 'bg-emerald-50 text-emerald-600',
  RESOLVED: 'bg-slate-100 text-slate-500',
  DISMISSED: 'bg-slate-50 text-slate-400',
};

const statusLabel = {
  PENDING: '논의 중',
  ACKNOWLEDGED: '확인됨',
  RESOLVED: '해결됨',
  DISMISSED: '무시됨',
};

export const AlertCenterView: React.FC<AlertCenterViewProps> = ({
  alertCenter,
  meetings = [],
  onGetAlerts,
  onGetAlert,
  onAcknowledgeAlert,
  onDismissAlert,
  onResolveAlert,
  onUpdateAlert,
  onDeleteAlert,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus | undefined>();
  const [selectedMeetingFilter, setSelectedMeetingFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isFilterPanelVisible, setIsFilterPanelVisible] = useState(true);
  const [editState, setEditState] = useState<AlertEditState | null>(null);
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);
  const getAlertsRef = useRef(onGetAlerts);
  const lastRequestedKeyRef = useRef<string | null>(null);
  const alerts = useMemo(() => alertCenter?.items ?? [], [alertCenter?.items]);
  const selectedAlert = alertCenter?.detail ?? null;
  const selectedAlertId = alertCenter?.selectedAlertId ?? null;
  const workspaceId = alertCenter?.workspaceId ?? null;
  const meetingId = alertCenter?.meetingId ?? null;
  const meetingRoomId = alertCenter?.meetingRoomId ?? null;
  const isSocketConnected = alertCenter?.isSocketConnected ?? false;
  const canRequestDetail =
    Boolean(onGetAlert) &&
    isSocketConnected &&
    Boolean(workspaceId) &&
    Boolean(meetingId) &&
    Boolean(meetingRoomId);
  const requestKey =
    workspaceId && meetingId && meetingRoomId
      ? `${workspaceId}-${meetingId}-${meetingRoomId}`
      : null;

  useEffect(() => {
    getAlertsRef.current = onGetAlerts;
  }, [onGetAlerts]);

  useEffect(() => {
    if (!isSocketConnected || !workspaceId || !meetingId || !meetingRoomId || !requestKey) return;
    if (lastRequestedKeyRef.current === requestKey) return;

    const getAlerts = getAlertsRef.current;
    if (!getAlerts) return;

    lastRequestedKeyRef.current = requestKey;
    getAlerts({
      workspaceId,
      meetingId,
      meetingRoomId,
    });
  }, [
    isSocketConnected,
    workspaceId,
    meetingId,
    meetingRoomId,
    requestKey,
  ]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: alerts.length };

    tabs.forEach((tab) => {
      if (!tab.status) return;
      counts[tab.status] = alerts.filter((alert) => alert.status === tab.status).length;
    });

    return counts;
  }, [alerts]);

  const meetingOptions = useMemo<MeetingOption[]>(() => {
    const options = new Map<string, MeetingOption>();

    alerts
      .filter((alert) => alert.meetingId !== undefined && alert.meetingId !== null)
      .forEach((alert) => {
        const value = String(alert.meetingId);

        if (options.has(value)) return;

        options.set(value, {
          value,
          label: getMeetingLabel(alert, meetings),
        });
      });

    return Array.from(options.values());
  }, [alerts, meetings]);

  const filteredAlerts = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return alerts.filter((alert) => {
      const matchesStatus = !selectedStatus || alert.status === selectedStatus;
      const matchesMeeting =
        selectedMeetingFilter === 'ALL' ||
        String(alert.meetingId) === selectedMeetingFilter;
      const matchesSearch =
        !keyword ||
        alert.message.toLowerCase().includes(keyword);

      return matchesStatus && matchesMeeting && matchesSearch;
    }).sort((a, b) => {
      const difference = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? -difference : difference;
    });
  }, [alerts, searchTerm, selectedMeetingFilter, selectedStatus, sortOrder]);

  const resetFilters = () => {
    setSelectedStatus(undefined);
    setSelectedMeetingFilter('ALL');
    setSearchTerm('');
    setSortOrder('newest');
  };

  const visibleSelectedAlert =
    selectedAlert && filteredAlerts.some((alert) => Number(alert.id) === Number(selectedAlert.id))
      ? selectedAlert
      : null;
  const activeEditState =
    visibleSelectedAlert && editState?.alertId === Number(visibleSelectedAlert.id)
      ? editState
      : null;
  const isEditMode = Boolean(
    activeEditState &&
      (activeEditState.status === 'editing' ||
        alertCenter?.isUpdateLoading ||
        alertCenter?.updateErrorMessage)
  );
  const editForm = activeEditState?.form ?? null;

  const handleSelectAlert = (alertId: number) => {
    if (!canRequestDetail || !onGetAlert || !workspaceId || !meetingId || !meetingRoomId) return;

    onGetAlert({
      workspaceId,
      meetingId,
      meetingRoomId,
      alertId,
    });
  };

  const handleAcknowledgeAlert = (alertId: number) => {
    if (!isSocketConnected || !onAcknowledgeAlert || alertCenter?.isAcknowledgeLoading) return;

    onAcknowledgeAlert(alertId);
  };

  const handleDismissAlert = (alertId: number) => {
    if (!isSocketConnected || !onDismissAlert || alertCenter?.isDismissLoading) return;

    onDismissAlert(alertId);
  };

  const handleResolveAlert = (alertId: number) => {
    if (!isSocketConnected || !onResolveAlert || alertCenter?.isResolveLoading) return;

    onResolveAlert(alertId);
  };

  const handleStartEdit = (alert: AlertItem) => {
    setEditState({
      alertId: Number(alert.id),
      form: createAlertEditForm(alert),
      status: 'editing',
    });
    setEditErrorMessage(null);
  };

  const handleCancelEdit = () => {
    setEditState(null);
    setEditErrorMessage(null);
  };

  const handleChangeEditForm = (values: Partial<AlertEditForm>) => {
    setEditState((current) =>
      current ? { ...current, form: { ...current.form, ...values }, status: 'editing' } : current
    );
    setEditErrorMessage(null);
  };

  const handleSaveAlert = (alert: AlertItem) => {
    if (!onUpdateAlert || !editForm || alertCenter?.isUpdateLoading) return;

    const trimmedMessage = editForm.message.trim();
    const payload: UpdateAlertPayload = {
      workspaceId: Number(alert.workspaceId),
      alertId: Number(alert.id),
    };
    const meetingId = editForm.meetingId.trim() === '' ? null : Number(editForm.meetingId);
    const issueId = editForm.issueId.trim() === '' ? null : Number(editForm.issueId);

    if (editForm.message !== alert.message) {
      if (!trimmedMessage) {
        setEditErrorMessage('알림 메시지를 입력해주세요.');
        return;
      }

      payload.message = trimmedMessage;
    }

    if (editForm.level !== alert.level) {
      payload.level = editForm.level;
    }

    if (editForm.status !== alert.status) {
      payload.status = editForm.status;
    }

    if (meetingId !== null) {
      if (!Number.isFinite(meetingId) || meetingId <= 0) {
        setEditErrorMessage('회의 ID를 확인해주세요.');
        return;
      }

      if (meetingId !== Number(alert.meetingId)) {
        payload.meetingId = meetingId;
      }
    }

    if (issueId !== null) {
      if (!Number.isFinite(issueId) || issueId <= 0) {
        setEditErrorMessage('안건 ID를 확인해주세요.');
        return;
      }

      if (issueId !== Number(alert.issueId)) {
        payload.issueId = issueId;
      }
    }

    if (Object.keys(payload).length === 2) {
      setEditState(null);
      setEditErrorMessage(null);
      return;
    }

    setEditState((current) => (current ? { ...current, status: 'saving' } : current));
    onUpdateAlert(payload);
  };

  const handleDeleteAlert = (alertId: number) => {
    if (!isSocketConnected || !onDeleteAlert || alertCenter?.isDeleteLoading) return;

    const confirmed = window.confirm('정말 이 재논의 알림을 삭제하시겠습니까?');
    if (!confirmed) return;

    onDeleteAlert(alertId);
  };

  return (
    <div className="w-full min-h-[640px] rounded-[18px] border border-slate-200 bg-white p-8 shadow-sm animate-in fade-in duration-200">
      <div className="flex justify-end gap-3 border-b border-slate-100 pb-5">
        <button
          type="button"
          aria-expanded={isFilterPanelVisible}
          onClick={() => setIsFilterPanelVisible((visible) => !visible)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <AppIcon src="/assets/icons/filter.png" alt="" className="h-4 w-4 text-slate-500" />
          필터
        </button>
        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
        >
          <AppIcon src="/assets/icons/close.png" alt="" className="h-4 w-4 text-slate-500" />
          초기화
        </button>
      </div>

      <div className="mt-5 flex items-center gap-8 border-b border-slate-100">
        {tabs.map((tab) => {
          const isSelected = selectedStatus === tab.status;
          const count = tab.status ? tabCounts[tab.status] ?? 0 : tabCounts.all;

          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setSelectedStatus(tab.status)}
              className={`relative pb-4 text-[13px] font-black transition-colors ${isSelected ? 'text-violet-600 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-violet-600' : 'text-slate-700 hover:text-violet-600'}`}
            >
              {tab.label}
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${isSelected ? 'bg-violet-50 text-violet-500' : 'bg-slate-100 text-slate-400'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-7">
        <section className="flex-[3] min-w-0">
          {isFilterPanelVisible && <div className="flex flex-wrap gap-3">
            <label className="relative flex-1">
              <AppIcon src="/assets/icons/file-search.png" alt="" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="키워드 검색 (예: 디자인, 일정, 기능)"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-[12px] font-semibold text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-violet-300 focus:ring-3 focus:ring-violet-100"
              />
            </label>
            <select
              value={selectedMeetingFilter}
              onChange={(event) => setSelectedMeetingFilter(event.target.value)}
              className="h-10 w-[112px] rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 outline-none focus:border-violet-300"
            >
              <option value="ALL">모든 회의</option>
              {meetingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')}
              className="h-10 w-[92px] rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-black text-slate-700 outline-none focus:border-violet-300"
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
            </select>
          </div>}

          <div className="mt-5 space-y-4">
            {alertCenter?.errorMessage ? (
              <StatePanel className="min-h-[330px]" message={alertCenter.errorMessage} tone="error" />
            ) : alertCenter?.isLoading ? (
              <StatePanel className="min-h-[330px]" message="재논의 알림을 불러오는 중입니다." />
            ) : filteredAlerts.length === 0 ? (
              <StatePanel className="min-h-[330px]" message="재논의 알림이 없습니다." />
            ) : (
              filteredAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  isSelected={alert.id === selectedAlertId}
                  onSelect={handleSelectAlert}
                />
              ))
            )}
          </div>
        </section>

        <aside className="flex-[2] min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
          {alertCenter?.detailErrorMessage ? (
            <StatePanel className="min-h-[430px]" message={alertCenter.detailErrorMessage} tone="error" />
          ) : alertCenter?.isDetailLoading ? (
            <StatePanel className="min-h-[430px]" message="재논의 알림 상세를 불러오는 중입니다." />
          ) : visibleSelectedAlert ? (
            <AlertDetail
              alert={visibleSelectedAlert}
              meetings={meetings}
              isEditMode={isEditMode}
              editForm={editForm}
              isAcknowledgeLoading={alertCenter?.isAcknowledgeLoading ?? false}
              isDismissLoading={alertCenter?.isDismissLoading ?? false}
              isResolveLoading={alertCenter?.isResolveLoading ?? false}
              isUpdateLoading={alertCenter?.isUpdateLoading ?? false}
              isDeleteLoading={alertCenter?.isDeleteLoading ?? false}
              acknowledgeErrorMessage={alertCenter?.acknowledgeErrorMessage ?? null}
              dismissErrorMessage={alertCenter?.dismissErrorMessage ?? null}
              resolveErrorMessage={alertCenter?.resolveErrorMessage ?? null}
              updateErrorMessage={alertCenter?.updateErrorMessage ?? null}
              deleteErrorMessage={alertCenter?.deleteErrorMessage ?? null}
              editErrorMessage={editErrorMessage}
              onAcknowledge={handleAcknowledgeAlert}
              onDismiss={handleDismissAlert}
              onResolve={handleResolveAlert}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onChangeEditForm={handleChangeEditForm}
              onSaveEdit={handleSaveAlert}
              onDelete={handleDeleteAlert}
            />
          ) : (
            <StatePanel className="min-h-[430px]" message="좌측 목록에서 알림을 선택해주세요." />
          )}
        </aside>
      </div>
    </div>
  );
};

const StatePanel = ({
  className = '',
  message,
  tone = 'empty',
}: {
  className?: string;
  message: string;
  tone?: 'empty' | 'error';
}) => (
  <div className={`flex items-center justify-center rounded-xl border border-dashed px-6 text-center ${tone === 'error' ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/60'} ${className}`}>
    <p className={`text-sm font-black ${tone === 'error' ? 'text-rose-500' : 'text-slate-400'}`}>{message}</p>
  </div>
);

const AlertCard = ({
  alert,
  isSelected,
  onSelect,
}: {
  alert: AlertItem;
  isSelected: boolean;
  onSelect: (alertId: number) => void;
}) => (
  <button
    type="button"
    onClick={() => onSelect(alert.id)}
    className={`group w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md ${isSelected ? 'border-violet-200 ring-1 ring-violet-100' : 'border-slate-200'}`}
  >
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={levelClass[alert.level]}>{levelLabel[alert.level]}</Badge>
          <h3 className="truncate text-[14px] font-black text-slate-900">{alert.message}</h3>
        </div>
        <p className="mt-2 text-[12px] font-semibold text-slate-500">회의 ID {alert.meetingId} · 안건 ID {alert.issueId}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
          <AppIcon src="/assets/icons/calendar.png" alt="" className="h-3.5 w-3.5" />
          {formatDate(alert.createdAt)}
        </p>
      </div>
      <span className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-black ${statusClass[alert.status]}`}>{statusLabel[alert.status]}</span>
    </div>
    <div className="mt-4 flex items-end justify-between gap-4">
      <p className="line-clamp-2 text-[12px] font-semibold leading-5 text-slate-600">{alert.message}</p>
      <time className="shrink-0 text-[11px] font-bold text-slate-400">{formatRelativeTime(alert.createdAt)}</time>
    </div>
  </button>
);

const AlertDetail = ({
  alert,
  meetings,
  isEditMode,
  editForm,
  isAcknowledgeLoading,
  isDismissLoading,
  isResolveLoading,
  isUpdateLoading,
  isDeleteLoading,
  acknowledgeErrorMessage,
  dismissErrorMessage,
  resolveErrorMessage,
  updateErrorMessage,
  deleteErrorMessage,
  editErrorMessage,
  onAcknowledge,
  onDismiss,
  onResolve,
  onStartEdit,
  onCancelEdit,
  onChangeEditForm,
  onSaveEdit,
  onDelete,
}: {
  alert: AlertItem;
  meetings: MeetingSource[];
  isEditMode: boolean;
  editForm: AlertEditForm | null;
  isAcknowledgeLoading: boolean;
  isDismissLoading: boolean;
  isResolveLoading: boolean;
  isUpdateLoading: boolean;
  isDeleteLoading: boolean;
  acknowledgeErrorMessage: string | null;
  dismissErrorMessage: string | null;
  resolveErrorMessage: string | null;
  updateErrorMessage: string | null;
  deleteErrorMessage: string | null;
  editErrorMessage: string | null;
  onAcknowledge: (alertId: number) => void;
  onDismiss: (alertId: number) => void;
  onResolve: (alertId: number) => void;
  onStartEdit: (alert: AlertItem) => void;
  onCancelEdit: () => void;
  onChangeEditForm: (values: Partial<AlertEditForm>) => void;
  onSaveEdit: (alert: AlertItem) => void;
  onDelete: (alertId: number) => void;
}) => (
  <div>
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
      <div className="min-w-0">
        <Badge className={levelClass[alert.level]}>{levelLabel[alert.level]}</Badge>
        <h3 className="mt-4 text-[18px] font-black tracking-[-0.01em] text-slate-950">{alert.message}</h3>
        <p className="mt-3 text-[12px] font-semibold text-slate-500">회의 ID {alert.meetingId}</p>
        <p className="mt-2 text-[12px] font-bold text-slate-400">생성일: {formatDate(alert.createdAt)}</p>
      </div>
      {!isEditMode && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onStartEdit(alert)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-black text-slate-500 transition-colors hover:bg-slate-50"
          >
            수정
          </button>
          <button
            type="button"
            disabled={isDeleteLoading}
            onClick={() => onDelete(alert.id)}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[12px] font-black text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
          >
            삭제
          </button>
        </div>
      )}
    </div>

    {isEditMode && editForm && (
      <DetailSection title="수정">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-black text-slate-400">message</span>
            <textarea
              value={editForm.message}
              onChange={(event) => onChangeEditForm({ message: event.target.value })}
              className="min-h-[86px] w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold leading-5 text-slate-700 outline-none focus:border-violet-300 focus:ring-3 focus:ring-violet-100"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-slate-400">level</span>
              <select
                value={editForm.level}
                onChange={(event) => onChangeEditForm({ level: event.target.value as AlertLevel })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-violet-300"
              >
                {alert.level === 'success' && <option value="success">success</option>}
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-slate-400">status</span>
              <select
                value={editForm.status}
                onChange={(event) => onChangeEditForm({ status: event.target.value as AlertStatus })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-violet-300"
              >
                <option value="PENDING">PENDING</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="DISMISSED">DISMISSED</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-slate-400">meetingId</span>
              {meetings.length > 0 ? (
                <select
                  value={editForm.meetingId}
                  onChange={(event) => onChangeEditForm({ meetingId: event.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-violet-300"
                >
                  <option value="">선택 안 함</option>
                  {meetings.map((meeting) => (
                    <option key={meeting.id} value={String(meeting.id)}>
                      {meeting.title || meeting.name || `회의 ID ${meeting.id}`}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  value={editForm.meetingId}
                  onChange={(event) => onChangeEditForm({ meetingId: event.target.value })}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-violet-300"
                />
              )}
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-black text-slate-400">issueId</span>
              <input
                type="number"
                value={editForm.issueId}
                onChange={(event) => onChangeEditForm({ issueId: event.target.value })}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-violet-300"
              />
            </label>
          </div>
        </div>
      </DetailSection>
    )}

    <DetailSection title="안건 정보">
      <p className="text-[12px] font-bold text-slate-500">상태 {statusLabel[alert.status]}</p>
      <p className="mt-1 text-[12px] font-bold text-slate-500">레벨 {levelLabel[alert.level]}</p>
      <p className="mt-1 text-[12px] font-bold text-slate-500">연결 안건 ID {alert.issueId}</p>
      <p className="mt-1 text-[12px] font-bold text-slate-400">회의 ID {alert.meetingId}</p>
      <p className="mt-1 text-[12px] font-bold text-slate-400">워크스페이스 ID {alert.workspaceId}</p>
    </DetailSection>
    <DetailSection title="AI 요약">
      <p className="text-[12px] font-semibold leading-5 text-slate-400">상세 데이터가 아직 제공되지 않았습니다.</p>
    </DetailSection>
    <DetailSection title="이전 회의 내용">
      <p className="text-[12px] font-semibold leading-5 text-slate-400">상세 데이터가 아직 제공되지 않았습니다.</p>
    </DetailSection>
    <DetailSection title="현재 회의 발언">
      <p className="text-[12px] font-semibold leading-5 text-slate-400">상세 데이터가 아직 제공되지 않았습니다.</p>
    </DetailSection>
    <DetailSection title="액션">
      <div className="grid grid-cols-2 gap-3">
        {isEditMode ? (
          <>
            <button
              type="button"
              disabled={isUpdateLoading}
              onClick={() => onSaveEdit(alert)}
              className="h-10 rounded-lg border border-violet-400 bg-white text-[12px] font-black text-violet-600 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white"
            >
              저장
            </button>
            <button
              type="button"
              disabled={isUpdateLoading}
              onClick={onCancelEdit}
              className="h-10 rounded-lg border border-slate-200 bg-white text-[12px] font-black text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
            >
              취소
            </button>
          </>
        ) : (
          <>
        <button
          type="button"
          disabled={isAcknowledgeLoading || alert.status === 'ACKNOWLEDGED'}
          onClick={() => onAcknowledge(alert.id)}
          className="h-10 rounded-lg border border-violet-400 bg-white text-[12px] font-black text-violet-600 transition-colors hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 disabled:hover:bg-white"
        >
          확인 완료 변경
        </button>
        <button
          type="button"
          disabled={isResolveLoading || alert.status === 'RESOLVED'}
          onClick={() => onResolve(alert.id)}
          className="h-10 rounded-lg border border-slate-200 bg-white text-[12px] font-black text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
        >
          해결됨으로 변경
        </button>
        <button
          type="button"
          disabled={isDismissLoading || alert.status === 'DISMISSED'}
          onClick={() => onDismiss(alert.id)}
          className="col-span-1 h-10 rounded-lg border border-slate-200 bg-white text-[12px] font-black text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
        >
          이 알림 무시
        </button>
          </>
        )}
      </div>
      {editErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{editErrorMessage}</p>
      )}
      {updateErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{updateErrorMessage}</p>
      )}
      {deleteErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{deleteErrorMessage}</p>
      )}
      {acknowledgeErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{acknowledgeErrorMessage}</p>
      )}
      {dismissErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{dismissErrorMessage}</p>
      )}
      {resolveErrorMessage && (
        <p className="mt-3 text-[12px] font-bold text-rose-500">{resolveErrorMessage}</p>
      )}
    </DetailSection>
  </div>
);

const DetailSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-slate-100 py-5 last:border-b-0 last:pb-0">
    <h4 className="mb-3 text-[13px] font-black text-slate-900">{title}</h4>
    {children}
  </section>
);

const Badge = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-black before:h-1.5 before:w-1.5 before:rounded-full before:content-[''] ${className}`}>
    {children}
  </span>
);

const createAlertEditForm = (alert: AlertItem): AlertEditForm => ({
  message: alert.message,
  level: alert.level,
  status: alert.status,
  meetingId: alert.meetingId ? String(alert.meetingId) : '',
  issueId: alert.issueId ? String(alert.issueId) : '',
});

const getMeetingLabel = (alert: AlertItem, meetings: MeetingSource[]) => {
  const alertWithMeeting = alert as AlertWithMeetingLabel;
  const alertMeetingTitle = alertWithMeeting.meetingTitle?.trim() || alertWithMeeting.meetingName?.trim();

  if (alertMeetingTitle) return alertMeetingTitle;

  const matchedMeeting = meetings.find((meeting) => String(meeting.id) === String(alert.meetingId));
  const meetingTitle = matchedMeeting?.title?.trim() || matchedMeeting?.name?.trim();

  return meetingTitle || `회의 ID ${alert.meetingId}`;
};

const formatDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatRelativeTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const diffMs = Date.now() - date.getTime();
  const minute = Math.floor(diffMs / 60000);
  const hour = Math.floor(minute / 60);
  const day = Math.floor(hour / 24);

  if (minute < 1) return '방금 전';
  if (minute < 60) return `${minute}분 전`;
  if (hour < 24) return `${hour}시간 전`;
  if (day === 1) return '어제';
  return `${day}일 전`;
};
