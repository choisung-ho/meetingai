import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { LoginPage } from "../pages/LoginPage";
import { login } from "../services/auth/authService";
import { useAuthStore } from "../store/authStore";

/**
 * 로그인 화면 기능 Container
 *
 * 담당:
 * - 로그인 입력 상태 관리
 * - mock 로그인 / 서버 로그인 실행
 * - 로그인 성공 시 authStore 저장
 * - 로그인 성공 시 /dashboard 이동
 *
 * UI는 API, Zustand, navigate를 직접 사용하지 않음
 */
export function LoginContainer() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setFieldErrors({});

      const result = await login({
        email,
        password,
      });

      clearAuth();
      setAuth({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        defaultWorkspaceId: result.defaultWorkspaceId,
        user: result.user,
      });
      navigate("/dashboard");
    } catch (error) {
      const nextFieldErrors =
        error instanceof Error && "fieldErrors" in error
          ? (error.fieldErrors as Record<string, string>)
          : {};
      setFieldErrors(nextFieldErrors);

      if (error instanceof Error) {
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage("알 수 없는 로그인 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveSignup = () => {
    navigate("/signup");
  };

  return (
    <LoginPage
      form={{
        email,
        password,
      }}
      state={{
        isLoading,
        errorMessage,
        fieldErrors,
      }}
      actions={{
        changeEmail: setEmail,
        changePassword: setPassword,
        login: handleLogin,
        moveSignup: handleMoveSignup,
      }}
    />
  );
}
