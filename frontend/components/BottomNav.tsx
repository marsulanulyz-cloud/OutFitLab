"use client";

import { Lightbulb, Plus, Shirt, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Гардероб", Icon: Shirt },
  { href: "/looks", label: "Образы", Icon: Sparkles },
  null, // место под центральную кнопку
  { href: "/insights", label: "Инсайты", Icon: Lightbulb },
  { href: "/profile", label: "Профиль", Icon: User },
] as const;

export function BottomNav({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/5 bg-card/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {TABS.map((tab, i) =>
          tab === null ? (
            <li key="add" className="relative flex justify-center">
              <button
                type="button"
                onClick={onAdd}
                aria-label="Добавить вещь"
                className="absolute -top-7 grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lift transition active:scale-95"
              >
                <Plus className="h-7 w-7" strokeWidth={2.2} />
              </button>
            </li>
          ) : (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition",
                  isActive(tab.href) ? "text-accent" : "text-muted",
                )}
              >
                <tab.Icon className="h-5 w-5" strokeWidth={isActive(tab.href) ? 2.2 : 1.7} />
                {tab.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
