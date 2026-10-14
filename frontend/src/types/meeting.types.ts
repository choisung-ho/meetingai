import type { ConnectedCollaborationUser } from "./collaborationUser.types";

import type {
    WorkspaceConnectionStatus,
    WorkspaceUser,
    WorkspaceResponse,
} from "./workspace.types";
import type {
    MeetingRoomConnectionStatus,
    MeetingRoomUser,
} from "./meetingRoom.types";

/**
 * 회의 전체 진행 상태 타입
 * 회의 진행 흐름 관리용
 */
export type MeetingStatus =
    | "ready" // 회의 준비 상태
    | "recording" // 녹음 진행 중
    | "auto_saving" // 자동 저장 중
    | "analyzing" // AI 분석 중
    | "analysis_completed" // 분석 완료
    | "completed" // 회의 종료
    | "failed"; // 오류 발생

/**
 * 사용자 기본 정보 타입
 * 참가자 / 작성자 / 담당자 공통 사용
 */
export type User = {
    id: string; // 사용자 고유 ID
    name: string; // 사용자 이름
    email: string; // 사용자 이메일
    role: "admin" | "member"; // 사용자 권한
    avatarUrl?: string; // 프로필 이미지
    teamName?: string; // 소속 팀 이름
};

/**
 * 회의 기본 정보 타입
 * 대시보드 / 회의 상세 / 실시간 회의 공통 사용
 */
export type Meeting = {
    id: number; // 회의 고유 ID
    title: string; // 회의 제목
    status: MeetingStatus; // 현재 회의 상태
    startTime: string; // 회의 시작 시간
    endTime?: string; // 회의 종료 시간
    duration?: string; // 회의 진행 시간
    participantCount: number; // 참가자 수
    participants: User[]; // 참가자 목록
    decisionCount: number; // 안건 개수
    rediscussCount: number; // 재논의 감지 개수
};

/**
 * 실시간 회의 발언 데이터 타입
 * STT 결과 및 채팅 표시용
 */
export type TranscriptLine = {
    id: string; // 발언 고유 ID
    timestamp: string; // 발언 시간
    speakerName: string; // 발언자 이름
    speakerRole?: string; // 발언자 역할
    text: string; // 발언 내용
    isRediscussDetected?: boolean; // 재논의 감지 여부
};

/**
 * 안건 상태 타입
 * 의사결정 진행 흐름 관리용
 */
export type IssueState =
    | "PROPOSED" // 제안됨
    | "DISCUSSING" // 논의 중
    | "APPROVED" // 승인 완료
    | "EXECUTED" // 실행 완료
    | "REJECTED" // 거절됨
    | "REOPENED" // 재논의 상태
    | "ON_HOLD"; // 보류 상태

/**
 * 안건 우선순위 타입
 */
export type Priority =
    | "low" // 낮음
    | "medium" // 보통
    | "high"; // 높음

/**
 * 회의 안건 데이터 타입
 * AI 추출 안건 및 의사결정 관리용
 */
export type DecisionItem = {
    id: string; // 안건 고유 ID
    title: string; // 안건 제목
    content: string; // 안건 상세 내용
    status: IssueState; // 현재 안건 상태
    priority: Priority; // 우선순위
    assigneeName?: string; // 담당자 이름
    dueDate?: string; // 마감일
    mentionedDate?: string; // 회의 언급 날짜
    relatedMeetingId?: string; // 연결된 회의 ID
};

/**
 * 재논의 감지 알림 타입
 * 이전 회의와 유사한 안건 탐지용
 */
export type RediscussAlert = {
    id: string; // 알림 고유 ID
    title: string; // 알림 제목
    message: string; // 알림 메시지
    previousMeetingId?: string; // 이전 회의 ID
    previousMeetingTitle?: string; // 이전 회의 제목
    similarityScore: number; // 유사도 점수
    severity:
        | "low" // 낮음
        | "medium" // 보통
        | "high" // 높음
        | "critical"; // 매우 높음
    isRead: boolean; // 읽음 여부
};

/**
 * 업로드 문서 파일 타입
 * 회의 첨부파일 및 분석 파일 관리용
 */
