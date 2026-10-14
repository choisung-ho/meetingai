import { USE_MOCK_AUTH } from "../../constants/authConfig";
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
} from "../../types/auth.types";
import { mockLogin } from "./mockAuthService";
import {
  serverLogin,
  serverGetCurrentUser,
  serverRefreshWithRefreshToken,
  serverSilentRefreshWithAccessToken,
} from "./serverAuthService";
import type {
  AuthMeResponse,
  SignupRequest,
  SignupResponse,
} from "../../types/auth.types";

import { serverSignup } from "./serverSignupService";
/**
 * 로그인 서비스 진입점
 *
 * USE_MOCK_AUTH = true  → mock 로그인
 * USE_MOCK_AUTH = false → 서버 로그인
 */
export async function login(
  request: LoginRequest
): Promise<LoginResponse> {
  if (USE_MOCK_AUTH) {
    return mockLogin(request);
  }

  return serverLogin(request);
}

export async function refreshWithRefreshToken(
  refreshToken: string
): Promise<RefreshResponse> {
  if (USE_MOCK_AUTH) {
    return {
      accessToken: "mock_jwt_token",
      refreshToken: "mock_refresh_token",
      tokenType: "bearer",
      user: null,
    };
  }

  return serverRefreshWithRefreshToken(refreshToken);
}

export async function silentRefreshWithAccessToken(
  accessToken: string
): Promise<RefreshResponse> {
  if (USE_MOCK_AUTH) {
    return {
      accessToken: "mock_jwt_token",
      refreshToken: "mock_refresh_token",
      tokenType: "bearer",
      user: null,
    };
  }

  return serverSilentRefreshWithAccessToken(accessToken);
}

export async function getCurrentUser(
  accessToken?: string | null
): Promise<AuthMeResponse> {
  if (USE_MOCK_AUTH) {
    return {
      id: "mock-user",
      userId: "mock-user",
      name: "Mock User",
      userName: "Mock User",
      email: "",
      organizationTeamName: null,
      organization_team_name: null,
    };
  }

  return serverGetCurrentUser(accessToken);
}
/**
 * 회원가입 서비스 진입점
 *
 * USE_MOCK_AUTH = true
 * → mock 회원가입
 *
 * USE_MOCK_AUTH = false
 * → 서버 회원가입
 */
/**
 * 회원가입 서비스
 *
 * 현재는 백엔드 API 연결용.
 * 서버 요청:
 * POST /auth/register
 */
export async function signup(
  request: SignupRequest
): Promise<SignupResponse> {
  return serverSignup(request);
}
