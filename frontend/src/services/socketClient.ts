import type {
    ClientSocketMessage,
    ServerSocketMessage,
} from "../types/socket.types";

export function createRequestId(prefix = "req"): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSocket(
    url: string,
    accessToken: string
): WebSocket {
    return new WebSocket(
        `${url}?token=${encodeURIComponent(accessToken)}`
    );
}

export function sendSocketMessage(
    socket: WebSocket | null,
    message: ClientSocketMessage
): void {
    if (!socket) {
        throw new Error("WebSocket 인스턴스가 없습니다.");
    }

    if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket이 OPEN 상태가 아닙니다.");
    }

    socket.send(JSON.stringify(message));
}

export function parseSocketMessage(event: MessageEvent): ServerSocketMessage | null {
    try {
        const data = JSON.parse(event.data);

        if (!data || typeof data !== "object") {
            return null;
        }

        if (!("type" in data) || !("payload" in data)) {
            return null;
        }

        return data as ServerSocketMessage;
    } catch {
        return null;
    }
}