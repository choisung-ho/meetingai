import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppIcon } from '../shared/ui/AppIcon';
import { UserStack } from '../shared/ui/UserStack';
import type { PresenceUser } from '../shared/ui/UserStack';

import { DashboardHomeView } from '../features/dashboard/views/DashboardHomeView';
import { MeetingListView } from '../features/dashboard/views/MeetingListView';
import { AgendaBoardView } from '../features/dashboard/views/AgendaBoardView';
import { AlertCenterView } from '../features/dashboard/views/AlertCenterView';
import { DocumentAnalysisView } from '../features/dashboard/views/DocumentAnalysisView';
import { CalendarView } from '../features/dashboard/views/CalendarView';
import { ReportView } from '../features/dashboard/views/ReportView';
import { WorkspaceMemberView } from '../features/dashboard/views/WorkspaceMemberView';
import { INVITABLE_WORKSPACE_ROLES, WORKSPACE_ROLE_LABEL } from '../constants/workspaceRoles';
import type { WorkspaceInvitation, WorkspaceMember } from '../types/workspace.types';
import type { WorkspaceRole } from '../types/workspace.types';
import type { InviteWorkspaceRequest, WorkspaceInvitationCreateResult } from '../types/workspace.types';
import type { AlertItem, GetAlertPayload, GetAlertsPayload, UpdateAlertPayload } from '../types/alert.types';
import type { DocumentMeta } from '../types/document.types';

export type User = { id: string; userId?: string; name: string; email: string; role: WorkspaceRole; avatarUrl?: string; teamName?: string; status?: string; };
export type WorkspaceItem = { id: string; name: string; icon: string; };
export type MeetingStatus = "READY" | "ACTIVE" | "ENDED";
export type Meeting = { id: string; title: string; status: MeetingStatus; issueStatus?: "OPEN" | "IN_PROGRESS" | "CLOSED" | null; startTime: string; createdAt?: string; created_at?: string; fetchedAt?: string; participantCount: number; participants: User[]; decisionCount: number; rediscussCount: number; };
export type RediscussAlert = { id: string; title: string; time: string; severity: "높음" | "중간" | "낮음"; color: "rose" | "amber" | "slate"; };
export type DocumentFile = { id: string; name: string; date: string; icon: string; meetingId?: number | null };
export type NavPageItem = { id: string; title: string; icon?: string; isExpanded?: boolean; isActive?: boolean; badge?: string | number; subPages?: NavPageItem[]; onClick?: () => void; };
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
  deletedAt?: string | null;
};

