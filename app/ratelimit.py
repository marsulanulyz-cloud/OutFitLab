"""Простой лимитер «скользящее окно» в памяти процесса.
Работает при одном воркере uvicorn (как в docker-compose). Для нескольких воркеров/реплик
перенесите счётчики в Redis."""
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException

from .deps import current_user

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def rate_limit(name: str, max_calls: int, per_seconds: int):
    async def dep(user=Depends(current_user)) -> None:
        now = time.monotonic()
        q = _hits[(name, str(user["id"]))]
        while q and now - q[0] > per_seconds:
            q.popleft()
        if len(q) >= max_calls:
            retry = int(per_seconds - (now - q[0])) + 1
            raise HTTPException(
                429,
                f"Слишком много запросов. Попробуйте через {retry // 60 + 1} мин.",
                headers={"Retry-After": str(retry)},
            )
        q.append(now)

    return dep
