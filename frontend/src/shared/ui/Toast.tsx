import { useToastStore } from "../../store/toastStore";

/**
 * 전역 Toast
 *
 * 디자인은 UI 원본(frontend 0724)을 그대로 유지하고,
 * 데이터 소스만 통합 앱의 toastStore로 연결했다.
 */
export const Toast = () => {
  const toast = useToastStore((state) => state.toast);

  // toast 데이터가 null일 때는 아예 렌더링하지 않음
  if (!toast) return null;

  return (
    <div
      className={`fixed bottom-8 right-8 px-5 py-3.5 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] border text-[13px] font-bold flex items-center gap-3 transition-all duration-300 z-[9999]
      ${toast.isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}
      ${
        toast.type === "success"
          ? "bg-emerald-50 text-emerald-600 border-emerald-100"
          : toast.type === "error"
            ? "bg-rose-50 text-rose-600 border-rose-100"
            : "bg-indigo-50 text-indigo-600 border-indigo-100"
      }`}
      role="status"
      aria-live="polite"
    >
      {toast.type === "success" && <span className="text-lg">✅</span>}
      {toast.type === "error" && <span className="text-lg">🚨</span>}
      {toast.type === "info" && <span className="text-lg">🔔</span>}
      {toast.message}
    </div>
  );
};
