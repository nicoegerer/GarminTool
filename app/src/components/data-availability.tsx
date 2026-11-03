"use client";

import { useData } from "@/lib/data";
import { historicalDataLabels } from "@/lib/data-availability";

export function DataAvailability() {
  const { data } = useData();
  const historical = historicalDataLabels(data?.manifest ?? null);
  if (!historical.length) return null;

  return (
    <aside className="mb-4 rounded-xl border border-caution/25 bg-caution/5 px-4 py-3 text-[13px] leading-relaxed text-ink-2" aria-label="Hinweis zum Datenstand">
      <span className="font-medium text-ink">Gespeicherter Stand: {historical.join(", ")}.</span>{" "}
      Diese Werte bleiben sichtbar, werden von der Garmin Personal API derzeit aber nicht aktualisiert.
    </aside>
  );
}
