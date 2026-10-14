# Frontend MVP 기능 연결 문서

## 반드시 먼저 읽을 문서

1. Frontend MVP 기능 연결 문서
2. 현재 Container 코드
3. 현재 Hook 코드
4. 현재 Store 코드
5. 첨부된 UI 코드

판단 우선순위

1순위 = Frontend MVP 기능 연결 문서
2순위 = 현재 Container/Hook/Store 코드
3순위 = UI 코드

UI 코드와 기능 문서가 충돌하면
기능 문서를 따른다.

Container props 구조가 최종 기준이다.

절대 새로운 props를 만들지 마라.

절대 action 이름을 바꾸지 마라.

절대 타입을 새로 정의하지 마라.

UI는 현재 Container가 제공하는 props/actions만 사용한다.

필요하면 UI 코드를 Container 규격에 맞게 수정한다.

Container를 UI에 맞추지 말고
UI를 Container에 맞춘다.

## 문서 기준

- 기준 코드: `LoginPage`, `SignupPage`, `DashboardPage`, `MeetingLivePage`, `MeetingSummaryPage`와 각 Container
- 기준 UI: 현재 테스트 UI
- 기준 기능: props 구조, 이벤트 함수 이름, 데이터 타입, 상태값(enum), 이벤트 동작 흐름, 데이터 갱신 타이밍
- 현재 라우터에는 독립 `WorkspacePage`가 없다. 워크스페이스 목록 조회, 생성, 선택, 접속자 표시 기능은 `DashboardPage`와 `DashboardContainer`에 포함되어 있어 본 문서도 `DashboardPage`의 workspace 기능으로 정리한다.

## 1. props 구조

### LoginPage

| 화면 | props 그룹 | 필드명 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| LoginPage | `form` | `email` | `string` | 이메일 입력값 |
| LoginPage | `form` | `password` | `string` | 비밀번호 입력값 |
| LoginPage | `state` | `isLoading` | `boolean` | 로그인 요청 진행 여부 |
| LoginPage | `state` | `errorMessage` | `string \| null` | 로그인 실패 메시지 |
| LoginPage | `actions` | `changeEmail` | `(email: string) => void` | 이메일 변경 |
| LoginPage | `actions` | `changePassword` | `(password: string) => void` | 비밀번호 변경 |
| LoginPage | `actions` | `login` | `() => void` | 로그인 실행 |
| LoginPage | `actions` | `moveSignup` | `() => void` | 회원가입 화면 이동 |

`LoginPage` 내부 로컬 UI 상태:

| 상태 | 타입 | 설명 |
| --- | --- | --- |
| `isLangOpen` | `boolean` | 언어 선택 메뉴 열림 여부 |
| `currentLang` | `string` | 현재 언어 표시값 |

현재 테스트 UI의 로그인 유지 체크박스, 비밀번호 찾기 버튼, Google 로그인 버튼은 Container action과 연결되어 있지 않다.

### SignupPage

| 화면 | props 그룹 | 필드명 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| SignupPage | `form` | `name` | `string` | 이름 |
| SignupPage | `form` | `email` | `string` | 이메일 |
| SignupPage | `form` | `birthDate` | `string` | 생년월일 |
| SignupPage | `form` | `password` | `string` | 비밀번호 |
| SignupPage | `form` | `passwordConfirm` | `string` | 비밀번호 확인 |
| SignupPage | `form` | `organizationTeamName` | `string` | 조직/팀 이름 |
| SignupPage | `form` | `termsAgreed` | `boolean` | 약관 동의 여부 |
| SignupPage | `state` | `isLoading` | `boolean` | 회원가입 요청 진행 여부 |
| SignupPage | `state` | `errorMessage` | `string \| null` | 검증/API 실패 메시지 |
| SignupPage | `actions` | `changeName` | `(value: string) => void` | 이름 변경 |
| SignupPage | `actions` | `changeEmail` | `(value: string) => void` | 이메일 변경 |
| SignupPage | `actions` | `changeBirthDate` | `(value: string) => void` | 생년월일 변경 |
| SignupPage | `actions` | `changePassword` | `(value: string) => void` | 비밀번호 변경 |
| SignupPage | `actions` | `changePasswordConfirm` | `(value: string) => void` | 비밀번호 확인 변경 |
| SignupPage | `actions` | `changeOrganizationTeamName` | `(value: string) => void` | 조직/팀 이름 변경 |
| SignupPage | `actions` | `changeTermsAgreed` | `(value: boolean) => void` | 약관 동의 변경 |
| SignupPage | `actions` | `signup` | `() => void` | 회원가입 실행 |
| SignupPage | `actions` | `backLogin` | `() => void` | 로그인 화면 이동 |

