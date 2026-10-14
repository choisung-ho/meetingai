import React, { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../shared/ui/AppIcon';
import { UserStack } from '../shared/ui/UserStack';
import type { AlertItem } from '../types/alert.types';
import type { WorkspaceRole } from '../types/workspace.types';
import type { DocumentMeta } from '../types/document.types';
import { useTranscriptStore } from '../store/transcriptStore';
import { StatusBadge } from '../shared/ui/StatusBadge';

/** --- 데이터 타입 정의 --- */
export type User = {
  id: string;
  name: string;
  email: string;
  role?: WorkspaceRole;
  avatarUrl?: string;
  teamName?: string;
  status?: string;
  isOnline?: boolean;
};

export type WorkspaceItem = {
  id: string;
  name: string;
  icon: string;
};

export type NavPageItem = {
  id: string;
  title: string;
  icon?: string; 
  isExpanded?: boolean;
  isActive?: boolean;
  badge?: string | number;
  subPages?: NavPageItem[];
  onClick?: () => void;
};

type MeetingLiveActions = {
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

export type MeetingLivePageProps = {
  user?: User;
  workspaces?: {
    available: WorkspaceItem[];
    current: WorkspaceItem;
  };
  navigation?: {
    mainMenu: NavPageItem[];
    workspace: NavPageItem[];
    weeklyMeeting: NavPageItem;
  };
  participants?: User[];
  meetingTitle?: string;
  meetingStatus?: 'READY' | 'ACTIVE' | 'ENDED';
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
  documents?: DocumentMeta[];
  audio?: {
    isRecording: boolean;
    isStarting: boolean;
    isProcessing: boolean;
    errorMessage: string | null;
  };
  state?: {
    isIssueInputVisible: boolean;
  };
  rediscussPopupAlert?: AlertItem | null;
  actions: MeetingLiveActions;
};

const getDocumentTone = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase();

  if (extension === 'pdf') return 'border-rose-100 bg-rose-50 text-rose-500';
  if (extension === 'xlsx' || extension === 'xls') return 'border-emerald-100 bg-emerald-50 text-emerald-500';
  if (extension === 'fig') return 'border-violet-100 bg-violet-50 text-violet-500';
  if (extension === 'ppt' || extension === 'pptx') return 'border-orange-100 bg-orange-50 text-orange-500';
  if (extension === 'doc' || extension === 'docx') return 'border-blue-100 bg-blue-50 text-blue-500';
  if (extension === 'txt') return 'border-slate-100 bg-slate-50 text-slate-500';

  return 'border-indigo-100 bg-indigo-50 text-indigo-500';
};

const formatDocumentDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}.${month}.${day}`;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
};

/**
 * 발화 시각 표시
 *
 * STT 엔진이 start_ms를 주면 회의 시작 기준 경과시간으로 표시하고,
 * 없으면 순번 기반으로 대체 표기한다.
 */
const formatOffset = (startMs: number | null, index: number) => {
  if (startMs === null || Number.isNaN(startMs)) {
    return `#${String(index + 1).padStart(3, '0')}`;
  }

  return formatDuration(startMs).slice(3); // mm:ss
};

