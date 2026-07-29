"use client";

import { useMemo, useState } from "react";
import { LineChart, type Series } from "@/components/charts";
import { Empty } from "@/components/ui/primitives";
import { themeToken } from "@/lib/theme-tokens";
import { cn, fmtDateShort, fmtPace } from "@/lib/format";
import { typeLabel } from "@/lib/sports";
import type { Activity } from "@/lib/types";

/**
 * "Werde ich schneller?" — pace grouped by target distance.
 *
 * Each class is a ±1 km band around a round race distance, so a run you stopped
 * at 5.1 km or 4.9 km both count as "5 km". Bands don't overlap. A run that
 * lands between bands (7 km, 18 km, …) belongs to no class and shows up only
 * under "Alle".
 *
 * Y is reversed — a rising line means getting faster. Colours sit far apart in
 * hue rather than shades of one accent: several overlaid lines need contrast.
 */
const BANDS = [
  { key: "5", label: "5 km", lo: 4000, hi: 6000, cssVar: "--gold" },
  { key: "10", label: "10 km", lo: 9000, hi: 11000, cssVar: "--sport-swim" },
  { key: "15", label: "15 km", lo: 14000, hi: 16000, cssVar: "--sport-gym" },
  { key: "21", label: "Halbmarathon", lo: 20000, hi: 22000, cssVar: "--sport-run" },
  { key: "42", label: "Marathon", lo: 41000, hi: 43000, cssVar: "--positive" },
];
const OTHER_COLOR = "--ink-3";

function bandOf(distance: number): string | null {
  return BANDS.find((b) => distance >= b.lo && distance <= b.hi)?.key ?? null;
}

interface Entry {
  activity: Activity;
  date: string;
  pace: number;
  band: string | null;
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
      if (a.group !== "run" || !a.distance) continue;
      const p = paceOf(a);
      if (!p || !isFinite(p.pace)) continue;
      rows.push({ activity: a, date: a.date, pace: p.pace, band: bandOf(a.distance), derived: p.derived });
    }
    return rows.sort((x, y) => x.date.localeCompare(y.date));
  }, [activities]);

  const usedBands = BANDS.filter((b) => entries.some((e) => e.band === b.key));
  const active = usedBands.find((b) => b.key === filter);

  // One band selected: only its runs, so dates on the x axis carry meaning.
  // "Alle": every run, so the date axis would misalign bands — sequence reads.
  const shown = active ? entries.filter((e) => e.band === active.key) : entries;

  const series = useMemo<Series[]>(() => {
    if (active) {
      return [{ label: active.label, color: themeToken(active.cssVar), data: shown.map((e) => e.pace) }];
    }
    const bandSeries = usedBands.map((b) => ({
      label: b.label,
      color: themeToken(b.cssVar),
      data: shown.map((e) => (e.band === b.key ? e.pace : null)),
    }));
    // The "rest" — runs in no band — as a muted line, so nothing disappears.
    if (shown.some((e) => e.band === null)) {
      bandSeries.push({
        label: "Sonstige",
        color: themeToken(OTHER_COLOR),
        data: shown.map((e) => (e.band === null ? e.pace : null)),
      });
    }
    return bandSeries;
  }, [active, usedBands, shown]);

  if (!entries.length) return <Empty>Noch keine Läufe.</Empty>;

  const anyDerived = shown.some((e) => e.derived);
  const otherCount = entries.filter((e) => e.band === null).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterChip active={!active} onClick={() => setFilter("all")}>
          Alle
        </FilterChip>
        {usedBands.map((b) => (
          <FilterChip key={b.key} active={filter === b.key} color={b.cssVar} onClick={() => setFilter(b.key)}>
            {b.label}
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
          const name = e.activity.activityName || typeLabel(e.activity.typeKey);
          const km = ((e.activity.distance ?? 0) / 1000).toFixed(2);
          return `${name} — ${fmtPace(v)} · ${km} km · ${fmtDateShort(e.date)}${e.derived ? " (berechnet)" : ""}`;
        }}
        onPointClick={onSelect ? (i) => shown[i] && onSelect(shown[i].activity) : undefined}
      />

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft pt-4">
        {(active ? [active] : usedBands).map((b) => {
          const own = entries.filter((e) => e.band === b.key);
          const first = own[0];
          const last = own[own.length - 1];
          // Pace falls as you get faster, so first-minus-last is the gain.
          const delta = own.length > 1 ? first.pace - last.pace : null;
          return (
            <div key={b.key} className="flex items-center gap-2 text-[12px]">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: themeToken(b.cssVar) }} />
              <span className="text-ink-2">{b.label}</span>
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
        Ø-Tempo laut Garmin (Bewegungszeit), gesamte Historie. Läufe werden nach Zieldistanz gruppiert (±1 km): 4–6 km
        zählen als „5 km", 9–11 km als „10 km" usw. Läufe dazwischen erscheinen nur unter „Alle"
        {otherCount > 0 && ` (${otherCount}×)`}. Fahr über einen Punkt für Name und Datum, tippe ihn an, um den Lauf zu
        öffnen.
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