현재 테스트 UI의 Google 계정 가입 버튼은 Container action과 연결되어 있지 않다.

### DashboardPage

| 화면 | props 그룹 | 필드명 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| DashboardPage | 기본 | `currentWorkspaceId` | `number \| null` | 현재 선택 workspace ID |
| DashboardPage | 기본 | `currentWorkspaceName` | `string \| null` | 현재 선택 workspace 이름 |
| DashboardPage | 기본 | `workspaces` | `WorkspaceResponse[]` | REST로 조회/생성한 workspace 목록 |
| DashboardPage | 기본 | `isWorkspaceListOpen` | `boolean` | workspace 목록 표시 여부 |
| DashboardPage | `workspace` | `users` | `WorkspaceUser[]` | 현재 workspace 접속자 목록 |
| DashboardPage | `meetings` | `items` | `WebSocketMeeting[]` | 현재 workspace 회의 목록 |
| DashboardPage | `meetings` | `isLoading` | `boolean` | 회의 조회/생성/삭제 요청 진행 여부 |
| DashboardPage | `meetings` | `errorMessage` | `string \| null` | 회의 계층 오류 메시지 |
| DashboardPage | `actions` | `toggleWorkspaceList` | `() => void` | workspace 목록 열기/닫기 |
| DashboardPage | `actions` | `selectWorkspace` | `(workspaceId: number) => void` | workspace 선택 |
| DashboardPage | `actions` | `createWorkspace` | `(name: string) => void` | workspace 생성 |
| DashboardPage | `actions` | `startMeeting` | `() => void` | 새 회의 생성 후 라이브 화면 이동 준비 |
| DashboardPage | `actions` | `openMeeting` | `(meetingId: string) => void` | 기존 회의 상세 조회 후 라이브 화면 이동 |
| DashboardPage | `actions` | `openSettings` | `() => void` | 설정 화면 이동 |
| DashboardPage | `actions` | `deleteMeeting` | `(meetingId: string \| number) => void` | 회의 삭제 요청 |
| DashboardPage | `actions` | `logout` | `() => void` | workspace 이탈, socket 연결 해제, auth 초기화 |

`DashboardPage` 내부 로컬 UI 상태:

| 상태 | 타입 | 설명 |
| --- | --- | --- |
| `newWorkspaceName` | `string` | workspace 생성 입력값 |

`DashboardContainer` 내부 상태:

| 상태 | 타입 | 설명 |
| --- | --- | --- |
| `currentWorkspaceId` | `number \| null` | 현재 workspace ID |
| `currentWorkspaceName` | `string \| null` | 현재 workspace 이름 fallback |
| `workspaces` | `WorkspaceResponse[]` | workspace 목록 |
| `isWorkspaceListOpen` | `boolean` | workspace 목록 UI 표시 여부 |
| `isLoadingWorkspaces` | `boolean` | workspace REST 요청 여부, 현재 Page props에는 미전달 |
| `workspaceErrorMessage` | `string \| null` | workspace REST 오류, 현재 Page props에는 미전달 |

### MeetingLivePage

