type BadgeType = "MEETING" | "AGENDA" | "ALERT" | "TOPIC";

type StatusBadgeProps = {
  status: string;
  type: BadgeType;
};

/**
 * 상태 배지
 *
 * 디자인(모양/색 팔레트)은 UI 원본(frontend 0724)을 그대로 유지하고,
 * 상태값만 실제 백엔드 상태 머신에 맞췄다.
 *
 * - Meeting: READY / ACTIVE / ENDED
 * - Issue:   OPEN / IN_PROGRESS / CLOSED
 * - Alert:   PENDING / ACKNOWLEDGED / RESOLVED / DISMISSED
 * - Topic:   PROPOSED / DECIDED / REVISITED / DROPPED  (Phase 4 재논의 탐지)
 */
const STYLE_BY_STATUS: Record<BadgeType, Record<string, string>> = {
  MEETING: {
    READY: "bg-slate-100 text-slate-500",
    ACTIVE: "bg-indigo-50 text-indigo-600",
    ENDED: "bg-emerald-50 text-emerald-600",
  },
  AGENDA: {
    OPEN: "bg-blue-50 text-blue-600",
    IN_PROGRESS: "bg-amber-50 text-amber-600",
    CLOSED: "bg-emerald-50 text-emerald-600",
  },
  ALERT: {
    PENDING: "bg-rose-50 text-rose-600",
    ACKNOWLEDGED: "bg-amber-50 text-amber-600",
    RESOLVED: "bg-emerald-50 text-emerald-600",
    DISMISSED: "bg-slate-100 text-slate-500",
  },
  TOPIC: {
    PROPOSED: "bg-blue-50 text-blue-600",
    DECIDED: "bg-emerald-50 text-emerald-600",
    REVISITED: "bg-rose-50 text-rose-600",
    DROPPED: "bg-slate-100 text-slate-500",
  },
};

const FALLBACK_STYLE: Record<BadgeType, string> = {
  MEETING: "bg-slate-100 text-slate-500",
  AGENDA: "bg-slate-100 text-slate-600",
  ALERT: "bg-rose-50 text-rose-600",
  TOPIC: "bg-slate-100 text-slate-600",
};

const LABELS: Record<string, string> = {
  // Meeting
  READY: "대기 중",
  ACTIVE: "진행 중",
  ENDED: "종료됨",
  // Issue
  OPEN: "제안됨",
  IN_PROGRESS: "논의 중",
  CLOSED: "승인됨",
  // Alert
  PENDING: "확인 필요",
  ACKNOWLEDGED: "확인 완료",
  RESOLVED: "해결됨",
  DISMISSED: "무시됨",
  // Topic (재논의 탐지)
  PROPOSED: "제안됨",
  DECIDED: "확정됨",
  REVISITED: "재논의됨",
  DROPPED: "보류됨",
};

export const StatusBadge = ({ status, type }: StatusBadgeProps) => {
  const normalized = (status ?? "").toUpperCase();
  const style = STYLE_BY_STATUS[type]?.[normalized] ?? FALLBACK_STYLE[type];
  const label = LABELS[normalized] ?? status;

  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${style}`}>
      {label}
    </span>
  );
};
