import React, { useState } from "react";
import type { LoginPageProps } from "../types/meeting.types";

export const LoginPage: React.FC<LoginPageProps> = ({
  form,
  state,
  actions,
}) => {
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState("한국어");
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  return (
<div className="w-screen min-h-screen bg-slate-50 flex items-center justify-center overflow-auto">
      <div className="w-full max-w-7xl flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 xl:gap-28">
        <section className="flex w-full lg:w-[740px] shrink-0 flex-col items-start">
          <div className="mb-4">
            <img
              src="/src/assets/logo.png"
              alt="PICK Logo"
              className="w-24 h-24 object-contain"
            />
          </div>

          <h1 className="text-5xl lg:text-[4rem] font-bold tracking-tight text-slate-900 mb-8 leading-[1.25]">
            회의의 모든 순간에서
            <br />
            인사이트를 <span className="text-indigo-600">PICK</span>하다.
          </h1>

          <p className="text-lg lg:text-xl font-medium text-slate-500 mb-14 leading-relaxed">
            AI가 실시간으로 대화의 결을 분석하고,
            <br />
            가장 중요한 결정 사항을 도출합니다.
          </p>

          <div className="w-full rounded-[2.5rem] bg-white p-12 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100">
            <div className="flex justify-between items-center mb-10 pb-4">
              <span className="text-xl font-bold text-slate-900">
                대시보드 요약
              </span>
              <div className="text-sm text-slate-500 bg-slate-50 px-4 py-2 rounded-full font-bold">
                이번 주 ▼
              </div>
            </div>

            <div className="grid grid-cols-4 gap-8 mb-10 text-center">
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">진행 중</p>
                <p className="text-4xl font-black text-indigo-600">3</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">승인됨</p>
                <p className="text-4xl font-black text-emerald-500">12</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">알림</p>
                <p className="text-4xl font-black text-rose-500">5</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-400">보류</p>
                <p className="text-4xl font-black text-amber-500">2</p>
              </div>
            </div>

            <div className="flex gap-10 pt-6">
              <div className="flex-1 space-y-4">
                <p className="text-sm font-bold text-slate-400">
                  최근 업데이트
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700">
                      프로젝트 전략
                    </span>
                    <span className="text-emerald-500 font-bold">완료</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-700">
                      로드맵 확정
                    </span>
                    <span className="text-emerald-500 font-bold">완료</span>
                  </div>
                </div>
              </div>

              <div className="w-20 flex items-center justify-center">
                <div className="h-16 w-16 rounded-full border-[6px] border-slate-50 border-t-indigo-500 border-r-emerald-400" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex w-full lg:w-[440px] shrink-0 flex-col items-center justify-center relative">
          <div className="w-full bg-gradient-to-b from-white to-slate-50/30 p-10 sm:p-12 rounded-[3rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)] border border-slate-100 z-10 relative">
            <div className="flex justify-end mb-8 relative">
              <div
                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 cursor-pointer hover:text-slate-700 transition-colors bg-white border border-slate-100 px-3 py-1.5 rounded-full shadow-sm"
                onClick={() => setIsLangOpen(!isLangOpen)}
              >
                <span className="text-amber-400/80">☀️</span>
                <span>{currentLang}</span>
                <span className="text-[8px] ml-0.5">
                  {isLangOpen ? "▲" : "▼"}
                </span>
              </div>

              {isLangOpen && (
                <div className="absolute top-full mt-2 right-0 w-28 bg-white border border-slate-100 rounded-2xl shadow-xl py-2 z-50 overflow-hidden">
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${
                      currentLang === "한국어"
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
                    }`}
                    onClick={() => {
                      setCurrentLang("한국어");
                      setIsLangOpen(false);
                    }}
                  >
                    🇰🇷 한국어
                  </button>

                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${
                      currentLang === "English"
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
                    }`}
                    onClick={() => {
                      setCurrentLang("English");
                      setIsLangOpen(false);
                    }}
                  >
                    🇺🇸 English
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1.5 mb-10 -ml-1">
              <p className="text-xs font-bold text-slate-400 ml-0.5 tracking-tight">
                AI 회의 분석의 시작
              </p>
              <h2 className="text-4xl font-black tracking-tight text-slate-900">
                로그인
              </h2>
            </div>

            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                actions.login();
              }}
            >
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-500 ml-1 block mb-2 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(event) =>
                      actions.changeEmail(event.target.value)
                    }
                    className="block w-full border border-slate-200 rounded-2xl bg-white py-4 px-5 text-sm font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all placeholder-slate-300"
                    placeholder="Email"
                  />
                  {state.fieldErrors?.email && (
                    <p className="mt-2 text-xs font-bold text-rose-500">
                      {state.fieldErrors.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 ml-1 block mb-2 uppercase tracking-wider">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={form.password}
                    onChange={(event) =>
                      actions.changePassword(event.target.value)
                    }
                    className="block w-full border border-slate-200 rounded-2xl bg-white py-4 px-5 text-sm font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all placeholder-slate-300"
                    placeholder="Password"
                  />
                  {state.fieldErrors?.password && (
                    <p className="mt-2 text-xs font-bold text-rose-500">
                      {state.fieldErrors.password}
                    </p>
                  )}
                </div>
              </div>

              {state.errorMessage && (
                <p className="text-xs font-bold text-rose-500">
                  {state.errorMessage}
                </p>
              )}

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-slate-800 transition-colors">
                    로그인 유지
                  </span>
                </label>

                <button
                  type="button"
                  className="text-xs font-bold text-indigo-600 hover:underline"
                  onClick={() => setAuthNotice("비밀번호 재설정은 관리자에게 문의해 주세요.")}
                >
                  비밀번호 찾기
                </button>
              </div>

              {authNotice && (
                <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600" role="status">
                  {authNotice}
                </p>
              )}

              <div className="space-y-3 pt-4">
                <button
                  type="submit"
                  disabled={state.isLoading}
                  className="w-full bg-[#5b5ee6] py-4.5 text-base font-bold text-white hover:bg-indigo-700 transition-all rounded-2xl shadow-xl shadow-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {state.isLoading ? "로그인 중..." : "로그인"}
                </button>

                <button
                  type="button"
                  disabled
                  title="Google 로그인은 OAuth 설정 후 사용할 수 있습니다."
                  className="flex w-full justify-center items-center gap-3 border border-slate-200 bg-white py-4.5 text-base font-bold text-slate-700 hover:bg-slate-50 transition-all rounded-2xl disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <img
                    src="https://www.google.com/favicon.ico"
                    alt="Google"
                    className="w-5 h-5"
                  />
                  Google로 계속하기 (준비 중)
                </button>
              </div>
            </form>

            <p className="text-center text-xs font-bold text-slate-400 mt-10">
              계정이 없으신가요?
              <button
                type="button"
                onClick={actions.moveSignup}
                className="text-indigo-600 font-bold hover:underline ml-1"
              >
                회원가입
              </button>
            </p>
          </div>

          <div className="w-full grid grid-cols-3 gap-4 mt-8 px-2">
            <div className="flex flex-col items-center text-center space-y-2">
              <span className="text-xl font-black text-indigo-600 tracking-tighter">
                30% ↓
              </span>
              <p className="text-[11px] font-bold text-slate-900">
                회의 시간 단축
              </p>
              <p className="text-[9px] font-medium text-slate-500">
                AI 요약 기반의
                <br />
                빠른 의사결정
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-2">
              <span className="text-xl font-black text-emerald-500 tracking-tighter">
                2.5x ↑
              </span>
              <p className="text-[11px] font-bold text-slate-900">
                팀 생산성 향상
              </p>
              <p className="text-[9px] font-medium text-slate-500">
                불필요한 기록 업무
                <br />
                완전 자동화
              </p>
            </div>

            <div className="flex flex-col items-center text-center space-y-2">
              <span className="text-xl font-black text-rose-500 tracking-tighter">
                100%
              </span>
              <p className="text-[11px] font-bold text-slate-900">
                인사이트 도출
              </p>
              <p className="text-[9px] font-medium text-slate-500">
                데이터 기반의
                <br />
                핵심 안건 추출
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
