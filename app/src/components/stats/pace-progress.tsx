"use client";

import { useMemo } from "react";
import { LineChart, type Series } from "@/components/charts";
import { Empty } from "@/components/ui/primitives";
import { themeToken } from "@/lib/theme-tokens";
import { fmtDateShort, fmtPace } from "@/lib/format";
import type { Activity } from "@/lib/types";

/**
 * "Werde ich schneller?" — pace per distance class over time.
 *
 * Classes are cumulative: a run counts for every class whose distance it
 * reaches or exceeds, so a 12 km run shows up under "ab 5 km" and "ab 10 km".
 * The Y axis is reversed, so a rising line means getting faster.
 */
const CLASSES = [
  { key: "5k", label: "ab 5 km", min: 5000, cssVar: "--sport-run" },
  { key: "10k", label: "ab 10 km", min: 10000, cssVar: "--gold" },
  { key: "15k", label: "ab 15 km", min: 15000, cssVar: "--sport-ride" },
  { key: "marathon", label: "ab Marathon", min: 42195, cssVar: "--sport-swim" },
];

interface Entry {
  activity: Activity;
  date: string;
  pace: number;
  /** True when Garmin gave no moving speed and the pace had to be derived. */
  derived: boolean;
}

/**
 * Garmin's own moving-average speed is the source of truth. `averageSpeed` is
 * the elapsed-time figure — it reads an 18 km run as 8:54/km instead of the
 * 6:03/km actually run — so it is only a fallback, and deriving from
 * duration/distance is the last resort and gets flagged in the UI.
 */
function paceOf(a: Activity): { pace: number; derived: boolean } | null {
  if (a.averageMovingSpeed) return { pace: 1000 / a.averageMovingSpeed, derived: false };
  if (a.movingDuration && a.distance) return { pace: a.movingDuration / (a.distance / 1000), derived: true };
  if (a.averageSpeed) return { pace: 1000 / a.averageSpeed, derived: true };
  return null;
}

export function PaceProgress({
  activities,
  onSelect,
}: {
  activities: Activity[];
  onSelect?: (a: Activity) => void;
}) {
  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = [];
    for (const a of activities) {
      if (a.group !== "run" || !a.distance || a.distance < CLASSES[0].min) continue;
      const p = paceOf(a);
      if (!p || !isFinite(p.pace)) continue;
      rows.push({ activity: a, date: a.date, pace: p.pace, derived: p.derived });
    }
    return rows.sort((x, y) => x.date.localeCompare(y.date));
  }, [activities]);

  const used = CLASSES.filter((c) => entries.some((e) => (e.activity.distance ?? 0) >= c.min));

  const series = useMemo<Series[]>(
    () =>
      used.map((c) => ({
        label: c.label,
        color: themeToken(c.cssVar),
        data: entries.map((e) => ((e.activity.distance ?? 0) >= c.min ? e.pace : null)),
      })),
    [entries, used],
  );

  if (!entries.length) return <Empty>Noch keine Läufe ab 5 km.</Empty>;

  const anyDerived = entries.some((e) => e.derived);

  return (
    <>
      <LineChart
        labels={entries.map((e) => fmtDateShort(e.date))}
        series={series}
        height={280}
        points
        reverseY
        yFormat={(v) => fmtPace(v)}
        tooltipFormat={(v, label, i) =>
          `${label}: ${fmtPace(v)} · ${entries[i]?.activity.activityName ?? ""}${entries[i]?.derived ? " (berechnet)" : ""}`
        }
        onPointClick={onSelect ? (i) => entries[i] && onSelect(entries[i].activity) : undefined}
      />

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft pt-4">
        {used.map((c) => {
          const own = entries.filter((e) => (e.activity.distance ?? 0) >= c.min);
          const first = own[0];
          const last = own[own.length - 1];
          // Pace falls as you get faster, so first-minus-last is the gain.
          const delta = own.length > 1 ? first.pace - last.pace : null;
          return (
            <div key={c.key} className="flex items-center gap-2 text-[12px]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: themeToken(c.cssVar) }} />
              <span className="text-ink-2">{c.label}</span>
              <span className="text-ink-3">
                {own.length === 1 ? fmtPace(last.pace) : `${fmtPace(first.pace)} → ${fmtPace(last.pace)}`}
              </span>
              {delta != null && Math.abs(delta) >= 1 && (
                <span className={delta > 0 ? "text-positive" : "text-negative"}>
                  {delta > 0 ? "−" : "+"}
                  {Math.abs(Math.round(delta))} s/km
                </span>
              )}
              <span className="text-ink-3">· {own.length}×</span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Ø-Tempo laut Garmin (Bewegungszeit). Ein Lauf zählt in jede Klasse, die er erreicht — ein 12-km-Lauf also
        unter „ab 5 km" und „ab 10 km". Tippe einen Punkt an, um den Lauf zu öffnen.
        {anyDerived && " Bei Einheiten ohne Garmin-Tempowert ist die Pace berechnet — im Tooltip mit „(berechnet)“ markiert."}
      </p>
    </>
  );
}