export type DocumentFile = {
    id: string; // 파일 고유 ID
    name: string; // 파일 이름
    fileExt:
        | "pdf"
        | "docx"
        | "pptx"
        | "xlsx"
        | "txt"
        | "hwp"; // 파일 확장자
    uploadedAt: string; // 업로드 시간
    status:
        | "uploaded" // 업로드 완료
        | "processing" // 분석 처리 중
        | "completed" // 분석 완료
        | "failed"; // 처리 실패
};

/**
 * 워크스페이스 선택 화면 props 타입
 * 사용자가 선택한 workspaceId로 입장하기 위한 UI 전달 구조
 */
export type WorkspaceSelectPageProps = {
    /**
     * 사용자 실시간 협업 상태 정보
     */
    collaboration: {
        status: string; // 현재 연결 상태
        currentUser: ConnectedCollaborationUser | null; // 현재 사용자 정보
        errorMessage: string | null; // 오류 메시지
        isUserRegistered: boolean; // 사용자 등록 여부
    };

    /**
     * 워크스페이스 입장 상태 정보
     */
    workspace: {
        status: WorkspaceConnectionStatus; // 참가 상태
        errorMessage: string | null; // 오류 메시지
    };

    /**
     * 선택 화면 상태값
     */
    state: {
        isConnected: boolean; // 소켓 연결 여부
        isJoining: boolean; // 워크스페이스 입장 요청 중 여부
    };

    /**
     * 워크스페이스 선택 화면 액션 함수 목록
     */
    actions: {
        enterWorkspace: (workspaceId: string) => void; // 워크스페이스 입장 요청
        reconnectSocket: () => void; // 소켓 재연결
        pingSocket: () => void; // 연결 상태 확인 ping
        disconnectSocket: () => void; // 소켓 연결 종료
    };
};

/**
 * 실시간 회의 화면 props 타입
 * MeetingLivePage UI 전달 데이터 구조
 */
export type MeetingLivePageProps = {
    meeting: {
        id: number;
        title: string;
        status: WebSocketMeetingStatus;
    };
    isIssueInputVisible: boolean;

    /**
     * 워크스페이스 참가 상태 정보
     */
    workspace: {
        workspaceId: number | null;// 현재 워크스페이스 ID
        status: WorkspaceConnectionStatus; // 참가 상태
        users: WorkspaceUser[]; // 현재 접속 사용자 목록
        updatedAt: string | null; // 마지막 갱신 시간
        errorMessage: string | null; // 오류 메시지
        isWorkspaceJoined: boolean; // 참가 여부
    };

    /**
     * 회의실 참가 상태 정보
     * MeetingRoom 계층 WebSocket 명세 기반으로 추가된 상태입니다.
     */
    meetingRoom: {
        workspaceId: number | null;
        meetingRoomId: number | null;// 현재 회의실 ID
        status: MeetingRoomConnectionStatus; // 회의실 참가 상태
        users: MeetingRoomUser[]; // 현재 회의실 접속 사용자 목록
        updatedAt: string | null; // 마지막 참가자 목록 갱신 시간
        errorMessage: string | null; // 회의실 오류 메시지
        isMeetingRoomJoined: boolean; // 회의실 참가 여부
    };

    issues: {
        items: Issue[];
        isLoading: boolean;
        errorMessage: string | null;
    };

  


    /**
     * 사용자 액션 함수 목록
     * 버튼 이벤트 및 기능 실행용
     */
    actions: {
        startMeeting: () => void;
        endMeeting: () => void;
        createIssue: (text: string) => void;
        leaveMeetingRoom: () => void;
        backDashboard: () => void;
    };
};
/**
 * 로그인 화면 props
 *
 * 기능:
 * - LoginPage가 실행할 로그인 action 정의
 *
 * UI 담당 사용 방식:
 * - 로그인 버튼에 actions.login 연결
 *
 * 나중에 변경될 가능성:
 * - email/password 입력값
 * - 자동 로그인 체크값
 * - 로그인 에러 메시지
 * - 로딩 상태
 */
/**
 * 로그인 화면 props
 *
 * 기능:
 * - 로그인 실행
 * - 회원가입 화면 이동
 *
 * UI 담당 사용 방식:
 * - 로그인 버튼 → actions.login 연결
 * - 회원가입 버튼 → actions.moveSignup 연결
 *
 * 주의:
 * - 현재 mock 구조 기준
 * - 실제 인증 API 연동 시 props 추가 가능
 */
