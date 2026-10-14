import { create } from "zustand";
import type {
    WorkspaceConnectionStatus,
    WorkspaceUser,
} from "../types/workspace.types";

type WorkspacePresenceStore = {
    workspaceId: number | null;
    status: WorkspaceConnectionStatus;
    users: WorkspaceUser[];
    joinedAt: string | null;
    leftAt: string | null;
    updatedAt: string | null;
    errorMessage: string | null;

    setWorkspaceId: (workspaceId: number | null) => void;
    setStatus: (status: WorkspaceConnectionStatus) => void;
    setUsers: (users: WorkspaceUser[]) => void;
    setJoinedAt: (joinedAt: string | null) => void;
    setLeftAt: (leftAt: string | null) => void;
    setUpdatedAt: (updatedAt: string | null) => void;
    setErrorMessage: (errorMessage: string | null) => void;
    resetWorkspacePresence: () => void;
};

const getUserKey = (user: WorkspaceUser) => String(user.userId);
const isFilledString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;

function mergeUser(previousUser: WorkspaceUser | null, nextUser: WorkspaceUser) {
    const previousName = previousUser?.name;
    const nextName = isFilledString(nextUser.name) ? nextUser.name : undefined;
    const shouldKeepPreviousName =
        previousName &&
        (!nextName || (nextName === "사용자" && previousName !== "사용자"));

    return {
        ...(previousUser ?? nextUser),
        ...nextUser,
        name: shouldKeepPreviousName ? previousName : nextName ?? previousName ?? "사용자",
        email: isFilledString(nextUser.email) ? nextUser.email : previousUser?.email,
        role: nextUser.role ?? previousUser?.role,
        status: nextUser.status ?? "online",
    };
}

function mergeUsers(previousUsers: WorkspaceUser[], nextUsers: WorkspaceUser[]) {
    const nextUserMap = new Map(nextUsers.map((user) => [getUserKey(user), user]));
    const merged = previousUsers.map((user) => {
        const nextUser = nextUserMap.get(getUserKey(user));

        if (!nextUser) {
            return { ...user, status: "offline" as const };
        }

        nextUserMap.delete(getUserKey(user));
        return mergeUser(user, nextUser);
    });

    return [
        ...merged,
        ...Array.from(nextUserMap.values()).map((user) => mergeUser(null, user)),
    ];
}

export const useWorkspacePresenceStore = create<WorkspacePresenceStore>(
    (set) => ({
        workspaceId: null,
        status: "idle",
        users: [],
        joinedAt: null,
        leftAt: null,
        updatedAt: null,
        errorMessage: null,

        setWorkspaceId: (workspaceId) =>
            set((state) => {
                const nextWorkspaceId = workspaceId === null ? null : Number(workspaceId);
                const didWorkspaceChange = state.workspaceId !== nextWorkspaceId;

                return {
                    workspaceId: nextWorkspaceId,
                    ...(didWorkspaceChange ? { users: [] } : {}),
                };
            }),
        setStatus: (status) => set({ status }),
        setUsers: (users) =>
            set((state) => ({
                users: mergeUsers(state.users, users),
            })),
        setJoinedAt: (joinedAt) => set({ joinedAt }),
        setLeftAt: (leftAt) => set({ leftAt }),
        setUpdatedAt: (updatedAt) => set({ updatedAt }),
        setErrorMessage: (errorMessage) => set({ errorMessage }),

        resetWorkspacePresence: () =>
            set({
                workspaceId: null,
                status: "idle",
                users: [],
                joinedAt: null,
                leftAt: null,
                updatedAt: null,
                errorMessage: null,
            }),
    })
);
