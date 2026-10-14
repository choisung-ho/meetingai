import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export type ToastState = {
  message: string;
  type: ToastType;
  isVisible: boolean;
};

type ToastStore = {
  toast: ToastState | null;
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  hideToast: () => void;
};

const DEFAULT_DURATION_MS = 2800;
const EXIT_ANIMATION_MS = 300;

let visibilityTimer: ReturnType<typeof setTimeout> | null = null;
let removeTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers() {
  if (visibilityTimer !== null) {
    clearTimeout(visibilityTimer);
    visibilityTimer = null;
  }

  if (removeTimer !== null) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }
}

/**
 * 전역 Toast 상태
 *
 * 사용처:
 * - 초대 성공 / 권한 변경 / 저장 실패 / 연결 복구 안내
 *
 * 동작:
 * - showToast 호출 시 즉시 노출되고, durationMs 후 사라지는 애니메이션을 거쳐 제거된다.
 * - 연속 호출 시 이전 타이머를 정리해 마지막 메시지만 남는다.
 */
export const useToastStore = create<ToastStore>((set) => ({
  toast: null,

  showToast: (message, type = "info", durationMs = DEFAULT_DURATION_MS) => {
    clearTimers();

    set({ toast: { message, type, isVisible: true } });

    visibilityTimer = setTimeout(() => {
      set((state) =>
        state.toast ? { toast: { ...state.toast, isVisible: false } } : state
      );

      removeTimer = setTimeout(() => {
        set({ toast: null });
      }, EXIT_ANIMATION_MS);
    }, durationMs);
  },

  hideToast: () => {
    clearTimers();
    set({ toast: null });
  },
}));

/**
 * React 외부(서비스 계층, 소켓 콜백)에서도 토스트를 띄우기 위한 헬퍼
 */
export const showToast = (
  message: string,
  type: ToastType = "info",
  durationMs = DEFAULT_DURATION_MS
) => useToastStore.getState().showToast(message, type, durationMs);