export type LoginPageProps = {
  form: {
    email: string;
    password: string;
  };

  state: {
    isLoading: boolean;
    errorMessage: string | null;
    fieldErrors?: Record<string, string>;
  };

  actions: {
    changeEmail: (email: string) => void;
    changePassword: (password: string) => void;

    /**
     * 현재:
     * - USE_MOCK_AUTH=true이면 mock 로그인
     * - USE_MOCK_AUTH=false이면 서버 로그인
     */
    login: () => void;

    moveSignup: () => void;
  };
};

/**
 * 대시보드 화면 props
 *
 * 기능:
 * - 사용자 정보, 회의 목록, 대시보드 action 전달
 *
 * UI 담당 사용 방식:
 * - user, meetings는 화면에 표시
 * - actions는 버튼에 연결
 *
 * 금지:
 * - UI에서 navigate 직접 호출
 * - UI에서 API 직접 호출
 * - UI에서 Zustand 직접 수정
 */
export type DashboardPageProps = {
  currentWorkspaceId: number | null;
  currentWorkspaceName: string | null;
  workspaces: WorkspaceResponse[];
  isWorkspaceListOpen: boolean;
  workspace: {
    users: WorkspaceUser[];
  };
  meetings: {
    items: WebSocketMeeting[];
    isLoading: boolean;
    errorMessage: string | null;
  };

  actions: {
    /**
     * 현재:
     * - /meeting/live/mock 이동
     *
     * 나중:
     * - 회의 생성 API 호출 후 실제 meetingId로 이동
     */
    toggleWorkspaceList: () => void;
    selectWorkspace: (workspaceId: number) => void;
    createWorkspace: (name: string) => void;
    startMeeting: () => void;

    /**
     * 현재:
     * - 선택한 meetingId로 회의중 화면 이동
     *
     * 나중:
     * - 실제 회의 상세/회의중 세션 연결
     */
    openMeeting: (meetingId: string) => void;

    /**
     * 현재:
     * - /settings 이동
     *
     * 나중:
     * - 설정 데이터 preload 가능
     */
    openSettings: () => void;
    deleteMeeting: (meetingId: string | number) => void;

    /**
     * 현재:
     * - /login 이동
     *
     * 나중:
     * - 로그아웃 API 호출
     * - token 제거
     * - authStore 초기화
     */
    logout: () => void;

  };
};

/**
 * 설정 화면 props
 *
 * 기능:
 * - 사용자 정보와 설정 화면 action 전달
 *
 * UI 담당 사용 방식:
 * - user는 화면에 표시
 * - actions.backDashboard, actions.logout은 버튼에 연결
 */
export type SettingsPageProps = {
  /**
   * 현재:
   * - mock 사용자 데이터
   *
   * 나중:
   * - authStore.user
   * - 사용자 설정 API 응답값
   */
  user: User;

  actions: {
    /**
     * 현재:
     * - /dashboard 이동
     *
     * 나중:
     * - 설정 저장 여부 확인 가능
     */
    backDashboard: () => void;

    /**
     * 현재:
     * - /login 이동
     *
     * 나중:
     * - 로그아웃 API 호출
     * - token 제거
     * - authStore 초기화
     */
    logout: () => void;
  };
};
/**
 * 회원가입 화면 props
 *
 * 기능:
 * - 회원가입 완료 / 로그인 화면 이동 action 정의
 *
 * UI 담당 사용 방식:
 * - 회원가입 버튼에 actions.signup 연결
 * - 로그인 이동 버튼에 actions.backLogin 연결
 */
export type SignupPageProps = {
  form: {
    name: string;
    email: string;
    birthDate: string;
    password: string;
    passwordConfirm: string;
    organizationTeamName: string;
    termsAgreed: boolean;
  };

  state: {
    isLoading: boolean;
    errorMessage: string | null;
  };

  actions: {
    changeName: (value: string) => void;
    changeEmail: (value: string) => void;
    changeBirthDate: (value: string) => void;
    changePassword: (value: string) => void;
    changePasswordConfirm: (value: string) => void;
    changeOrganizationTeamName: (value: string) => void;
    changeTermsAgreed: (value: boolean) => void;
    signup: () => void;
    backLogin: () => void;
  };
};

