import React, { useMemo } from 'react';

type ReportMeeting = { id: string; status: 'READY' | 'ACTIVE' | 'ENDED' };
type ReportIssue = { status?: string | null; deletedAt?: string | null };
type ReportAlert = { status: string };

type ReportViewProps = {
  meetings?: ReportMeeting[];
  issues?: ReportIssue[];
  alerts?: ReportAlert[];
};

export const ReportView: React.FC<ReportViewProps> = ({ meetings = [], issues = [], alerts = [] }) => {
  const metrics = useMemo(() => {
    const activeIssues = issues.filter((issue) => issue.deletedAt == null);
    const closedIssues = activeIssues.filter((issue) => String(issue.status).toUpperCase() === 'CLOSED').length;
    const resolvedAlerts = alerts.filter((alert) => String(alert.status).toUpperCase() === 'RESOLVED').length;
    return {
      meetingCount: meetings.length,
      meetingProgress: Math.min(meetings.length * 10, 100),
      issueRate: activeIssues.length ? Math.round((closedIssues / activeIssues.length) * 100) : 0,
      alertRate: alerts.length ? Math.round((resolvedAlerts / alerts.length) * 100) : 0,
      issueCount: activeIssues.length,
      alertCount: alerts.length,
    };
  }, [alerts, issues, meetings]);

  return (
    <div className="w-full grid grid-cols-3 gap-4 animate-in fade-in duration-200">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-xs font-bold text-slate-400 mb-1">현재 워크스페이스 회의</p>
        <h3 className="text-2xl font-black text-indigo-600">{metrics.meetingCount}건</h3>
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden"><div className="bg-indigo-600 h-full" style={{ width: `${metrics.meetingProgress}%` }} /></div>
      </div>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-xs font-bold text-slate-400 mb-1">안건 승인율 ({metrics.issueCount}건)</p>
        <h3 className="text-2xl font-black text-emerald-500">{metrics.issueRate}%</h3>
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden"><div className="bg-emerald-500 h-full" style={{ width: `${metrics.issueRate}%` }} /></div>
      </div>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-xs font-bold text-slate-400 mb-1">재논의 알림 해결률 ({metrics.alertCount}건)</p>
        <h3 className="text-2xl font-black text-rose-500">{metrics.alertRate}%</h3>
        <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden"><div className="bg-rose-500 h-full" style={{ width: `${metrics.alertRate}%` }} /></div>
      </div>
    </div>
  );
};
