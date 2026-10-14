import React from 'react';
import { DashboardPageUI } from './DashboardPage.ui';
import type { PresenceUser } from '../shared/ui/UserStack';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers';
import {
  canDeleteMeeting,
  canInviteWorkspaceMember,
} from '../constants/permissions';
import type { InviteWorkspaceRequest, WorkspaceInvitationCreateResult, WorkspaceResponse, WorkspaceRole } from '../types/workspace.types';
import type { WorkspaceUser } from '../types/workspace.types';
import type { WorkspaceInvitation } from '../types/workspace.types';
import type { Issue, IssueEvent, WebSocketMeeting } from '../types/meeting.types';
import type { AlertItem, AlertStatus, GetAlertPayload, GetAlertsPayload, UpdateAlertPayload } from '../types/alert.types';
import type { AuthUser } from '../types/auth.types';
import type { DocumentMeta } from '../types/document.types';

export type User = { id: string; userId?: string; name: string; email: string; role: WorkspaceRole; avatarUrl?: string; teamName?: string; status?: string };
export type WorkspaceItem = { id: string; name: string; icon: string };
export type MeetingStatus = 'READY' | 'ACTIVE' | 'ENDED';
export type Meeting = { id: string; title: string; status: MeetingStatus; issueStatus?: Issue['status'] | null; startTime: string; createdAt?: string; created_at?: string; fetchedAt?: string; participantCount: number; participants: User[]; decisionCount: number; rediscussCount: number };
export type RediscussAlert = { id: string; title: string; time: string; severity: '높음' | '중간' | '낮음'; color: 'rose' | 'amber' | 'slate' };
export type DocumentFile = { id: string; name: string; date: string; icon: string; meetingId?: number | null };
export type NavPageItem = { id: string; title: string; icon?: string; isExpanded?: boolean; isActive?: boolean; badge?: string | number; subPages?: NavPageItem[]; onClick?: () => void };

