import { mockLoginResponse } from "../../mocks/mockAuthData";
import type { LoginRequest, LoginResponse } from "../../types/auth.types";

/**
 * mock 로그인
 *
 * 서버가 꺼져 있을 때 사용하는 임시 로그인 함수
 */
export async function mockLogin(
  request: LoginRequest
): Promise<LoginResponse> {
  if (!request.email || !request.password) {
    throw new Error("이메일과 비밀번호를 입력해주세요.");
  }

  return mockLoginResponse;
}