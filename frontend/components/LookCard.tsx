"use client";

import { Bookmark, Check, CloudRain, Snowflake, Sparkles, Sun } from "lucide-react";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { OCCASION_RU } from "@/lib/labels";
import { revalidateAll } from "@/lib/swr";
import type { Outfit, OutfitItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorNote, Spinner } from "./ui";

function Tile({ item, grow }: { item: OutfitItem; grow: number }) {
  return (
    <div className="podium relative min-h-0 rounded-2xl bg-canvas/70" style={{ flexGrow: grow, flexBasis: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image_url} alt={item.title} className="absolute inset-0 h-full w-full object-contain p-2" />
    </div>
  );
}

/** Коллаж: слева верх (и слой сверху), справа низ, обувь и аксессуары. */
function Collage({ items }: { items: OutfitItem[] }) {
  const by = (role: string) => items.filter((i) => i.role === role);
  const onepiece = by("onepiece")[0];
  const tops = by("top");
  const main = onepiece ?? tops[0];
  const layer = by("outerwear")[0] ?? (onepiece ? undefined : tops[1]);
  const bottom = by("bottom")[0];
  const shoes = by("footwear")[0];
  const acc = by("accessory").slice(0, 2);

  return (
    <div className="flex aspect-[4/5] gap-2 p-3">
      <div className="flex flex-1 flex-col gap-2">
        {layer && <Tile item={layer} grow={1} />}
        {main && <Tile item={main} grow={1.4} />}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {bottom && <Tile item={bottom} grow={1.6} />}
        {shoes && <Tile item={shoes} grow={1} />}
        {acc.length > 0 && (
          <div className="flex min-h-0 gap-2" style={{ flexGrow: 0.7, flexBasis: 0 }}>
            {acc.map((a) => (
              <div key={a.id} className="podium relative min-w-0 flex-1 rounded-2xl bg-canvas/70">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image_url} alt={a.title} className="absolute inset-0 h-full w-full object-contain p-1.5" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeatherStrip({ weather }: { weather: Outfit["weather"] }) {
  if (!weather) return null;
  const Icon = weather.condition === "snow" ? Snowflake : weather.condition === "rain" ? CloudRain : Sun;
  const label = weather.condition === "snow" ? "снег" : weather.condition === "rain" ? "дождь" : "без осадков";
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm shadow-soft dark:border dark:border-white/10 dark:shadow-none">
      <Icon className="h-4 w-4 text-accent" />
      {weather.temp_c}° (ощущается {weather.feels_like_c}°) · {label}
    </p>
  );
}

export function LookCard({ outfit, onUpdate }: { outfit: Outfit; onUpdate: (o: Outfit) => void }) {
  const [busy, setBusy] = useState<"save" | "wear" | null>(null);
  const [worn, setWorn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "save" | "wear") {
    setBusy(kind);
    setError(null);
    try {
      const updated = await apiFetch<Outfit>(`/outfits/${outfit.id}/${kind}`, { method: "POST" });
      onUpdate(updated);
      if (kind === "wear") {
        setWorn(true);
        await revalidateAll();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="text-xs uppercase tracking-widest text-muted">{OCCASION_RU[outfit.occasion]}</p>
        <button
          onClick={() => void act("save")}
          disabled={busy !== null}
          aria-label={outfit.is_saved ? "Убрать из сохранённых" : "Сохранить образ"}
          aria-pressed={outfit.is_saved}
          className="rounded-full p-2 transition active:scale-90"
        >
          {busy === "save" ? (
            <Spinner />
          ) : (
            <Bookmark className={cn("h-5 w-5", outfit.is_saved ? "fill-accent text-accent" : "text-muted")} />
          )}
        </button>
      </div>

      <Collage items={outfit.items} />

      <div className="mx-4 rounded-2xl bg-accent/10 p-4">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-accent">
          <Sparkles className="h-3.5 w-3.5" /> Совет стилиста
        </p>
        <p className="font-display text-lg leading-snug">{outfit.ai_tip ?? "Соберите образ целиком — он уже работает."}</p>
        {outfit.rationale && <p className="mt-2 text-sm text-muted">{outfit.rationale}</p>}
      </div>

      <div className="space-y-2 p-4">
        <ErrorNote message={error} />
        <button
          className={worn ? "btn-ghost w-full" : "btn-accent w-full"}
          disabled={busy !== null || worn}
          onClick={() => void act("wear")}
        >
          {busy === "wear" ? <Spinner className="text-white" /> : <Check className="h-4 w-4" />}
          {worn ? "Записано в носку" : "Надену этот образ"}
        </button>
      </div>
    </article>
  );
}
