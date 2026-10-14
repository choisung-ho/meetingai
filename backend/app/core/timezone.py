from datetime import datetime
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")


def now_kst() -> datetime:
    return datetime.now(KST)


def to_kst(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None

    return dt.astimezone(KST)