import { API_BASE_URL } from "../constants/authConfig";
import {
    runLogoutOnce,
    runRefreshOnce,
    waitForTokenRefresh,
} from "./auth/authRefreshLock";
import { refreshWithRefreshToken } from "./auth/authService";
import { useAuthStore } from "../store/authStore";

function getHeaders(options?: RequestInit) {
    const accessToken =
        useAuthStore.getState().accessToken ?? localStorage.getItem("accessToken");
    const hasBody = options?.body != null;
    const isFormData =
        typeof FormData !== "undefined" && options?.body instanceof FormData;

    return {
        ...(hasBody && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers || {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };
}

async function refreshAccessToken() {
    const refreshToken = useAuthStore.getState().refreshToken;

    if (!refreshToken) {
        throw new Error("refreshToken이 없어 세션을 갱신할 수 없습니다.");
    }

    const result = await runRefreshOnce(() => refreshWithRefreshToken(refreshToken));

    useAuthStore.getState().setTokens({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: result.tokenType,
        ...(result.user ? { user: result.user } : {}),
    });
}

export const authorizedFetch = async (
    endpoint: string,
    options?: RequestInit
) => {
    await waitForTokenRefresh();

    const request = () => fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: getHeaders(options),
    });

    let response = await request();

    if (response.status !== 401) {
        return response;
    }

    try {
        await refreshAccessToken();
    } catch (error) {
        runLogoutOnce(() => {
            useAuthStore.getState().clearAuth();
        });

        throw error;
    }

    await waitForTokenRefresh();
    response = await request();

    return response;
};