| 화면 | props 그룹 | 필드명 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| MeetingLivePage | `meeting` | `id` | `number` | 라이브 회의 ID |
| MeetingLivePage | `meeting` | `title` | `string` | 라이브 회의 제목 |
| MeetingLivePage | `meeting` | `status` | `WebSocketMeetingStatus` | 회의 상태 |
| MeetingLivePage | `state` | `isIssueInputVisible` | `boolean` | 회의가 `ACTIVE`일 때 안건 입력 UI 표시 |
| MeetingLivePage | `workspace` | `workspaceId` | `number \| null` | 참여 중인 workspace ID |
| MeetingLivePage | `workspace` | `status` | `WorkspaceConnectionStatus` | workspace 입장 상태 |
| MeetingLivePage | `workspace` | `users` | `WorkspaceUser[]` | workspace 접속자 목록 |
| MeetingLivePage | `workspace` | `updatedAt` | `string \| null` | workspace 접속자 갱신 시각 |
| MeetingLivePage | `workspace` | `errorMessage` | `string \| null` | workspace 오류 메시지 |
| MeetingLivePage | `workspace` | `isWorkspaceJoined` | `boolean` | workspace 입장 완료 여부 |
| MeetingLivePage | `meetingRoom` | `workspaceId` | `number \| null` | 회의방이 속한 workspace ID |
| MeetingLivePage | `meetingRoom` | `meetingRoomId` | `number \| null` | 회의방 ID |
| MeetingLivePage | `meetingRoom` | `status` | `MeetingRoomConnectionStatus` | 회의방 입장 상태 |
| MeetingLivePage | `meetingRoom` | `users` | `MeetingRoomUser[]` | 회의방 참여자 목록 |
| MeetingLivePage | `meetingRoom` | `updatedAt` | `string \| null` | 회의방 참여자 갱신 시각 |
| MeetingLivePage | `meetingRoom` | `errorMessage` | `string \| null` | 회의방 오류 메시지 |
| MeetingLivePage | `meetingRoom` | `isMeetingRoomJoined` | `boolean` | 회의방 입장 완료 여부 |
| MeetingLivePage | `issues` | `items` | `Issue[]` | 현재 socket issue 목록 |
| MeetingLivePage | `issues` | `isLoading` | `boolean` | 현재 Container에서 항상 `false` 전달 |
| MeetingLivePage | `issues` | `errorMessage` | `string \| null` | 현재 Container에서 항상 `null` 전달 |
| MeetingLivePage | `actions` | `startMeeting` | `() => void` | 회의 시작 요청 |
| MeetingLivePage | `actions` | `endMeeting` | `() => void` | 회의 종료 요청 |
| MeetingLivePage | `actions` | `createIssue` | `(text: string) => void` | 안건 생성 요청 |
| MeetingLivePage | `actions` | `leaveMeetingRoom` | `() => void` | 회의방 퇴장 후 dashboard 이동 |
| MeetingLivePage | `actions` | `backDashboard` | `() => void` | 회의방 이탈 요청 후 dashboard 이동 |

`MeetingLivePage` 내부 로컬 UI 상태:

| 상태 | 타입 | 설명 |
| --- | --- | --- |
| `issueText` | `string` | 안건 생성 입력값 |

### MeetingSummaryPage

| 화면 | props 그룹 | 필드명 | 타입 | 설명 |
| --- | --- | --- | --- | --- |
| MeetingSummaryPage | 기본 | `workspaceId` | `number \| null` | query string의 workspace ID |
| MeetingSummaryPage | 기본 | `meetingId` | `number \| null` | query string의 meeting ID |
| MeetingSummaryPage | `issues` | `items` | `Issue[]` | socket issue 목록 |
| MeetingSummaryPage | `issues` | `isLoading` | `boolean` | 현재 Container에서 항상 `false` 전달 |
| MeetingSummaryPage | `issues` | `errorMessage` | `string \| null` | 현재 Container에서 항상 `null` 전달 |
| MeetingSummaryPage | `actions` | `getIssues` | `() => void` | 해당 회의 안건 목록 조회 |
| MeetingSummaryPage | `actions` | `updateIssueStatus` | `(issueId: number, status: Exclude<IssueStatus, "OPEN">) => void` | 안건 상태 변경 |
| MeetingSummaryPage | `actions` | `deleteIssue` | `(issueId: number) => void` | 안건 삭제 |
| MeetingSummaryPage | `actions` | `backDashboard` | `() => void` | dashboard 이동 |

## 2. 이벤트 함수 이름

