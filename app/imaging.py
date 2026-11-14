"""Нормализация фото и удаление фона (локально, rembg)."""
import io

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from rembg import new_session, remove

register_heif_opener()
Image.MAX_IMAGE_PIXELS = 50_000_000  # защита от decompression bomb

_session = None


def normalize_original(data: bytes, max_side: int = 1600) -> bytes:
    """Учитывает EXIF-поворот, убирает метаданные, ужимает до JPEG."""
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88, optimize=True)
    return buf.getvalue()


def cutout(jpeg: bytes, max_side: int = 1200) -> bytes:
    """PNG с прозрачным фоном, обрезанный по контуру вещи с небольшим полем."""
    global _session
    if _session is None:
        _session = new_session("isnet-general-use")
    out = remove(jpeg, session=_session)
    img = Image.open(io.BytesIO(out)).convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if bbox:
        img = img.crop(bbox)
    pad = int(max(img.size) * 0.06)
    canvas = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    canvas.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    canvas.save(buf, "PNG", optimize=True)
    return buf.getvalue()
