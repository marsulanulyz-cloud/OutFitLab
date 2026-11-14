from collections.abc import AsyncIterator

import asyncpg
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import get_pool
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)


async def get_db() -> AsyncIterator[asyncpg.Connection]:
    async with get_pool().acquire() as conn:
        yield conn


async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    conn: asyncpg.Connection = Depends(get_db),
) -> asyncpg.Record:
    if creds is None:
        raise HTTPException(401, "Требуется авторизация")
    user_id = decode_access_token(creds.credentials)
    user = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if user is None:
        raise HTTPException(401, "Пользователь не найден")
    return user