/**
 * 회의 상세/회의 후 화면 props
 *
 * 기능:
 * - 회의 상세 데이터, 의사결정, 재논의 알림, 관련 파일 전달
 *
 * UI 담당 사용 방식:
 * - meeting, decisions, alerts, documents는 화면 표시
 * - actions는 버튼/카드 클릭에 연결
 *
 * 주의:
 * - 현재는 최소 mock 구조 기준
 * - 실제 API 연동 시 필드 추가 가능
 */
export type MeetingDetailPageProps = {
  meeting: Meeting;

  decisions: DecisionItem[];

  alerts: RediscussAlert[];

  documents: DocumentFile[];

  actions: {
    backDashboard: () => void;

    openLiveMeeting: () => void;

    openDecision: (decisionId: string) => void;

    openAlert: (alertId: string) => void;

    openFile: (fileId: string) => void;

    shareMeeting: () => void;

    downloadMeeting: () => void;
  };
};

/**
 * 의사결정 필터 타입
 *
 * 현재:
 * - 클라이언트 필터 상태
 *
 * 나중:
 * - 의사결정 목록 API request parameter로 사용 가능
 */
export type DecisionFilter = {
  keyword: string;

  status: IssueState | "ALL";

  priority: Priority | "ALL";

  assigneeId?: string;
};

/**
 * 의사결정 화면 props
 *
 * 기능:
 * - 의사결정 목록, 필터 상태, 선택된 안건 상태 전달
 *
 * UI 담당 사용 방식:
 * - decisions는 목록 표시
 * - filter는 검색/필터 UI 상태 표시
 * - selectedDecisionId는 상세 패널 표시 기준
 * - actions는 검색/필터/행 클릭/상태 변경 버튼에 연결
 */
export type DecisionPageProps = {
  decisions: DecisionItem[];

  filter: DecisionFilter;

  selectedDecisionId: string | null;

  actions: {
    searchDecision: (keyword: string) => void;

    changeFilter: (filter: Partial<DecisionFilter>) => void;

    resetFilter: () => void;

    selectDecision: (decisionId: string) => void;

    closeDetail: () => void;

    changeDecisionStatus: (
      decisionId: string,
      status: IssueState
    ) => void;

    changePriority: (decisionId: string, priority: Priority) => void;

    openRelatedMeeting: (meetingId: string) => void;

    backDashboard: () => void;
  };
};
/**
 * 로그인 화면 props
 *
 * 기능:
 * - 로그인 실행
 * - 회원가입 화면 이동
 *
 * UI 담당 사용 방식:
 * - 로그인 버튼 → actions.login 연결
 * - 회원가입 버튼 → actions.moveSignup 연결
 *
 * 주의:
 * - 현재 mock 구조 기준
 * - 실제 인증 API 연동 시 props 추가 가능
 */
// WebSocket Meeting 계층에서 사용하는 회의 상태
// 백엔드 명세 기준: ACTIVE / ENDED
export type WebSocketMeetingStatus = "READY" | "ACTIVE" | "ENDED";

// WebSocket으로 주고받는 회의 최소 데이터
// CREATE_MEETING_ACK, GET_MEETINGS_ACK, MEETING_CREATED에서 사용
// GET_MEETINGS_ACK의 meetings 배열 안 객체
export type WebSocketMeeting = {
  id: string | number;
  title: string;
  status: WebSocketMeetingStatus;
  workspaceId?: number;
  description?: string | null;
  scheduledAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;

  // GET_MEETINGS_ACK에서는 created_at
  created_at?: string;

  // CREATE_MEETING_ACK / MEETING_CREATED에서는 createdAt
  createdAt?: string;
};


// 클라이언트 → 서버
// 새 회의 생성 요청 payload
export type CreateMeetingPayload = {
  workspaceId: number;
  title: string;
  status: "READY";
};

// 클라이언트 → 서버
// 특정 워크스페이스 회의 목록 조회 요청 payload
export type GetMeetingsPayload = {
  workspaceId: number;
  page?: number;
  size?: number;
};

export type GetMeetingPayload = {
  workspaceId: number;
  meetingId: number;
};
export type GetMeetingAckPayload = {
  workspaceId: number;
  id: number;
  title: string;
  status: WebSocketMeetingStatus;
  fetchedAt: string;
};
// 서버 → 요청자
// CREATE_MEETING 요청 결과 확인용 ACK
export type CreateMeetingAckPayload = {
  workspaceId: number;
  id: number;
  title: string;
  status: "READY";
  createdAt: string;
};