type DashboardIssueEvent = {
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

export type DashboardPageProps = {
  user: User;
  meetings: Meeting[];
  issues?: DashboardIssue[];
  issue?: {
    selectedIssueDetail: DashboardIssue | null;
    selectedIssueEvents: DashboardIssueEvent[];
    isLoading: boolean;
    isEventsLoading: boolean;
  };
  alertCenter?: {
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
  statistics: { proposed: number; discussing: number; approved: number; executing: number; onHold: number; };
  alerts: RediscussAlert[];
  documents: DocumentFile[];
  selectedDocument: DocumentMeta | null;
  documentProcessing: {
    isUploading: boolean;
    uploadErrorMessage: string | null;
    processingDocumentId: number | null;
    errorMessage: string | null;
  };
  workspaces: { available: WorkspaceItem[]; current: WorkspaceItem; };
  canInviteMember: boolean;
  canDeleteMeeting: boolean;
  workspace: { users: PresenceUser[] };
  invitations: {
    items: WorkspaceInvitation[];
    isLoading: boolean;
    errorMessage: string | null;
  };
  /** 워크스페이스 멤버 관리 (Phase 2.5 멤버 목록/권한 변경/제거) */
  memberManagement: {
    currentUserId: number | null;
    members: WorkspaceMember[];
    isLoading: boolean;
    errorMessage: string | null;
    changeMemberRole: (targetUserId: number, role: 'MEMBER' | 'ADMIN') => void;
    removeMember: (targetUserId: number) => void;
    retry: () => void;
  };
  navigation: { mainMenu: NavPageItem[]; workspace?: NavPageItem[]; weeklyMeeting: NavPageItem; };
  actions: {
    toggleWorkspaceList: () => void;
    selectWorkspace: (workspaceId: number) => void;
    createWorkspace: (name: string) => void;
    inviteMember: (
      workspaceId: number,
      email: string,
      role: InviteWorkspaceRequest['role']
    ) => Promise<WorkspaceInvitationCreateResult>;
    fetchMyInvitations: () => Promise<void>;
    acceptInvitation: (invitationId: number) => Promise<void>;
    rejectInvitation: (invitationId: number) => Promise<void>;
    startMeeting: (title: string) => void;
    openMeeting: (meetingId: string) => void;
    openMeetingRecord: (meetingId: string) => void;
    openSettings: () => void;
    deleteMeeting: (meetingId: string | number) => void;
    getIssue: (
      payload: {
        workspaceId: number;
        meetingId: number;
        meetingRoomId: number;
        issueId: number;
      }
    ) => void;
    getIssueEvents: (
      payload: {
        workspaceId: number;
        meetingId: number;
        meetingRoomId: number;
        issueId: number;
      }
    ) => void;
    getAlerts?: (payload: GetAlertsPayload) => void;
    getAlert?: (payload: GetAlertPayload) => void;
    acknowledgeAlert?: (alertId: number) => void;
    dismissAlert?: (alertId: number) => void;
    resolveAlert?: (alertId: number) => void;
    updateAlert?: (payload: UpdateAlertPayload) => void;
    deleteAlert?: (alertId: number) => void;
    updateIssueStatus: (
      issueId: number,
      status: "IN_PROGRESS" | "CLOSED",
      meetingId: number,
      meetingRoomId?: number
    ) => void;
    updateIssue: (
      issueId: number,
      meetingId: number,
      values: {
        title: string;
        description: string | null;
        priority: "LOW" | "MEDIUM" | "HIGH" | null;
        dueDate: string | null;
        assigneeId: number | null;
      },
      meetingRoomId?: number
    ) => void;
    deleteIssue: (
      issueId: number,
      meetingId: number,
      meetingRoomId?: number
    ) => void;
    uploadWorkspaceDocument: (file: File) => void;
    processDocument: (documentId: number) => Promise<void>;
    openDocumentDetail: (documentId: number) => void;
    closeDocumentDetail: () => void;
    deleteDocument: (documentId: number, meetingId?: number | null) => void;
    logout: () => void;
  };
};

export const DashboardPageUI: React.FC<DashboardPageProps> = ({
  user, meetings, issues = [], issue, alertCenter, statistics, alerts, documents, selectedDocument, documentProcessing, workspaces, canInviteMember, canDeleteMeeting, workspace, invitations, memberManagement, navigation, actions
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isInvitationModalOpen, setIsInvitationModalOpen] = useState(false);
  
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteWorkspaceRequest['role']>('MEMBER');
  const [inviteTargetWorkspaceId, setInviteTargetWorkspaceId] = useState<number | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteErrorMessage, setInviteErrorMessage] = useState<string | null>(null);
  const [inviteFieldErrors, setInviteFieldErrors] = useState<Record<string, string>>({});
  const [isInviting, setIsInviting] = useState(false);
  const [acceptingInvitationId, setAcceptingInvitationId] = useState<number | null>(null);
  const [rejectingInvitationId, setRejectingInvitationId] = useState<number | null>(null);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');

  const requestedMenuId = searchParams.get('menu');
  const activeMenuId = requestedMenuId && navigation.mainMenu.some((menu) => menu.id === requestedMenuId) ? requestedMenuId : 'menu-1';
  const selectMenu = (menuId: string) => {
    const nextParams = new URLSearchParams(searchParams);

    if (menuId === 'menu-1') {
      nextParams.delete('menu');
    } else {
      nextParams.set('menu', menuId);
    }

    setSearchParams(nextParams, { replace: true });
  };
  const dashboardUserStack = workspace.users;
  const pendingInvitations = invitations.items.filter((invitation) => invitation.status === 'PENDING');

  const handleCreateMeeting = () => {
    if (newMeetingTitle.trim()) {
      actions.startMeeting(newMeetingTitle);
      setIsCreateModalOpen(false);
      setNewMeetingTitle('');
    }
  };

  const handleCreateWorkspace = () => {
    if (newWorkspaceName.trim()) {
      actions.createWorkspace(newWorkspaceName);
      setIsWorkspaceModalOpen(false);
      setNewWorkspaceName('');
    }
  };

  const handleOpenInviteModal = () => {
    const workspaceId = Number(workspaces.current.id);

    if (!Number.isFinite(workspaceId) || workspaceId <= 0) {
      setInviteErrorMessage('워크스페이스를 선택해야 합니다.');
      return;
    }

    setInviteEmail('');
    setInviteRole('MEMBER');
    setInviteTargetWorkspaceId(workspaceId);
    setInviteErrorMessage(null);
    setInviteFieldErrors({});
    setInviteMessage(null);
    setIsInviteModalOpen(true);
    setIsSwitcherOpen(false);
  };

  const handleCloseInviteModal = () => {
    if (isInviting) return;

    setIsInviteModalOpen(false);
    setInviteTargetWorkspaceId(null);
    setInviteEmail('');
    setInviteRole('MEMBER');
    setInviteErrorMessage(null);
    setInviteFieldErrors({});
  };

  const handleInviteMember = async () => {
    const trimmedEmail = inviteEmail.trim();

    if (!trimmedEmail) {
      setInviteFieldErrors({ email: '이메일을 입력해주세요.' });
      setInviteErrorMessage('이메일을 입력하세요.');
      return;
    }

    if (!inviteTargetWorkspaceId) {
      setInviteErrorMessage('워크스페이스를 선택해야 합니다.');
      return;
    }

    if (
      !workspaces.available.some(
        (workspace) => Number(workspace.id) === inviteTargetWorkspaceId
      )
    ) {
      setInviteErrorMessage('워크스페이스를 찾을 수 없습니다.');
      return;
    }

    try {
      setIsInviting(true);
      setInviteErrorMessage(null);
      setInviteFieldErrors({});
      const invitation = await actions.inviteMember(inviteTargetWorkspaceId, trimmedEmail, inviteRole);
      if (!invitation.id) {
        throw new Error('초대 응답이 올바르지 않습니다.');
      }
      setIsInviteModalOpen(false);
      setInviteTargetWorkspaceId(null);
      setInviteEmail('');
      setInviteRole('MEMBER');
      setInviteMessage('워크스페이스 초대가 전송되었습니다.');
    } catch (error) {
      const fieldErrors =
        error instanceof Error && 'fieldErrors' in error
          ? (error.fieldErrors as Record<string, string>)
          : {};
      setInviteFieldErrors(fieldErrors);
      setInviteErrorMessage(error instanceof Error ? error.message : '초대 요청에 실패했습니다.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleAcceptInvitation = async (invitationId: number) => {
    if (acceptingInvitationId !== null || rejectingInvitationId !== null) return;

    try {
      setAcceptingInvitationId(invitationId);
      await actions.acceptInvitation(invitationId);
    } finally {
      setAcceptingInvitationId(null);
    }
  };

  const handleOpenInvitationModal = () => {
    setIsInvitationModalOpen(true);
    if (!invitations.isLoading) {
      actions.fetchMyInvitations();
    }
  };

  const handleRejectInvitation = async (invitationId: number) => {
    if (acceptingInvitationId !== null || rejectingInvitationId !== null) return;

    try {
      setRejectingInvitationId(invitationId);
      await actions.rejectInvitation(invitationId);
    } finally {
      setRejectingInvitationId(null);
    }
  };

  const renderActiveView = () => {
    switch (activeMenuId) {
      case 'menu-1': return <DashboardHomeView setIsCreateModalOpen={setIsCreateModalOpen} statistics={statistics} meetings={meetings} alerts={alerts} documents={documents} uploadState={documentProcessing} actions={actions} setActiveMenuId={selectMenu} />;
      case 'menu-2': return <MeetingListView meetings={meetings} canDeleteMeeting={canDeleteMeeting} actions={actions} />;
      case 'menu-3': return <AgendaBoardView issues={issues} selectedIssueDetail={issue?.selectedIssueDetail ?? null} issueEvents={issue?.selectedIssueEvents ?? []} isIssueDetailLoading={issue?.isLoading ?? false} isIssueEventsLoading={issue?.isEventsLoading ?? false} actions={{ getIssue: actions.getIssue, getIssueEvents: actions.getIssueEvents, updateIssueStatus: actions.updateIssueStatus, updateIssue: actions.updateIssue, deleteIssue: actions.deleteIssue }} />;
      case 'menu-4': return <AlertCenterView alertCenter={alertCenter} meetings={meetings} onGetAlerts={actions.getAlerts} onGetAlert={actions.getAlert} onAcknowledgeAlert={actions.acknowledgeAlert} onDismissAlert={actions.dismissAlert} onResolveAlert={actions.resolveAlert} onUpdateAlert={actions.updateAlert} onDeleteAlert={actions.deleteAlert} />;
      case 'menu-5': return <DocumentAnalysisView documents={documents} selectedDocument={selectedDocument} onUpload={actions.uploadWorkspaceDocument} uploadState={documentProcessing} actions={{ openDocumentDetail: actions.openDocumentDetail, closeDocumentDetail: actions.closeDocumentDetail, deleteDocument: actions.deleteDocument, processDocument: actions.processDocument }} />;
      case 'menu-6': return <CalendarView meetings={meetings} actions={{ openMeeting: actions.openMeeting }} />;
      case 'menu-7': return <ReportView meetings={meetings} issues={issues} alerts={alertCenter?.items ?? []} />;
      case 'menu-8': return (
        <WorkspaceMemberView
          currentUserId={memberManagement.currentUserId}
          members={memberManagement.members}
          canManage={canInviteMember}
          isLoading={memberManagement.isLoading}
          errorMessage={memberManagement.errorMessage}
          inviteForm={{
            email: inviteEmail,
            role: inviteRole,
            isSubmitting: isInviting,
            errorMessage: inviteErrorMessage,
          }}
          actions={{
            changeInviteEmail: (email) => { setInviteEmail(email); setInviteErrorMessage(null); },
            changeInviteRole: setInviteRole,
            sendInvite: handleInviteMember,
            changeMemberRole: memberManagement.changeMemberRole,
            removeMember: memberManagement.removeMember,
            retry: memberManagement.retry,
          }}
        />
      );
      default: return <DashboardHomeView setIsCreateModalOpen={setIsCreateModalOpen} statistics={statistics} meetings={meetings} alerts={alerts} documents={documents} uploadState={documentProcessing} actions={actions} setActiveMenuId={selectMenu} />;
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#f8faff] font-sans text-slate-800 overflow-hidden select-none relative">
      <aside className="w-[240px] shrink-0 bg-[#fbfbfa] flex flex-col border-r border-black/[0.03] z-20">
        <div className="p-3 mb-1 relative">
          <div onClick={() => setIsSwitcherOpen(!isSwitcherOpen)} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-black/[0.05] cursor-pointer transition-colors group">
            <div className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-white font-black text-[11px] shadow-sm">P</div>
            <span className="flex-1 font-semibold text-[14px] truncate text-slate-700">PICK - {workspaces?.current?.name || 'Workspace'}</span>
            <AppIcon src="/assets/icons/chevron-down.png" alt="open" className={`w-3 h-3 opacity-50 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
          </div>

          {isSwitcherOpen && (
            <div className="absolute top-12 left-3 w-[260px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-2 z-50 animate-in fade-in zoom-in duration-150">
              <div className="px-3 py-1.5 mb-1"><p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2">워크스페이스</p></div>
              <div className="space-y-0.5 px-2 max-h-[200px] overflow-y-auto scrollbar-hide">
                {workspaces?.available?.map((ws) => (
                  <div key={ws.id} onClick={() => { actions.selectWorkspace(Number(ws.id)); setIsSwitcherOpen(false); }} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${ws.id === workspaces?.current?.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-white font-black text-[10px]">P</div>
                      <span className={`text-[13px] font-bold ${ws.id === workspaces?.current?.id ? 'text-indigo-600' : 'text-slate-700'}`}>PICK - {ws.name}</span>
                    </div>
                    {ws.id === workspaces?.current?.id && <AppIcon src="/assets/icons/check.png" alt="selected" className="w-3 h-3" />}
                  </div>
                ))}
              </div>
              <div className="h-[1px] bg-slate-100 my-1.5 mx-2" />
              <div className="px-2">
                {canInviteMember && (
                  <div onClick={handleOpenInviteModal} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                    <AppIcon src="/assets/icons/user-plus.png" alt="invite" className="w-3.5 h-3.5 opacity-60" />
                    <span className="text-[13px] font-bold">초대하기</span>
                  </div>
                )}
                <div onClick={() => { setIsWorkspaceModalOpen(true); setIsSwitcherOpen(false); }} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                  <AppIcon src="/assets/icons/plus.png" alt="add" className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-[13px] font-bold">새 워크스페이스 추가</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 mt-2 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 space-y-4">
          <div className="space-y-1">
            {navigation?.mainMenu?.map((menu) => (
              <SideMenuItem key={menu.id} iconSrc={menu.icon || ''} label={menu.id === 'menu-3' ? '의사결정' : menu.title} badge={menu.badge} isActive={activeMenuId === menu.id}
                onClick={() => { selectMenu(menu.id); if (menu.onClick) menu.onClick(); }}
              />
            ))}
          </div>
          <div className="h-[1px] bg-black/[0.04] w-full" />
          <div className="px-1">{navigation?.weeklyMeeting && <PageRow item={navigation.weeklyMeeting} canDeleteMeeting={canDeleteMeeting} actions={actions} depth={0} />}</div>
        </div>

        <div className="p-3 border-t border-black/[0.03] mt-auto relative">
          <div onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)} className="flex items-center gap-3 px-2 py-2 hover:bg-black/[0.05] rounded-xl cursor-pointer transition-colors group">
            <img src={user?.avatarUrl || "https://i.pravatar.cc/150"} alt="profile" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
            <div className="flex-1 overflow-hidden">
              <p className="text-[13px] font-bold text-slate-800 truncate">{user?.name}</p>
              <p className="text-[11px] font-medium text-slate-400 truncate">{user?.teamName}</p>
            </div>
            <AppIcon src="/assets/icons/chevron-down.png" alt="more" className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform ${isProfileMenuOpen ? 'rotate-180' : 'group-hover:opacity-100'}`} />
          </div>

          {isProfileMenuOpen && (
            <div className="absolute bottom-16 left-3 w-[220px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in duration-150">
              <div className="px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <img src={user?.avatarUrl || "https://i.pravatar.cc/150"} alt="profile" className="w-10 h-10 rounded-full object-cover border border-slate-200" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[13px] font-extrabold text-slate-900">{user?.name || "사용자"}</p>
                      <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">online</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{user?.email || "이메일 정보 없음"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {user?.id && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">ID {user.id}</span>
                      )}
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">{WORKSPACE_ROLE_LABEL[user?.role ?? "MEMBER"]}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="h-[1px] bg-slate-100 my-1 mx-2" />
              <div onClick={() => { actions.openSettings(); setIsProfileMenuOpen(false); }} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-slate-600 transition-colors">
                <AppIcon src="/assets/icons/settings.png" alt="settings" className="w-4 h-4 opacity-70" /><span className="text-[13px] font-bold">설정</span>
              </div>
              <div className="h-[1px] bg-slate-100 my-1 mx-2" />
              <div onClick={() => { actions.logout(); setIsProfileMenuOpen(false); }} className="flex items-center gap-2.5 px-3 py-2 hover:bg-rose-50 cursor-pointer text-rose-500 transition-colors">
                <AppIcon src="/assets/icons/log-out.png" alt="logout" className="w-4 h-4 opacity-70" /><span className="text-[13px] font-bold">로그아웃</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-12 flex flex-col items-center">
        <div className={`w-full ${activeMenuId === 'menu-3' ? 'max-w-[1220px]' : 'max-w-[1000px]'}`}>
          {inviteMessage && (
            <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
              {inviteMessage}
            </div>
          )}

          <header className="flex justify-between items-end mb-12 shrink-0">
            <div>
              {activeMenuId === 'menu-3' ? (
                <>
                  <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900">의사결정</h1>
                  <p className="text-slate-500 mt-2 font-medium">회의에서 논의된 안건의 의사결정과 상태를 관리하세요.</p>
                </>
              ) : (
                <>
              <h1 className="text-3xl font-extrabold tracking-tighter text-slate-900">
                {activeMenuId === 'menu-1' && `안녕하세요, ${user?.name || '사용자'}님.`}
                {activeMenuId === 'menu-2' && '모든 회의록'}
                {activeMenuId === 'menu-3' && '안건 관리 보드'}
                {activeMenuId === 'menu-4' && '재논의 알림 센터'}
                {activeMenuId === 'menu-5' && '문서 분석함'}
                {activeMenuId === 'menu-6' && '캘린더 및 일정'}
                {activeMenuId === 'menu-7' && '조직 성과 보고서'}
                {activeMenuId === 'menu-8' && '워크스페이스 멤버'}
              </h1>
              <p className="text-slate-500 mt-2 font-medium">
                {activeMenuId === 'menu-1' && <>오늘의 회의 인사이트를 <span className="text-indigo-600 font-bold">PICK</span> 하세요.</>}
                {activeMenuId !== 'menu-1' && `${navigation.mainMenu.find(m => m.id === activeMenuId)?.title} 항목의 상세 내역을 확인합니다.`}
              </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <UserStack users={dashboardUserStack} currentUser={user} maxVisible={3} size="sm" />
                <span className="text-[11px] font-bold text-slate-500">{dashboardUserStack.length}명</span>
              </div>
              <button onClick={handleOpenInvitationModal} className="relative p-2.5 bg-white border border-slate-200 rounded-full shadow-sm hover:bg-slate-50 transition-colors">
                <AppIcon src="/assets/icons/bell.png" alt="alert" className="w-5 h-5 opacity-70" />
                {pendingInvitations.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white">{pendingInvitations.length}</span>
                )}
              </button>
              <button onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold text-[14px] shadow-sm flex items-center gap-2 transition-all active:scale-95">
                <AppIcon src="/assets/icons/mic-white.png" alt="mic" className="w-4 h-4" />회의 시작하기
              </button>
            </div>
          </header>

          {renderActiveView()}
        </div>
      </main>

      {/* 모달 생략 처리 (기존과 동일하므로 간소화하지 않고 전체 형태 유지) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="w-[440px] bg-white rounded-[2rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">신규 회의 생성</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><AppIcon src="/assets/icons/close.png" alt="close" className="w-5 h-5 opacity-40" /></button>
            </div>
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-slate-500 ml-1 uppercase tracking-wider">회의 제목</label>
                <input type="text" value={newMeetingTitle} onChange={(e) => setNewMeetingTitle(e.target.value)} placeholder="회의 제목을 입력하세요" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" autoFocus />
              </div>
            </div>
            <button onClick={handleCreateMeeting} disabled={!newMeetingTitle.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-4.5 rounded-2xl font-black text-base shadow-lg mt-10 transition-all active:scale-[0.98]">생성</button>
          </div>
        </div>
      )}

      {isInvitationModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="w-[440px] bg-white rounded-[2rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">받은 초대</h2>
              <button onClick={() => setIsInvitationModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><AppIcon src="/assets/icons/close.png" alt="close" className="w-5 h-5 opacity-40" /></button>
            </div>
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {invitations.isLoading && (
                <p className="text-sm font-bold text-slate-400">받은 초대를 불러오는 중입니다.</p>
              )}
              {!invitations.isLoading && invitations.errorMessage && (
                <p className="text-sm font-bold text-rose-500">{invitations.errorMessage}</p>
              )}
              {!invitations.isLoading && !invitations.errorMessage && pendingInvitations.length === 0 && (
                <p className="text-sm font-bold text-slate-400">받은 초대가 없습니다.</p>
              )}
              {!invitations.isLoading && !invitations.errorMessage && pendingInvitations.map((invitation) => (
                <div key={invitation.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                  <p className="text-base font-black text-slate-900">{invitation.workspaceName}</p>
                  {invitation.invitedByUserName && (
                    <p className="mt-2 text-xs font-bold text-slate-500">
                      초대한 사람: {invitation.invitedByUserName}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-2 text-xs font-black text-slate-500">
                    <span>{WORKSPACE_ROLE_LABEL[invitation.role]}</span>
                    <span>{invitation.status}</span>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-400">{invitation.createdAt.slice(0, 10)}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => handleAcceptInvitation(invitation.id)} disabled={acceptingInvitationId !== null || rejectingInvitationId !== null} className="rounded-xl bg-indigo-600 py-3 text-sm font-black text-white transition-all hover:bg-indigo-700 disabled:bg-slate-200">
                    {acceptingInvitationId === invitation.id ? '수락 중...' : '수락'}
                  </button>
                  <button onClick={() => handleRejectInvitation(invitation.id)} disabled={acceptingInvitationId !== null || rejectingInvitationId !== null} className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 transition-all hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-300">
                    {rejectingInvitationId === invitation.id ? '거절 중...' : '거절'}
                  </button>
                </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="w-[440px] bg-white rounded-[2rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">멤버 초대</h2>
              <button onClick={handleCloseInviteModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><AppIcon src="/assets/icons/close.png" alt="close" className="w-5 h-5 opacity-40" /></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-slate-500 ml-1 uppercase tracking-wider">이메일</label>
                <input type="email" value={inviteEmail} onChange={(e) => { setInviteEmail(e.target.value); setInviteErrorMessage(null); setInviteFieldErrors((prev) => ({ ...prev, email: '' })); }} placeholder="member@example.com" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:border-indigo-500 transition-all" autoFocus />
                {inviteFieldErrors.email && (
                  <p className="text-[11px] font-bold text-rose-500 ml-1">{inviteFieldErrors.email}</p>
                )}
              </div>
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-slate-500 ml-1 uppercase tracking-wider">권한</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as InviteWorkspaceRequest['role'])} className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:border-indigo-500 transition-all">
                  {INVITABLE_WORKSPACE_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              {inviteErrorMessage && (
                <p className="text-[13px] font-bold text-rose-500 ml-1">{inviteErrorMessage}</p>
              )}
            </div>
            <button onClick={handleInviteMember} disabled={!inviteEmail.trim() || isInviting} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-4.5 rounded-2xl font-black text-base shadow-lg mt-8 transition-all active:scale-[0.98]">{isInviting ? '초대 중...' : '초대'}</button>
          </div>
        </div>
      )}

      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="w-[440px] bg-white rounded-[2rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">워크스페이스 생성</h2>
              <button onClick={() => setIsWorkspaceModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><AppIcon src="/assets/icons/close.png" alt="close" className="w-5 h-5 opacity-40" /></button>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-slate-500 ml-1 uppercase tracking-wider">워크스페이스 이름</label>
                <input type="text" value={newWorkspaceName} onChange={(e) => setNewWorkspaceName(e.target.value)} placeholder="이름을 입력하세요" className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:border-indigo-500 transition-all" autoFocus />
              </div>
            </div>
            <button onClick={handleCreateWorkspace} disabled={!newWorkspaceName.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-4.5 rounded-2xl font-black text-base shadow-lg mt-8 transition-all active:scale-[0.98]">생성하기</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* --- 하위 컴포넌트 --- */
type SideMenuItemProps = {
  iconSrc: string;
  label: string;
  badge?: string | number;
  count?: number;
  isActive: boolean;
  onClick: () => void;
};

const SideMenuItem = ({ iconSrc, label, badge, count, isActive, onClick }: SideMenuItemProps) => {
  const bgClass = isActive ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-black/[0.05] text-slate-600 group-hover:text-[#37352f]';
  const iconOpacity = isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100';
  return (
    <div onClick={onClick} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors group ${bgClass}`}>
      {iconSrc && <AppIcon src={iconSrc} alt={label} className={`w-4 h-4 ${iconOpacity} transition-opacity`} />}
      <span className="flex-1 text-[14px] font-bold tracking-tight">{label}</span>
      {badge && <span className="bg-indigo-100 text-indigo-600 text-[11px] px-2 py-0.5 rounded-full font-black">{badge}</span>}
      {count && <span className="text-[12px] font-medium text-slate-400 group-hover:text-[#37352f]">{count}</span>}
    </div>
  );
};

const PageRow = ({ item, canDeleteMeeting, actions, depth }: { item: NavPageItem, canDeleteMeeting: boolean, actions: DashboardPageProps['actions'], depth: number }) => {
  const [isDeleteMenuOpen, setIsDeleteMenuOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(item.isExpanded ?? true);
  const hasSubPages = item.subPages && item.subPages.length > 0;
  const bgClass = item.isActive ? 'bg-indigo-50/70' : 'hover:bg-black/[0.05]';
  const textClass = item.isActive ? 'text-indigo-600 font-bold' : 'text-slate-700 font-medium';
  const handleDeleteMeeting = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    const confirmed = window.confirm("이 회의를 삭제하시겠습니까?");
    if (!confirmed) return;

    actions.deleteMeeting(item.id);
    setIsDeleteMenuOpen(false);
  };

  return (
    <div className="w-full">
      <div className={`flex items-center justify-between py-1.5 pr-3 cursor-pointer group/row transition-colors rounded-lg mx-1 mb-0.5 ${bgClass}`} style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        <div className="flex items-center gap-1 flex-1 overflow-hidden">
          <button type="button" onClick={(e) => { e.stopPropagation(); if (hasSubPages) setIsExpanded((current) => !current); }} aria-label={`${item.title} 하위 페이지 토글`} className={`w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors ${hasSubPages ? 'visible' : 'invisible'}`}>
            <AppIcon src={`/assets/icons/${isExpanded ? 'triangle-down' : 'triangle-right'}.png`} alt="토글" className="w-2.5 h-2.5 opacity-60" />
          </button>
          <div className="flex items-center gap-2 flex-1 overflow-hidden" onClick={() => actions.openMeeting(item.id)}>
            {item.icon && <AppIcon src={item.icon} alt="아이콘" className="w-4 h-4 shrink-0" />}<span className={`text-[13px] truncate ${textClass}`}>{item.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
          {canDeleteMeeting && (
          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); if (!hasSubPages) setIsDeleteMenuOpen((prev) => !prev); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors"><AppIcon src="/assets/icons/dots.png" alt="more" className="w-3.5 h-3.5 opacity-50" /></button>
            {isDeleteMenuOpen && !hasSubPages && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-6 w-[92px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-1.5 z-50">
                <button onClick={handleDeleteMeeting} className="w-full text-left px-3 py-2 text-[12px] font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                  삭제
                </button>
              </div>
            )}
          </div>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); if (hasSubPages) setIsExpanded(true); else actions.openMeeting(item.id); }} aria-label={`${item.title} 하위 페이지 추가`} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors"><AppIcon src="/assets/icons/plus.png" alt="add" className="w-3.5 h-3.5 opacity-50" /></button>
        </div>
      </div>
      {isExpanded && hasSubPages && (<div className="mt-0.5 space-y-0.5">{item.subPages!.map(sub => <PageRow key={sub.id} item={sub} canDeleteMeeting={canDeleteMeeting} actions={actions} depth={depth + 1} />)}</div>)}
    </div>
  );
};
