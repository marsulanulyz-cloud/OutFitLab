import asyncio

import asyncpg
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from .. import ai, imaging, storage
from ..deps import current_user, get_db
from ..queries import ITEM_SELECT, add_filter, get_item
from ..ratelimit import rate_limit
from ..schemas import ItemOut, ItemPatch, Status, StatusIn

router = APIRouter(prefix="/items", tags=["closet"])

PATCHABLE = {"title", "category_id", "material", "primary_color", "color_name",
             "seasons", "warmth", "formality", "style_tags"}


def _clamp(v: int, lo: int = 1, hi: int = 5) -> int:
    return max(lo, min(hi, int(v)))


@router.post(
    "", response_model=ItemOut, status_code=201,
    dependencies=[Depends(rate_limit("upload", 60, 3600))],
)
async def create_item(
    file: UploadFile = File(...), user=Depends(current_user), conn=Depends(get_db)
):
    raw = await storage.read_upload(file)
    try:
        original = await asyncio.to_thread(imaging.normalize_original, raw)
    except Exception:
        raise HTTPException(400, "Не удалось прочитать изображение")

    # тегирование и удаление фона идут параллельно
    tags, png = await asyncio.gather(
        ai.tag_item(original), asyncio.to_thread(imaging.cutout, original)
    )

    cat = await conn.fetchrow("SELECT id FROM categories WHERE slug = $1", tags.category_slug)
    if cat is None:
        raise HTTPException(502, "Модель вернула неизвестную категорию")

    color = tags.primary_color_hex if len(tags.primary_color_hex) == 7 else None
    original_url = storage.save_bytes(user["id"], original, "jpg")
    image_url = storage.save_bytes(user["id"], png, "png")
    row = await conn.fetchrow(
        """
        INSERT INTO items (user_id, category_id, title, image_url, original_url, primary_color,
                           color_name, material, seasons, warmth, formality, style_tags, ai_raw)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id
        """,
        user["id"], cat["id"], tags.title.strip()[:120] or "Вещь", image_url, original_url,
        color, tags.color_name, tags.material, sorted(set(tags.seasons)),
        _clamp(tags.warmth), _clamp(tags.formality), tags.style_tags[:5], tags.model_dump(),
    )
    return await get_item(conn, user["id"], row["id"])


@router.get("", response_model=list[ItemOut])
async def list_items(
    category: str | None = None,
    category_group: str | None = None,
    status: Status | None = None,
    season: str | None = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user=Depends(current_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    conds, args = ["i.user_id = $1"], [user["id"]]
    if category:
        add_filter(conds, args, "c.slug = ?", category)
    if category_group:
        add_filter(conds, args, "c.grp = ?", category_group)
    if status:
        add_filter(conds, args, "i.status = ?", status)
    if season:
        add_filter(conds, args, "? = ANY(i.seasons)", season)
    args += [limit, offset]
    sql = (f"{ITEM_SELECT} WHERE {' AND '.join(conds)} "
           f"ORDER BY i.created_at DESC LIMIT ${len(args) - 1} OFFSET ${len(args)}")
    return [dict(r) for r in await conn.fetch(sql, *args)]


@router.get("/{item_id}", response_model=ItemOut)
async def read_item(item_id: str, user=Depends(current_user), conn=Depends(get_db)):
    return dict(await get_item(conn, user["id"], item_id))


@router.patch("/{item_id}", response_model=ItemOut)
async def patch_item(item_id: str, body: ItemPatch, user=Depends(current_user), conn=Depends(get_db)):
    await get_item(conn, user["id"], item_id)  # 404, если чужая/несуществующая
    data = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "category_slug" in data:
        cat = await conn.fetchrow("SELECT id FROM categories WHERE slug = $1", data.pop("category_slug"))
        if cat is None:
            raise HTTPException(422, "Неизвестная категория")
        data["category_id"] = cat["id"]
    data = {k: v for k, v in data.items() if k in PATCHABLE}
    if data:
        sets = [f"{k} = ${i}" for i, k in enumerate(data, start=3)]
        await conn.execute(
            f"UPDATE items SET {', '.join(sets)} WHERE id = $1 AND user_id = $2",
            item_id, user["id"], *data.values(),
        )
    return dict(await get_item(conn, user["id"], item_id))


@router.patch("/{item_id}/status", response_model=ItemOut)
async def set_status(item_id: str, body: StatusIn, user=Depends(current_user), conn=Depends(get_db)):
    """Переключатель «доступна / в стирке» — вещь в стирке не попадает в генерацию."""
    await get_item(conn, user["id"], item_id)
    await conn.execute(
        "UPDATE items SET status = $3 WHERE id = $1 AND user_id = $2", item_id, user["id"], body.status
    )
    return dict(await get_item(conn, user["id"], item_id))


@router.post("/{item_id}/wear", response_model=ItemOut)
async def wear_item(item_id: str, user=Depends(current_user), conn=Depends(get_db)):
    await get_item(conn, user["id"], item_id)
    async with conn.transaction():
        logged = await conn.fetchval(
            "INSERT INTO wear_log (user_id, item_id) VALUES ($1, $2) "
            "ON CONFLICT (item_id, worn_on) DO NOTHING RETURNING id", user["id"], item_id,
        )
        if logged:
            await conn.execute(
                "UPDATE items SET wear_count = wear_count + 1, last_worn_at = now() WHERE id = $1", item_id
            )
    return dict(await get_item(conn, user["id"], item_id))


@router.delete("/{item_id}", status_code=204)
async def delete_item(item_id: str, user=Depends(current_user), conn=Depends(get_db)):
    row = await get_item(conn, user["id"], item_id)
    await conn.execute("DELETE FROM items WHERE id = $1 AND user_id = $2", item_id, user["id"])
    storage.delete_by_url(row["image_url"])
    storage.delete_by_url(row["original_url"])
