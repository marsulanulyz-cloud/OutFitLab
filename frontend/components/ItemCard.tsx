import { Droplets } from "lucide-react";
import { CATEGORY_RU } from "@/lib/labels";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ItemCard({ item, onClick, badge }: { item: Item; onClick?: () => void; badge?: string }) {
  const laundry = item.status === "laundry";
  return (
    <button
      type="button"
      onClick={onClick}
      className="card relative mb-3 block w-full break-inside-avoid overflow-hidden text-left transition active:scale-[0.98]"
    >
      <div className={cn("podium", laundry && "opacity-50")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.title} loading="lazy" className="block h-auto w-full p-4" />
      </div>
      <div className="px-3.5 pb-3.5">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-xs text-muted">{CATEGORY_RU[item.category_slug] ?? item.category_slug}</p>
      </div>
      {laundry && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-[11px] text-white">
          <Droplets className="h-3 w-3" /> В стирке
        </span>
      )}
      {badge && (
        <span className="absolute right-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] text-canvas">
          {badge}
        </span>
      )}
    </button>
  );
}
