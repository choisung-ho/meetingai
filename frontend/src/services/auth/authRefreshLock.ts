import type { RefreshResponse } from "../../types/auth.types";

let inFlightRefresh: Promise<RefreshResponse> | null = null;
let logoutInProgress = false;

export function isTokenRefreshing() {
  return inFlightRefresh !== null;
}

export function waitForTokenRefresh() {
  return inFlightRefresh ? inFlightRefresh.then(() => undefined) : Promise.resolve();
}

export function runRefreshOnce(refreshFn: () => Promise<RefreshResponse>) {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = refreshFn().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

export function runLogoutOnce(logoutFn: () => void) {
  if (logoutInProgress) return;

  logoutInProgress = true;
  logoutFn();
}

export function resetLogoutLock() {
  logoutInProgress = false;
}
