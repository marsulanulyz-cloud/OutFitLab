import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException

from .config import get_settings

s = get_settings()


def create_access_token(user_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=s.access_ttl_min),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_alg)


def decode_access_token(token: str) -> uuid.UUID:
    try:
        data = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_alg])
        if data.get("type") != "access":
            raise jwt.InvalidTokenError("wrong token type")
        return uuid.UUID(data["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Недействительный или истёкший токен")


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_refresh_token() -> tuple[str, str, datetime]:
    raw = secrets.token_urlsafe(48)
    exp = datetime.now(timezone.utc) + timedelta(days=s.refresh_ttl_days)
    return raw, hash_token(raw), exp
