import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from .. import ai
from ..deps import current_user, get_db
from ..queries import ITEM_SELECT
from ..ratelimit import rate_limit
from ..schemas import GenerateIn, OutfitOut
from ..weather import get_weather

router = APIRouter(prefix="/outfits", tags=["outfits"])

ORDER = {"outerwear": 0, "top": 1, "onepiece": 1, "bottom": 2, "footwear": 3, "accessory": 4}


def _base_ok(groups: set[str]) -> bool:
    return "footwear" in groups and ("onepiece" in groups or {"top", "bottom"} <= groups)


def _valid(ids: list[str], by_id: dict) -> bool:
    if len(set(ids)) != len(ids) or not all(i in by_id for i in ids):
        return False
    groups = [by_id[i]["category_group"] for i in ids]
    if not _base_ok(set(groups)):
        return False
    if groups.count("footwear") != 1 or groups.count("bottom") > 1 or groups.count("top") > 2:
        return False
    if "onepiece" in groups and "bottom" in groups:
        return False
    return groups.count("outerwear") <= 1 and groups.count("accessory") <= 2


async def _hydrate(conn: asyncpg.Connection, outfits: list[asyncpg.Record]) -> list[dict]:
    if not outfits:
        return []
    rows = await conn.fetch(
        """
        SELECT oi.outfit_id, oi.role, i.*, c.slug AS category_slug, c.grp AS category_group
        FROM outfit_items oi
        JOIN items i ON i.id = oi.item_id
        JOIN categories c ON c.id = i.category_id
        WHERE oi.outfit_id = ANY($1::uuid[])
        ORDER BY oi.outfit_id, oi.position
        """,
        [o["id"] for o in outfits],
    )
    by_outfit: dict = {}
    for r in rows:
        by_outfit.setdefault(r["outfit_id"], []).append(dict(r))
    return [{**dict(o), "items": by_outfit.get(o["id"], [])} for o in outfits]


@router.post(
    "/generate", response_model=list[OutfitOut],
    dependencies=[Depends(rate_limit("generate", 30, 3600))],
)
async def generate(body: GenerateIn, user=Depends(current_user), conn=Depends(get_db)):
    weather = None
    if body.use_weather and user["latitude"] is not None and user["longitude"] is not None:
        weather = await get_weather(user["latitude"], user["longitude"])

    rows = await conn.fetch(
        ITEM_SELECT + " WHERE i.user_id = $1 AND i.status = 'available' "
        "AND NOT (i.id = ANY($2::uuid[]))",
        user["id"], body.exclude_item_ids,
    )
    if not _base_ok({r["category_group"] for r in rows}):
        raise HTTPException(
            422, "Недостаточно доступных вещей: нужны верх и низ (или платье) и обувь. "
                 "Проверьте, что вещи не в стирке."
        )

    idle = {
        r["id"]: r["days_idle"]
        for r in await conn.fetch(
            "SELECT id, EXTRACT(DAY FROM now() - COALESCE(last_worn_at, created_at))::int AS days_idle "
            "FROM items WHERE user_id = $1", user["id"],
        )
    }
    by_id = {str(r["id"]): dict(r) for r in rows}
    catalog = [
        {
            "id": str(r["id"]), "category": r["category_slug"], "group": r["category_group"],
            "color": r["color_name"], "material": r["material"], "warmth": r["warmth"],
            "formality": r["formality"], "seasons": r["seasons"], "tags": r["style_tags"],
            "days_idle": idle.get(r["id"], 0),
        }
        for r in rows
    ]
    profile = {"color_type": user["color_type"], "style_prefs": user["style_prefs"]}

    picked: list[ai.AIOutfit] = []
    seen: set[frozenset] = set()
    for _ in range(2):  # одна повторная попытка, если модель выдала невалидные сочетания
        for o in await ai.generate_outfits(catalog, body.occasion, body.vibe, weather, profile):
            key = frozenset(o.item_ids)
            if key not in seen and _valid(o.item_ids, by_id):
                seen.add(key)
                picked.append(o)
        if len(picked) >= 3:
            break
    if not picked:
        raise HTTPException(502, "Не удалось подобрать образы, попробуйте ещё раз")

    saved = []
    async with conn.transaction():
        for o in picked[:3]:
            oid = await conn.fetchval(
                "INSERT INTO outfits (user_id, occasion, vibe, weather, ai_tip, rationale) "
                "VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
                user["id"], body.occasion, body.vibe, weather, o.styling_tip[:300], o.rationale[:600],
            )
            ordered = sorted(o.item_ids, key=lambda i: ORDER[by_id[i]["category_group"]])
            await conn.executemany(
                "INSERT INTO outfit_items (outfit_id, item_id, role, position) VALUES ($1,$2,$3,$4)",
                [(oid, i, by_id[i]["category_group"], pos) for pos, i in enumerate(ordered)],
            )
            saved.append(oid)
    outfits = await conn.fetch("SELECT * FROM outfits WHERE id = ANY($1::uuid[]) ORDER BY created_at", saved)
    return await _hydrate(conn, outfits)


@router.get("", response_model=list[OutfitOut])
async def history(
    saved_only: bool = False,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user=Depends(current_user), conn=Depends(get_db),
):
    outfits = await conn.fetch(
        "SELECT * FROM outfits WHERE user_id = $1 AND ($2::bool IS FALSE OR is_saved) "
        "ORDER BY created_at DESC LIMIT $3 OFFSET $4",
        user["id"], saved_only, limit, offset,
    )
    return await _hydrate(conn, outfits)


async def _own_outfit(conn, user_id, outfit_id) -> asyncpg.Record:
    row = await conn.fetchrow("SELECT * FROM outfits WHERE id = $1 AND user_id = $2", outfit_id, user_id)
    if row is None:
        raise HTTPException(404, "Образ не найден")
    return row


@router.post("/{outfit_id}/save", response_model=OutfitOut)
async def toggle_save(outfit_id: str, user=Depends(current_user), conn=Depends(get_db)):
    await _own_outfit(conn, user["id"], outfit_id)
    row = await conn.fetchrow("UPDATE outfits SET is_saved = NOT is_saved WHERE id = $1 RETURNING *", outfit_id)
    return (await _hydrate(conn, [row]))[0]


@router.post("/{outfit_id}/wear", response_model=OutfitOut)
async def wear_outfit(outfit_id: str, user=Depends(current_user), conn=Depends(get_db)):
    """«Надел это»: пишет в wear_log и обновляет счётчики. Повтор в тот же день не дублирует."""
    outfit = await _own_outfit(conn, user["id"], outfit_id)
    async with conn.transaction():
        logged = await conn.fetch(
            "INSERT INTO wear_log (user_id, item_id, outfit_id) "
            "SELECT $1, item_id, $2 FROM outfit_items WHERE outfit_id = $2 "
            "ON CONFLICT (item_id, worn_on) DO NOTHING RETURNING item_id",
            user["id"], outfit["id"],
        )
        if logged:
            await conn.execute(
                "UPDATE items SET wear_count = wear_count + 1, last_worn_at = now() "
                "WHERE id = ANY($1::uuid[])", [r["item_id"] for r in logged],
            )
    return (await _hydrate(conn, [outfit]))[0]


@router.delete("/{outfit_id}", status_code=204)
async def delete_outfit(outfit_id: str, user=Depends(current_user), conn=Depends(get_db)):
    await _own_outfit(conn, user["id"], outfit_id)
    await conn.execute("DELETE FROM outfits WHERE id = $1", outfit_id)
