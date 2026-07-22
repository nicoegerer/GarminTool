"use client";

import { useMemo, useState } from "react";
import { LineChart, type Series } from "@/components/charts";
import { Empty } from "@/components/ui/primitives";
import { themeToken } from "@/lib/theme-tokens";
import { cn, fmtDateShort, fmtPace } from "@/lib/format";
import type { Activity } from "@/lib/types";

/**
 * "Werde ich schneller?" — pace per distance class.
 *
 * Classes are cumulative: a run counts for every class whose distance it
 * reaches or exceeds, so a 12 km run appears under "ab 5 km" and "ab 10 km".
 * Y is reversed — a rising line means getting faster.
 *
 * Colours are deliberately far apart in hue rather than shades of one accent:
 * with four or five lines on top of each other, a muted ramp is unreadable.
 */
const CLASSES = [
  { key: "5", label: "ab 5 km", short: "5 km", min: 5000, cssVar: "--gold" },
  { key: "10", label: "ab 10 km", short: "10 km", min: 10000, cssVar: "--sport-swim" },
  { key: "15", label: "ab 15 km", short: "15 km", min: 15000, cssVar: "--sport-gym" },
  { key: "21", label: "ab 21 km", short: "21 km", min: 21000, cssVar: "--sport-run" },
  { key: "42", label: "ab Marathon", short: "Marathon", min: 42195, cssVar: "--positive" },
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
  const [filter, setFilter] = useState<string>("all");

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
  const active = used.find((c) => c.key === filter);

  // One class selected: only its runs, so dates on the x axis carry meaning.
  // All classes at once: the x positions of different classes don't line up,
  // so a date axis would be misleading — the sequence is what's readable.
  const shown = active ? entries.filter((e) => (e.activity.distance ?? 0) >= active.min) : entries;

  const series = useMemo<Series[]>(() => {
    if (active) {
      return [
        {
          label: active.label,
          color: themeToken(active.cssVar),
          data: shown.map((e) => e.pace),
        },
      ];
    }
    return used.map((c) => ({
      label: c.label,
      color: themeToken(c.cssVar),
      data: shown.map((e) => ((e.activity.distance ?? 0) >= c.min ? e.pace : null)),
    }));
  }, [active, used, shown]);

  if (!entries.length) return <Empty>Noch keine Läufe ab 5 km.</Empty>;

  const anyDerived = shown.some((e) => e.derived);

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={!active} onClick={() => setFilter("all")}>
          Alle
        </FilterChip>
        {used.map((c) => (
          <FilterChip key={c.key} active={filter === c.key} color={c.cssVar} onClick={() => setFilter(c.key)}>
            {c.short}
          </FilterChip>
        ))}
      </div>

      <LineChart
        labels={shown.map((e) => (active ? fmtDateShort(e.date) : ""))}
        series={series}
        height={280}
        points
        reverseY
        yFormat={(v) => fmtPace(v)}
        tooltipFormat={(v, label, i) => {
          const e = shown[i];
          if (!e) return `${label}: ${fmtPace(v)}`;
          const km = ((e.activity.distance ?? 0) / 1000).toFixed(1);
          return `${fmtPace(v)} · ${km} km · ${fmtDateShort(e.date)}${e.derived ? " (berechnet)" : ""}`;
        }}
        onPointClick={onSelect ? (i) => shown[i] && onSelect(shown[i].activity) : undefined}
      />

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft pt-4">
        {(active ? [active] : used).map((c) => {
          const own = entries.filter((e) => (e.activity.distance ?? 0) >= c.min);
          const first = own[0];
          const last = own[own.length - 1];
          // Pace falls as you get faster, so first-minus-last is the gain.
          const delta = own.length > 1 ? first.pace - last.pace : null;
          return (
            <div key={c.key} className="flex items-center gap-2 text-[12px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: themeToken(c.cssVar) }} />
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
        Ø-Tempo laut Garmin (Bewegungszeit), gesamte Historie. Ein Lauf zählt in jede Klasse, die er erreicht — ein
        12-km-Lauf also unter „ab 5 km" und „ab 10 km". Wähle eine Klasse, um sie einzeln mit Datum zu sehen; tippe
        einen Punkt an, um den Lauf zu öffnen.
        {anyDerived && " Fehlt Garmins Tempowert, ist die Pace berechnet — im Tooltip markiert."}
      </p>
    </>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        active ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
      )}
    >
      {color && <span className="size-2 rounded-full" style={{ background: themeToken(color) }} />}
      {children}
    </button>
  );
}