| 화면/위치 | 함수 | 기능 |
| --- | --- | --- |
| LoginPage | `actions.changeEmail(email)` | 이메일 입력 상태 변경 |
| LoginPage | `actions.changePassword(password)` | 비밀번호 입력 상태 변경 |
| LoginPage | `actions.login()` | 로그인 요청 |
| LoginPage | `actions.moveSignup()` | `/signup` 이동 |
| SignupPage | `actions.changeName(value)` | 이름 입력 상태 변경 |
| SignupPage | `actions.changeEmail(value)` | 이메일 입력 상태 변경 |
| SignupPage | `actions.changeBirthDate(value)` | 생년월일 입력 상태 변경 |
| SignupPage | `actions.changePassword(value)` | 비밀번호 입력 상태 변경 |
| SignupPage | `actions.changePasswordConfirm(value)` | 비밀번호 확인 입력 상태 변경 |
| SignupPage | `actions.changeOrganizationTeamName(value)` | 조직/팀 이름 입력 상태 변경 |
| SignupPage | `actions.changeTermsAgreed(value)` | 약관 동의 상태 변경 |
| SignupPage | `actions.signup()` | 회원가입 요청 |
| SignupPage | `actions.backLogin()` | `/login` 이동 |
| DashboardPage | `actions.toggleWorkspaceList()` | workspace 목록 표시 토글 |
| DashboardPage | `actions.selectWorkspace(workspaceId)` | 현재 workspace 변경 |
| DashboardPage | `actions.createWorkspace(name)` | workspace 생성 |
| DashboardPage | `actions.startMeeting()` | 회의 제목 입력 후 `CREATE_MEETING` 전송 |
| DashboardPage | `actions.openMeeting(meetingId)` | `GET_MEETING` 전송 |
| DashboardPage | `actions.deleteMeeting(meetingId)` | `DELETE_MEETING` 전송 |
| DashboardPage | `actions.openSettings()` | `/settings` 이동 |
| DashboardPage | `actions.logout()` | workspace 이탈, socket disconnect, auth 초기화, `/login` 이동 |
| MeetingLivePage | `actions.startMeeting()` | `START_MEETING` 전송 |
| MeetingLivePage | `actions.endMeeting()` | `END_MEETING` 전송 |
| MeetingLivePage | `actions.createIssue(text)` | `CREATE_ISSUE` 전송 |
| MeetingLivePage | `actions.leaveMeetingRoom()` | `LEAVE_MEETING_ROOM` 전송 후 dashboard 이동 |
| MeetingLivePage | `actions.backDashboard()` | 회의방 이탈 요청 후 dashboard 이동 |
| MeetingSummaryPage | `actions.getIssues()` | `GET_ISSUES` 전송 |
| MeetingSummaryPage | `actions.updateIssueStatus(issueId, status)` | `UPDATE_ISSUE` 전송 |
| MeetingSummaryPage | `actions.deleteIssue(issueId)` | `DELETE_ISSUE` 전송 |
| MeetingSummaryPage | `actions.backDashboard()` | `/dashboard` 또는 workspace query 포함 dashboard 이동 |

## 3. 데이터 타입

### Auth

| 타입 | 필드 |
| --- | --- |
| `LoginRequest` | `email`, `password` |
| `LoginResponse` | `accessToken`, `tokenType`, `defaultWorkspaceId` |
| `SignupRequest` | `name`, `email`, `birthDate`, `password`, `passwordConfirm`, `organizationTeamName`, `termsAgreed`, `termsVersion` |
| `SignupResponse` | `id`, `name`, `email`, `birthDate`, `organizationTeamName`, `termsAgreed`, `termsAgreedAt`, `termsVersion`, `createdAt`, `updatedAt` |

### Workspace / Presence

| 타입 | 필드 |
| --- | --- |
| `WorkspaceResponse` | `id`, `name`, `owner_user_id?`, `created_at?`, `updated_at?` |
| `CreateWorkspaceRequest` | `name` |
| `WorkspaceUser` | `userId`, `name`, `status`, `joinedAt`, `lastSeenAt` |
| `ConnectedCollaborationUser` | `userId`, `name`, `status`, `connectedAt` |
| `JoinWorkspacePayload` | `workspaceId` |
| `JoinWorkspaceAckPayload` | `workspaceId`, `userId`, `joinedAt` |
| `LeaveWorkspacePayload` | `workspaceId` |
| `LeaveWorkspaceAckPayload` | `workspaceId`, `userId`, `leftAt` |
| `WorkspaceUsersUpdatedPayload` | `workspaceId`, `users`, `updatedAt` |

