import os
import secrets
import uuid
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext

from app.core.config import settings


pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# 토큰 검증 로직
def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        token_type = payload.get("type", "access")
        if token_type != "access":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def decode_refresh_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            return None
        return payload
    except jwt.PyJWTError:
        return None


def verify_websocket_token(token: str) -> dict | None:
    payload = decode_access_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    return {
        "user_id": user_id,
        "role": payload.get("role", "authenticated"),
        "email": payload.get("email"),
    }

# 토큰 발급 로직
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    사용자 정보를 받아 JWT Access Token을 생성합니다.
    data 파라미터에는 {'sub': user_id, 'role': role}이 들어옵니다.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    
    # 만료 시간 설정 (기본값은 settings에서 가져옴)
    if expires_delta:
        expire = now + expires_delta
    else:
        # .env에서 설정한 시간을 사용 (예: 60분)
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # JWT 규격에 맞게 만료 시간(exp) 추가
    to_encode.update(
        {
            "type": "access",
            "exp": expire,
            "iat": now,
            "jti": str(uuid.uuid4()),
        }
    )
    
    # 설정된 SECRET_KEY와 ALGORITHM으로 서명하여 토큰 생성
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta
        if expires_delta is not None
        else timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    to_encode.update(
        {
            "type": "refresh",
            "exp": expire,
            "iat": now,
            "jti": str(uuid.uuid4()),
        }
    )
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_legacy_pbkdf2(password: str, stored_password_hash: str) -> bool:
    try:
        import base64
        import hashlib

        algorithm, iterations, encoded_salt, encoded_hash = stored_password_hash.split("$")
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    salt = base64.b64decode(encoded_salt.encode("ascii"))
    expected_hash = base64.b64decode(encoded_hash.encode("ascii"))
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        int(iterations),
    )

    return secrets.compare_digest(password_hash, expected_hash)


def verify_password(password: str, stored_password_hash: str) -> bool:
    if not stored_password_hash:
        return False
    if stored_password_hash.startswith("pbkdf2_sha256$"):
        return _verify_legacy_pbkdf2(password, stored_password_hash)
    try:
        return pwd_context.verify(password, stored_password_hash)
    except Exception:
        return False
