import { mutate } from "swr";

/** Перечитать всё, что зависит от гардероба и образов. */
export function revalidateAll() {
  return mutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/items") || key.startsWith("/stats") || key.startsWith("/outfits")),
  );
}
