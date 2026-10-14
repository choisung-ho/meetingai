import { API_BASE_URL } from "../../constants/authConfig";
import type {
  AuthMeResponse,
  AuthUser,
  AuthUserPayload,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  ServerAuthMeResponse,
  ServerLoginResponse,
  ServerRefreshResponse,
} from "../../types/auth.types";
import { parseApiError } from "../apiError";
import {
  normalizeAccessToken,
  normalizeRefreshToken,
} from "./tokenGuard";

function mapAuthUser(data: AuthUserPayload | null | undefined): AuthUser | null {
  if (!data) return null;

  const userId = data.userId ?? data.user_id ?? data.id;
  const name = data.userName ?? data.name;

  if (userId === undefined || userId === null || !name) {
    return null;
  }

  return {
    id: String(data.id ?? userId),
    userId,
    name,
    userName: data.userName ?? name,
    email: data.email ?? "",
    organizationTeamName:
      data.organizationTeamName ?? data.organization_team_name ?? null,
    organization_team_name:
      data.organization_team_name ?? data.organizationTeamName ?? null,
  };
}

export async function serverLogin(
  request: LoginRequest
): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw await parseApiError(response, "로그인에 실패했습니다.");
  }

  const data: ServerLoginResponse = await response.json();
  const accessToken = normalizeAccessToken(data.access_token ?? data.accessToken);
  const refreshToken = normalizeRefreshToken(
    data.refresh_token ?? data.refreshToken
  );

  if (!accessToken || !refreshToken) {
    throw new Error("로그인 응답에 토큰이 없습니다.");
  }

  return {
    accessToken,
    refreshToken,
    tokenType: data.token_type ?? data.tokenType ?? "bearer",
    defaultWorkspaceId: data.defaultWorkspaceId,
    user: mapAuthUser(data),
  };
}

export async function serverRefreshWithRefreshToken(
  refreshTokenParam: string
): Promise<RefreshResponse> {
  const requestRefreshToken = normalizeRefreshToken(refreshTokenParam);

  if (!requestRefreshToken) {
    throw new Error("Invalid refresh token");
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: requestRefreshToken }),
  });

  if (!response.ok) {
    throw await parseApiError(response, "세션 갱신에 실패했습니다.");
  }

  const raw: ServerRefreshResponse & { data?: ServerRefreshResponse } =
    await response.json();
  const data = raw.data ?? raw;
  const accessToken = normalizeAccessToken(data.access_token ?? data.accessToken);
  const refreshToken = normalizeRefreshToken(
    data.refresh_token ?? data.refreshToken ?? requestRefreshToken
  );
  const tokenType = data.token_type ?? data.tokenType ?? "bearer";

  if (!accessToken || !refreshToken) {
    throw new Error("세션 갱신 응답이 올바르지 않습니다.");
  }

  return {
    accessToken,
    refreshToken,
    tokenType,
    user: mapAuthUser(data),
  };
}

export async function serverSilentRefreshWithAccessToken(
  accessTokenParam: string
): Promise<RefreshResponse> {
  const requestAccessToken = normalizeAccessToken(accessTokenParam);

  if (!requestAccessToken) {
    throw new Error("Invalid access token");
  }

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requestAccessToken}`,
    },
  });

  if (!response.ok) {
    throw await parseApiError(response, "세션 연장에 실패했습니다.");
  }

  const raw: ServerRefreshResponse & { data?: ServerRefreshResponse } =
    await response.json();
  const data = raw.data ?? raw;
  const previousRefreshToken = localStorage.getItem("refreshToken");
  const accessToken = normalizeAccessToken(data.access_token ?? data.accessToken);
  const refreshToken = normalizeRefreshToken(
    data.refresh_token ?? data.refreshToken ?? previousRefreshToken
  );
  const tokenType = data.token_type ?? data.tokenType ?? "bearer";

  if (!accessToken) {
    throw new Error("세션 연장 응답에 accessToken이 없습니다.");
  }

  return {
    accessToken,
    refreshToken,
    tokenType,
    user: mapAuthUser(data),
  };
}

export async function serverGetCurrentUser(
  accessTokenParam?: string | null
): Promise<AuthMeResponse> {
  const requestAccessToken = normalizeAccessToken(
    accessTokenParam ?? localStorage.getItem("accessToken")
  );

  if (!requestAccessToken) {
    throw new Error("Invalid access token");
  }

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${requestAccessToken}`,
    },
  });

  if (!response.ok) {
    throw await parseApiError(response, "사용자 정보를 조회하지 못했습니다.");
  }

  const raw: ServerAuthMeResponse = await response.json();
  const user = mapAuthUser(raw.data ?? raw);

  if (!user) {
    throw new Error("사용자 정보 응답이 올바르지 않습니다.");
  }

  return user;
}
