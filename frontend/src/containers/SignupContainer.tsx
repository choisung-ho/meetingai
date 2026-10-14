import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { SignupPage } from "../pages/SignupPage";
import { signup } from "../services/auth/authService";

/**
 * 회원가입 기능 Container
 *
 * 담당:
 * - 회원가입 입력 상태 관리
 * - 서버 회원가입 API 호출
 * - 성공 시 /login 이동
 *
 * 서버 요청:
 * POST /auth/register
 */
export function SignupContainer() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] =
    useState("");

  const [organizationTeamName, setOrganizationTeamName] =
    useState("");

  const [termsAgreed, setTermsAgreed] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSignup = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      setFieldErrors({});

      if (!name.trim()) {
        throw new Error("이름을 입력해주세요.");
      }

      if (!email.trim()) {
        throw new Error("이메일을 입력해주세요.");
      }

      if (!birthDate.trim()) {
        throw new Error("생년월일을 입력해주세요.");
      }

      const birthDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!birthDateRegex.test(birthDate.trim())) {
        throw new Error("생년월일은 YYYY-MM-DD 형식으로 입력해주세요.");
      }

      if (!password) {
        throw new Error("비밀번호를 입력해주세요.");
      }

      if (password !== passwordConfirm) {
        throw new Error("비밀번호가 일치하지 않습니다.");
      }

      if (!termsAgreed) {
        throw new Error("약관에 동의해주세요.");
      }

      await signup({
        name,
        email,
        birthDate,
        password,
        passwordConfirm,
        organizationTeamName: organizationTeamName.trim(),
        termsAgreed,
        termsVersion: "v1",
      });

      navigate("/login");
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

      setErrorMessage("회원가입 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackLogin = () => {
    navigate("/login");
  };

  return (
    <SignupPage
      form={{
        name,
        email,
        birthDate,
        password,
        passwordConfirm,
        organizationTeamName,
        termsAgreed,
      }}
      state={{
        isLoading,
        errorMessage,
        fieldErrors,
      }}
      actions={{
        changeName: setName,
        changeEmail: setEmail,
        changeBirthDate: setBirthDate,
        changePassword: setPassword,
        changePasswordConfirm: setPasswordConfirm,
        changeOrganizationTeamName:
          setOrganizationTeamName,
        changeTermsAgreed: setTermsAgreed,
        signup: handleSignup,
        backLogin: handleBackLogin,
      }}
    />
  );
}
