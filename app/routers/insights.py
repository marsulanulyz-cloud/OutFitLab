import asyncio

import asyncpg
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from .. import ai, imaging, storage
from ..deps import current_user, get_db
from ..queries import ITEM_SELECT
from ..ratelimit import rate_limit
from ..schemas import (ForgottenItemOut, LookRatingOut, MissingItemOut, Occasion,
                       OverviewOut)

router = APIRouter(tags=["insights"])


@router.get(
    "/stylist/missing-item", response_model=MissingItemOut,
    dependencies=[Depends(rate_limit("missing", 10, 3600))],
)
async def missing_item(user=Depends(current_user), conn: asyncpg.Connection = Depends(get_db)):
    """Одна вещь, которая сильнее всего расширит вариативность гардероба."""
    rows = await conn.fetch(ITEM_SELECT + " WHERE i.user_id = $1", user["id"])
    if len(rows) < 5:
        raise HTTPException(422, "Добавьте хотя бы 5 вещей, чтобы получить рекомендацию")
    catalog = [
        {"category": r["category_slug"], "group": r["category_group"], "color": r["color_name"],
         "material": r["material"], "warmth": r["warmth"], "formality": r["formality"],
         "seasons": r["seasons"], "tags": r["style_tags"]}
        for r in rows
    ]
    profile = {"color_type": user["color_type"], "style_prefs": user["style_prefs"]}
    sug = await ai.suggest_missing_item(catalog, profile)
    row = await conn.fetchrow(
        "INSERT INTO purchase_suggestions (user_id, title, category_slug, color_name, reason, unlocks_estimate) "
        "VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
        user["id"], sug.title[:120], sug.category_slug, sug.color_name, sug.reason, max(0, sug.unlocks_estimate),
    )
    return dict(row)


@router.post(
    "/stylist/rate-look", response_model=LookRatingOut, status_code=201,
    dependencies=[Depends(rate_limit("rate", 20, 3600))],
)
async def rate_look(
    file: UploadFile = File(...),
    occasion: Occasion | None = Form(None),
    user=Depends(current_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    raw = await storage.read_upload(file)
    try:
        jpeg = await asyncio.to_thread(imaging.normalize_original, raw)
    except Exception:
        raise HTTPException(400, "Не удалось прочитать изображение")
    rating = await ai.rate_look(jpeg, occasion)
    url = storage.save_bytes(user["id"], jpeg, "jpg")
    row = await conn.fetchrow(
        "INSERT INTO look_ratings (user_id, image_url, occasion, score, summary, strengths, improvements) "
        "VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        user["id"], url, occasion, rating.score, rating.summary,
        rating.strengths[:4], rating.improvements[:4],
    )
    return dict(row)


@router.get("/stats/forgotten", response_model=list[ForgottenItemOut])
async def forgotten(
    days: int = Query(30, ge=1, le=365), user=Depends(current_user), conn=Depends(get_db)
):
    rows = await conn.fetch(
        """
        SELECT i.*, c.slug AS category_slug, c.grp AS category_group,
               EXTRACT(DAY FROM now() - COALESCE(i.last_worn_at, i.created_at))::int AS days_idle
        FROM items i JOIN categories c ON c.id = i.category_id
        WHERE i.user_id = $1
          AND COALESCE(i.last_worn_at, i.created_at) < now() - make_interval(days => $2)
        ORDER BY days_idle DESC
        """,
        user["id"], days,
    )
    return [dict(r) for r in rows]


@router.get("/stats/overview", response_model=OverviewOut)
async def overview(user=Depends(current_user), conn=Depends(get_db)):
    uid = user["id"]
    totals = await conn.fetchrow(
        """
        SELECT count(*) AS total,
               count(*) FILTER (WHERE status = 'laundry') AS laundry,
               count(*) FILTER (WHERE COALESCE(last_worn_at, created_at) < now() - interval '30 days') AS forgotten
        FROM items WHERE user_id = $1
        """, uid,
    )
    cats = await conn.fetch(
        "SELECT c.slug, count(*) AS n FROM items i JOIN categories c ON c.id = i.category_id "
        "WHERE i.user_id = $1 GROUP BY c.slug ORDER BY n DESC", uid,
    )
    top = await conn.fetch(
        ITEM_SELECT + " WHERE i.user_id = $1 AND i.wear_count > 0 ORDER BY i.wear_count DESC LIMIT 5", uid
    )
    return {
        "total_items": totals["total"], "laundry_items": totals["laundry"],
        "forgotten_items": totals["forgotten"],
        "by_category": {r["slug"]: r["n"] for r in cats},
        "most_worn": [dict(r) for r in top],
    }
