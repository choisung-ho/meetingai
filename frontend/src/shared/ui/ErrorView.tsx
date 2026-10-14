import { AppIcon } from "./AppIcon";

type ErrorViewProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** AppIcon 아이콘 이름 */
  icon?: string;
};

/**
 * 오류 화면 (API 실패 / 권한 없음 / WebSocket 연결 끊김)
 *
 * 디자인은 UI 원본(frontend 0724)을 그대로 유지했다.
 * 원본의 FontAwesome 아이콘만 통합 앱의 AppIcon(인라인 SVG)으로 연결했다.
 */
export const ErrorView = ({
  title = "오류가 발생했습니다",
  message,
  onRetry,
  icon = "alert",
}: ErrorViewProps) => {
  return (
    <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center bg-rose-50/30 rounded-2xl border border-rose-100 animate-in fade-in duration-200">
      <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-rose-100 flex items-center justify-center mb-4 text-rose-500">
        <AppIcon src={icon} alt="" className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-rose-800 mb-1">{title}</h3>
      <p className="text-xs font-medium text-rose-500/70 mb-6 max-w-[250px] leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="bg-rose-500 hover:bg-rose-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm active:scale-95"
        >
          다시 시도
        </button>
      )}
    </div>
  );
};
