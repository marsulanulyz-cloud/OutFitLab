"use client";

import { Camera, ShoppingBag, Star, TrendingUp } from "lucide-react";
import { useRef, useState } from "react";
import useSWR from "swr";
import { ItemCard } from "@/components/ItemCard";
import { Chip, ErrorNote, PageTitle, Spinner } from "@/components/ui";
import { apiFetch, errorMessage, fetcher } from "@/lib/api";
import { CATEGORY_RU, OCCASION_RU } from "@/lib/labels";
import type { ForgottenItem, LookRating, MissingItem, Occasion, Overview } from "@/lib/types";

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card px-4 py-5 text-center">
      <p className="font-display text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-ink/10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-accent transition-all duration-700"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 10)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <p className="font-display text-3xl">
          {score}
          <span className="text-base text-muted">/10</span>
        </p>
      </div>
    </div>
  );
}

function MissingItemCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MissingItem | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setResult(await apiFetch<MissingItem>("/stylist/missing-item"));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-3 flex items-center gap-2 text-accent">
        <ShoppingBag className="h-5 w-5" />
        <h2 className="text-xs font-medium uppercase tracking-widest">Умная докупка</h2>
      </div>
      {!result && (
        <p className="mb-4 text-sm text-muted">
          Стилист найдёт одну вещь, которая сильнее всего расширит число ваших образов.
        </p>
      )}
      {result && (
        <div className="mb-4">
          <h3 className="font-display text-2xl leading-tight">{result.title}</h3>
          <p className="mt-1 text-xs text-muted">
            {CATEGORY_RU[result.category_slug] ?? result.category_slug}
            {result.color_name ? ` · ${result.color_name}` : ""}
          </p>
          <p className="mt-3 text-sm">{result.reason}</p>
          {result.unlocks_estimate ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-xs text-accent">
              <TrendingUp className="h-3.5 w-3.5" /> ≈ {result.unlocks_estimate} новых образов
            </p>
          ) : null}
        </div>
      )}
      <ErrorNote message={error} />
      <button className="btn-accent mt-3 w-full" disabled={busy} onClick={() => void load()}>
        {busy && <Spinner className="text-white" />}
        {result ? "Предложить другую" : "Что мне докупить?"}
      </button>
    </section>
  );
}

function RateLookCard() {
  const input = useRef<HTMLInputElement>(null);
  const [occasion, setOccasion] = useState<Occasion | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookRating | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (occasion) fd.append("occasion", occasion);
      setResult(await apiFetch<LookRating>("/stylist/rate-look", { method: "POST", body: fd }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <div className="mb-3 flex items-center gap-2 text-accent">
        <Star className="h-5 w-5" />
        <h2 className="text-xs font-medium uppercase tracking-widest">Оценка образа</h2>
      </div>
      <p className="mb-4 text-sm text-muted">
        Сфотографируйтесь в готовом образе перед зеркалом — получите оценку от 1 до 10 и советы.
      </p>

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={occasion === ""} onClick={() => setOccasion("")} className="text-xs">
          Без повода
        </Chip>
        {(Object.keys(OCCASION_RU) as Occasion[]).map((o) => (
          <Chip key={o} active={occasion === o} onClick={() => setOccasion(o)} className="text-xs">
            {OCCASION_RU[o]}
          </Chip>
        ))}
      </div>

      {result && (
        <div className="mb-4 space-y-4">
          <div className="flex items-center gap-4">
            <ScoreRing score={result.score} />
            <p className="text-sm">{result.summary}</p>
          </div>
          {result.strengths.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs uppercase tracking-widest text-muted">Что получилось</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.improvements.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs uppercase tracking-widest text-muted">Как улучшить</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {result.improvements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ErrorNote message={error} />
      <button className="btn-accent mt-3 w-full" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner className="text-white" /> : <Camera className="h-4 w-4" />}
        {busy ? "Оцениваю…" : result ? "Оценить другой образ" : "Загрузить селфи"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="user"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

export default function InsightsPage() {
  const overview = useSWR<Overview>("/stats/overview", fetcher);
  const forgotten = useSWR<ForgottenItem[]>("/stats/forgotten?days=30", fetcher);

  return (
    <>
      <PageTitle title="Инсайты" subtitle="Что в гардеробе работает, а что лежит без дела" />

      {overview.data && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <Stat value={overview.data.total_items} label="вещей" />
          <Stat value={overview.data.laundry_items} label="в стирке" />
          <Stat value={overview.data.forgotten_items} label="забытых" />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <MissingItemCard />
        <RateLookCard />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Забытые вещи</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Не надевались больше 30 дней — самое время вернуть их в игру</p>
        {forgotten.isLoading && <Spinner />}
        {forgotten.data && forgotten.data.length === 0 && (
          <p className="text-sm text-muted">Все вещи в ротации — отличный результат.</p>
        )}
        {forgotten.data && forgotten.data.length > 0 && (
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
            {forgotten.data.map((it) => (
              <ItemCard key={it.id} item={it} badge={`${it.days_idle} дн.`} />
            ))}
          </div>
        )}
      </section>

      {overview.data && overview.data.most_worn.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl">Чаще всего носите</h2>
          <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
            {overview.data.most_worn.map((it) => (
              <ItemCard key={it.id} item={it} badge={`×${it.wear_count}`} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
