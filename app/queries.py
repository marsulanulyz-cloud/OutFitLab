import asyncpg
from fastapi import HTTPException

ITEM_SELECT = (
    "SELECT i.*, c.slug AS category_slug, c.grp AS category_group "
    "FROM items i JOIN categories c ON c.id = i.category_id"
)


async def get_item(conn: asyncpg.Connection, user_id, item_id) -> asyncpg.Record:
    row = await conn.fetchrow(
        ITEM_SELECT + " WHERE i.id = $1 AND i.user_id = $2", item_id, user_id
    )
    if row is None:
        raise HTTPException(404, "Вещь не найдена")
    return row


def add_filter(conds: list[str], args: list, sql: str, val) -> None:
    """Добавляет условие; '?' в sql заменяется на номер параметра."""
    args.append(val)
    conds.append(sql.replace("?", f"${len(args)}"))
