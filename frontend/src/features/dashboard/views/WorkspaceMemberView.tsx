import type { WorkspaceMember, WorkspaceRole } from "../../../types/workspace.types";
import { EmptyView } from "../../../shared/ui/EmptyView";
import { ErrorView } from "../../../shared/ui/ErrorView";
import { INVITABLE_WORKSPACE_ROLES } from "../../../constants/workspaceRoles";

type ManageableRole = Exclude<WorkspaceRole, "OWNER">;

export type WorkspaceMemberViewProps = {
  currentUserId: number | null;
  members: WorkspaceMember[];
  /** OWNER / ADMIN만 초대·권한변경·제거가 가능하다 */
  canManage: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  inviteForm: {
    email: string;
    role: ManageableRole;
    isSubmitting: boolean;
    errorMessage: string | null;
  };
  actions: {
    changeInviteEmail: (email: string) => void;
    changeInviteRole: (role: ManageableRole) => void;
    sendInvite: () => void;
    changeMemberRole: (targetUserId: number, role: ManageableRole) => void;
    removeMember: (targetUserId: number) => void;
    retry: () => void;
  };
};

/**
 * 워크스페이스 멤버 관리 화면
 *
 * 디자인은 UI 원본(frontend 0724 WorkspaceMemberView)을 그대로 유지하고,
 * role 값만 실제 백엔드 권한 체계(OWNER/ADMIN/MEMBER)에 맞춰 연결했다.
 *
 * 권한 정책(서버와 동일):
 * - OWNER/ADMIN만 초대·권한변경·제거 버튼이 보인다.
 * - 본인과 OWNER는 권한 변경/제거 대상에서 제외한다.
 */
export const WorkspaceMemberView = ({
  currentUserId,
  members,
  canManage,
  isLoading,
  errorMessage,
  inviteForm,
  actions,
}: WorkspaceMemberViewProps) => {
  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm animate-in fade-in duration-200">
        <div className="text-center py-12 text-sm font-bold text-slate-400">로딩 중...</div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm animate-in fade-in duration-200">
        <ErrorView message={errorMessage} onRetry={actions.retry} />
      </div>
    );
  }

  return (
    <div className="w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-sm animate-in fade-in duration-200">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">멤버 관리</h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            워크스페이스에 팀원을 초대하고 권한을 관리하세요.
          </p>
        </div>
      </div>

      {canManage && (
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
          <h3 className="text-sm font-bold text-slate-800 mb-4">새 멤버 초대</h3>
          <div className="flex gap-3">
            <input
              type="email"
              value={inviteForm.email}
              onChange={(event) => actions.changeInviteEmail(event.target.value)}
              placeholder="초대할 팀원의 이메일 주소"
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <select
              value={inviteForm.role}
              onChange={(event) =>
                actions.changeInviteRole(event.target.value as ManageableRole)
              }
              className="bg-white border border-slate-200 rounded-xl px-4 text-sm font-bold text-slate-700 focus:outline-none"
            >
              {INVITABLE_WORKSPACE_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.value}
                </option>
              ))}
            </select>
            <button
              onClick={actions.sendInvite}
              disabled={inviteForm.isSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors"
            >
              {inviteForm.isSubmitting ? "전송 중..." : "초대보내기"}
            </button>
          </div>
          {inviteForm.errorMessage && (
            <p className="text-xs font-bold text-rose-500 mt-3">{inviteForm.errorMessage}</p>
          )}
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-4">
          참여 중인 팀원 ({members.length})
        </h3>

        {members.length === 0 ? (
          <EmptyView
            icon="users"
            title="참여 중인 멤버가 없습니다."
            description="팀원을 초대하면 이곳에 표시됩니다."
          />
        ) : (
          <div className="border border-slate-100 rounded-2xl overflow-hidden">
            {members.map((member) => {
              const isMe = currentUserId !== null && member.userId === currentUserId;
              const isOwner = member.role === "OWNER";
              const canEditThisMember = canManage && !isMe && !isOwner;

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 border-b border-slate-100 last:border-0 bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-sm font-black text-slate-500">
                      {member.name?.trim().charAt(0) || "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800">{member.name}</p>
                        {isMe && (
                          <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded font-black">
                            나
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-400">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {canEditThisMember ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(event) =>
                            actions.changeMemberRole(
                              member.userId,
                              event.target.value as ManageableRole
                            )
                          }
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none"
                        >
                          {INVITABLE_WORKSPACE_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.value}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => actions.removeMember(member.userId)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                        >
                          추방
                        </button>
                      </>
                    ) : (
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          member.role === "OWNER"
                            ? "bg-indigo-50 text-indigo-600"
                            : member.role === "ADMIN"
                              ? "bg-blue-50 text-blue-600"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {member.role}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
