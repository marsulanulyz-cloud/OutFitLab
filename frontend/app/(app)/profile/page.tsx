"use client";

import { Check, LogOut, MapPin, Monitor, Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Chip, ErrorNote, PageTitle, Spinner } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { COLOR_TYPES, STYLE_PREFS } from "@/lib/labels";
import { useTheme } from "@/lib/theme";
import type { ThemePref, User } from "@/lib/types";

interface GeoResult {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

// Open-Meteo Geocoding: бесплатно, без ключа
async function searchCity(q: string): Promise<GeoResult[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=ru&format=json`;
  const r = await fetch(url);
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: GeoResult[] };
  return d.results ?? [];
}

const THEMES: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Светлая", Icon: Sun },
  { id: "dark", label: "Тёмная", Icon: Moon },
  { id: "system", label: "Как в системе", Icon: Monitor },
];

export default function ProfilePage() {
  const { user, setUser, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [place, setPlace] = useState({
    city: user?.city ?? "",
    lat: user?.latitude ?? null,
    lon: user?.longitude ?? null,
    tz: user?.timezone ?? null,
  });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [colorType, setColorType] = useState(user?.color_type ?? "");
  const [prefs, setPrefs] = useState<string[]>(user?.style_prefs ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function find() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const found = await searchCity(query.trim());
      setResults(found);
      if (found.length === 0) setError("Город не найден — попробуйте другое написание");
    } catch {
      setError("Не удалось выполнить поиск города");
    } finally {
      setSearching(false);
    }
  }

  function pick(g: GeoResult) {
    setPlace({ city: g.name, lat: g.latitude, lon: g.longitude, tz: g.timezone ?? null });
    setResults([]);
    setQuery("");
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Браузер не поддерживает геолокацию");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setPlace((p) => ({
          city: p.city || "Моё местоположение",
          lat: Math.round(pos.coords.latitude * 1e4) / 1e4,
          lon: Math.round(pos.coords.longitude * 1e4) / 1e4,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })),
      () => setError("Не удалось получить геопозицию — разрешите доступ или найдите город вручную"),
    );
  }

  function changeTheme(t: ThemePref) {
    setTheme(t);
    apiFetch<User>("/me", { method: "PATCH", body: JSON.stringify({ theme: t }) })
      .then(setUser)
      .catch(() => undefined);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiFetch<User>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || undefined,
          city: place.city || undefined,
          latitude: place.lat ?? undefined,
          longitude: place.lon ?? undefined,
          timezone: place.tz ?? undefined,
          color_type: colorType || undefined,
          style_prefs: prefs,
        }),
      });
      setUser(updated);
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

  return (
    <>
      <PageTitle title="Профиль" />

      <div className="card mb-6 flex items-center gap-4 p-5">
        {user.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="grid h-14 w-14 place-items-center rounded-full bg-accent font-display text-2xl text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name ?? "Без имени"}</p>
          <p className="truncate text-sm text-muted">{user.email ?? "email скрыт провайдером"}</p>
        </div>
      </div>

      <div className="space-y-6">
        <section className="card space-y-3 p-5">
          <label htmlFor="name" className="text-xs uppercase tracking-widest text-muted">
            Имя
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full rounded-2xl bg-ink/5 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-xs uppercase tracking-widest text-muted">Локация для погоды</h2>
          <p className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-accent" />
            {place.city || "Не задана"}
            {place.lat != null && place.lon != null && (
              <span className="text-xs text-muted">
                ({place.lat.toFixed(2)}, {place.lon.toFixed(2)})
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void find()}
              placeholder="Найти город"
              aria-label="Найти город"
              className="min-w-0 flex-1 rounded-2xl bg-ink/5 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <button className="btn-ghost px-4" onClick={() => void find()} disabled={searching} aria-label="Искать">
              {searching ? <Spinner /> : <Search className="h-4 w-4" />}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="divide-y divide-ink/5 overflow-hidden rounded-2xl bg-ink/5">
              {results.map((g) => (
                <li key={g.id}>
                  <button className="w-full px-4 py-3 text-left text-sm hover:bg-ink/5" onClick={() => pick(g)}>
                    {g.name}
                    <span className="text-muted">
                      {[g.admin1, g.country].filter(Boolean).length ? `, ${[g.admin1, g.country].filter(Boolean).join(", ")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="text-sm text-accent underline" onClick={locate}>
            Определить автоматически
          </button>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-xs uppercase tracking-widest text-muted">Цветотип</h2>
          <div className="flex flex-wrap gap-2">
            {COLOR_TYPES.map((c) => (
              <Chip key={c.id} active={colorType === c.id} onClick={() => setColorType(colorType === c.id ? "" : c.id)} className="text-xs">
                {c.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-xs uppercase tracking-widest text-muted">Любимые стили</h2>
          <div className="flex flex-wrap gap-2">
            {STYLE_PREFS.map((s) => (
              <Chip
                key={s.id}
                active={prefs.includes(s.id)}
                onClick={() => setPrefs((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                className="text-xs"
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-xs uppercase tracking-widest text-muted">Тема</h2>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => changeTheme(id)}
                aria-pressed={theme === id}
                className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs transition ${
                  theme === id ? "bg-accent text-white" : "bg-ink/5"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <ErrorNote message={error} />

        <button className="btn-accent w-full py-4" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner className="text-white" /> : saved ? <Check className="h-4 w-4" /> : null}
          {saved ? "Сохранено" : "Сохранить"}
        </button>

        <button
          className="btn-ghost w-full"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </>
  );
}
