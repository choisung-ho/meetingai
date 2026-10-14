import asyncio
from collections import defaultdict, deque
from dataclasses import asdict, dataclass

from app.core.config import settings


@dataclass(frozen=True)
class BufferedUtterance:
    utterance_id: int
    sequence: int
    speaker_label: str
    text: str
    start_ms: int | None
    end_ms: int | None


class MeetingContextBuffer:
    """Process-local rolling context. Database remains the source of truth."""

    def __init__(self, max_items: int, max_chars: int):
        self.max_items = max_items
        self.max_chars = max_chars
        self._items: dict[int, deque[BufferedUtterance]] = defaultdict(
            lambda: deque(maxlen=self.max_items)
        )
        self._locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def append(self, meeting_id: int, item: BufferedUtterance) -> list[dict]:
        async with self._locks[meeting_id]:
            items = self._items[meeting_id]
            items.append(item)
            while items and sum(len(value.text) for value in items) > self.max_chars:
                items.popleft()
            return [asdict(value) for value in items]

    async def snapshot(self, meeting_id: int) -> list[dict]:
        async with self._locks[meeting_id]:
            return [asdict(value) for value in self._items[meeting_id]]

    async def clear(self, meeting_id: int) -> None:
        async with self._locks[meeting_id]:
            self._items.pop(meeting_id, None)


context_buffer = MeetingContextBuffer(
    max_items=settings.REALTIME_CONTEXT_SIZE,
    max_chars=settings.REALTIME_CONTEXT_MAX_CHARS,
)
