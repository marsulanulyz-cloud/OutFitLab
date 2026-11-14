"use client";

import { Apple } from "lucide-react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorNote, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { User } from "@/lib/types";

const GOOGLE_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const APPLE_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";

interface SessionResponse {
  access_token: string;
  user: User;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(cfg: { client_id: string; callback: (r: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
        };
      };
    };
    AppleID?: {
      auth: {
        init(cfg: Record<string, unknown>): void;
        signIn(): Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();
  const googleBtn = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const exchange = useCallback(
    async (provider: "google" | "apple", payload: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(`/api/session/${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Не удалось войти");
        const d = data as SessionResponse;
        signIn(d.access_token, d.user);
        router.replace("/");
      } catch (e) {
        setError(errorMessage(e));
        setBusy(false);
      }
    },
    [router, signIn],
  );

  const initGoogle = useCallback(() => {
    if (!window.google || !googleBtn.current || !GOOGLE_ID) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_ID,
      callback: (r) => void exchange("google", { id_token: r.credential }),
    });
    window.google.accounts.id.renderButton(googleBtn.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 300,
    });
  }, [exchange]);

  const initApple = useCallback(() => {
    if (!window.AppleID || !APPLE_ID) return;
    window.AppleID.auth.init({
      clientId: APPLE_ID,
      scope: "name email",
      redirectURI: window.location.origin,
      usePopup: true,
    });
  }, []);

  useEffect(() => {
    if (window.google) initGoogle();
    if (window.AppleID) initApple();
  }, [initGoogle, initApple]);

  async function appleSignIn() {
    if (!window.AppleID) return;
    try {
      const res = await window.AppleID.auth.signIn();
      const n = res.user?.name;
      const name = n ? [n.firstName, n.lastName].filter(Boolean).join(" ") : undefined;
      await exchange("apple", { identity_token: res.authorization.id_token, name });
    } catch (e) {
      // Закрытие окна Apple — не ошибка
      if (typeof e === "object" && e !== null && "error" in e) return;
      setError(errorMessage(e));
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
      />
      <div className="relative w-full max-w-sm text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-muted">ИИ-стилист</p>
        <h1 className="font-display text-6xl tracking-tight">Stylist</h1>
        <p className="mx-auto mt-4 max-w-xs text-balance text-muted">
          Полный шкаф — и есть что надеть. Загрузите вещи, а образы мы соберём сами.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3">
          {busy && <Spinner className="h-6 w-6" />}
          <div ref={googleBtn} className={busy ? "pointer-events-none opacity-40" : ""} />
          {APPLE_ID && (
            <button
              onClick={() => void appleSignIn()}
              disabled={busy}
              className="btn w-[300px] bg-black text-white disabled:opacity-40 dark:border dark:border-white/20"
            >
              <Apple className="h-4 w-4 fill-white" /> Продолжить с Apple
            </button>
          )}
          {!GOOGLE_ID && !APPLE_ID && (
            <p className="text-sm text-muted">Вход не настроен: задайте NEXT_PUBLIC_GOOGLE_CLIENT_ID.</p>
          )}
          <div className="w-full max-w-[300px]">
            <ErrorNote message={error} />
          </div>
        </div>
      </div>

      {GOOGLE_ID && (
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initGoogle} />
      )}
      {APPLE_ID && (
        <Script
          src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
          strategy="afterInteractive"
          onLoad={initApple}
        />
      )}
    </main>
  );
}
