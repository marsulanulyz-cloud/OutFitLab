// BFF: refresh-токен хранится в httpOnly-cookie и никогда не попадает в JS браузера.
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API =
  process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const COOKIE = "refresh_token";
const PATH = "/api/session";
const MAX_AGE = 60 * 60 * 24 * 30;

function callBackend(path: string, body: unknown) {
  return fetch(`${API}/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

function setRefresh(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: PATH,
    maxAge: MAX_AGE,
  });
}

function clearRefresh(res: NextResponse) {
  res.cookies.set(COOKIE, "", { path: PATH, maxAge: 0 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const jar = await cookies();

  if (action === "google" || action === "apple") {
    const payload = await req.json().catch(() => null);
    if (!payload) return NextResponse.json({ detail: "Некорректный запрос" }, { status: 400 });
    const r = await callBackend(`/auth/${action}`, payload);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json({ detail: data.detail ?? "Ошибка входа" }, { status: r.status });
    }
    const { refresh_token, ...rest } = data;
    const res = NextResponse.json(rest);
    setRefresh(res, refresh_token);
    return res;
  }

  if (action === "refresh") {
    const token = jar.get(COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ detail: "Нет сессии", code: "no_session" }, { status: 401 });
    }
    const r = await callBackend("/auth/refresh", { refresh_token: token });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const res = NextResponse.json({ detail: "Сессия истекла" }, { status: 401 });
      // Не стираем cookie при сбоях бэкенда — только при отказе по существу
      if (r.status === 401) clearRefresh(res);
      return res;
    }
    const { refresh_token, ...rest } = data;
    const res = NextResponse.json(rest);
    setRefresh(res, refresh_token);
    return res;
  }

  if (action === "logout") {
    const token = jar.get(COOKIE)?.value;
    if (token) await callBackend("/auth/logout", { refresh_token: token }).catch(() => undefined);
    const res = new NextResponse(null, { status: 204 });
    clearRefresh(res);
    return res;
  }

  return NextResponse.json({ detail: "Not found" }, { status: 404 });
}
