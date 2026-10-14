import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, meeting_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[meeting_id].add(websocket)

    async def disconnect(self, meeting_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            connections = self._connections.get(meeting_id)
            if connections:
                connections.discard(websocket)
                if not connections:
                    self._connections.pop(meeting_id, None)

    async def broadcast(self, meeting_id: int, message: dict) -> None:
        async with self._lock:
            connections = list(self._connections.get(meeting_id, ()))
        failed = []
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception:
                failed.append(websocket)
        for websocket in failed:
            await self.disconnect(meeting_id, websocket)


connection_manager = ConnectionManager()
