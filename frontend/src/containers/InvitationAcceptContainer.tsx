import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  acceptInvitationByToken,
  getWorkspaces,
} from "../services/workspaceService";
import { useAuthStore } from "../store/authStore";

export function InvitationAcceptContainer() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setDefaultWorkspaceId = useAuthStore((state) => state.setDefaultWorkspaceId);
  const [message, setMessage] = useState("초대 링크를 확인하는 중입니다.");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const token = searchParams.get("token")?.trim();

    const acceptInvitation = async () => {
      if (!token) {
        setErrorMessage("초대 token이 없습니다.");
        setMessage("초대 링크를 수락할 수 없습니다.");
        return;
      }

      try {
        setIsAccepting(true);
        setErrorMessage(null);

        const result = await acceptInvitationByToken(token);
        const workspaceId = Number(result.workspaceId);

        await getWorkspaces();
        setDefaultWorkspaceId(workspaceId);
        localStorage.setItem("lastWorkspaceId", String(workspaceId));
        setMessage("초대를 수락했습니다. 워크스페이스로 이동합니다.");
        navigate(`/dashboard?workspaceId=${workspaceId}`, { replace: true });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "초대 링크 수락에 실패했습니다."
        );
        setMessage("초대 링크를 수락할 수 없습니다.");
      } finally {
        setIsAccepting(false);
      }
    };

    acceptInvitation();
  }, [navigate, searchParams, setDefaultWorkspaceId]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 px-6 font-sans text-slate-900">
      <section className="w-full max-w-[440px] rounded-[2.5rem] border border-slate-100 bg-white p-10 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)]">
        <div className="mb-8">
          <img
            src="/src/assets/logo.png"
            alt="PICK Logo"
            className="h-16 w-16 object-contain"
          />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          초대 수락
        </h1>
        <p className="mt-3 text-sm font-bold text-slate-500">{message}</p>
        {errorMessage && (
          <p className="mt-5 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-600">
            {errorMessage}
          </p>
        )}
        {errorMessage && (
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="mt-8 w-full rounded-2xl bg-[#5b5ee6] py-4 text-base font-bold text-white shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700"
          >
            로그인으로 이동
          </button>
        )}
        {!errorMessage && (
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full bg-indigo-600 ${
                isAccepting ? "w-2/3" : "w-full"
              } transition-all`}
            />
          </div>
        )}
      </section>
    </div>
  );
}
