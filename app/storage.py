"""Локальное файловое хранилище. В проде замените на S3/R2 с подписанными URL."""
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import get_settings

s = get_settings()
ALLOWED = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


async def read_upload(file: UploadFile) -> bytes:
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Поддерживаются JPEG, PNG, WebP и HEIC")
    data = await file.read(s.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Файл больше {s.max_upload_mb} МБ")
    if not data:
        raise HTTPException(400, "Пустой файл")
    return data


def save_bytes(user_id, data: bytes, ext: str) -> str:
    rel = f"{user_id}/{uuid.uuid4().hex}.{ext}"
    path = Path(s.upload_dir) / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"{s.public_base_url}/media/{rel}"


def delete_by_url(url: str) -> None:
    marker = "/media/"
    if marker not in url:
        return
    rel = url.split(marker, 1)[1]
    path = (Path(s.upload_dir) / rel).resolve()
    if Path(s.upload_dir).resolve() in path.parents:
        path.unlink(missing_ok=True)
