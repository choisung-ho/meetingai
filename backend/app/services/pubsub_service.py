import json

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

_redis_client: Redis | None = None


def get_redis_client() -> Redis:
    global _redis_client
    if not settings.REDIS_URL:
        raise RuntimeError("REDIS_URL is not set. Redis server is owned by the Node.js realtime server.")
    if _redis_client is None:
        # 실시간 알림 장애가 API 요청을 무기한 붙잡지 않도록 짧은
        # 네트워크 timeout과 주기적 PING을 사용한다.
        _redis_client = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )
    return _redis_client


def publish_json(channel: str, payload: dict) -> int:
    message = json.dumps(payload, ensure_ascii=False)
    try:
        return int(get_redis_client().publish(channel, message))
    except RuntimeError as exc:
        logger.warning("[PUBSUB] [SKIP] channel=%s reason=%s", channel, exc)
        return 0
    except RedisError as exc:
        # Redis는 실시간 알림 보조 경로다. DB 트랜잭션이 이미 성공한
        # 뒤 Pub/Sub 장애 때문에 문서/STT 요청 전체가 500이 되면
        # 재시도 시 중복 저장이 발생할 수 있으므로 fail-soft로 처리한다.
        logger.warning("[PUBSUB] [DEGRADED] failed to publish channel=%s reason=%s", channel, exc)
        return 0


def publish_realtime_event(payload: dict) -> int:
    try:
        client = get_redis_client()
        event_id = client.xadd(
            settings.REALTIME_EVENT_STREAM,
            {"payload": json.dumps(payload, ensure_ascii=False)},
            maxlen=settings.REALTIME_STREAM_MAXLEN,
            approximate=True,
        )
        event = {**payload, "event_id": event_id}
        return int(
            client.publish(
                settings.REALTIME_EVENT_CHANNEL,
                json.dumps(event, ensure_ascii=False),
            )
        )
    except RuntimeError as exc:
        logger.warning("[PUBSUB] [SKIP] realtime reason=%s", exc)
        return 0
    except RedisError as exc:
        # 이벤트 저장/방송 실패는 health 로그로 관찰하되 원본 DB 작업은
        # 성공 상태로 유지한다. 클라이언트는 다음 목록 조회로 정합성을
        # 회복할 수 있다.
        logger.warning("[PUBSUB] [DEGRADED] failed to persist realtime event reason=%s", exc)
        return 0
