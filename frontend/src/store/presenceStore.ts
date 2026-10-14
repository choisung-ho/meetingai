import { create } from "zustand";
import type {
    ConnectedCollaborationUser,
    PresenceStatus,
} from "../types/collaborationUser.types";
import type { SocketErrorPayload } from "../types/socket.types";

type PresenceStore = {
    status: PresenceStatus;
    currentUser: ConnectedCollaborationUser | null;
    lastServerTime: string | null;
    error: SocketErrorPayload | null;

    setStatus: (status: PresenceStatus) => void;
    setCurrentUser: (user: ConnectedCollaborationUser | null) => void;
    setLastServerTime: (serverTime: string | null) => void;
    setError: (error: SocketErrorPayload | null) => void;
    reset: () => void;
};

export const usePresenceStore = create<PresenceStore>((set) => ({
    status: "idle",
    currentUser: null,
    lastServerTime: null,
    error: null,

    setStatus: (status) => set({ status }),
    setCurrentUser: (currentUser) => set({ currentUser }),
    setLastServerTime: (lastServerTime) => set({ lastServerTime }),
    setError: (error) => set({ error }),

    reset: () =>
        set({
            status: "idle",
            currentUser: null,
            lastServerTime: null,
            error: null,
        }),
}));