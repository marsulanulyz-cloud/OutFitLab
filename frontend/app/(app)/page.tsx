"use client";

import { useState } from "react";
import useSWR from "swr";
import { ItemCard } from "@/components/ItemCard";
import { ItemSheet } from "@/components/ItemSheet";
import { Chip, EmptyState, ErrorNote, PageTitle, Spinner } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { GROUPS } from "@/lib/labels";
import type { Item, Status } from "@/lib/types";

const STATUSES: { id: "" | Status; label: string }[] = [
  { id: "", label: "Все" },
  { id: "available", label: "Доступные" },
  { id: "laundry", label: "В стирке" },
];

export default function ClosetPage() {
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const params = new URLSearchParams({ limit: "100" });
  if (group) params.set("category_group", group);
  if (status) params.set("status", status);

  const { data, error, isLoading } = useSWR<Item[]>(`/items?${params.toString()}`, fetcher);
  const selected = data?.find((i) => i.id === selectedId) ?? null;
  const filtered = group !== "" || status !== "";

  return (
    <>
      <PageTitle
        title="Гардероб"
        subtitle={data ? `${data.length} ${filtered ? "по фильтру" : "вещей"}` : undefined}
      />

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {GROUPS.map((g) => (
          <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>
      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {STATUSES.map((s) => (
          <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)} className="text-xs">
            {s.label}
          </Chip>
        ))}
      </div>

      {error && <ErrorNote message={error instanceof Error ? error.message : "Не удалось загрузить гардероб"} />}
      {isLoading && (
        <div className="grid place-items-center py-20">
          <Spinner className="h-7 w-7" />
        </div>
      )}

      {data && data.length === 0 && (
        <EmptyState
          title={filtered ? "Ничего не найдено" : "Гардероб пуст"}
          text={
            filtered
              ? "Попробуйте другой фильтр."
              : "Нажмите «+» внизу и сфотографируйте первую вещь — фон уберём автоматически."
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="columns-2 gap-3 md:columns-3 lg:columns-4">
          {data.map((item) => (
            <ItemCard key={item.id} item={item} onClick={() => setSelectedId(item.id)} />
          ))}
        </div>
      )}

      <ItemSheet item={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
