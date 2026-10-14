import { create } from "zustand";

import { resetLogoutLock } from "../services/auth/authRefreshLock";
import {
  getJwtSubject,
  normalizeAccessToken,
  normalizeRefreshToken,
} from "../services/auth/tokenGuard";
import type { AuthUser } from "../types/auth.types";

const storedAccessToken = normalizeAccessToken(localStorage.getItem("accessToken"));
const storedRefreshToken = normalizeRefreshToken(localStorage.getItem("refreshToken"));
const storedTokenType = localStorage.getItem("tokenType");
const storedDefaultWorkspaceId = localStorage.getItem("defaultWorkspaceId");
const storedAuthUserId = getJwtSubject(storedAccessToken);

function clearWorkspaceStorage() {
  localStorage.removeItem("defaultWorkspaceId");
  localStorage.removeItem("lastWorkspaceId");
  localStorage.removeItem("currentWorkspaceId");
  localStorage.removeItem("currentWorkspaceName");
  sessionStorage.removeItem("defaultWorkspaceId");
  sessionStorage.removeItem("lastWorkspaceId");
  sessionStorage.removeItem("currentWorkspaceId");
  sessionStorage.removeItem("currentWorkspaceName");
}

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  authUserId: string | null;
  tokenType: "bearer" | null;
  defaultWorkspaceId: number | null;
  isLoggedIn: boolean;

  setAuth: (payload: {
    accessToken: string;
    refreshToken: string;
    tokenType: "bearer";
    defaultWorkspaceId: number;
    user?: AuthUser | null;
  }) => void;

  setTokens: (payload: {
    accessToken: string;
    refreshToken?: string | null;
    tokenType: "bearer";
    user?: AuthUser | null;
  }) => void;

  setUser: (user: AuthUser | null) => void;

  setDefaultWorkspaceId: (workspaceId: number) => void;

  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  accessToken: storedAccessToken,
  refreshToken: storedRefreshToken,
  authUserId: storedAuthUserId,
  tokenType: storedTokenType === "bearer" ? "bearer" : null,
  defaultWorkspaceId: storedDefaultWorkspaceId
    ? Number(storedDefaultWorkspaceId)
    : null,
  isLoggedIn: Boolean(storedAccessToken),

  setAuth: ({ accessToken, refreshToken, tokenType, defaultWorkspaceId, user }) => {
    const nextAccessToken = normalizeAccessToken(accessToken);
    const nextRefreshToken = normalizeRefreshToken(refreshToken);

    if (!nextAccessToken || !nextRefreshToken) {
      throw new Error("Invalid auth token");
    }

    const previousAuthUserId = getJwtSubject(localStorage.getItem("accessToken"));
    const nextAuthUserId = getJwtSubject(nextAccessToken);

    resetLogoutLock();
    clearWorkspaceStorage();
    localStorage.setItem("accessToken", nextAccessToken);
    localStorage.setItem("refreshToken", nextRefreshToken);
    localStorage.setItem("tokenType", tokenType);
    localStorage.setItem("defaultWorkspaceId", String(defaultWorkspaceId));

    if (previousAuthUserId && previousAuthUserId !== nextAuthUserId) {
      console.log("[Workspace] clear previous user workspace state");
    }

    console.log("[Auth] login success", {
      userId: nextAuthUserId ?? "unknown",
    });

    set({
      user: user ?? null,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      authUserId: nextAuthUserId,
      tokenType,
      defaultWorkspaceId,
      isLoggedIn: true,
    });
  },

  setTokens: ({ accessToken, refreshToken, tokenType, user }) => {
    const nextAccessToken = normalizeAccessToken(accessToken);
    const storedRefreshToken = normalizeRefreshToken(localStorage.getItem("refreshToken"));
    const nextRefreshToken = normalizeRefreshToken(refreshToken) ?? storedRefreshToken;

    if (!nextAccessToken || !nextRefreshToken) {
      throw new Error("Invalid auth token");
    }

    const previousAuthUserId = getJwtSubject(localStorage.getItem("accessToken"));
    const nextAuthUserId = getJwtSubject(nextAccessToken);

    resetLogoutLock();

    const didAuthUserChange =
      previousAuthUserId &&
      nextAuthUserId &&
      previousAuthUserId !== nextAuthUserId;

    if (didAuthUserChange) {
      clearWorkspaceStorage();
      console.log("[Workspace] clear previous user workspace state");
    }

    localStorage.setItem("accessToken", nextAccessToken);
    localStorage.setItem("refreshToken", nextRefreshToken);
    localStorage.setItem("tokenType", tokenType);

    set({
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      ...(user != null ? { user } : {}),
      authUserId: nextAuthUserId,
      tokenType,
      ...(didAuthUserChange ? { defaultWorkspaceId: null } : {}),
      isLoggedIn: true,
    });
  },

  setUser: (user) => {
    set({ user });
  },

  setDefaultWorkspaceId: (workspaceId: number) => {
    localStorage.setItem("defaultWorkspaceId", String(workspaceId));

    set({
      defaultWorkspaceId: workspaceId,
    });
  },

  clearAuth: () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tokenType");
    clearWorkspaceStorage();
    localStorage.removeItem("authUser");
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("tokenType");
    sessionStorage.removeItem("authUser");

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      authUserId: null,
      tokenType: null,
      defaultWorkspaceId: null,
      isLoggedIn: false,
    });
  },
}));