// 서버 → 요청자
// GET_MEETINGS 요청 결과
export type GetMeetingsAckPayload = {
  workspaceId: number;
  page: number;
  size: number;
  meetings: WebSocketMeeting[];
  count: number;
  fetchedAt: string;
};

// Client → Server
// 회의 페이지 삭제 요청 payload
export type DeleteMeetingPayload = {
  workspaceId: number;
  meetingId: number;
};

// Server → 요청한 Client
// 삭제 요청 성공 확인용 ACK

export type DeleteMeetingAckPayload = {
  workspaceId: number;
  id: number;
  title: string;
  status: "ENDED";
};

// Server → 같은 workspace 접속자 전체
// 회의 삭제 브로드캐스트 payload
export type MeetingDeletedPayload = {
  workspaceId: number;
  id: number;
  title: string;
  status: "ENDED";
};

// 서버 → 같은 workspace 접속자 전체
// 새 회의 생성 브로드캐스트 payload
export type MeetingCreatedPayload = {
  workspaceId: number;
  id: number;
  title: string;
  status: "READY";
  createdAt?: string;
};

//회의 시작 종료
export type StartMeetingPayload = {
  workspaceId: number;
  meetingId: number;
  title: string;
};

export type EndMeetingPayload = {
  workspaceId: number;
  meetingId: number;
  title: string;
};

export type MeetingSessionPayload = {
  workspaceId: number;
  meetingId: number;
  title: string;
  description: string | null;
  status: WebSocketMeetingStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type StartMeetingAckPayload = MeetingSessionPayload & {
  status: "ACTIVE";
};

export type EndMeetingAckPayload = MeetingSessionPayload & {
  status: "ENDED";
};

export type MeetingStatusChangedPayload = MeetingSessionPayload & {
  status: "ACTIVE" | "ENDED";
};

//회의 안건 
export type IssueStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "CLOSED";

export type IssuePriority =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | null;

//회의 안건
export type Issue = {
  id: number;

  workspaceId: number;
  meetingId: number;

  title: string;

  description: string | null;

  status: IssueStatus;

  priority: IssuePriority;

  dueDate: string | null;

  assigneeId: number | null;

  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
};

//안건 생성
export type CreateIssuePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;

  title: string;

  description: string | null;

  status: "OPEN";

  priority: IssuePriority;

  dueDate: string | null;

  assigneeId: number | null;
};

//안건 조회
export type GetIssuesPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
};

export type GetAllIssuesPayload = {
  workspaceId: number;
};

export type GetIssuePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
};

export type GetIssueAckPayload = Issue;

export type GetIssueEventsPayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
};

export type IssueEvent = {
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

//안건 수정
export type UpdateIssuePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
  title: string;
  description: string | null;
  priority: IssuePriority | null;
  dueDate: string | null;
  assigneeId: number | null;
};

export type ChangeIssueStatePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
  toState: IssueStatus;
  reason: string;
  evidence: string;
};

export type ChangeIssueStateAckPayload = {
  issueId: number;
  fromState: IssueStatus;
  toState: IssueStatus;
  eventType: string;
  changedAt: string;
};

export type IssueStateChangedPayload = {
  issueId: number;
  fromState: IssueStatus;
  toState: IssueStatus;
  eventType: string;
  changedAt: string;
};

//안건 삭제
export type DeleteIssuePayload = {
  workspaceId: number;
  meetingId: number;
  meetingRoomId: number;
  issueId: number;
};

export type MeetingSummaryPageProps = {
  workspaceId: number | null;
  meetingId: number | null;
  issues: {
    items: Issue[];
    isLoading: boolean;
    errorMessage: string | null;
  };
  actions: {
    getIssues: () => void;
    updateIssueStatus: (
      issueId: number,
      status: Exclude<IssueStatus, "OPEN">
    ) => void;
    updateIssue: (issueId: number, values: {
      title: string;
      description: string | null;
      priority: IssuePriority | null;
      dueDate: string | null;
      assigneeId: number | null;
    }) => void;
    deleteIssue: (issueId: number) => void;
    backDashboard: () => void;
  };
};
