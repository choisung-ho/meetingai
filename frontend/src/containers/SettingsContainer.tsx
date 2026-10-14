import { useNavigate } from "react-router-dom";

import { SettingsPage } from "../pages/SettingsPage";
import { useAuthStore } from "../store/authStore";
import { useSocketContext } from "../app/providers/SocketProvider";

/**
 * 설정 화면 기능 Container
 *
 * 기능:
 * - SettingsPage에 mock user 전달
 * - 대시보드 이동 / 로그아웃 action 전달
 *
 * UI 담당 사용 방식:
 * - user는 화면 표시용
 * - actions.backDashboard, actions.logout을 버튼에 연결
 */
export function SettingsContainer() {
  const navigate = useNavigate();
  const socket = useSocketContext();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const authUser = useAuthStore((state) => state.user);

  /**
   * 대시보드 이동 버튼 클릭 시 실행
   *
   * 현재 기능:
   * - /dashboard로 이동
   *
   * 나중에 변경될 값/로직:
   * - 설정 변경사항 저장 여부 확인 가능
   */
  const handleBackDashboard = () => {
    navigate("/dashboard");
  };

  /**
   * 로그아웃 버튼 클릭 시 실행
   *
   * 현재 기능:
   * - mock 로그아웃
   * - /login으로 이동
   *
   * 나중에 변경될 값/로직:
   * - 로그아웃 API 호출
   * - token 제거
   * - authStore 초기화
   */
  const handleLogout = () => {
    if (socket.workspace.workspaceId) {
      socket.actions.leaveWorkspace(socket.workspace.workspaceId);
    }
    socket.actions.disconnect();
    socket.actions.clearWorkspaceData();
    clearAuth();
    navigate("/login");
  };

  return (
    <SettingsPage
      user={{
        id: String(authUser?.userId ?? authUser?.id ?? ""),
        name: authUser?.userName ?? authUser?.name ?? "사용자",
        email: authUser?.email ?? "",
        role: authUser?.role === "admin" ? "admin" : "member",
        teamName: authUser?.organizationTeamName ?? "",
      }}
      actions={{
        backDashboard: handleBackDashboard,
        logout: handleLogout,
      }}
    />
  );
}