export const MeetingLivePageUI: React.FC<MeetingLivePageProps> = ({
  user,
  workspaces,
  navigation,
  participants = [],
  documents = [],
  meetingTitle = "안건1. 버튼 색상 회의",
  meetingStatus = 'READY',
  scheduledAt,
  startedAt,
  endedAt,
  createdAt,
  rediscussPopupAlert,
  audio = { isRecording: false, isStarting: false, isProcessing: false, errorMessage: null },
  actions
}) => {
  const [activeTab, setActiveTab] = useState('실시간 회의록');
  
  // 사이드바 스위처 및 프로필 메뉴 상태
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [workspaceErrorMessage, setWorkspaceErrorMessage] = useState<string | null>(null);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueErrorMessage, setIssueErrorMessage] = useState<string | null>(null);

  // 텍스트 채팅 입력 상태
  const [chatInput, setChatInput] = useState('');

  // 실시간 발화 목록 (화자 클러스터링 결과가 speaker에 담겨 온다)
  const transcriptLines = useTranscriptStore((state) => state.lines);
  const activeSpeaker = useTranscriptStore((state) => state.activeSpeaker);
  const rediscussions = useTranscriptStore((state) => state.rediscussions);
  const topics = useTranscriptStore((state) => state.topics);
  const aiAnalysis = useTranscriptStore((state) => state.aiAnalysis);
  const isAiAnalysisLoading = useTranscriptStore((state) => state.isAiAnalysisLoading);
  const aiAnalysisErrorMessage = useTranscriptStore((state) => state.aiAnalysisErrorMessage);

  const chatMessages = transcriptLines.map((line, index) => ({
    id: line.key,
    sender: line.speaker,
    text: line.text,
    time: formatOffset(line.startMs, index),
    isFinal: line.isFinal,
  }));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const meetingUserStack = participants.length > 0 ? participants : user ? [user] : [];
  const isRecording = meetingStatus === 'ACTIVE';
  const [now, setNow] = useState(() => Date.now());
  const [openDocumentMenuId, setOpenDocumentMenuId] = useState<number | null>(null);
  const startedAtTime = startedAt ? new Date(startedAt).getTime() : NaN;
  const endedAtTime = endedAt ? new Date(endedAt).getTime() : NaN;
  const elapsedTime =
    meetingStatus === 'ACTIVE' && Number.isFinite(startedAtTime)
      ? formatDuration(now - startedAtTime)
      : meetingStatus === 'ENDED' &&
        Number.isFinite(startedAtTime) &&
        Number.isFinite(endedAtTime)
        ? formatDuration(endedAtTime - startedAtTime)
        : '00:00:00';
  const statusLabel =
    meetingStatus === 'ACTIVE'
      ? '진행 중'
      : meetingStatus === 'ENDED'
        ? '종료됨'
        : '대기 중';
  const canToggleMeeting = meetingStatus === 'READY' || meetingStatus === 'ACTIVE';
  const meetingDate = scheduledAt ?? startedAt ?? null;

  useEffect(() => {
    if (meetingStatus !== 'ACTIVE') return;

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [meetingStatus, startedAt]);

  const handleToggleRecording = () => {
    if (meetingStatus === 'ENDED') return;

    if (meetingStatus === 'ACTIVE') {
      actions.endMeeting();
      return;
    }

    actions.startMeeting();
  };

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name || isCreatingWorkspace) return;

    setIsCreatingWorkspace(true);
    setWorkspaceErrorMessage(null);
    try {
      await actions.createWorkspace(name);
      setIsWorkspaceModalOpen(false);
      setNewWorkspaceName('');
    } catch (error) {
      setWorkspaceErrorMessage(error instanceof Error ? error.message : '워크스페이스 생성에 실패했습니다.');
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleSendTranscriptText = () => {
    if (!chatInput.trim() || !isRecording) return;

    actions.submitTranscriptText(chatInput.trim());
    setChatInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendTranscriptText();
    }
  };

  const handleAddIssue = () => {
    setIssueTitle('');
    setIssueErrorMessage(null);
    setIsIssueModalOpen(true);
  };

  const handleSubmitIssue = () => {
    const title = issueTitle.trim();
    if (!title) {
      setIssueErrorMessage('안건 제목을 입력해 주세요.');
      return;
    }

    actions.createIssue(title);
    setIsIssueModalOpen(false);
    setIssueTitle('');
    setIssueErrorMessage(null);
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      actions.attachFile(file);
    }

    event.target.value = '';
  };
  const handleDeleteDocument = (documentId: number) => {
    setOpenDocumentMenuId(null);

    if (!window.confirm('문서를 삭제하시겠습니까?')) return;

    actions.deleteDocument(documentId);
  };

  return (
    <div className="flex h-screen w-full bg-[#f8faff] font-sans text-slate-800 overflow-hidden select-none">
      
      {/* 1. 좌측 사이드바 */}
      <aside className="w-[240px] shrink-0 bg-[#fbfbfa] flex flex-col border-r border-black/[0.03] z-20">
        
        {/* 상단 워크스페이스 스위처 */}
        <div className="p-3 mb-1 relative">
          <div 
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-black/[0.05] cursor-pointer transition-colors group"
          >
            <div className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-white font-black text-[11px] shadow-sm">P</div>
            <span className="flex-1 font-semibold text-[14px] truncate text-slate-700">PICK - {workspaces?.current?.name || 'Workspace'}</span>
            <AppIcon 
              src="/assets/icons/chevron-down.png" 
              alt="open" 
              className={`w-3 h-3 opacity-50 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} 
            />
          </div>

          {isSwitcherOpen && (
            <div className="absolute top-12 left-3 w-[260px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-2 z-50 animate-in fade-in zoom-in duration-150">
              <div className="px-3 py-1.5 mb-1">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest px-2">워크스페이스</p>
              </div>
              <div className="space-y-0.5 px-2 max-h-[200px] overflow-y-auto scrollbar-hide">
                {workspaces?.available?.map((ws) => (
                  <button
                    type="button"
                    key={ws.id}
                    onClick={() => { setIsSwitcherOpen(false); actions.switchWorkspace(ws.id); }}
                    className={`flex w-full items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${ws.id === workspaces?.current?.id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 bg-indigo-600 rounded flex items-center justify-center text-white font-black text-[10px]">P</div>
                      <span className={`text-[13px] font-bold ${ws.id === workspaces?.current?.id ? 'text-indigo-600' : 'text-slate-700'}`}>PICK - {ws.name}</span>
                    </div>
                    {ws.id === workspaces?.current?.id && <AppIcon src="/assets/icons/check.png" alt="selected" className="w-3 h-3" />}
                  </button>
                ))}
              </div>
              
              <div className="h-[1px] bg-slate-100 my-1.5 mx-2" />
              <div className="px-2">
                <button
                  type="button"
                  onClick={() => { setWorkspaceErrorMessage(null); setIsWorkspaceModalOpen(true); setIsSwitcherOpen(false); }}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                >
                  <AppIcon src="/assets/icons/plus.png" alt="add" className="w-3.5 h-3.5 opacity-60" />
                  <span className="text-[13px] font-bold">새 워크스페이스 추가</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 사이드바 메뉴 */}
        <div className="flex-1 mt-2 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 space-y-4">
          <div className="space-y-1">
            {navigation?.mainMenu?.map((menu) => (
              <button type="button" key={menu.id} onClick={menu.onClick} className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-black/[0.05] text-slate-600">
                <AppIcon src={menu.icon ?? ''} alt={menu.title} className="w-4 h-4 opacity-60" />
                <span className="flex-1 text-[14px] font-bold tracking-tight">{menu.title}</span>
                {menu.badge && <span className="bg-indigo-100 text-indigo-600 text-[11px] px-2 py-0.5 rounded-full font-black">{menu.badge}</span>}
              </button>
            ))}
          </div>
          
          <div className="h-[1px] bg-black/[0.04] w-full" />
          
          <div className="px-1 space-y-5">
            {/* 주간 회의 리스트 */}
            {navigation?.weeklyMeeting && (
              <div>
                <PageRow item={navigation.weeklyMeeting} depth={0} />
              </div>
            )}
          </div>
        </div>

        {/* 하단 사용자 프로필 */}
        <div className="p-3 border-t border-black/[0.03] mt-auto relative">
          <div 
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-3 px-2 py-2 hover:bg-black/[0.05] rounded-xl cursor-pointer transition-colors group"
          >
            <img src={user?.avatarUrl || "https://i.pravatar.cc/150"} alt="profile" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
            <div className="flex-1 overflow-hidden">
              <p className="text-[13px] font-bold text-slate-800 truncate">{user?.name}</p>
              <p className="text-[11px] font-medium text-slate-400 truncate">{user?.teamName}</p>
            </div>
            <AppIcon 
              src="/assets/icons/chevron-down.png" 
              alt="more" 
              className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform ${isProfileMenuOpen ? 'rotate-180' : 'group-hover:opacity-100'}`} 
            />
          </div>

          {isProfileMenuOpen && (
            <div className="absolute bottom-16 left-3 w-[220px] bg-white rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.15)] border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in duration-150">
              <div 
                onClick={() => { actions.openSettings(); setIsProfileMenuOpen(false); }} 
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer text-slate-600 transition-colors"
              >
                <AppIcon src="/assets/icons/settings.png" alt="settings" className="w-4 h-4 opacity-70" />
                <span className="text-[13px] font-bold">설정</span>
              </div>
              <div className="h-[1px] bg-slate-100 my-1 mx-2" />
              <div 
                onClick={() => { actions.logout(); setIsProfileMenuOpen(false); }} 
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-rose-50 cursor-pointer text-rose-500 transition-colors"
              >
                <AppIcon src="/assets/icons/log-out.png" alt="logout" className="w-4 h-4 opacity-70" />
                <span className="text-[13px] font-bold">로그아웃</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. 메인 회의 화면 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        
        {/* 상단 헤더 */}
        <header className="h-16 px-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">{meetingTitle}</h1>
            <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${meetingStatus === 'ACTIVE' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
              {statusLabel}
            </span>
            {isRecording && activeSpeaker && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeSpeaker} 발언 중
              </span>
            )}
            {isRecording && audio.isRecording && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                마이크 녹음 중
              </span>
            )}
            {audio.isProcessing && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-600">
                STT·화자 분석 중
              </span>
            )}
            {audio.isStarting && (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-600">
                마이크 권한 확인 중
              </span>
            )}
            {audio.errorMessage && (
              <span className="max-w-[320px] truncate px-2.5 py-1 rounded-md text-[11px] font-bold bg-rose-50 text-rose-600" title={audio.errorMessage}>
                마이크 오류: {audio.errorMessage}
              </span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4 text-xs font-bold text-slate-500">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${meetingStatus === 'ACTIVE' ? 'bg-rose-500 animate-pulse' : 'bg-slate-300'}`} />
                회의 시간 {elapsedTime}
              </div>
              <div className="flex items-center gap-1.5">
                <AppIcon src="/assets/icons/users.png" className="w-4 h-4 opacity-60" alt="users" />
                참여자 {meetingUserStack.length}명
              </div>
            </div>

            <div className="flex items-center gap-2">
              <UserStack users={meetingUserStack} maxVisible={3} size="sm" className="mr-1" />
              <button type="button" onClick={() => actions.openDashboardMenu('menu-8')} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-bold text-slate-600 border border-slate-200 transition-colors">
                <AppIcon src="/assets/icons/user-plus.png" className="w-4 h-4 opacity-70" alt="invite" />
                초대
              </button>
              <button type="button" onClick={actions.openSettings} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-50 text-[13px] font-bold text-slate-600 border border-slate-200 transition-colors">
                <AppIcon src="/assets/icons/settings.png" className="w-4 h-4 opacity-70" alt="settings" />
                설정
              </button>
              <button 
                onClick={handleToggleRecording}
                disabled={!canToggleMeeting || audio.isStarting || audio.isProcessing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-bold text-white transition-all shadow-sm active:scale-95 ${meetingStatus === 'ACTIVE' ? 'bg-rose-500 hover:bg-rose-600' : meetingStatus === 'READY' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 cursor-not-allowed shadow-none'}`}
              >
                {meetingStatus === 'ACTIVE'
                  ? audio.isProcessing
                    ? '음성 분석 중...'
                    : '회의 종료'
                  : meetingStatus === 'READY'
                    ? audio.isStarting ? '마이크 확인 중...' : '회의 시작'
                    : '회의 종료됨'}
              </button>
            </div>
          </div>
        </header>

        {/* 본문 3단 레이아웃 */}
        <div className="flex-1 flex overflow-hidden p-6 gap-6 bg-[#f8faff]">
          
          {/* [왼쪽] 다중 탭 패널 */}
          <section className="flex-[3] bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
            
            {/* 탭 네비게이션 */}
            <div className="flex items-center gap-6 px-6 border-b border-slate-100">
              {['실시간 회의록', 'AI 요약', '음성 텍스트', '참여자'].map((tab) => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)}
                  className={`py-4 text-[13px] font-bold transition-colors border-b-2 ${activeTab === tab ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 hover:text-slate-600 border-transparent'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 영역 */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center text-center">
              
              {/* 1. 실시간 회의록 탭 (채팅 이력 렌더링 적용) */}
              {activeTab === '실시간 회의록' && (
                chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/file-text.png" alt="chat" className="w-8 h-8 opacity-20" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">아직 기록된 내용이 없습니다</h3>
                    <p className="text-xs font-medium text-slate-400">우측 상단의 '회의 시작' 버튼을 누른 후 메시지를 입력하세요.</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col text-left space-y-5">
                    {chatMessages.map(msg => (
                      <div key={msg.id} className={`flex gap-4 ${msg.isFinal ? '' : 'opacity-60'}`}>
                        <div className="text-[11px] font-bold text-slate-400 mt-1">{msg.time}</div>
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[11px] font-black shrink-0 border border-indigo-200">
                            {msg.sender.charAt(0)}
                          </div>
                          <div>
                            <div className="text-[12px] font-bold text-slate-700 mb-1">
                              {msg.sender}
                              {!msg.isFinal && <span className="ml-2 text-[10px] font-bold text-slate-400">인식 중...</span>}
                            </div>
                            <div className="text-[13px] font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-slate-100">
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* 2. AI 요약 탭 */}
              {activeTab === 'AI 요약' && (
                isAiAnalysisLoading ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/sparkles.png" className="w-8 h-8 opacity-60 animate-pulse" alt="ai" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">AI 요약 생성 중</h3>
                    <p className="text-xs font-medium text-slate-400">회의 발화와 안건을 바탕으로 요약을 만들고 있습니다.</p>
                  </div>
                ) : aiAnalysisErrorMessage ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/alert.png" className="w-8 h-8 opacity-60" alt="error" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">AI 요약을 불러오지 못했습니다</h3>
                    <p className="max-w-[320px] text-xs font-medium leading-5 text-rose-500">{aiAnalysisErrorMessage}</p>
                  </div>
                ) : aiAnalysis ? (
                  <div className="w-full h-full flex flex-col text-left space-y-4">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AppIcon src="/assets/icons/sparkles.png" className="w-4 h-4 opacity-70" alt="ai" />
                        <span className="text-[13px] font-bold text-indigo-600">AI 요약</span>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] font-medium leading-6 text-slate-700">{aiAnalysis.summaryText || '요약 내용이 없습니다.'}</p>
                    </div>
                    {Array.isArray(aiAnalysis.actionItems) && aiAnalysis.actionItems.length > 0 && (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <h3 className="mb-2 text-[12px] font-black text-slate-700">액션 아이템</h3>
                        <ul className="list-disc list-inside space-y-1 text-[12px] font-medium leading-5 text-slate-600">
                          {aiAnalysis.actionItems.slice(0, 8).map((item, index) => (
                            <li key={`live-action-${index}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : topics.length > 0 ? (
                  <div className="w-full h-full flex flex-col text-left">
                    <div className="flex items-center gap-2 mb-4">
                      <AppIcon src="/assets/icons/sparkles.png" className="w-4 h-4 opacity-70" alt="ai" />
                      <span className="text-[13px] font-bold text-indigo-600">실시간 안건 분석</span>
                    </div>
                    <div className="space-y-2">
                      {topics.map((topic) => (
                        <div key={topic.topicId} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] font-black text-slate-700">{topic.label || '제목 없는 안건'}</span>
                            <span className="text-[10px] font-bold text-indigo-500">{topic.status}</span>
                          </div>
                          {topic.revisitedBy && <p className="mt-1 text-[10px] font-medium text-rose-500">{topic.revisitedBy} 님이 재논의했습니다.</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/sparkles.png" className="w-8 h-8 opacity-20" alt="ai" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">AI 요약 대기 중</h3>
                    <p className="text-xs font-medium text-slate-400">실제 발화가 쌓이면 안건과 AI 분석 결과가 표시됩니다.</p>
                  </div>
                )
              )}

              {/* 3. 음성 텍스트 탭 */}
              {activeTab === '음성 텍스트' && (
                audio.isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/sparkles.png" className="w-8 h-8 opacity-60" alt="processing" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">음성 분석 중</h3>
                    <p className="text-xs font-medium text-slate-400">faster-whisper와 화자 분리 모델이 실제 녹음을 처리하고 있습니다.</p>
                  </div>
                ) : transcriptLines.length > 0 ? (
                  <div className="w-full h-full flex flex-col text-left space-y-4">
                    {chatMessages.map((message) => (
                      <div key={`audio-${message.id}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <span className="min-w-[76px] text-[11px] font-black text-indigo-600">{message.sender}</span>
                        <span className="text-[13px] font-medium leading-relaxed text-slate-700">{message.text}</span>
                        <span className="ml-auto text-[10px] font-bold text-slate-400">{message.time}</span>
                      </div>
                    ))}
                  </div>
                ) : !isRecording ? (
                  <div className="h-full flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4">
                      <AppIcon src="/assets/icons/file-text.png" className="w-8 h-8 opacity-20" alt="text" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700 mb-1">STT 변환 대기 중</h3>
                    <p className="text-xs font-medium text-slate-400">회의 시작 후 마이크로 녹음하면 화자별 STT 결과가 표시됩니다.</p>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center">
                      <span className="w-4 h-4 rounded-full bg-rose-500 animate-pulse" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700">마이크 녹음 중</h3>
                    <p className="text-xs font-medium text-slate-400">회의 종료 후 실제 음성을 STT로 변환하고 Speaker 1, Speaker 2로 표시합니다.</p>
                  </div>
                )
              )}

              {/* 4. 참여자 탭 */}
              {activeTab === '참여자' && (
                <div className="w-full h-full flex flex-col text-left">
                  <h3 className="text-sm font-bold text-slate-800 mb-4">현재 참여자 ({meetingUserStack.length}명)</h3>
                  {meetingUserStack.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-medium text-slate-400">현재 참여자 정보가 없습니다.</div>
                  ) : (
                    <div className="space-y-2">
                    {meetingUserStack.map((participant) => (
                      <div key={participant.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-white shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200">
                            <img src={participant.avatarUrl || `https://i.pravatar.cc/50?u=${participant.id}`} alt={participant.name} />
                          </div>
                          <div>
                            <div className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5">
                              {participant.name}
                              {participant.role === 'OWNER' && <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] rounded font-black">Host</span>}
                            </div>
                            <div className="text-[11px] font-medium text-slate-400">{participant.teamName || participant.email || '참여자'}</div>
                          </div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${participant.isOnline === false ? 'bg-slate-300' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'}`}></div>
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하단 텍스트 채팅 입력 바 */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center gap-3">
              <input 
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isRecording}
                placeholder={isRecording ? "채팅 메시지를 입력하세요..." : "상단의 '회의 시작' 버튼을 눌러야 입력 가능합니다"}
                className="flex-1 bg-white border border-slate-200 rounded-xl py-3 px-4 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400 disabled:opacity-60 disabled:bg-slate-100"
              />
              <button 
                onClick={handleSendTranscriptText}
                disabled={!chatInput.trim() || !isRecording}
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md transition-all active:scale-95"
              >
                {/* 텍스트 아이콘 또는 종이비행기 형태 대체 */}
                <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </section>

          {/* [가운데] AI 패널 */}
          <section className="flex-[2] flex flex-col gap-6">
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800">AI 재논의 감지</h3>
                  <span className="bg-rose-50 text-rose-500 text-[9px] px-1.5 py-0.5 rounded font-black">Beta</span>
                </div>
              </div>
              {rediscussions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                  <AppIcon src="/assets/icons/sparkles.png" className="w-6 h-6 opacity-30 mb-2" alt="ai" />
                  <p className="text-xs font-bold text-slate-500 mb-1">감지된 재논의 사항이 없습니다</p>
                  <p className="text-[10px] font-medium text-slate-400 px-4">과거 회의와 유사한 주제가 나오면 AI가 알려줍니다.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                  {rediscussions.map((record) => (
                    <div
                      key={`${record.topicId}-${record.detectedAt}`}
                      className="border border-rose-100 bg-rose-50/60 rounded-xl p-3 text-left"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-rose-500">재논의 감지</span>
                        {record.similarity !== null && (
                          <span className="text-[10px] font-bold text-rose-400">
                            유사도 {(record.similarity * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] font-bold text-slate-700 leading-snug mb-1 line-clamp-2">
                        {record.topicLabel}
                      </p>
                      <p className="text-[10px] font-medium text-slate-500">
                        {record.speaker} 님이 다시 언급했습니다.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">실시간 요약</h3>
                <span className="text-[11px] font-bold text-slate-400">자동 생성</span>
              </div>
              {isAiAnalysisLoading ? (
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="text-xs font-bold text-slate-400">AI가 현재 발화를 요약하고 있습니다.</p>
                </div>
              ) : aiAnalysisErrorMessage ? (
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="text-xs font-bold text-rose-500">{aiAnalysisErrorMessage}</p>
                </div>
              ) : aiAnalysis?.summaryText ? (
                <div className="flex-1 overflow-y-auto rounded-xl bg-slate-50 p-4 text-left">
                  <p className="whitespace-pre-wrap text-xs font-medium leading-5 text-slate-600">{aiAnalysis.summaryText}</p>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="text-xs font-bold text-slate-400">실제 발화가 쌓이면 핵심 내용이 요약됩니다.</p>
                </div>
              )}
            </div>
          </section>

          {/* [오른쪽] 안건 및 정보 패널 */}
          <section className="flex-[2] flex flex-col gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800">진행 중인 안건</h3>
                <span className="text-[11px] font-bold text-slate-400">실시간 분석</span>
              </div>
              {topics.length === 0 ? (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4 flex items-center justify-between opacity-60">
                  <span className="text-[13px] font-bold text-slate-500">선택된 안건이 없습니다</span>
                  <span className="text-[10px] font-bold text-slate-400 border border-slate-200 px-2 py-1 rounded bg-white">대기 중</span>
                </div>
              ) : (
                <div className="mb-4 flex flex-col gap-2 max-h-[220px] overflow-y-auto">
                  {topics.map((topic) => (
                    <div
                      key={topic.topicId}
                      className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-slate-700 truncate">{topic.label}</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                          {topic.decidedBy
                            ? `${topic.decidedBy} 확정`
                            : topic.proposedBy
                              ? `${topic.proposedBy} 제안`
                              : '화자 미상'}
                        </p>
                      </div>
                      <StatusBadge status={topic.status} type="TOPIC" />
                    </div>
                  ))}
                </div>
              )}
              <h4 className="text-xs font-bold text-slate-700 mb-3">안건 진행 상태</h4>
              <div className="mb-4 grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-400">
                <p>일시: {meetingDate ? formatDateTime(meetingDate) : '-'}</p>
                <p>생성일: {createdAt ? formatDateTime(createdAt) : '-'}</p>
                <p>회의 시작 시간: {startedAt ? formatDateTime(startedAt) : '-'}</p>
                {endedAt && <p>회의 종료 시간: {formatDateTime(endedAt)}</p>}
              </div>
              <div className="flex items-center justify-between px-2 relative opacity-50">
                <div className="absolute top-2.5 left-6 right-6 h-[2px] bg-slate-200 -z-10"></div>
                {['제안', '진행 중', '승인'].map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1.5 bg-white">
                    <div className="w-5 h-5 rounded-full border-2 border-slate-200 bg-slate-50"></div>
                    <span className="text-[10px] font-bold text-slate-400">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-3">이번 회의의 결정 사항</h3>
              <button onClick={handleAddIssue} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-indigo-400 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex flex-col items-center justify-center gap-1">
                <AppIcon src="/assets/icons/plus.png" className="w-4 h-4 opacity-50" alt="add" />
                <span className="text-[11px] font-bold">결정 사항 추가</span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex-1 flex flex-col">
              <h3 className="text-sm font-bold text-slate-800 mb-3">관련 파일</h3>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              {documents.length > 0 && (
                <div className="flex flex-1 flex-col">
                  <div className="space-y-3">
                    {documents.map((document) => (
                      <div key={document.id} className="relative flex items-center gap-3 pr-9">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${getDocumentTone(document.originalFilename)}`}>
                          <AppIcon src="/assets/icons/file-text.png" className="h-4 w-4" alt="" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-black text-slate-700">
                            {document.originalFilename}
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                            업데이트: {formatDocumentDate(document.createdAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenDocumentMenuId((prev) => prev === document.id ? null : document.id);
                          }}
                          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-slate-100"
                          aria-label="문서 메뉴 열기"
                        >
                          <AppIcon src="/assets/icons/dots.png" className="h-4 w-4 opacity-50" alt="" />
                        </button>
                        {openDocumentMenuId === document.id && (
                          <div className="absolute right-0 top-8 z-20 w-20 rounded-xl border border-slate-100 bg-white py-1.5 shadow-lg">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteDocument(document.id);
                              }}
                              className="w-full px-3 py-2 text-left text-[12px] font-bold text-rose-500 hover:bg-rose-50"
                            >
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenFilePicker}
                    className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-[12px] font-black text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600"
                  >
                    <AppIcon src="/assets/icons/plus.png" className="h-3.5 w-3.5 opacity-70" alt="" />
                    파일 추가
                  </button>
                </div>
              )}
              <div onClick={handleOpenFilePicker} className={`${documents.length > 0 ? 'hidden' : 'flex'} flex-1 items-center justify-center text-center py-6 border-2 border-dashed border-slate-100 bg-slate-50/50 rounded-xl text-[11px] font-bold text-slate-400 cursor-pointer hover:bg-slate-50 transition-colors`}>
                + 파일 추가
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex gap-2">
              <button type="button" onClick={actions.openMeetingRecord} className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-[12px] font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-colors border border-slate-100">
                <AppIcon src="/assets/icons/file-text.png" className="w-3.5 h-3.5 opacity-60" alt="preview" />
                회의록 미리보기
              </button>
              <button type="button" onClick={() => actions.openDashboardMenu('menu-6')} className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-[12px] font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-colors border border-slate-100">
                <AppIcon src="/assets/icons/calendar.png" className="w-3.5 h-3.5 opacity-60" alt="schedule" />
                다음 회의 잡기
              </button>
            </div>
          </section>

        </div>
        
        {/* 하단 타임라인 */}
        <div className="h-12 bg-white border-t border-slate-200 flex items-center px-6">
          <div className="text-[11px] font-bold text-slate-500 w-24">회의 타임라인</div>
          <div className="flex-1 h-[2px] bg-slate-100 relative rounded-full mx-4">
            <div className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm ${meetingStatus === 'ACTIVE' ? 'bg-indigo-500 left-4 transition-all duration-1000' : 'bg-slate-300 left-0'}`}></div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 w-16 text-right">
            {elapsedTime}
          </div>
        </div>

      </main>

      {isIssueModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 px-4">
          <section className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">결정 사항 추가</h2>
                <p className="mt-1 text-xs font-semibold text-slate-400">이번 회의에서 추적할 안건을 등록합니다.</p>
              </div>
              <button type="button" onClick={() => setIsIssueModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100" aria-label="결정 사항 추가 닫기">
                <AppIcon src="/assets/icons/close.png" alt="" className="h-4 w-4 opacity-50" />
              </button>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-black text-slate-500">안건 제목</span>
              <input
                value={issueTitle}
                onChange={(event) => { setIssueTitle(event.target.value); setIssueErrorMessage(null); }}
                onKeyDown={(event) => { if (event.key === 'Enter') handleSubmitIssue(); }}
                placeholder="예: 다음 분기 출시 일정 확정"
                autoFocus
                className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
              />
            </label>
            {issueErrorMessage && <p className="mt-2 text-xs font-bold text-rose-500">{issueErrorMessage}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setIsIssueModalOpen(false)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-200">취소</button>
              <button type="button" onClick={handleSubmitIssue} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700">추가</button>
            </div>
          </section>
        </div>
      )}

      {/* 4. 신규 워크스페이스 생성 모달 */}
      {isWorkspaceModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100] animate-in fade-in duration-200">
          <div className="w-[440px] bg-white rounded-[2rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">워크스페이스 생성</h2>
              <button onClick={() => setIsWorkspaceModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <AppIcon src="/assets/icons/close.png" alt="close" className="w-5 h-5 opacity-40" />
              </button>
            </div>
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[13px] font-bold text-slate-500 ml-1 uppercase tracking-wider">워크스페이스 이름</label>
                <input 
                  type="text" 
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="워크스페이스 이름을 입력하세요"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:font-medium placeholder:text-slate-300"
                  autoFocus
                />
              </div>
            </div>
            {workspaceErrorMessage && <p className="mt-4 text-xs font-bold text-rose-500">{workspaceErrorMessage}</p>}
            <button 
              onClick={handleCreateWorkspace}
              disabled={!newWorkspaceName.trim() || isCreatingWorkspace}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white py-4.5 rounded-2xl font-black text-base shadow-lg shadow-indigo-100 mt-8 transition-all active:scale-[0.98]"
            >
              {isCreatingWorkspace ? '생성 중...' : '생성하기'}
            </button>
          </div>
        </div>
      )}
      {rediscussPopupAlert && (
        <RediscussPopup
          alert={rediscussPopupAlert}
          onClose={actions.closeRediscussPopup}
          onOpenMeeting={actions.openMeetingRecord}
        />
      )}
    </div>
  );
};

/* --- 하위 컴포넌트 --- */

type PageRowProps = {
  item: NavPageItem;
  depth: number;
};

const alertLevelLabel = {
  info: '정보',
  warning: '주의',
  error: '오류',
  success: '완료',
};

const alertStatusLabel = {
  PENDING: '논의 중',
  ACKNOWLEDGED: '확인됨',
  DISMISSED: '무시됨',
  RESOLVED: '해결됨',
};

const RediscussPopup = ({
  alert,
  onClose,
  onOpenMeeting,
}: {
  alert: AlertItem;
  onClose: () => void;
  onOpenMeeting: () => void;
}) => (
  <div className="fixed left-1/2 top-20 z-[120] w-[360px] -translate-x-1/2 rounded-[18px] border border-rose-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.18)] animate-in fade-in zoom-in-95 duration-200">
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white">
          <AppIcon src="/assets/icons/alert.png" alt="" className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-black text-rose-600">재논의 감지</h2>
          <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-black text-rose-400">Beta</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
      >
        <AppIcon src="/assets/icons/close.png" alt="닫기" className="h-4 w-4" />
      </button>
    </div>

    <p className="mt-4 text-[12px] font-semibold leading-5 text-slate-600">
      이 내용은 과거 회의에서 논의된 주제와 유사합니다.
    </p>

    <div className="mt-4 rounded-xl border border-rose-50 bg-rose-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-black leading-5 text-slate-900">{alert.message}</p>
        <span className="shrink-0 text-[11px] font-black text-rose-500">{alertLevelLabel[alert.level]}</span>
      </div>
      <div className="mt-3 space-y-1.5 text-[11px] font-bold text-slate-500">
        <p>상태: {alertStatusLabel[alert.status]}</p>
        <p>생성일: {formatAlertDate(alert.createdAt)}</p>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3">
      <button type="button" onClick={onOpenMeeting} className="h-10 rounded-lg border border-slate-200 bg-white text-[12px] font-black text-slate-700 transition-colors hover:bg-slate-50">
        이전 회의 보기
      </button>
      <button type="button" onClick={onOpenMeeting} className="h-10 rounded-lg bg-violet-600 text-[12px] font-black text-white shadow-sm transition-colors hover:bg-violet-700">
        비교하기
      </button>
    </div>
  </div>
);

const formatAlertDate = (value: string) => {
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

const PageRow = ({ item, depth }: PageRowProps) => {
  const hasSubPages = item.subPages && item.subPages.length > 0;
  const [isExpanded, setIsExpanded] = useState(item.isExpanded ?? true);
  // 하위 컴포넌트인 경우 좌측 패딩을 추가하여 들여쓰기 구현 (Dashboard와 동일한 규격)
  const paddingLeft = depth * 14 + 12;
  const bgClass = item.isActive ? 'bg-indigo-50/70' : 'hover:bg-black/[0.05]';
  const textClass = item.isActive ? 'text-indigo-600 font-bold' : 'text-slate-700 font-medium';

  return (
    <div className="w-full">
      <div 
        className={`flex items-center justify-between py-1.5 pr-3 cursor-pointer group/row transition-colors rounded-lg mb-0.5 ${bgClass}`} 
        style={{ paddingLeft: `${paddingLeft}px`, marginLeft: depth === 0 ? '0' : '4px', marginRight: '4px' }}
      >
        <div className="flex items-center gap-1 flex-1 overflow-hidden">
          <button type="button" onClick={(e) => { e.stopPropagation(); if (hasSubPages) setIsExpanded((current) => !current); }} className={`w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors ${hasSubPages ? 'visible' : 'invisible'}`} aria-label={`${item.title} 하위 페이지 토글`}>
            <AppIcon src={`/assets/icons/${isExpanded ? 'triangle-down' : 'triangle-right'}.png`} alt="토글" className="w-2.5 h-2.5 opacity-60" />
          </button>
          <button type="button" className="flex items-center gap-2 flex-1 overflow-hidden text-left" onClick={() => item.onClick?.()}>
            {item.icon && <AppIcon src={item.icon} alt="아이콘" className="w-4 h-4 shrink-0" />}
            <span className={`text-[13px] truncate ${textClass}`}>{item.title}</span>
          </button>
        </div>
        
        <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
          <button type="button" onClick={() => item.onClick?.()} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors" aria-label={`${item.title} 메뉴`}>
            <AppIcon src="/assets/icons/dots.png" alt="more" className="w-3.5 h-3.5 opacity-50" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); if (hasSubPages) setIsExpanded(true); }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/[0.1] transition-colors" aria-label={`${item.title} 하위 페이지 추가`}>
            <AppIcon src="/assets/icons/plus.png" alt="add" className="w-3.5 h-3.5 opacity-50" />
          </button>
        </div>
      </div>
      
      {isExpanded && hasSubPages && (
        <div className="mt-0.5 space-y-0.5">
          {item.subPages!.map(sub => <PageRow key={sub.id} item={sub} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
};
