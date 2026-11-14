const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const API_BASE = `${API}/api/v1`;

// Access-токен живёт только в памяти. Refresh-токен — в httpOnly-cookie, JS его не видит.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function doRefresh(): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch("/api/session/refresh", { method: "POST" });
    if (r.ok) {
      const d = (await r.json()) as { access_token: string };
      accessToken = d.access_token;
      return true;
    }
    const body = (await r.json().catch(() => ({}))) as { code?: string };
    if (r.status !== 401 || body.code === "no_session") break;
    // Гонка двух вкладок: cookie могла обновиться секундой раньше — пробуем ещё раз
    await new Promise((res) => setTimeout(res, 400));
  }
  accessToken = null;
  return false;
}

/** Один общий запрос на обновление: параллельные вызовы не «сжигают» refresh-токен дважды. */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  };

  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();

  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") message = j.detail;
    } catch {
      /* тело не JSON */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function fetcher<T>(path: string): Promise<T> {
  return apiFetch<T>(path);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Что-то пошло не так";
}
