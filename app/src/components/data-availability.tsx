"use client";

import { useData } from "@/lib/data";
import { historicalDataLabels } from "@/lib/data-availability";

export function DataAvailability() {
  const { data } = useData();
  const historical = historicalDataLabels(data?.manifest ?? null);
  if (!data?.manifest) return null;
  const pending = data.manifest.source !== "python_garminconnect";
  if (!historical.length && !pending) return null;

  return (
    <details className="mb-4 text-[11px] text-ink-3" aria-label="Hinweis zum Datenstand">
      <summary className="cursor-pointer">Garmin Connect · {pending ? "Einrichtung offen" : "teilweise gespeicherter Stand"}</summary>
      <p className="mt-1 max-w-2xl leading-relaxed">{pending ? "Die neue Garmin-Anmeldung ist noch nicht durch einen erfolgreichen Datenabruf bestätigt. " : ""}{historical.length ? `Gespeichert: ${historical.join(", ")}. Der letzte verfügbare Stand bleibt bei Abruffehlern erhalten.` : ""}</p>
    </details>
  );
}
