import { AppIcon } from "./AppIcon";

type EmptyViewProps = {
  /** AppIcon 아이콘 이름 (예: clipboard, calendar, bell, users) */
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * 빈 상태 화면 (회의 없음 / 이슈 없음 / 알림 없음 / 멤버 없음)
 *
 * 디자인은 UI 원본(frontend 0724)을 그대로 유지했다.
 * 원본은 FontAwesome(fa-solid)을 썼지만 이 앱에는 FontAwesome이 없어
 * 아이콘만 통합 앱의 AppIcon(인라인 SVG)으로 연결했다.
 */
export const EmptyView = ({
  icon = "clipboard",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyViewProps) => {
  return (
    <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 animate-in fade-in duration-200">
      <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center mb-4">
        <AppIcon src={icon} alt="" className="w-6 h-6 text-slate-300" />
      </div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">{title}</h3>
      <p className="text-xs font-medium text-slate-400 mb-6 max-w-[250px] leading-relaxed">
        {description}
      </p>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-5 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
