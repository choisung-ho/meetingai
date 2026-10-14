import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MeetingSummaryPageUI } from './MeetingSummaryPage.ui';
import type { Issue, IssuePriority, IssueStatus } from '../types/meeting.types';
import type { Meeting } from './DashboardPage';
import type { AlertItem } from '../types/alert.types';
import type { DocumentMeta } from '../types/document.types';
import type { AiAnalysis, TranscriptLine } from '../types/transcript.types';

export type MeetingSummaryPageProps = {
  workspaceId: number | null;
  workspaceName?: string | null;
  meetingId: number | null;
  meeting?: Meeting | null;
  participants?: Meeting['participants'];
  documents?: DocumentMeta[];
  transcriptLines?: TranscriptLine[];
  aiAnalysis?: AiAnalysis | null;
  isAiAnalysisLoading?: boolean;
  aiAnalysisErrorMessage?: string | null;
  issues: { items: Issue[]; isLoading: boolean; errorMessage: string | null };
  alerts: { items: AlertItem[]; isLoading: boolean; errorMessage: string | null };
  pageExpansion?: Record<string, boolean>;
  actions: {
    getIssues: () => void;
    updateIssueStatus: (issueId: number, status: Exclude<IssueStatus, 'OPEN'>) => void;
    updateIssue: (issueId: number, values: {
      title: string;
      description: string | null;
      priority: IssuePriority | null;
      dueDate: string | null;
      assigneeId: number | null;
    }) => void;
    deleteIssue: (issueId: number) => void;
    backDashboard: () => void;
    openAlert: (alertId: number) => void;
    openDashboardMenu?: (menuId: string) => void;
    openLiveMeeting?: () => void;
    openSettings?: () => void;
    switchWorkspace?: (workspaceId: string) => void;
    togglePage?: (pageId: string) => void;
    addPage?: (pageId: string) => void;
    openMeeting?: (meetingId: string) => void;
    logout?: () => void;
  };
};

export const MeetingSummaryPage: React.FC<MeetingSummaryPageProps> = (props) => {
  const navigate = useNavigate();
  const getIssuesRef = useRef(props.actions.getIssues);

  useEffect(() => {
    getIssuesRef.current = props.actions.getIssues;
  }, [props.actions.getIssues]);

  useEffect(() => { getIssuesRef.current(); }, []);

  const participants = props.participants?.length
    ? props.participants
    : [{ id: 'me', name: '사용자', email: '', role: 'MEMBER' as const, isOnline: false }];
  const workspaceDisplayName = props.workspaceName?.trim() || `Workspace ${props.workspaceId ?? ''}`;
  const meetingCreatedAt = props.issues.items[0]?.createdAt ?? undefined;
  const fallbackMeeting: Meeting = {
    id: String(props.meetingId ?? ''),
    title: `회의 ${props.meetingId ?? ''}`,
    status: 'ENDED' as const,
    startTime: meetingCreatedAt ?? '-',
    createdAt: meetingCreatedAt,
    participantCount: participants.length,
    participants,
    decisionCount: props.issues.items.length,
    rediscussCount: props.alerts.items.length,
  };
  const meetings: Meeting[] = [props.meeting ?? fallbackMeeting];
  const openDashboardMenu = (menuId: string) => {
    if (props.actions.openDashboardMenu) {
      props.actions.openDashboardMenu(menuId);
      return;
    }
    navigate(`/dashboard?workspaceId=${props.workspaceId ?? ''}${menuId ? `&menu=${encodeURIComponent(menuId)}` : ''}`);
  };
  const openSettings = () => props.actions.openSettings?.() ?? navigate('/settings');
  const openMeeting = (targetMeetingId: string) => {
    if (props.actions.openMeeting) {
      props.actions.openMeeting(targetMeetingId);
      return;
    }
    navigate(`/meeting-records/${targetMeetingId}?workspaceId=${props.workspaceId ?? ''}&meetingRoomId=1`);
  };

  return (
    <MeetingSummaryPageUI
      user={participants[0]}
      participants={participants}
      meetings={meetings}
      issues={props.issues}
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
        })),
        weeklyMeeting: { id: String(props.meetingId ?? 'meeting'), title: '회의록', icon: '/assets/icons/file-text.png', isExpanded: props.pageExpansion?.['weekly-meetings'] ?? true },
      }}
      workspaces={{
        available: props.workspaceId ? [{ id: String(props.workspaceId), name: workspaceDisplayName, icon: '/assets/icons/workspace.png' }] : [],
        current: { id: String(props.workspaceId ?? ''), name: workspaceDisplayName, icon: '/assets/icons/workspace.png' },
      }}
      alerts={props.alerts}
      documents={props.documents ?? []}
      transcriptLines={props.transcriptLines ?? []}
      aiAnalysis={props.aiAnalysis ?? null}
      isAiAnalysisLoading={props.isAiAnalysisLoading ?? false}
      aiAnalysisErrorMessage={props.aiAnalysisErrorMessage ?? null}
      actions={{
        updateIssueStatus: props.actions.updateIssueStatus,
        updateIssue: props.actions.updateIssue,
        deleteIssue: props.actions.deleteIssue,
        backDashboard: props.actions.backDashboard,
        openAlert: props.actions.openAlert,
        openDashboardMenu,
        openLiveMeeting: props.actions.openLiveMeeting ?? props.actions.backDashboard,
        openSettings,
        switchWorkspace: props.actions.switchWorkspace ?? ((workspaceId: string) => navigate(`/dashboard?workspaceId=${workspaceId}`)),
        togglePage: props.actions.togglePage ?? (() => undefined),
        addPage: props.actions.addPage ?? (() => undefined),
        openMeeting,
        logout: props.actions.logout ?? props.actions.backDashboard,
      }}
    />
  );
};
