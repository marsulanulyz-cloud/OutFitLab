from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

Status = Literal["available", "laundry"]
Occasion = Literal["study_office", "date", "sport", "party", "walk"]
Vibe = Literal["casual", "oversize", "formal"]
Season = Literal["winter", "spring", "summer", "autumn"]
HexColor = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


# ── Auth / profile ──
class GoogleLogin(BaseModel):
    id_token: str


class AppleLogin(BaseModel):
    identity_token: str
    name: str | None = None  # Apple отдаёт имя только при первом входе, и только клиенту


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: UUID
    email: str | None
    name: str | None
    avatar_url: str | None
    city: str | None
    latitude: float | None
    longitude: float | None
    timezone: str | None
    color_type: str | None
    style_prefs: list[str]
    theme: str


class AuthOut(TokenPair):
    user: UserOut


class UserPatch(BaseModel):
    name: str | None = None
    city: str | None = None
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    timezone: str | None = None
    color_type: str | None = None
    style_prefs: list[str] | None = None
    theme: Literal["light", "dark", "system"] | None = None


# ── Closet ──
class ItemOut(BaseModel):
    id: UUID
    category_slug: str
    category_group: str
    title: str
    image_url: str
    original_url: str
    primary_color: str | None
    color_name: str | None
    material: str | None
    seasons: list[str]
    warmth: int | None
    formality: int | None
    style_tags: list[str]
    status: Status
    wear_count: int
    last_worn_at: datetime | None
    created_at: datetime


class ForgottenItemOut(ItemOut):
    days_idle: int


class ItemPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    category_slug: str | None = None
    material: str | None = None
    primary_color: str | None = HexColor
    color_name: str | None = None
    seasons: list[Season] | None = None
    warmth: int | None = Field(None, ge=1, le=5)
    formality: int | None = Field(None, ge=1, le=5)
    style_tags: list[str] | None = None


class StatusIn(BaseModel):
    status: Status


# ── Outfits ──
class GenerateIn(BaseModel):
    occasion: Occasion
    vibe: Vibe = "casual"
    use_weather: bool = True
    exclude_item_ids: list[UUID] = []


class OutfitItemOut(ItemOut):
    role: str


class OutfitOut(BaseModel):
    id: UUID
    occasion: str
    vibe: str
    weather: dict | None
    ai_tip: str | None
    rationale: str | None
    is_saved: bool
    created_at: datetime
    items: list[OutfitItemOut]


# ── Insights ──
class MissingItemOut(BaseModel):
    id: UUID
    title: str
    category_slug: str
    color_name: str | None
    reason: str
    unlocks_estimate: int | None
    created_at: datetime


class LookRatingOut(BaseModel):
    id: UUID
    image_url: str
    score: int
    summary: str
    strengths: list[str]
    improvements: list[str]
    created_at: datetime


class OverviewOut(BaseModel):
    total_items: int
    laundry_items: int
    forgotten_items: int
    by_category: dict[str, int]
    most_worn: list[ItemOut]
