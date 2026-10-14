import React from 'react';

// 외부에서 Import 하지 않고 직접 타입을 선언하여 에러 해결
export type SignupPageProps = {
  form: {
    name: string;
    email: string;
    birthDate: string;
    password: string;
    passwordConfirm: string;
    organizationTeamName: string;
    termsAgreed: boolean;
  };
  state: {
    isLoading: boolean;
    errorMessage: string | null;
    fieldErrors?: Record<string, string>;
  };
  actions: {
    changeName: (value: string) => void;
    changeEmail: (value: string) => void;
    changeBirthDate: (value: string) => void;
    changePassword: (value: string) => void;
    changePasswordConfirm: (value: string) => void;
    changeOrganizationTeamName: (value: string) => void;
    changeTermsAgreed: (value: boolean) => void;
    signup: () => void;
    backLogin: () => void;
  };
};

export const SignupPage: React.FC<SignupPageProps> = ({ form, state, actions }) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    actions.signup();
  };

  return (
    <div className="flex min-h-screen w-full font-sans text-slate-900 bg-slate-50 items-center justify-center p-6 lg:p-8 overflow-x-hidden">
      
      {/* 우측 상단 배경 장식 */}
      <div className="absolute right-0 top-0 w-[40rem] h-[40rem] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-[1240px] flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16 z-10">
        
        {/* ========================================= */}
        {/* 좌측: 브랜드 영역, 통계 지표 및 대시보드 (여백 최적화) */}
        {/* ========================================= */}
        <section className="flex w-full lg:w-[640px] shrink-0 flex-col items-start">
          
          <div className="mb-6">
            <img 
              src="/src/assets/logo.png" 
              alt="PICK Logo" 
              className="w-20 h-20 object-contain" 
            />
          </div>

          <h1 className="text-4xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 mb-6 leading-[1.2]">
            회의의 모든 순간에서<br />
            인사이트를 <span className="text-indigo-600">PICK</span>하다.
          </h1>
          <p className="text-base lg:text-lg font-medium text-slate-500 mb-8 leading-relaxed">
            AI가 실시간으로 대화의 결을 분석하고,<br />
            가장 중요한 결정 사항을 도출합니다.
          </p>

          {/* 좌측 통계 지표 영역 */}
          <div className="w-full max-w-[580px] bg-slate-50 rounded-[1.5rem] p-6 mb-8 grid grid-cols-3 gap-4 border border-slate-100/50">
            <div className="flex flex-col items-center text-center space-y-1.5">
              <span className="text-[30px] font-black text-indigo-600 tracking-tighter">30% ↓</span>
              <p className="text-[20px] font-bold text-slate-900">회의 시간 단축</p>
              <p className="text-[15px] font-medium text-slate-500">AI 요약 기반의<br/>빠른 의사결정</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-1.5">
              <span className="text-[30px] font-black text-emerald-500 tracking-tighter">2.5x ↑</span>
              <p className="text-[20px] font-bold text-slate-900">팀 생산성 향상</p>
              <p className="text-[15px] font-medium text-slate-500">불필요한 기록 업무<br/>완전 자동화</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-1.5">
              <span className="text-[30px] font-black text-rose-500 tracking-tighter">100%</span>
              <p className="text-[20px] font-bold text-slate-900">인사이트 도출</p>
              <p className="text-[15px] font-medium text-slate-500">데이터 기반의<br/>핵심 안건 추출</p>
            </div>
          </div>

          {/* 좌측 대시보드 요약 뷰 */}
          <div className="w-full rounded-[2rem] bg-white p-8 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100">
            <div className="flex justify-between items-center mb-8 pb-4">
              <span className="text-lg font-bold text-slate-900">대시보드 요약</span>
              <div className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full font-bold">이번 주 ▼</div>
            </div>
            
            <div className="grid grid-cols-4 gap-6 mb-8 text-center">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400">진행 중</p>
                <p className="text-3xl font-black text-indigo-600">3</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400">승인됨</p>
                <p className="text-3xl font-black text-emerald-500">12</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400">알림</p>
                <p className="text-3xl font-black text-rose-500">5</p>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-slate-400">보류</p>
                <p className="text-3xl font-black text-amber-500">2</p>
              </div>
            </div>

            <div className="flex gap-8 pt-4">
              <div className="flex-1 space-y-3">
                <p className="text-xs font-bold text-slate-400">최근 업데이트</p>
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">프로젝트 전략</span>
                    <span className="text-emerald-500 font-bold">완료</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">로드맵 확정</span>
                    <span className="text-emerald-500 font-bold">완료</span>
                  </div>
                </div>
              </div>
              <div className="w-16 flex items-center justify-center">
                <div className="h-12 w-12 rounded-full border-[5px] border-slate-50 border-t-indigo-500 border-r-emerald-400" />
              </div>
            </div>
          </div>
        </section>

        {/* ========================================= */}
        {/* 우측: 회원가입 폼 영역 (로그인 링크 내부 통합) */}
        {/* ========================================= */}
        <section className="flex w-full lg:w-[460px] shrink-0 flex-col relative">
          
          <div className="w-full bg-gradient-to-b from-white to-slate-50/30 p-8 sm:p-10 rounded-[2.5rem] shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)] border border-slate-100 z-10">
            
            <div className="space-y-1.5 mb-8 -ml-1">
              <h2 className="text-3xl font-black tracking-tight text-slate-900">회원가입</h2>
              <p className="text-xs font-bold text-slate-400 ml-0.5 tracking-tight">PICK 계정을 생성해보세요.</p>
            </div>

            {state.errorMessage && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="text-xs font-bold text-rose-600">{state.errorMessage}</p>
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">이름</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  </div>
                  <input type="text" required value={form.name} onChange={(e) => actions.changeName(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-4 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="이름을 입력하세요" />
                </div>
                {state.fieldErrors?.name && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">{state.fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">이메일</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  </div>
                  <input type="email" required value={form.email} onChange={(e) => actions.changeEmail(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-4 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="이메일을 입력하세요" />
                </div>
                {state.fieldErrors?.email && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">{state.fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">생년월일</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                  </div>
                  <input type="text" required value={form.birthDate} onChange={(e) => actions.changeBirthDate(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-4 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="YYYY-MM-DD 형식으로 입력하세요" />
                </div>
                {state.fieldErrors?.birth_date && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">{state.fieldErrors.birth_date}</p>
                )}
                <p className="text-[10px] font-bold text-slate-400 ml-2">예: 1990-01-01</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">비밀번호</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  </div>
                  <input type="password" required value={form.password} onChange={(e) => actions.changePassword(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-10 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="비밀번호를 입력하세요" />
                  <div className="absolute right-4 text-slate-300 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
                </div>
                {state.fieldErrors?.password && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">{state.fieldErrors.password}</p>
                )}
                <p className="text-[10px] font-bold text-slate-400 ml-2">8자 이상, 영문, 숫자, 특수문자를 포함해주세요.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">비밀번호 확인</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  </div>
                  <input type="password" required value={form.passwordConfirm} onChange={(e) => actions.changePasswordConfirm(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-10 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="비밀번호를 다시 입력하세요" />
                  <div className="absolute right-4 text-slate-300 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </div>
                </div>
                {(state.fieldErrors?.password_confirm || state.fieldErrors?.passwordConfirm) && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">
                    {state.fieldErrors.password_confirm ?? state.fieldErrors.passwordConfirm}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-800 ml-1 block">조직 / 팀 이름 (선택)</label>
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><path d="M9 22v-4h6v4"></path><path d="M8 6h.01"></path><path d="M16 6h.01"></path><path d="M12 6h.01"></path><path d="M12 10h.01"></path><path d="M12 14h.01"></path><path d="M16 10h.01"></path><path d="M16 14h.01"></path><path d="M8 10h.01"></path><path d="M8 14h.01"></path></svg>
                  </div>
                  <input type="text" value={form.organizationTeamName} onChange={(e) => actions.changeOrganizationTeamName(e.target.value)} className="block w-full border border-slate-200 rounded-xl bg-white py-3 pl-11 pr-4 text-xs font-medium focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all placeholder-slate-300" placeholder="조직 또는 팀 이름을 입력하세요" />
                </div>
                {(state.fieldErrors?.organization_team_name || state.fieldErrors?.organizationTeamName) && (
                  <p className="text-[10px] font-bold text-rose-500 ml-2">
                    {state.fieldErrors.organization_team_name ?? state.fieldErrors.organizationTeamName}
                  </p>
                )}
                <p className="text-[10px] font-bold text-slate-400 ml-2">생성하신 조직이 기본으로 설정됩니다.</p>
              </div>

              <div className="pt-2 pb-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input type="checkbox" required checked={form.termsAgreed} onChange={(e) => actions.changeTermsAgreed(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" />
                    <span className="text-[11px] font-bold text-slate-600 group-hover:text-indigo-900 transition-colors">이용약관 및 개인정보처리방침에 동의합니다.</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button type="submit" disabled={state.isLoading} className="w-full bg-[#5b5ee6] py-3.5 text-sm font-bold text-white hover:bg-indigo-700 transition-all rounded-xl shadow-lg shadow-indigo-100 disabled:opacity-50">
                  {state.isLoading ? '처리 중...' : '회원가입'}
                </button>

                <button type="button" className="flex w-full justify-center items-center gap-2 border border-slate-200 bg-white py-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all rounded-xl">
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-3.5 h-3.5" />
                  Google 계정으로 가입
                </button>
              </div>

            </form>

            {/* 폼 밖에서 떠돌던 로그인 링크를 폼 하단 내부로 이동 */}
            <p className="text-center text-[11px] font-bold text-slate-400 mt-6 pt-6 border-t border-slate-100">
              이미 계정이 있으신가요? <button type="button" onClick={actions.backLogin} className="text-indigo-600 font-bold hover:underline ml-1">로그인</button>
            </p>

          </div>
        </section>
      </div>
    </div>
  );
};
