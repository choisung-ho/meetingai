import React from 'react';
import { AppIcon } from '../../../shared/ui/AppIcon';
import { UserStack } from '../../../shared/ui/UserStack';
import { getIssueStatusLabel } from '../../../shared/utils/issueStatusLabel';
import type { DashboardPageProps, DocumentFile, Meeting, RediscussAlert } from '../../../pages/DashboardPage.ui';

type DashboardHomeViewProps = {
  setIsCreateModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  statistics: DashboardPageProps['statistics'];
  meetings: Meeting[];
  alerts: RediscussAlert[];
  documents: DocumentFile[];
  uploadState: {
    isUploading: boolean;
    uploadErrorMessage: string | null;
  };
  actions: DashboardPageProps['actions'];
  setActiveMenuId: (menuId: string) => void;
};

export const DashboardHomeView: React.FC<DashboardHomeViewProps> = ({
  setIsCreateModalOpen,
  statistics,
  meetings,
  alerts,
  documents,
  uploadState,
  actions,
  setActiveMenuId,
}) => {
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const getIssueStatusClassName = (status: Meeting['issueStatus']) => {
    switch (status) {
      case 'OPEN':
        return 'bg-slate-100 text-slate-500';
      case 'IN_PROGRESS':
        return 'bg-indigo-50 text-indigo-600';
      case 'CLOSED':
        return 'bg-emerald-50 text-emerald-600';
      default:
        return 'bg-slate-100 text-slate-500';
    }
  };
  const calendarMonth = new Date();
  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIndex = calendarMonth.getMonth();
  const calendarFirstDay = new Date(calendarYear, calendarMonthIndex, 1).getDay();
  const calendarDaysInMonth = new Date(calendarYear, calendarMonthIndex + 1, 0).getDate();
  const meetingDays = new Set(
    meetings
      .map((meeting) => new Date(meeting.startTime || meeting.createdAt || '').getTime())
      .filter((value) => Number.isFinite(value))
      .filter((value) => {
        const date = new Date(value);
        return date.getFullYear() === calendarYear && date.getMonth() === calendarMonthIndex;
      })
      .map((value) => new Date(value).getDate())
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      actions.uploadWorkspaceDocument(file);
    }

    event.target.value = '';
  };

  return (
    <div className="grid grid-cols-12 gap-8 animate-in fade-in duration-300">
      <div className="col-span-8 space-y-8">
        <div className="grid grid-cols-2 gap-6">
          <div onClick={() => setIsCreateModalOpen(true)} className="bg-indigo-600 rounded-3xl p-8 text-white flex flex-col items-center justify-center text-center cursor-pointer hover:bg-indigo-700 transition-colors shadow-sm group">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <AppIcon src="/assets/icons/mic-white.png" alt="" className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold mb-1.5 tracking-tight">새 회의 시작</h3>
            <p className="text-xs text-indigo-200 mb-6 font-medium">PICK으로 실시간 회의를 기록하고 분석합니다.</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsCreateModalOpen(true);
              }}
              className="bg-white text-indigo-600 px-6 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-transform active:scale-95"
            >
              회의 시작하기
            </button>
          </div>

          <div onClick={() => uploadInputRef.current?.click()} className="bg-white border border-dashed border-slate-300 rounded-3xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-colors group">
            <input ref={uploadInputRef} type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={handleFileChange} />
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
              <AppIcon src="/assets/icons/upload.png" alt="" className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1.5 tracking-tight">파일 업로드</h3>
            <p className="text-[10px] text-slate-400 font-bold mb-3 uppercase tracking-wider">PDF, DOCX, TXT, MD, CSV</p>
            <p className={`text-xs font-medium ${uploadState.uploadErrorMessage ? 'text-rose-500' : 'text-slate-500'}`}>
              {uploadState.isUploading ? '문서를 업로드하는 중입니다...' : uploadState.uploadErrorMessage ?? '클릭해서 워크스페이스 문서를 업로드하세요.'}
            </p>
          </div>
        </div>

        <section className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-6 px-1">회의 상태 요약</h4>
          <div className="grid grid-cols-5 gap-4">
            <StatusCard label="제안" count={statistics?.proposed || 0} color="indigo" iconSrc="/assets/icons/status-1.png" />
            <StatusCard label="진행 중" count={statistics?.discussing || 0} color="blue" iconSrc="/assets/icons/status-2.png" />
            <StatusCard label="승인" count={statistics?.approved || 0} color="emerald" iconSrc="/assets/icons/status-3.png" />
            <StatusCard label="실행" count={statistics?.executing || 0} color="amber" iconSrc="/assets/icons/status-4.png" />
            <StatusCard label="보류" count={statistics?.onHold || 0} color="slate" iconSrc="/assets/icons/status-5.png" />
          </div>
        </section>

        <section className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6 px-1">
            <h4 className="text-sm font-bold text-slate-800">최근 회의</h4>
            <button type="button" onClick={() => setActiveMenuId('menu-2')} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors">전체 보기</button>
          </div>
          <table className="w-full text-left">
            <thead className="text-[10px] font-bold text-slate-400 border-b border-slate-100">
              <tr>
                <th className="pb-3 pl-2 uppercase tracking-wider">회의 제목</th>
                <th className="pb-3 uppercase tracking-wider">일시</th>
                <th className="pb-3 text-center uppercase tracking-wider">참여자</th>
                <th className="pb-3 text-center uppercase tracking-wider">안건</th>
                <th className="pb-3 text-right pr-2 uppercase tracking-wider">상태</th>
              </tr>
            </thead>
            <tbody className="text-xs font-medium text-slate-600">
              {meetings?.map((meeting: Meeting) => (
                <tr key={meeting.id} onClick={() => actions.openMeeting(meeting.id)} className="group cursor-pointer hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                  <td className="py-4 pl-2 flex items-center gap-3">
                    <AppIcon src="/assets/icons/file-text.png" alt="" className="w-4 h-4 opacity-60 group-hover:opacity-100" />
                    <span className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{meeting.title}</span>
                  </td>
                  <td className="py-4 text-slate-500">{meeting.startTime}</td>
                  <td className="py-4 text-center">
                    {meeting.participants.length > 0 ? (
                      <UserStack users={meeting.participants} maxVisible={3} size="sm" className="justify-center" />
                    ) : (
                      <span className="font-bold text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-4 text-center font-bold text-slate-700">{meeting.decisionCount || 0}</td>
                  <td className="py-4 text-right pr-2">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold ${getIssueStatusClassName(meeting.issueStatus)}`}>
                      {getIssueStatusLabel(meeting.issueStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={() => setActiveMenuId('menu-2')} className="w-full py-3 mt-2 text-[11px] font-bold text-slate-400 bg-slate-50 rounded-xl hover:bg-slate-100 hover:text-slate-600 transition-colors">더 보기</button>
        </section>
      </div>

      <div className="col-span-4 space-y-6">
        <section className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h4 className="text-sm font-bold text-slate-800">알림 감지</h4>
            <button onClick={() => setActiveMenuId('menu-4')} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">전체 보기</button>
          </div>
          <div className="space-y-3">
            {alerts?.map((alert: RediscussAlert) => <AlertItem key={alert.id} {...alert} />)}
          </div>
        </section>

        <section className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h4 className="text-sm font-bold text-slate-800">최근 분석 문서</h4>
            <button onClick={() => setActiveMenuId('menu-5')} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600">전체 보기</button>
          </div>
          <div className="space-y-3">
            {documents?.map((doc: DocumentFile) => (
              <FileItem
                key={doc.id}
                document={doc}
                onDelete={() => actions.deleteDocument(Number(doc.id), doc.meetingId ?? null)}
              />
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl p-7 border border-slate-200 shadow-sm text-center">
          <div className="flex justify-between items-center mb-5">
            <h4 className="text-sm font-bold text-left text-slate-800">캘린더</h4>
            <span className="text-[10px] font-bold text-slate-500 uppercase">{calendarYear}.{String(calendarMonthIndex + 1).padStart(2, '0')}</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[10px] font-bold text-slate-400 mb-3">
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-xs font-medium text-slate-600">
            {Array.from({ length: calendarFirstDay + calendarDaysInMonth }, (_, index) => {
              const day = index - calendarFirstDay + 1;
              if (day < 1) return <div key={`empty-${index}`} className="py-1.5" />;
              const isToday = day === calendarMonth.getDate();
              const hasMeeting = meetingDays.has(day);
              return <button type="button" key={day} onClick={() => hasMeeting && setActiveMenuId('menu-2')} className={`relative rounded-lg py-1.5 transition-colors hover:bg-slate-100 ${isToday ? 'bg-indigo-600 font-bold text-white shadow-sm' : ''}`} aria-label={`${calendarMonthIndex + 1}월 ${day}일${hasMeeting ? ' 회의 있음' : ''}`}>{day}{hasMeeting && <span className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isToday ? 'bg-white' : 'bg-indigo-500'}`} />}</button>;
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

type StatusCardProps = {
  label: string;
  count: number;
  color: string;
  iconSrc: string;
};

export const StatusCard = ({ label, count, color, iconSrc }: StatusCardProps) => {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-600',
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className={`p-4 rounded-2xl ${colorMap[color]} flex flex-col items-center justify-center text-center border border-transparent`}>
      <AppIcon src={iconSrc} alt={label} className="w-6 h-6 mb-2 opacity-80" />
      <p className="text-[10px] font-bold mb-1">{label}</p>
      <p className="text-xl font-black">{count}</p>
    </div>
  );
};

export const AlertItem = ({ title, time, severity, color }: RediscussAlert) => {
  const colorStyle: Record<string, string> = {
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    slate: 'bg-slate-50 text-slate-500 border-slate-200',
  };
  const dotColor: Record<string, string> = {
    rose: 'bg-rose-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-400',
  };

  return (
    <div className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-slate-100 hover:border-slate-300 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-1.5 rounded-full ${dotColor[color]}`}></div>
        <div>
          <p className="text-xs font-bold text-slate-800">{title}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-0.5">{time}</p>
        </div>
      </div>
      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${colorStyle[color]}`}>{severity}</span>
    </div>
  );
};

export const FileItem = ({
  document,
  onDelete,
}: {
  document: DocumentFile;
  onDelete: () => void;
}) => {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const handleDelete = () => {
    setIsMenuOpen(false);

    if (!window.confirm('문서를 삭제하시겠습니까?')) return;

    onDelete();
  };

  return (
    <div className="relative flex items-center gap-3 p-3.5 pr-10 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
      <AppIcon src={document.icon} alt="문서" className="w-5 h-5" />
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-slate-800">{document.name}</p>
        <p className="text-[10px] font-medium text-slate-400 mt-0.5">{document.date}</p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsMenuOpen((prev) => !prev);
        }}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-slate-100"
        aria-label="문서 메뉴 열기"
      >
        <AppIcon src="/assets/icons/dots.png" alt="" className="h-4 w-4 opacity-50" />
      </button>
      {isMenuOpen && (
        <div className="absolute right-2 top-10 z-20 w-20 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleDelete();
            }}
            className="w-full px-3 py-2 text-left text-[12px] font-bold text-rose-500 hover:bg-rose-50"
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
};
