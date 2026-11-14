import type { Occasion, Vibe } from "./types";

export const CATEGORY_RU: Record<string, string> = {
  tshirt: "Футболка", shirt: "Рубашка", sweater: "Свитер", hoodie: "Худи",
  jeans: "Джинсы", trousers: "Брюки", shorts: "Шорты", skirt: "Юбка", dress: "Платье",
  jacket: "Куртка", coat: "Пальто", sneakers: "Кроссовки", boots: "Ботинки", shoes: "Туфли",
  bag: "Сумка", hat: "Головной убор", scarf: "Шарф", jewelry: "Украшения", belt: "Ремень",
};

export const GROUPS: { id: string; label: string }[] = [
  { id: "", label: "Все" },
  { id: "top", label: "Верх" },
  { id: "bottom", label: "Низ" },
  { id: "onepiece", label: "Платья" },
  { id: "outerwear", label: "Верхняя одежда" },
  { id: "footwear", label: "Обувь" },
  { id: "accessory", label: "Аксессуары" },
];

export const SEASON_RU: Record<string, string> = {
  winter: "Зима", spring: "Весна", summer: "Лето", autumn: "Осень",
};

export const OCCASION_RU: Record<Occasion, string> = {
  study_office: "Учёба / Офис", date: "Свидание", sport: "Спорт",
  party: "Вечеринка", walk: "Прогулка",
};

export const VIBES: { id: Vibe; label: string }[] = [
  { id: "casual", label: "Casual" },
  { id: "oversize", label: "Oversize" },
  { id: "formal", label: "Formal" },
];

export const COLOR_TYPES: { id: string; label: string }[] = [
  { id: "spring", label: "Весна — тёплый, светлый" },
  { id: "summer", label: "Лето — холодный, мягкий" },
  { id: "autumn", label: "Осень — тёплый, глубокий" },
  { id: "winter", label: "Зима — холодный, контрастный" },
];

export const STYLE_PREFS: { id: string; label: string }[] = [
  { id: "minimal", label: "Минимализм" },
  { id: "classic", label: "Классика" },
  { id: "smart_casual", label: "Smart casual" },
  { id: "streetwear", label: "Стритвир" },
  { id: "sporty", label: "Спорт" },
  { id: "vintage", label: "Винтаж" },
  { id: "romantic", label: "Романтика" },
  { id: "boho", label: "Бохо" },
];
