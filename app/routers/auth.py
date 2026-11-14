import asyncio
from datetime import datetime, timedelta, timezone

import asyncpg
import jwt
from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token as g_id_token

from ..config import get_settings
from ..deps import current_user, get_db
from ..schemas import (AppleLogin, AuthOut, GoogleLogin, RefreshIn, TokenPair,
                       UserOut, UserPatch)
from ..security import create_access_token, hash_token, new_refresh_token

router = APIRouter(tags=["auth"])
s = get_settings()
_apple_jwks = jwt.PyJWKClient("https://appleid.apple.com/auth/keys")


async def _issue(conn: asyncpg.Connection, user_id, family_id=None) -> TokenPair:
    raw, h, exp = new_refresh_token()
    await conn.execute(
        "INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) "
        "VALUES ($1, $2, COALESCE($3::uuid, gen_random_uuid()), $4)",
        user_id, h, family_id, exp,
    )
    return TokenPair(
        access_token=create_access_token(user_id),
        refresh_token=raw,
        expires_in=s.access_ttl_min * 60,
    )


async def _upsert_user(conn, provider: str, sub: str, email, name, avatar) -> asyncpg.Record:
    return await conn.fetchrow(
        """
        INSERT INTO users (email, name, avatar_url, auth_provider, provider_sub)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (auth_provider, provider_sub) DO UPDATE SET
          email      = COALESCE(EXCLUDED.email, users.email),
          name       = COALESCE(users.name, EXCLUDED.name),
          avatar_url = COALESCE(users.avatar_url, EXCLUDED.avatar_url)
        RETURNING *
        """,
        email, name, avatar, provider, sub,
    )


@router.post("/auth/google", response_model=AuthOut)
async def google_login(body: GoogleLogin, conn: asyncpg.Connection = Depends(get_db)):
    try:
        claims = await asyncio.to_thread(
            g_id_token.verify_oauth2_token, body.id_token, g_requests.Request(), s.google_client_id
        )
    except ValueError:
        raise HTTPException(401, "Не удалось подтвердить вход через Google")
    user = await _upsert_user(
        conn, "google", claims["sub"], claims.get("email"), claims.get("name"), claims.get("picture")
    )
    tokens = await _issue(conn, user["id"])
    return AuthOut(**tokens.model_dump(), user=UserOut(**dict(user)))


def _verify_apple(token: str) -> dict:
    key = _apple_jwks.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token, key, algorithms=["RS256"],
        audience=s.apple_client_id, issuer="https://appleid.apple.com",
    )


@router.post("/auth/apple", response_model=AuthOut)
async def apple_login(body: AppleLogin, conn: asyncpg.Connection = Depends(get_db)):
    try:
        claims = await asyncio.to_thread(_verify_apple, body.identity_token)
    except jwt.PyJWTError:
        raise HTTPException(401, "Не удалось подтвердить вход через Apple")
    user = await _upsert_user(conn, "apple", claims["sub"], claims.get("email"), body.name, None)
    tokens = await _issue(conn, user["id"])
    return AuthOut(**tokens.model_dump(), user=UserOut(**dict(user)))


@router.post("/auth/refresh", response_model=TokenPair)
async def refresh(body: RefreshIn, conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow(
        "SELECT * FROM refresh_tokens WHERE token_hash = $1", hash_token(body.refresh_token)
    )
    if row is None:
        raise HTTPException(401, "Недействительный refresh-токен")
    if row["revoked_at"] is not None:
        # Повторное использование давно ротированного токена → вероятная кража: гасим всю цепочку.
        # Окно в 10 с — для гонки двух вкладок, которые обновляют сессию одновременно.
        if datetime.now(timezone.utc) - row["revoked_at"] > timedelta(seconds=10):
            await conn.execute(
                "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
                row["family_id"],
            )
        raise HTTPException(401, "Сессия отозвана, войдите заново")
    if row["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(401, "Refresh-токен истёк")
    async with conn.transaction():
        await conn.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", row["id"])
        return await _issue(conn, row["user_id"], row["family_id"])


@router.post("/auth/logout", status_code=204)
async def logout(body: RefreshIn, conn: asyncpg.Connection = Depends(get_db)):
    await conn.execute(
        "UPDATE refresh_tokens SET revoked_at = now() "
        "WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1) "
        "AND revoked_at IS NULL",
        hash_token(body.refresh_token),
    )


@router.get("/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return UserOut(**dict(user))


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserPatch, user=Depends(current_user), conn=Depends(get_db)):
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not data:
        return UserOut(**dict(user))
    sets = [f"{k} = ${i}" for i, k in enumerate(data, start=2)]  # ключи — из полей модели
    row = await conn.fetchrow(
        f"UPDATE users SET {', '.join(sets)} WHERE id = $1 RETURNING *", user["id"], *data.values()
    )
    return UserOut(**dict(row))
