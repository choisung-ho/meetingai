import { WORKSPACE_ROLE_LABEL } from '../../constants/workspaceRoles';
import type { WorkspaceRole } from '../../types/workspace.types';

export type PresenceUser = {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  role?: WorkspaceRole;
  avatarUrl?: string;
  teamName?: string;
  status?: string;
  isOnline?: boolean;
};

type UserStackProps = {
  users: PresenceUser[];
  currentUser?: {
    id: string;
    userId?: string;
    name: string;
    email?: string;
    role?: WorkspaceRole;
    avatarUrl?: string;
    teamName?: string;
  };
  maxVisible?: number;
  size?: 'sm' | 'md';
  className?: string;
};

const sizeClass = {
  sm: 'h-6 w-6 text-[9px]',
  md: 'h-8 w-8 text-[11px]',
};

const getUserKey = (user: PresenceUser) => String(user.userId ?? user.id);
const getInitial = (name: string) => name.trim().charAt(0) || '?';
const isUserOnline = (user: PresenceUser) =>
  user.isOnline ?? user.status === 'online';

const getUniqueUsers = (
  users: PresenceUser[],
  currentUser?: UserStackProps['currentUser']
) => {
  const userMap = new Map<string, PresenceUser>();
  const currentUserKey = currentUser ? String(currentUser.userId ?? currentUser.id) : null;

  users.forEach((user) => {
    const key = getUserKey(user);
    const nextUser =
      currentUserKey === key
        ? {
            ...user,
            ...currentUser,
            id: user.id,
            userId: user.userId,
            isOnline: user.isOnline,
            status: user.status,
          }
        : user;
    const previous = userMap.get(key);

    if (!previous || (!isUserOnline(previous) && isUserOnline(nextUser))) {
      userMap.set(key, nextUser);
    }
  });

  return Array.from(userMap.values()).sort((left, right) => {
    const leftOnline = isUserOnline(left) ? 0 : 1;
    const rightOnline = isUserOnline(right) ? 0 : 1;
    return leftOnline - rightOnline || left.name.localeCompare(right.name);
  });
};

const getRoleLabel = (role?: WorkspaceRole) =>
  role ? WORKSPACE_ROLE_LABEL[role] : null;

export const UserStack = ({
  users,
  currentUser,
  size = 'md',
  className = '',
}: UserStackProps) => {
  const orderedUsers = getUniqueUsers(users, currentUser);
  const visibleUsers = orderedUsers.slice(0, 3);
  const hiddenUserCount = Math.max(orderedUsers.length - 3, 0);

  if (orderedUsers.length === 0) {
    return (
      <div className={`relative flex items-center ${className}`}>
        <div className={`${sizeClass[size]} flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-400`}>
          0
        </div>
      </div>
    );
  }

  return (
    <div className={`group/user-stack relative flex items-center -space-x-2 ${className}`}>
      {visibleUsers.map((user) => {
        const isOnline = isUserOnline(user);

        return (
          <div
            key={getUserKey(user)}
            className={`${sizeClass[size]} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-slate-100 font-black shadow-sm transition ${isOnline ? 'z-10 border-emerald-300 text-indigo-600 opacity-100' : 'border-white text-slate-500 opacity-40 grayscale'}`}
            aria-label={`${user.name} ${isOnline ? '온라인' : '오프라인'}`}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true">{getInitial(user.name)}</span>
            )}
            {isOnline && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-500" />
            )}
          </div>
        );
      })}

      {hiddenUserCount > 0 && (
        <div className={`${sizeClass[size]} relative z-20 flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-slate-100 px-2 text-[10px] font-black text-slate-600 shadow-sm`}>
          +{hiddenUserCount}명
        </div>
      )}

      <UsersHoverCard users={orderedUsers} />
    </div>
  );
};

const UsersHoverCard = ({ users }: { users: PresenceUser[] }) => (
  <div
    onClick={(event) => event.stopPropagation()}
    className="invisible absolute right-0 top-[calc(100%+12px)] z-50 w-[280px] translate-y-1 rounded-2xl border border-slate-200 bg-white p-3 text-left text-slate-900 opacity-0 shadow-[0_24px_70px_rgba(15,23,42,0.18)] transition duration-150 group-hover/user-stack:visible group-hover/user-stack:translate-y-0 group-hover/user-stack:opacity-100 group-focus-within/user-stack:visible group-focus-within/user-stack:translate-y-0 group-focus-within/user-stack:opacity-100"
  >
    <div aria-hidden="true" className="absolute -top-3 left-0 h-3 w-full" />
    <div className="mb-2 flex items-center justify-between px-1">
      <p className="text-[12px] font-black text-slate-700">참여자</p>
      <p className="text-[11px] font-bold text-slate-400">{users.length}명</p>
    </div>
    <div className="max-h-[320px] space-y-1 overflow-y-auto">
      {users.map((user) => {
        const isOnline = isUserOnline(user);
        const roleLabel = getRoleLabel(user.role);

        return (
          <div key={getUserKey(user)} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
            <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-slate-100 text-sm font-black ${isOnline ? 'border-emerald-200 text-indigo-600 opacity-100' : 'border-slate-200 text-slate-500 opacity-40 grayscale'}`}>
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{getInitial(user.name)}</span>
              )}
              {isOnline && (
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-white bg-emerald-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`truncate text-sm font-black ${isOnline ? 'text-slate-900' : 'text-slate-400'}`}>{user.name}</p>
                {roleLabel && (
                  <span className="shrink-0 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">
                    {roleLabel}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                {isOnline ? '온라인' : '오프라인'}
                {user.email ? ` · ${user.email}` : ''}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);
