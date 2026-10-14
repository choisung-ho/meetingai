import React, { useMemo, useState } from 'react';

type CalendarMeeting = {
  id: string;
  title: string;
  status: 'READY' | 'ACTIVE' | 'ENDED';
  startTime: string;
  createdAt?: string;
};

type CalendarViewProps = {
  meetings?: CalendarMeeting[];
  actions?: { openMeeting: (meetingId: string) => void };
};

const toDateKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ meetings = [], actions }) => {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstGridDay = new Date(monthStart);
  firstGridDay.setDate(1 - monthStart.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstGridDay);
    day.setDate(firstGridDay.getDate() + index);
    return day;
  });
  const meetingsByDay = useMemo(() => {
    const result = new Map<string, CalendarMeeting[]>();
    meetings.forEach((meeting) => {
      const key = toDateKey(meeting.startTime || meeting.createdAt || '');
      if (!key) return;
      result.set(key, [...(result.get(key) ?? []), meeting]);
    });
    return result;
  }, [meetings]);

  return (
    <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm min-h-[560px] animate-in fade-in duration-200">
      <div className="mb-5 flex items-center justify-between">
        <div><h2 className="text-lg font-black text-slate-900">{visibleMonth.getFullYear()}년 {visibleMonth.getMonth() + 1}월</h2><p className="mt-1 text-xs font-bold text-slate-400">등록된 회의를 날짜별로 확인합니다.</p></div>
        <div className="flex gap-1"><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="이전 달">‹</button><button type="button" onClick={() => setVisibleMonth(new Date())} className="rounded-lg border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50">오늘</button><button type="button" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="다음 달">›</button></div>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 text-xs">
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="bg-slate-50 py-2.5 text-center font-bold text-slate-400 uppercase tracking-widest">{d}</div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day.toISOString()) ?? '';
          const dayMeetings = meetingsByDay.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          return (
          <div key={key} className={`min-h-[90px] bg-white p-2 transition-colors hover:bg-slate-50 ${isCurrentMonth ? '' : 'bg-slate-50/70'}`}>
            <span className={`text-[10px] font-bold ${isCurrentMonth ? 'text-slate-600' : 'text-slate-300'}`}>{day.getDate()}</span>
            <div className="mt-1 space-y-1">
              {dayMeetings.slice(0, 3).map((meeting) => (
                <button key={meeting.id} type="button" onClick={() => actions?.openMeeting(meeting.id)} className={`block w-full truncate rounded p-1 text-left text-[9px] font-bold text-white shadow-sm ${meeting.status === 'ACTIVE' ? 'bg-rose-500' : meeting.status === 'ENDED' ? 'bg-indigo-600' : 'bg-slate-400'}`} title={meeting.title}>{meeting.title}</button>
              ))}
              {dayMeetings.length > 3 && <span className="block text-[9px] font-bold text-slate-400">+{dayMeetings.length - 3}건</span>}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
