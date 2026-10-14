import { useState } from "react";
import type { SettingsPageProps } from "../types/meeting.types";

export function SettingsPage({ user, actions }: SettingsPageProps) {
  const [notice, setNotice] = useState<string | null>(null);

  const copyEmail = async () => {
    if (!user.email) return;
    try {
      await navigator.clipboard?.writeText(user.email);
      setNotice("이메일 주소를 복사했습니다.");
    } catch {
      setNotice("현재 환경에서는 이메일을 복사할 수 없습니다.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f8faff] px-5 py-8 text-slate-800 sm:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-500">PICK</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">설정</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">계정과 앱 환경을 확인합니다.</p>
          </div>
          <button type="button" onClick={actions.backDashboard} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 shadow-sm hover:bg-slate-50">대시보드</button>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white">{user.name.slice(0, 1) || "P"}</div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-slate-900">{user.name}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">{user.teamName || "소속 팀 미설정"}</p>
            </div>
            <span className="ml-auto rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-600">{user.role === "admin" ? "관리자" : "멤버"}</span>
          </div>

          <div className="grid gap-4 py-6 sm:grid-cols-2">
            <InfoRow label="계정 ID" value={user.id || "-"} />
            <InfoRow label="이메일" value={user.email || "-"} action={user.email ? copyEmail : undefined} />
            <InfoRow label="권한" value={user.role === "admin" ? "관리자" : "멤버"} />
            <InfoRow label="팀" value={user.teamName || "-"} />
          </div>

          {notice && <p className="mb-5 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">{notice}</p>}

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6">
            <button type="button" onClick={actions.logout} className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-black text-rose-600 hover:bg-rose-100">로그아웃</button>
          </div>
        </section>
      </div>
    </main>
  );
}

const InfoRow = ({ label, value, action }: { label: string; value: string; action?: () => void }) => (
  <div className="rounded-2xl bg-slate-50 px-4 py-4">
    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</p>
    <div className="mt-1 flex items-center justify-between gap-3">
      <p className="truncate text-sm font-black text-slate-700">{value}</p>
      {action && <button type="button" onClick={action} className="shrink-0 text-xs font-black text-indigo-600 hover:text-indigo-700">복사</button>}
    </div>
  </div>
);
