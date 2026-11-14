"use client";

import { Dumbbell, Footprints, GraduationCap, Heart, MapPin, PartyPopper, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { LookCard, WeatherStrip } from "@/components/LookCard";
import { Chip, EmptyState, ErrorNote, PageTitle, Spinner, Switch } from "@/components/ui";
import { apiFetch, errorMessage, fetcher } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { OCCASION_RU, VIBES } from "@/lib/labels";
import type { Occasion, Outfit, Vibe } from "@/lib/types";
import { cn } from "@/lib/utils";

const OCCASION_ICONS: Record<Occasion, LucideIcon> = {
  study_office: GraduationCap,
  date: Heart,
  sport: Dumbbell,
  party: PartyPopper,
  walk: Footprints,
};

export default function LooksPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"new" | "saved">("new");
  const [occasion, setOccasion] = useState<Occasion>("walk");
  const [vibe, setVibe] = useState<Vibe>("casual");
  const [useWeather, setUseWeather] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outfits, setOutfits] = useState<Outfit[]>([]);

  const hasLocation = user?.latitude != null && user?.longitude != null;
  const saved = useSWR<Outfit[]>(tab === "saved" ? "/outfits?saved_only=true&limit=50" : null, fetcher);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<Outfit[]>("/outfits/generate", {
        method: "POST",
        body: JSON.stringify({ occasion, vibe, use_weather: useWeather && hasLocation }),
      });
      setOutfits(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (o: Outfit) => {
    setOutfits((list) => list.map((x) => (x.id === o.id ? o : x)));
    void saved.mutate();
  };

  return (
    <>
      <PageTitle title="Образы" subtitle="Стилист соберёт три варианта из вещей, которые сейчас доступны" />

      <div className="mb-6 flex gap-2">
        <Chip active={tab === "new"} onClick={() => setTab("new")}>
          Подбор
        </Chip>
        <Chip active={tab === "saved"} onClick={() => setTab("saved")}>
          Сохранённые
        </Chip>
      </div>

      {tab === "new" && (
        <>
          <section aria-label="Повод" className="mb-5">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Повод</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(Object.keys(OCCASION_RU) as Occasion[]).map((o) => {
                const Icon = OCCASION_ICONS[o];
                const active = occasion === o;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOccasion(o)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-xs transition active:scale-95",
                      active
                        ? "bg-accent text-white shadow-lift"
                        : "bg-card shadow-soft dark:border dark:border-white/10 dark:shadow-none",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {OCCASION_RU[o]}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Вайб" className="mb-5">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-muted">Вайб</h2>
            <div className="flex gap-2">
              {VIBES.map((v) => (
                <Chip key={v.id} active={vibe === v.id} onClick={() => setVibe(v.id)}>
                  {v.label}
                </Chip>
              ))}
            </div>
          </section>

          <div className="card mb-6 flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm font-medium">Учитывать погоду</p>
                <p className="text-xs text-muted">
                  {hasLocation ? (
                    user?.city ?? "Местоположение задано"
                  ) : (
                    <>
                      Укажите город в{" "}
                      <Link href="/profile" className="text-accent underline">
                        профиле
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
            <Switch
              label="Учитывать погоду"
              checked={useWeather && hasLocation}
              disabled={!hasLocation}
              onChange={setUseWeather}
            />
          </div>

          <button className="btn-accent mb-8 w-full py-4" disabled={busy} onClick={() => void generate()}>
            {busy ? <Spinner className="text-white" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Стилист думает…" : outfits.length ? "Подобрать заново" : "Подобрать образы"}
          </button>

          <div className="mb-6">
            <ErrorNote message={error} />
          </div>

          {outfits.length > 0 && (
            <>
              {outfits[0].weather && (
                <div className="mb-4">
                  <WeatherStrip weather={outfits[0].weather} />
                </div>
              )}
              <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
                {outfits.map((o) => (
                  <div key={o.id} className="w-[84%] shrink-0 snap-center md:w-auto">
                    <LookCard outfit={o} onUpdate={update} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "saved" && (
        <>
          {saved.isLoading && (
            <div className="grid place-items-center py-16">
              <Spinner className="h-7 w-7" />
            </div>
          )}
          {saved.data && saved.data.length === 0 && (
            <EmptyState title="Пока пусто" text="Сохраняйте понравившиеся образы закладкой — они появятся здесь." />
          )}
          {saved.data && saved.data.length > 0 && (
            <div className="grid gap-4 md:grid-cols-3">
              {saved.data.map((o) => (
                <LookCard key={o.id} outfit={o} onUpdate={() => void saved.mutate()} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