### Meeting / MeetingRoom

| 타입 | 필드 |
| --- | --- |
| `WebSocketMeeting` | `id`, `title`, `status`, `created_at?`, `createdAt?` |
| `CreateMeetingPayload` | `workspaceId`, `title`, `status` |
| `CreateMeetingAckPayload` | `workspaceId`, `id`, `title`, `status`, `createdAt` |
| `MeetingCreatedPayload` | `workspaceId`, `id`, `title`, `status`, `createdAt?` |
| `GetMeetingsPayload` | `workspaceId`, `page?`, `size?` |
| `GetMeetingsAckPayload` | `workspaceId`, `page`, `size`, `meetings`, `count`, `fetchedAt` |
| `GetMeetingPayload` | `workspaceId`, `meetingId` |
| `GetMeetingAckPayload` | `workspaceId`, `id`, `title`, `status`, `fetchedAt` |
| `DeleteMeetingPayload` | `workspaceId`, `meetingId` |
| `DeleteMeetingAckPayload` | `workspaceId`, `id`, `title`, `status` |
| `MeetingDeletedPayload` | `workspaceId`, `id`, `title`, `status` |
| `StartMeetingPayload` | `workspaceId`, `meetingId` |
| `EndMeetingPayload` | `workspaceId`, `meetingId` |
| `MeetingStatusChangedPayload` | `workspaceId`, `meetingId`, `title`, `status` |
| `MeetingRoomUser` | `userId`, `name`, `status`, `joinedAt?`, `lastSeenAt?` |
| `JoinMeetingRoomPayload` | `workspaceId`, `meetingId`, `meetingRoomId` |
| `JoinMeetingRoomAckPayload` | `workspaceId`, `meetingId`, `meetingRoomId`, `userId`, `joinedAt` |
| `LeaveMeetingRoomPayload` | `workspaceId`, `meetingId`, `meetingRoomId` |
| `LeaveMeetingRoomAckPayload` | `workspaceId`, `meetingId`, `meetingRoomId`, `userId`, `leftAt` |
| `MeetingRoomUsersUpdatedPayload` | `workspaceId`, `meetingId`, `meetingRoomId`, `users`, `updatedAt` |

### Issue

| 타입 | 필드 |
| --- | --- |
| `Issue` | `id`, `workspaceId`, `meetingId`, `title`, `description`, `status`, `priority`, `dueDate`, `assigneeId`, `createdAt`, `updatedAt`, `deletedAt` |
| `CreateIssuePayload` | `workspaceId`, `meetingId`, `title`, `description`, `status`, `priority`, `dueDate`, `assigneeId` |
| `GetIssuesPayload` | `workspaceId`, `meetingId` |
| `UpdateIssuePayload` | `workspaceId`, `meetingId`, `issueId`, `status` |
| `DeleteIssuePayload` | `workspaceId`, `meetingId`, `issueId` |

## 4. 상태값(enum)

| 상태 타입 | 값 | 사용 위치 |
| --- | --- | --- |
| `AuthRole` | `admin`, `member` | Auth user role 타입 |
| `PresenceStatus` | `idle`, `connecting`, `socket_connected`, `user_registered`, `disconnecting`, `disconnected`, `error` | socket/presence 상태 |
| `CollaborationUserStatus` | `online`, `offline` | 연결 사용자 상태 |
| `WorkspaceUserStatus` | `online`, `offline` | workspace/meetingRoom 사용자 상태 |
| `WorkspaceConnectionStatus` | `idle`, `joining`, `joined`, `leaving`, `left`, `error` | workspace 입장 상태 |
| `MeetingRoomConnectionStatus` | `idle`, `joining`, `joined`, `leaving`, `left`, `error` | meetingRoom 입장 상태 |
| `WebSocketMeetingStatus` | `READY`, `ACTIVE`, `ENDED` | 현재 테스트 UI 회의 상태 |
| `IssueStatus` | `OPEN`, `IN_PROGRESS`, `CLOSED` | 안건 상태 |
| `IssuePriority` | `LOW`, `MEDIUM`, `HIGH`, `null` | 안건 우선순위 |