export type DashboardPageProps = {
  currentWorkspaceId: number | null;
  currentWorkspaceName: string | null;
  authUser?: AuthUser | null;
  workspaces: WorkspaceResponse[];
  isWorkspaceListOpen: boolean;
  workspace: { users: WorkspaceUser[] };
  invitations: {
    items: WorkspaceInvitation[];
    isLoading: boolean;
    errorMessage: string | null;
  };
  meetings: { items: WebSocketMeeting[]; isLoading: boolean; errorMessage: string | null };
  documents: DocumentMeta[];
  selectedDocument: DocumentMeta | null;
  documentProcessing: {
    isUploading: boolean;
    uploadErrorMessage: string | null;
    processingDocumentId: number | null;
    errorMessage: string | null;
  };
  issues: { items: Issue[] };
  issue: {
    selectedIssueDetail: Issue | null;
    selectedIssueEvents: IssueEvent[];
    isLoading: boolean;
    isEventsLoading: boolean;
  };
  alertCenter: {
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
    getAlerts: (payload: GetAlertsPayload) => void;
    getAlert: (payload: GetAlertPayload) => void;
    acknowledgeAlert: (alertId: number) => void;
    dismissAlert: (alertId: number) => void;
    resolveAlert: (alertId: number) => void;
    updateAlert: (payload: UpdateAlertPayload) => void;
    deleteAlert: (alertId: number) => void;
    updateIssueStatus: (
      issueId: number,
      status: Exclude<Issue['status'], 'OPEN'>,
      meetingId: number,
      meetingRoomId?: number
    ) => void;
    updateIssue: (
      issueId: number,
      meetingId: number,
      values: {
        title: string;
        description: string | null;
        priority: Issue['priority'] | null;
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

const toPresenceUser = (u: WorkspaceUser): PresenceUser => ({
  id: String(u.userId),
  userId: String(u.userId),
  name: u.name || '사용자',
  email: u.email ?? '',
  role: u.role,
  teamName: u.status,
  status: u.status,
  isOnline: u.status === 'online',
});

export const DashboardPage: React.FC<DashboardPageProps> = (props) => {
  const current = props.workspaces.find((w) => w.id === props.currentWorkspaceId) ?? props.workspaces[0] ?? { id: props.currentWorkspaceId ?? 0, name: props.currentWorkspaceName ?? 'Workspace' };
  const canInviteMember = canInviteWorkspaceMember(current.my_role, current.canInviteMember);
  const workspaceMembers = useWorkspaceMembers(props.currentWorkspaceId);
  const canDeleteCurrentMeeting = canDeleteMeeting(current.my_role);
  const available: WorkspaceItem[] = props.workspaces.map((w) => ({ id: String(w.id), name: w.name, icon: '/assets/icons/workspace.png' }));
  const participants = props.workspace.users.map(toPresenceUser);
  const activeIssues = props.issues.items.filter((issue) => {
    if (issue.deletedAt != null) return false;
    if (!props.currentWorkspaceId) return true;
    return Number(issue.workspaceId) === Number(props.currentWorkspaceId);
  });

  const uiMeetings: Meeting[] = props.meetings.items.map((m) => {
    const meetingIssues = activeIssues.filter((issue) => Number(issue.meetingId) === Number(m.id));

    return {
      id: String(m.id),
      title: m.title,
      status: m.status,
      issueStatus: meetingIssues[0]?.status ?? null,
      startTime: m.created_at ?? m.createdAt ?? '-',
      createdAt: m.createdAt,
      created_at: m.created_at,
      participantCount: 0,
      participants: [],
      decisionCount: meetingIssues.length,
      rediscussCount: 0,
    };
  });
  const proposedCount = activeIssues.filter((issue) => issue.status === 'OPEN').length;
  const discussingCount = activeIssues.filter((issue) => issue.status === 'IN_PROGRESS').length;
  const approvedCount = activeIssues.filter((issue) => issue.status === 'CLOSED').length;
  const issueRows = activeIssues.map((issue) => ({
    ...issue,
    meetingTitle: props.meetings.items.find((meeting) => Number(meeting.id) === Number(issue.meetingId))?.title,
  }));
  const uiDocuments: DocumentFile[] = props.documents
    .filter((document) => {
      if (!props.currentWorkspaceId) return true;
      return document.workspaceId == null || Number(document.workspaceId) === Number(props.currentWorkspaceId);
    })
    .map((document) => ({
      id: String(document.id),
      name: document.originalFilename || document.storedFilename || `Document ${document.id}`,
      date: document.createdAt ? document.createdAt.slice(0, 10) : '-',
      icon: document.contentType?.includes('pdf')
        ? '/assets/icons/file-search.png'
        : '/assets/icons/file-text.png',
      meetingId: document.meetingId ?? null,
    }));

  const navigation = {
    mainMenu: [
      { id: 'menu-1', title: '대시보드', icon: '/assets/icons/home.png' },
      { id: 'menu-2', title: '회의록', icon: '/assets/icons/file-text.png', badge: uiMeetings.length || undefined },
      { id: 'menu-3', title: '안건 보드', icon: '/assets/icons/list-check.png' },
      { id: 'menu-4', title: '재논의 알림', icon: '/assets/icons/bell.png' },
      { id: 'menu-5', title: '문서 분석', icon: '/assets/icons/file-search.png' },
      { id: 'menu-6', title: '캘린더', icon: '/assets/icons/calendar.png' },
      { id: 'menu-7', title: '리포트', icon: '/assets/icons/chart.png' },
      { id: 'menu-8', title: '멤버 관리', icon: '/assets/icons/users.png', badge: workspaceMembers.members.length || undefined },
    ],
    weeklyMeeting: {
      id: 'weekly-meetings',
      title: '주간 회의',
      icon: '/assets/icons/folder.png',
      isExpanded: true,
      subPages: uiMeetings.map((m) => ({ id: m.id, title: m.title, icon: '/assets/icons/file-text.png' })),
    },
  };
  const authDisplayName =
    props.authUser?.userName ??
    props.authUser?.name ??
    '사용자';

  const authId = props.authUser?.userId ?? props.authUser?.id;
  const currentWorkspaceRole =
    current.my_role ??
    (current as WorkspaceResponse & { myRole?: WorkspaceRole }).myRole ??
    'MEMBER';

  return (
    <DashboardPageUI
      user={{
        id: authId != null ? String(authId) : '',
        userId: authId != null ? String(authId) : undefined,
        name: authDisplayName,
        email: props.authUser?.email ?? '이메일 정보 없음',
        role: currentWorkspaceRole,
        teamName: props.authUser?.organizationTeamName ?? props.currentWorkspaceName ?? current.name,
      }}
      meetings={uiMeetings}
      issues={issueRows}
      issue={{
        selectedIssueDetail: props.issue.selectedIssueDetail,
        selectedIssueEvents: props.issue.selectedIssueEvents,
        isLoading: props.issue.isLoading,
        isEventsLoading: props.issue.isEventsLoading,
      }}
      alertCenter={props.alertCenter}
      statistics={{ proposed: proposedCount, discussing: discussingCount, approved: approvedCount, executing: 0, onHold: 0 }}
      alerts={props.meetings.errorMessage ? [{ id: 'meeting-error', title: props.meetings.errorMessage, time: 'now', severity: '높음', color: 'rose' }] : []}
      documents={uiDocuments}
      selectedDocument={props.selectedDocument}
      documentProcessing={props.documentProcessing}
      workspaces={{ available, current: { id: String(current.id), name: current.name, icon: '/assets/icons/workspace.png' } }}
      canInviteMember={canInviteMember}
      canDeleteMeeting={canDeleteCurrentMeeting}
      workspace={{ users: participants }}
      invitations={props.invitations}
      memberManagement={{
        currentUserId: authId != null ? Number(authId) : null,
        members: workspaceMembers.members,
        isLoading: workspaceMembers.isLoading,
        errorMessage: workspaceMembers.errorMessage,
        changeMemberRole: (targetUserId, role) => {
          void workspaceMembers.changeMemberRole(targetUserId, role);
        },
        removeMember: (targetUserId) => {
          void workspaceMembers.removeMember(targetUserId);
        },
        retry: () => {
          void workspaceMembers.fetchMembers();
        },
      }}
      navigation={navigation}
      actions={{
        toggleWorkspaceList: props.actions.toggleWorkspaceList,
        selectWorkspace: (workspaceId: number) => props.actions.selectWorkspace(workspaceId),
        createWorkspace: (name: string) => props.actions.createWorkspace(name),
        inviteMember: (workspaceId: number, email: string, role: InviteWorkspaceRequest['role']) =>
          props.actions.inviteMember(workspaceId, email, role),
        fetchMyInvitations: props.actions.fetchMyInvitations,
        acceptInvitation: (invitationId: number) =>
          props.actions.acceptInvitation(invitationId),
        rejectInvitation: (invitationId: number) =>
          props.actions.rejectInvitation(invitationId),
        startMeeting: (title: string) => props.actions.startMeeting(title),
        openMeeting: (meetingId: string) => props.actions.openMeeting(meetingId),
        openMeetingRecord: (meetingId: string) => props.actions.openMeetingRecord(meetingId),
        openSettings: props.actions.openSettings,
        deleteMeeting: props.actions.deleteMeeting,
        getIssue: props.actions.getIssue,
        getIssueEvents: props.actions.getIssueEvents,
        getAlerts: (payload: {
          workspaceId: number;
          meetingId: number;
          meetingRoomId: number;
          status?: AlertStatus;
        }) => props.actions.getAlerts(payload),
        getAlert: props.actions.getAlert,
        acknowledgeAlert: props.actions.acknowledgeAlert,
        dismissAlert: props.actions.dismissAlert,
        resolveAlert: props.actions.resolveAlert,
        updateAlert: props.actions.updateAlert,
        deleteAlert: props.actions.deleteAlert,
        updateIssueStatus: props.actions.updateIssueStatus,
        updateIssue: props.actions.updateIssue,
        deleteIssue: props.actions.deleteIssue,
        uploadWorkspaceDocument: props.actions.uploadWorkspaceDocument,
        processDocument: props.actions.processDocument,
        openDocumentDetail: props.actions.openDocumentDetail,
        closeDocumentDetail: props.actions.closeDocumentDetail,
        deleteDocument: props.actions.deleteDocument,
        logout: props.actions.logout,
      }}
    />
  );
};
