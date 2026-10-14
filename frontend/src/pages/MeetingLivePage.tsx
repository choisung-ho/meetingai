import React from 'react';
import { MeetingLivePageUI } from './MeetingLivePage.ui';
import type { WorkspaceConnectionStatus, WorkspaceUser } from '../types/workspace.types';
import type { MeetingRoomConnectionStatus, MeetingRoomUser } from '../types/meetingRoom.types';
import type { Issue } from '../types/meeting.types';
import type { WebSocketMeetingStatus } from '../types/meeting.types';
import type { AlertItem } from '../types/alert.types';
import type { DocumentMeta } from '../types/document.types';

export type MeetingLivePageProps = {
  workspaceName: string | null;
  meeting: { id: number; title: string; status: WebSocketMeetingStatus; scheduledAt?: string | null; startedAt?: string | null; endedAt?: string | null; createdAt?: string | null };
  state: { isIssueInputVisible: boolean };
  audio: { isRecording: boolean; isStarting: boolean; isProcessing: boolean; errorMessage: string | null };
  workspace: { workspaceId: number | null; status: WorkspaceConnectionStatus; users: WorkspaceUser[]; updatedAt: string | null; errorMessage: string | null; isWorkspaceJoined: boolean };
  meetingRoom: { workspaceId: number | null; meetingRoomId: number | null; status: MeetingRoomConnectionStatus; users: MeetingRoomUser[]; updatedAt: string | null; errorMessage: string | null; isMeetingRoomJoined: boolean };
  issues: { items: Issue[]; isLoading: boolean; errorMessage: string | null };
  rediscussPopupAlert?: AlertItem | null;
  documents: DocumentMeta[];
  actions: {
    startMeeting: () => void;
    endMeeting: () => void;
    createIssue: (text: string) => void;
    submitTranscriptText: (text: string) => void;
    leaveMeetingRoom: () => void;
    backDashboard: () => void;
    closeRediscussPopup: () => void;
    attachFile: (file: File) => void;
    deleteDocument: (documentId: number) => void;
    openDashboardMenu: (menuId: string) => void;
    openSettings: () => void;
    switchWorkspace: (workspaceId: string) => void;
    createWorkspace: (name: string) => Promise<void>;
    logout: () => void;
    openMeetingRecord: () => void;
  };
};

const toUser = (u: { userId: string | number; name?: string; email?: string; role?: 'OWNER' | 'ADMIN' | 'MEMBER'; status?: string }) => ({ id: String(u.userId), name: u.name || '사용자', email: u.email ?? '', role: u.role, teamName: u.status, status: u.status, isOnline: u.status === 'online' });

export const MeetingLivePage: React.FC<MeetingLivePageProps> = (props) => {
  const participants = (props.meetingRoom.users.length ? props.meetingRoom.users : props.workspace.users).map(toUser);
  const workspaceDisplayName = props.workspaceName?.trim() || `Workspace ${props.workspace.workspaceId ?? ''}`;

  return (
    <MeetingLivePageUI
      user={participants[0] ?? { id: 'me', name: '사용자', email: '', role: 'MEMBER' }}
      participants={participants}
      meetingTitle={props.meeting.title}
      meetingStatus={props.meeting.status}
      scheduledAt={props.meeting.scheduledAt}
      startedAt={props.meeting.startedAt}
      endedAt={props.meeting.endedAt}
      createdAt={props.meeting.createdAt}
      state={props.state}
      audio={props.audio}
      rediscussPopupAlert={props.rediscussPopupAlert}
      documents={props.documents}
      workspaces={{
        available: props.workspace.workspaceId ? [{ id: String(props.workspace.workspaceId), name: workspaceDisplayName, icon: '/assets/icons/workspace.png' }] : [],
        current: { id: String(props.workspace.workspaceId ?? ''), name: workspaceDisplayName, icon: '/assets/icons/workspace.png' },
      }}
      navigation={{
        mainMenu: [
          ['menu-1', '대시보드', 'home'],
          ['menu-2', '회의록', 'file-text'],
          ['menu-3', '안건 관리', 'list-check'],
          ['menu-4', '재논의 알림', 'bell'],
          ['menu-5', '문서 분석', 'file-search'],
          ['menu-6', '캘린더', 'calendar'],
          ['menu-7', '보고서', 'chart'],
          ['menu-8', '멤버 관리', 'users'],
        ].map(([id, title, icon]) => ({
          id,
          title,
          icon: `/assets/icons/${icon}.png`,
          onClick: () => props.actions.openDashboardMenu(id === 'menu-1' ? '' : id),
        })),
        workspace: [],
        weeklyMeeting: {
          id: String(props.meeting.id),
          title: props.meeting.title,
          icon: '/assets/icons/file-text.png',
          onClick: props.actions.openMeetingRecord,
        },
      }}
      actions={{
        startMeeting: props.actions.startMeeting,
        endMeeting: props.actions.endMeeting,
        createIssue: props.actions.createIssue,
        submitTranscriptText: props.actions.submitTranscriptText,
        leaveMeetingRoom: props.actions.leaveMeetingRoom,
        backDashboard: props.actions.backDashboard,
        closeRediscussPopup: props.actions.closeRediscussPopup,
        attachFile: props.actions.attachFile,
        deleteDocument: props.actions.deleteDocument,
        openDashboardMenu: props.actions.openDashboardMenu,
        openSettings: props.actions.openSettings,
        switchWorkspace: props.actions.switchWorkspace,
        createWorkspace: props.actions.createWorkspace,
        logout: props.actions.logout,
        openMeetingRecord: props.actions.openMeetingRecord,
      }}
    />
  );
};