추가 타입인 `MeetingStatus`, `IssueState`, `Priority`도 `meeting.types.ts`에 남아 있으나, 현재 MVP 테스트 UI의 Dashboard/MeetingLive/MeetingSummary 연결 흐름은 `WebSocketMeetingStatus`, `IssueStatus`, `IssuePriority`를 사용한다.

## 5. 이벤트 동작 흐름

| 기능 | 이벤트 흐름 |
| --- | --- |
| 로그인 | `/login` 입력 -> `actions.login()` -> `LoginContainer.handleLogin()` -> `authService.login()` -> mock login 또는 `POST /login` -> `authStore.setAuth()` -> `/dashboard` 이동 |
| 회원가입 | `/signup` 입력 -> `actions.signup()` -> `SignupContainer.handleSignup()` -> 입력 검증 -> `authService.signup()` -> `POST /auth/register` -> 성공 시 `/login` 이동 |
| Socket 사용자 등록 | `SocketProvider` mount -> `usePresence(autoConnect)` -> WebSocket connect -> `CONNECTED` 수신 -> `CONNECT_USER` 전송 -> `CONNECT_USER_ACK` 수신 -> `PresenceStatus = user_registered`, `currentUser` 저장 |
| Dashboard 초기 workspace 준비 | `/dashboard` mount -> access token 확인 -> `GET /workspaces` -> 목록이 비면 `POST /workspaces`로 기본 workspace 생성 -> default workspace 선택 -> `authStore.defaultWorkspaceId`, `currentWorkspaceId`, `currentWorkspaceName`, `workspaces` 갱신 -> `/dashboard?workspaceId={id}` replace 이동 |
| Workspace 입장 | `currentWorkspaceId`와 socket user registration 준비 -> 필요 시 기존 workspace `LEAVE_WORKSPACE` -> `JOIN_WORKSPACE` 전송 -> `GET_MEETINGS` 전송 -> `JOIN_WORKSPACE_ACK` 수신 -> workspace joined -> `WORKSPACE_USERS_UPDATED` 수신 -> 접속자 목록 갱신 |
| Workspace 생성 | Dashboard 입력 -> `actions.createWorkspace(name)` -> `POST /workspaces` -> `workspaces`에 생성 workspace 추가 -> default/current workspace 갱신 -> `/dashboard?workspaceId={id}` replace 이동 -> workspace effect에서 `JOIN_WORKSPACE`, `GET_MEETINGS` 수행 |
| Workspace 선택 | 목록 버튼 클릭 -> `actions.selectWorkspace(workspaceId)` -> 유효한 다른 ID면 `currentWorkspaceId` 변경 -> workspace effect가 기존 workspace 이탈과 새 workspace 입장/회의 조회 수행 |
| 회의 목록 조회 | workspace 입장 effect -> `GET_MEETINGS` 전송 -> `GET_MEETINGS_ACK` 수신 -> `meetings` 전체 교체 |
| 회의 생성 및 라이브 이동 | Dashboard 회의 시작 버튼 -> 제목 `prompt` -> `CREATE_MEETING` 전송 -> `CREATE_MEETING_ACK` 수신 -> 같은 workspace의 `MEETING_CREATED` 수신 -> 목록에 회의 추가, `lastCreatedMeeting` 저장 -> `/meeting/live/{meetingId}?workspaceId={workspaceId}&autoStart=true` 이동 |
| 기존 회의 열기 | Dashboard 기존 회의 버튼 -> `actions.openMeeting(meetingId)` -> `GET_MEETING` 전송 -> `GET_MEETING_ACK` 수신 -> `lastFetchedMeeting` 저장 -> `/meeting/live/{meetingId}?workspaceId={workspaceId}` 이동 |
| 회의 삭제 | Dashboard 삭제 버튼 -> `DELETE_MEETING` 전송 -> `DELETE_MEETING_ACK` 수신 -> 성공 확인 -> 같은 workspace의 `MEETING_DELETED` 수신 -> `meetings`에서 해당 ID 제거 |
| MeetingRoom 입장 | MeetingLive route에서 `workspaceId`, `meetingId`, `meetingRoomId` 해석 -> workspace joined 확인 -> `JOIN_MEETING_ROOM` 전송 -> `JOIN_MEETING_ROOM_ACK` 수신 -> meetingRoom joined -> `MEETING_ROOM_USERS_UPDATED` 수신 -> 회의방 참여자 목록 갱신 |
| 자동 회의 시작 | Dashboard 생성 이동 query `autoStart=true` -> meetingRoom joined 확인 -> 회의 상태가 `ACTIVE`/`ENDED`가 아니면 `START_MEETING` 전송 |
| 수동 회의 시작 | MeetingLive 시작 버튼 -> `actions.startMeeting()` -> meetingRoom joined 확인 -> `START_MEETING` 전송 -> `START_MEETING_ACK` 수신 -> `MEETING_STATUS_CHANGED` 수신 -> 회의 상태 `ACTIVE` 반영 |
| 라이브 안건 생성 | 회의 상태 `ACTIVE` -> 안건 입력 UI 표시 -> `actions.createIssue(text)` -> trim 후 `CREATE_ISSUE` 전송 -> `CREATE_ISSUE_ACK` 수신 -> `ISSUE_CREATED` 수신 -> issue 목록에 중복 ID가 아니면 추가 |
| 회의 종료 및 Summary 이동 | MeetingLive 종료 버튼 -> `END_MEETING` 전송 -> `END_MEETING_ACK` 수신 -> `MEETING_STATUS_CHANGED`에서 상태 `ENDED` 반영 -> Live effect가 meetingRoom 이탈 요청 -> `/meeting/summary?workspaceId={workspaceId}&meetingId={meetingId}` 이동 |
| 회의방 나가기 | MeetingLive 나가기/대시보드 버튼 -> `LEAVE_MEETING_ROOM` 전송 가능 시 전송 -> 즉시 `/dashboard?workspaceId={workspaceId}` 이동 |
| Summary 안건 조회 | Summary 안건 조회 버튼 -> `GET_ISSUES` 전송 -> `GET_ISSUES_ACK` 수신 -> socket `issues` 전체 교체 |
| Summary 안건 상태 변경 | Summary 진행 중/종료 버튼 -> `UPDATE_ISSUE` 전송 -> `UPDATE_ISSUE_ACK` 수신 -> `ISSUE_UPDATED` 수신 -> 같은 issue ID 항목 교체 |
| Summary 안건 삭제 | Summary 삭제 버튼 -> `DELETE_ISSUE` 전송 -> `DELETE_ISSUE_ACK` 수신 -> `ISSUE_DELETED` 수신 -> issue 목록에서 삭제 |
| 로그아웃 | Dashboard 로그아웃 버튼 -> 현재 workspace `LEAVE_WORKSPACE` 전송 -> socket `DISCONNECT_USER` 전송 -> `authStore.clearAuth()` -> `/login` 이동 |

