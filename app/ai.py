"""Все обращения к Gemini. Модель получает фото только для тегирования и оценки селфи;
генерация луков идёт по текстовому каталогу вещей — быстрее и дешевле, чем слать картинки."""
import json
import logging
from functools import lru_cache
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel

from .config import get_settings

log = logging.getLogger(__name__)
s = get_settings()


class AIError(Exception):
    pass


CategorySlug = Literal[
    "tshirt", "shirt", "sweater", "hoodie", "jeans", "trousers", "shorts", "skirt",
    "dress", "jacket", "coat", "sneakers", "boots", "shoes",
    "bag", "hat", "scarf", "jewelry", "belt",
]

OCCASION_RU = {
    "study_office": "Учёба / Офис", "date": "Свидание", "sport": "Спорт",
    "party": "Вечеринка", "walk": "Прогулка",
}
VIBE_RU = {"casual": "Casual", "oversize": "Oversize", "formal": "Formal"}


class ItemTags(BaseModel):
    category_slug: CategorySlug
    title: str
    primary_color_hex: str
    color_name: str
    material: str
    seasons: list[Literal["winter", "spring", "summer", "autumn"]]
    warmth: int
    formality: int
    style_tags: list[str]


class AIOutfit(BaseModel):
    item_ids: list[str]
    styling_tip: str
    rationale: str


class AIOutfits(BaseModel):
    outfits: list[AIOutfit]


class MissingItem(BaseModel):
    title: str
    category_slug: CategorySlug
    color_name: str
    reason: str
    unlocks_estimate: int


class LookRating(BaseModel):
    score: int
    summary: str
    strengths: list[str]
    improvements: list[str]


@lru_cache
def _client() -> genai.Client:
    return genai.Client(api_key=s.gemini_api_key)


async def _generate(contents: list, schema, temperature: float = 0.6):
    try:
        resp = await _client().aio.models.generate_content(
            model=s.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=temperature,
            ),
        )
    except Exception as e:  # сетевые/квотные/safety-ошибки SDK
        log.exception("Gemini call failed")
        raise AIError("не удалось получить ответ модели") from e
    if resp.parsed is None:
        raise AIError("модель вернула пустой или невалидный ответ")
    return resp.parsed


def _image(data: bytes, mime: str = "image/jpeg") -> types.Part:
    return types.Part.from_bytes(data=data, mime_type=mime)


async def tag_item(jpeg: bytes) -> ItemTags:
    prompt = (
        "На фото одна вещь одежды или аксессуар. Определи:\n"
        "- category_slug строго из допустимого списка;\n"
        "- title: короткое название по-русски (напр. «Белая оверсайз футболка»);\n"
        "- primary_color_hex: доминирующий цвет самой вещи (не фона), формат #RRGGBB;\n"
        "- color_name: цвет по-русски;\n"
        "- material: наиболее вероятный материал по-русски;\n"
        "- seasons: в какие сезоны вещь уместна;\n"
        "- warmth: 1 (очень лёгкая) … 5 (зимняя);\n"
        "- formality: 1 (спорт/дом) … 5 (строгий деловой);\n"
        "- style_tags: 2–5 тегов (minimal, streetwear, classic, sporty, vintage…).\n"
        "Не выдумывай то, чего не видно."
    )
    return await _generate([_image(jpeg), prompt], ItemTags, temperature=0.2)


async def generate_outfits(
    catalog: list[dict], occasion: str, vibe: str, weather: dict | None, profile: dict
) -> list[AIOutfit]:
    ctx = {
        "повод": OCCASION_RU[occasion],
        "вайб": VIBE_RU[vibe],
        "погода": weather or "неизвестна",
        "цветотип": profile.get("color_type"),
        "предпочтения": profile.get("style_prefs"),
    }
    prompt = (
        "Ты персональный стилист. Составь РОВНО 3 разных образа из каталога.\n"
        "Правила:\n"
        "1. Используй ТОЛЬКО id из каталога.\n"
        "2. Образ = (group top + group bottom) ИЛИ group onepiece; плюс ровно одна обувь (footwear).\n"
        "3. outerwear добавляй, если по погоде нужно; accessory — по желанию (0–2).\n"
        "4. Подбирай warmth под температуру (ощущаемую), учитывай дождь/снег и ветер; "
        "formality — под повод и вайб.\n"
        "5. Цвета должны сочетаться; учитывай цветотип, если он указан.\n"
        "6. Три образа должны заметно отличаться набором вещей.\n"
        "7. Вещам с большим days_idle отдавай приоритет — их давно не носили.\n"
        "8. styling_tip: один конкретный совет по стилизации (до 140 символов), "
        "напр. про заправку, рукава, пропорции. rationale: 1–2 предложения почему это работает.\n"
        "Ответ по-русски.\n\n"
        f"Контекст: {json.dumps(ctx, ensure_ascii=False)}\n"
        f"Каталог: {json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))}"
    )
    result = await _generate([prompt], AIOutfits, temperature=0.8)
    return result.outfits


async def suggest_missing_item(catalog: list[dict], profile: dict) -> MissingItem:
    prompt = (
        "Ты стилист. Проанализируй гардероб и предложи ОДНУ вещь для покупки, "
        "которая даст максимальный прирост новых сочетаний с уже имеющимися вещами. "
        "Не предлагай то, что уже есть в избытке. Учитывай цветотип и предпочтения. "
        "unlocks_estimate — реалистичная оценка числа новых образов (целое). "
        "reason — 1–2 предложения с отсылкой к конкретным вещам гардероба. Ответ по-русски.\n\n"
        f"Профиль: {json.dumps(profile, ensure_ascii=False)}\n"
        f"Гардероб: {json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))}"
    )
    return await _generate([prompt], MissingItem, temperature=0.5)


async def rate_look(jpeg: bytes, occasion: str | None) -> LookRating:
    prompt = (
        "Оцени образ человека на фото как стилист: сочетание цветов, пропорции, посадка, "
        "уместность для повода, актуальность. Оценивай честно и по шкале 1–10 (5 — обычный "
        "нормальный образ; 9–10 — редкость). Не комментируй внешность и тело — только одежду. "
        "summary — 1–2 предложения; strengths и improvements — по 2–4 конкретных пункта. "
        f"Повод: {OCCASION_RU.get(occasion, 'не указан') if occasion else 'не указан'}. Ответ по-русски."
    )
    result = await _generate([_image(jpeg), prompt], LookRating, temperature=0.4)
    result.score = max(1, min(10, result.score))
    return result
