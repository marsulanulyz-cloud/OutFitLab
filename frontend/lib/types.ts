export type Status = "available" | "laundry";
export type Occasion = "study_office" | "date" | "sport" | "party" | "walk";
export type Vibe = "casual" | "oversize" | "formal";
export type ThemePref = "light" | "dark" | "system";

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  color_type: string | null;
  style_prefs: string[];
  theme: ThemePref;
}

export interface Item {
  id: string;
  category_slug: string;
  category_group: string;
  title: string;
  image_url: string;
  original_url: string;
  primary_color: string | null;
  color_name: string | null;
  material: string | null;
  seasons: string[];
  warmth: number | null;
  formality: number | null;
  style_tags: string[];
  status: Status;
  wear_count: number;
  last_worn_at: string | null;
  created_at: string;
}

export interface ForgottenItem extends Item {
  days_idle: number;
}

export interface OutfitItem extends Item {
  role: string;
}

export interface Weather {
  temp_c: number;
  feels_like_c: number;
  t_min: number;
  t_max: number;
  rain_prob: number;
  wind_kmh: number;
  condition: "dry" | "rain" | "snow";
}

export interface Outfit {
  id: string;
  occasion: Occasion;
  vibe: Vibe;
  weather: Weather | null;
  ai_tip: string | null;
  rationale: string | null;
  is_saved: boolean;
  created_at: string;
  items: OutfitItem[];
}

export interface Overview {
  total_items: number;
  laundry_items: number;
  forgotten_items: number;
  by_category: Record<string, number>;
  most_worn: Item[];
}

export interface MissingItem {
  id: string;
  title: string;
  category_slug: string;
  color_name: string | null;
  reason: string;
  unlocks_estimate: number | null;
}

export interface LookRating {
  id: string;
  image_url: string;
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}
