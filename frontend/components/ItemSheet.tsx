"use client";

import { Check, Droplets, Trash2, X } from "lucide-react";
import { useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { CATEGORY_RU, SEASON_RU } from "@/lib/labels";
import { revalidateAll } from "@/lib/swr";
import type { Item, Status } from "@/lib/types";
import { ErrorNote, Spinner, Switch } from "./ui";

function formatDate(iso: string | null): string {
  if (!iso) return "ещё не надевали";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;
  const id = item.id;

  async function run(key: string, fn: () => Promise<unknown>, closeAfter = false) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await revalidateAll();
      if (closeAfter) onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (status: Status) =>
    run("status", () =>
      apiFetch<Item>(`/items/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    );
  const wear = () => run("wear", () => apiFetch<Item>(`/items/${id}/wear`, { method: "POST" }));
  const remove = () => {
    if (!window.confirm("Удалить вещь из гардероба?")) return;
    void run("delete", () => apiFetch<void>(`/items/${id}`, { method: "DELETE" }), true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 animate-fade" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-md animate-sheet overflow-y-auto rounded-t-3xl bg-card shadow-2xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="podium relative bg-canvas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image_url} alt={item.title} className="mx-auto block max-h-[42dvh] w-auto p-6" />
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute right-3 top-3 rounded-full bg-card/80 p-2 backdrop-blur"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 pt-5">
          <div>
            <h2 className="font-display text-2xl leading-tight">{item.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {CATEGORY_RU[item.category_slug] ?? item.category_slug}
              {item.material ? ` · ${item.material}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {item.primary_color && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5">
                <span className="h-3 w-3 rounded-full border border-ink/10" style={{ background: item.primary_color }} />
                {item.color_name ?? item.primary_color}
              </span>
            )}
            {item.seasons.map((s) => (
              <span key={s} className="rounded-full bg-ink/5 px-3 py-1.5">
                {SEASON_RU[s] ?? s}
              </span>
            ))}
            {item.style_tags.map((t) => (
              <span key={t} className="rounded-full bg-accent/10 px-3 py-1.5 text-accent">
                {t}
              </span>
            ))}
          </div>

          <p className="text-sm text-muted">
            Надето {item.wear_count} раз · последний раз: {formatDate(item.last_worn_at)}
          </p>

          <div className="flex items-center justify-between rounded-2xl bg-ink/5 px-4 py-3">
            <div className="flex items-center gap-3">
              <Droplets className="h-5 w-5 text-accent" />
              <div>
                <p className="text-sm font-medium">В стирке</p>
                <p className="text-xs text-muted">Не попадает в подбор образов</p>
              </div>
            </div>
            <Switch
              label="В стирке"
              checked={item.status === "laundry"}
              disabled={busy !== null}
              onChange={(v) => void setStatus(v ? "laundry" : "available")}
            />
          </div>

          <ErrorNote message={error} />

          <div className="flex gap-2">
            <button className="btn-accent flex-1" disabled={busy !== null} onClick={() => void wear()}>
              {busy === "wear" ? <Spinner className="text-white" /> : <Check className="h-4 w-4" />}
              Надел сегодня
            </button>
            <button
              className="btn-ghost px-4 text-red-600 dark:text-red-400"
              disabled={busy !== null}
              onClick={remove}
              aria-label="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
