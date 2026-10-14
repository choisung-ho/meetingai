import { create } from "zustand";
import type {
    MeetingRoomConnectionStatus,
    MeetingRoomUser,
} from "../types/meetingRoom.types";

/**
 * 회의실 Presence 전역 상태
 * MeetingRoom 계층은 워크스페이스 내부 특정 회의실의 참가자 목록을 관리합니다.
 */
type MeetingRoomPresenceStore = {
    workspaceId: number | null;
    meetingRoomId: number | null;
    status: MeetingRoomConnectionStatus;
    users: MeetingRoomUser[];
    joinedAt: string | null;
    leftAt: string | null;
    updatedAt: string | null;
    errorMessage: string | null;

    setWorkspaceId: (workspaceId: number | null) => void;
    setMeetingRoomId: (meetingRoomId: number | null) => void;
    setStatus: (status: MeetingRoomConnectionStatus) => void;
    setUsers: (users: MeetingRoomUser[]) => void;
    setJoinedAt: (joinedAt: string | null) => void;
    setLeftAt: (leftAt: string | null) => void;
    setUpdatedAt: (updatedAt: string | null) => void;
    setErrorMessage: (errorMessage: string | null) => void;
    resetMeetingRoomPresence: () => void;
};

const getUserKey = (user: MeetingRoomUser) => String(user.userId);
const isFilledString = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0;

function mergeUser(previousUser: MeetingRoomUser | null, nextUser: MeetingRoomUser) {
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

function mergeUsers(previousUsers: MeetingRoomUser[], nextUsers: MeetingRoomUser[]) {
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

export const useMeetingRoomPresenceStore = create<MeetingRoomPresenceStore>(
    (set) => ({
        workspaceId: null,
        meetingRoomId: null,
        status: "idle",
        users: [],
        joinedAt: null,
        leftAt: null,
        updatedAt: null,
        errorMessage: null,

        setWorkspaceId: (workspaceId) =>
            set((state) => {
                const didWorkspaceChange = state.workspaceId !== workspaceId;

                return {
                    workspaceId,
                    ...(didWorkspaceChange ? { users: [] } : {}),
                };
            }),
        setMeetingRoomId: (meetingRoomId) =>
            set((state) => {
                const didMeetingRoomChange = state.meetingRoomId !== meetingRoomId;

                return {
                    meetingRoomId,
                    ...(didMeetingRoomChange ? { users: [] } : {}),
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

        resetMeetingRoomPresence: () =>
            set({
                workspaceId: null,
                meetingRoomId: null,
                status: "idle",
                users: [],
                joinedAt: null,
                leftAt: null,
                updatedAt: null,
                errorMessage: null,
            }),
    })
);
