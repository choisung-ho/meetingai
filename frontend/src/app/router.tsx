import {
  createBrowserRouter,
  createHashRouter,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { LoginContainer } from "../containers/LoginContainer";
import { SignupContainer } from "../containers/SignupContainer";
import { InvitationAcceptContainer } from "../containers/InvitationAcceptContainer";
import { DashboardContainer } from "../containers/DashboardContainer";
import { MeetingLiveContainer } from "../containers/MeetingLiveContainer";
import { MeetingRecordDetailContainer } from "../containers/MeetingRecordDetailContainer";
import { MeetingSummaryContainer } from "../containers/MeetingSummaryContainer";
import { DecisionContainer } from "../containers/DecisionContainer";
import { SettingsContainer } from "../containers/SettingsContainer";
import { SocketProvider } from "./providers/SocketProvider";
import { useAuthStore } from "../store/authStore";

// eslint-disable-next-line react-refresh/only-export-components
function RequireAuth() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
/**
 * 앱 전체 라우팅 규칙
 *
 * 현재 기능:
 * - 로그인 / 회원가입 / 대시보드 / 회의중 / 회의상세 / 의사결정 / 설정 이동 연결
 *
 * 나중에 변경될 가능성:
 * - 실제 로그인/JWT 적용 시 보호 라우트 추가
 * - workspace 기반 라우트 구조로 변경 가능
 */
/**
 * Electron 패키징본은 file:// 로 로드되어 History API 경로가 동작하지 않는다.
 * 브라우저(개발/웹 배포)에서는 기존처럼 경로 기반 라우터를 쓰고,
 * file:// 환경에서만 hash 라우터로 전환한다.
 */
const isFileProtocol =
  typeof window !== "undefined" && window.location.protocol === "file:";

const createRouter = isFileProtocol ? createHashRouter : createBrowserRouter;

export const router = createRouter([
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: <LoginContainer />,
  },
  {
    path: "/signup",
    element: <SignupContainer />,
  },
  {
    path: "/invitations/accept",
    element: <InvitationAcceptContainer />,
  },
  {
    element: (
      <SocketProvider>
        <RequireAuth />
      </SocketProvider>
    ),
    children: [
      {
        path: "/dashboard",
        element: <DashboardContainer />,
      },
      {
        path: "/meeting/live/:meetingId",
        element: <MeetingLiveContainer />,
      },
      {
        path: "/meeting/summary",
        element: <MeetingSummaryContainer />,
      },
      {
        path: "/meetings",
        element: <Navigate to="/dashboard?menu=menu-2" replace />,
      },
      {
        path: "/meetings/:meetingId",
        element: <MeetingRecordDetailContainer />,
      },
      {
        path: "/meeting-records/:meetingId",
        element: <MeetingRecordDetailContainer />,
      },
      {
        path: "/decisions",
        element: <DecisionContainer />,
      },
      {
        path: "/settings",
        element: <SettingsContainer />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/login" replace />,
  },
]);
