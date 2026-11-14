"use client";

import { Camera, Check, ImagePlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/api";
import { revalidateAll } from "@/lib/swr";
import type { Item } from "@/lib/types";
import { Spinner } from "./ui";

export function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [added, setAdded] = useState<Item[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  if (!open) return null;

  function reset() {
    setAdded([]);
    setErrors([]);
    setProgress({ done: 0, total: 0 });
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files); // снимок до сброса input
    reset();
    setBusy(true);
    setProgress({ done: 0, total: list.length });
    for (const file of list) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const item = await apiFetch<Item>("/items", { method: "POST", body: fd });
        setAdded((a) => [...a, item]);
      } catch (e) {
        setErrors((er) => [...er, errorMessage(e)]);
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }
    setBusy(false);
    await revalidateAll();
  }

  const finished = !busy && (added.length > 0 || errors.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 animate-fade" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Добавить вещь"
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md animate-sheet rounded-t-3xl bg-card px-6 pb-8 pt-5 shadow-2xl"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl">Новая вещь</h2>
          <button onClick={close} aria-label="Закрыть" className="rounded-full p-2 text-muted hover:bg-ink/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {busy && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Spinner className="h-8 w-8" />
            <p className="text-sm">
              Убираю фон и определяю вещь… {progress.done}/{progress.total}
            </p>
            <p className="text-xs text-muted">Обычно это занимает несколько секунд на вещь</p>
          </div>
        )}

        {finished && (
          <div className="space-y-4">
            {added.length > 0 && (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-accent" /> Добавлено: {added.length}
                </p>
                <ul className="grid grid-cols-4 gap-2">
                  {added.map((it) => (
                    <li key={it.id} className="podium aspect-square overflow-hidden rounded-2xl bg-canvas">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.image_url} alt={it.title} className="h-full w-full object-contain p-1.5" />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {errors.length > 0 && (
              <p role="alert" className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                Не удалось добавить: {errors.length}. {errors[0]}
              </p>
            )}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" onClick={reset}>
                Ещё
              </button>
              <button className="btn-accent flex-1" onClick={close}>
                Готово
              </button>
            </div>
          </div>
        )}

        {!busy && !finished && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => camera.current?.click()}
              className="card flex flex-col items-center gap-2 px-4 py-6 text-sm transition active:scale-95"
            >
              <Camera className="h-7 w-7 text-accent" />
              Сфотографировать
            </button>
            <button
              onClick={() => gallery.current?.click()}
              className="card flex flex-col items-center gap-2 px-4 py-6 text-sm transition active:scale-95"
            >
              <ImagePlus className="h-7 w-7 text-accent" />
              Из галереи
            </button>
            <p className="col-span-2 text-center text-xs text-muted">
              Лучше всего — одна вещь на ровном фоне при хорошем свете
            </p>
          </div>
        )}

        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
