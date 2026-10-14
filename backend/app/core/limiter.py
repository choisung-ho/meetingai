from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.security import decode_access_token


def get_inviter_rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.startswith("Bearer "):
        payload = decode_access_token(authorization.removeprefix("Bearer ").strip())
        user_id = payload.get("sub") if payload else None
        if user_id:
            return f"user:{user_id}"

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=get_remote_address)
