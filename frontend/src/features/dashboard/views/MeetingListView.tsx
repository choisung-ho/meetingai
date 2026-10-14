import React, { useState } from 'react';
import type { DashboardPageProps, Meeting } from '../../../pages/DashboardPage.ui';
import { AppIcon } from '../../../shared/ui/AppIcon';

export const MeetingListView: React.FC<{
  meetings: Meeting[];
  canDeleteMeeting: boolean;
  actions: DashboardPageProps['actions'];
}> = ({ meetings, canDeleteMeeting, actions }) => {
  const [openMenuMeetingId, setOpenMenuMeetingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const storedMeetings = meetings.filter((meeting) => meeting.status === 'ENDED');
  const visibleMeetings = storedMeetings.filter((meeting) => meeting.title.toLowerCase().includes(searchTerm.trim().toLowerCase()));

  const handleDeleteMeeting = (meetingId: string | number) => {
    const confirmed = window.confirm("이 회의를 삭제하시겠습니까?");
    if (!confirmed) return;

    actions.deleteMeeting(meetingId);
    setOpenMenuMeetingId(null);
  };

  return (
    <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm min-h-[560px] animate-in fade-in duration-200">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-base font-bold text-slate-800">보관된 회의록 요약</h3>
        <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="회의록 제목 검색" aria-label="회의록 제목 검색" className="px-4 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-indigo-500" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {visibleMeetings.map((m) => (
          <div key={m.id} onClick={() => actions.openMeetingRecord(m.id)} className="p-5 border border-slate-100 rounded-2xl hover:border-indigo-400 hover:shadow-sm cursor-pointer transition-all bg-slate-50/30">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">DOC</div>
              <h4 className="font-bold text-slate-700 truncate flex-1">{m.title}</h4>
              {canDeleteMeeting && (
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setOpenMenuMeetingId(openMenuMeetingId === m.id ? null : m.id); }} className="w-7 h-7 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors">
                  <AppIcon src="/assets/icons/dots.png" alt="more" className="w-3.5 h-3.5 opacity-50" />
                </button>
                {openMenuMeetingId === m.id && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 w-[92px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-1.5 z-50">
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(m.id); }} className="w-full text-left px-3 py-2 text-[12px] font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                      삭제
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">일시: {m.startTime}</p>
            <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100/70 text-[11px] font-bold">
              <span className="text-slate-400">의사결정 {m.decisionCount}개</span>
              <span className="text-indigo-600">상세 보기 →</span>
            </div>
          </div>
        ))}
        {visibleMeetings.length === 0 && (
          <div className="col-span-2 rounded-2xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm font-bold text-slate-400">
            {storedMeetings.length === 0 ? '보관된 회의록이 없습니다.' : '검색 결과가 없습니다.'}
          </div>
        )}
      </div>
    </div>
  );
};