## 6. 데이터 갱신 타이밍

| 구분 | 타이밍 | 갱신 값 |
| --- | --- | --- |
| Login form | 입력 `onChange` 시 | `email`, `password` |
| Login loading | `handleLogin()` 시작/종료 시 | `isLoading`, `errorMessage` |
| Auth | 로그인 성공 시 | `accessToken`, `tokenType`, `defaultWorkspaceId`, `isLoggedIn`을 Zustand/localStorage에 저장 |
| Signup form | 입력 `onChange` 시 | `name`, `email`, `birthDate`, `password`, `passwordConfirm`, `organizationTeamName`, `termsAgreed` |
| Signup loading | `handleSignup()` 시작/검증 실패/API 종료 시 | `isLoading`, `errorMessage` |
| Workspace list | Dashboard mount의 `GET /workspaces` 성공 시 | `workspaces` 전체 교체 |
| Workspace create | `POST /workspaces` 성공 시 | `workspaces`에 생성 항목 추가, `defaultWorkspaceId`, `currentWorkspaceId`, `currentWorkspaceName` 갱신 |
| Workspace selection | workspace 선택 버튼 클릭 시 | `currentWorkspaceId` 즉시 변경 |
| Workspace join request | `JOIN_WORKSPACE` 전송 직전 | workspace `status = joining`, `workspaceId` 저장, join/left 시간과 오류 초기화 |
| Workspace join ack | `JOIN_WORKSPACE_ACK` 성공 수신 시 | workspace `status = joined`, `joinedAt`, `errorMessage` 갱신 |
| Workspace users | `WORKSPACE_USERS_UPDATED` 수신 시 | 같은 workspace면 `workspace.users` 전체 교체, `updatedAt` 갱신 |
| Workspace leave ack | `LEAVE_WORKSPACE_ACK` 성공 수신 시 | workspace `status = left`, users 비움, `leftAt` 저장 |
| Meeting query | `GET_MEETINGS`/`GET_MEETING`/`CREATE_MEETING`/`DELETE_MEETING` 전송 시 | meeting `isLoading = true`, `errorMessage = null` |
| Meeting list | `GET_MEETINGS_ACK` 성공 수신 시 | `meetings` 전체 교체, `isLoading = false` |
| Created meeting | `MEETING_CREATED` 수신 시 | 같은 workspace면 `meetings`에 새 회의 추가, 생성 요청 pending 조건이면 `lastCreatedMeeting` 저장 |
| Fetched meeting | `GET_MEETING_ACK` 성공 수신 시 | `lastFetchedMeeting` 저장, `isLoading = false` |
| Meeting delete ack | `DELETE_MEETING_ACK` 수신 시 | `isLoading = false`, 성공이면 `errorMessage = null` |
| Meeting delete broadcast | `MEETING_DELETED` 수신 시 | 같은 workspace면 `meetings`에서 meeting ID 제거, 삭제 대상이 `lastCreatedMeeting`이면 초기화 |
| MeetingRoom join request | `JOIN_MEETING_ROOM` 전송 직전 | meetingRoom `status = joining`, workspace ID, meetingRoom ID 저장 |
| MeetingRoom join ack | `JOIN_MEETING_ROOM_ACK` 수신 시 | meetingRoom `status = joined`, `joinedAt`, 오류 초기화 |
| MeetingRoom users | `MEETING_ROOM_USERS_UPDATED` 수신 시 | 같은 room이면 `meetingRoom.users` 전체 교체, `updatedAt` 갱신 |
| MeetingRoom leave | `LEAVE_MEETING_ROOM` 전송/ACK 수신 시 | 전송 시 `status = leaving`, ACK 시 `status = left`, `leftAt` 저장 |
| Meeting session | `MEETING_STATUS_CHANGED` 수신 시 | `meetings`, `lastCreatedMeeting`, `lastFetchedMeeting`의 해당 회의 status 동기화 |
| Live issue input | 회의 status 계산 시 | 선택 회의가 `ACTIVE`면 `isIssueInputVisible = true` |
| Issue list query | `GET_ISSUES_ACK` 수신 시 | `issues` 전체 교체 |
| Issue create | `ISSUE_CREATED` 수신 시 | 동일 issue ID가 없으면 `issues`에 추가 |
| Issue update | `ISSUE_UPDATED` 수신 시 | 동일 issue ID 항목을 payload로 교체 |
| Issue delete | `ISSUE_DELETED` 수신 시 | 동일 issue ID 항목 제거 |
| Socket heartbeat | `CONNECTED` 이후 interval `PING`, `PONG` 수신 시 | `lastServerTime` 갱신 |
| Socket error/close | `ERROR`, socket close, disconnect 수신 시 | pending ref 해제, presence/workspace/meetingRoom 상태 및 오류 갱신 |

회의와 안건 갱신은 요청 ACK와 broadcast 수신 시점을 구분해야 한다. 현재 회의 목록은 `GET_MEETINGS_ACK`에서 전체 교체되고, 생성/삭제는 `MEETING_CREATED`/`MEETING_DELETED` broadcast에서 목록을 증분 갱신한다. 안건도 조회는 `GET_ISSUES_ACK` 전체 교체, 생성/수정/삭제는 `ISSUE_CREATED`/`ISSUE_UPDATED`/`ISSUE_DELETED` broadcast 반영 방식이다.

