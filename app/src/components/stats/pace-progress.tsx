"use client";

import { useMemo } from "react";
import { LineChart, type Series } from "@/components/charts";
import { Empty } from "@/components/ui/primitives";
import { themeToken } from "@/lib/theme-tokens";
import { fmtDateShort, fmtPace } from "@/lib/format";
import type { Activity } from "@/lib/types";

/**
 * "Werde ich schneller?" — average pace per distance class over time.
 *
 * Runs are bucketed by distance so a 5 km effort is never compared against a
 * half marathon; each class gets its own line. The Y axis is reversed, so a
 * line going UP means getting faster — which is what the eye expects from a
 * progress chart.
 */
const BUCKETS = [
  { key: "5k", label: "5 km", min: 4300, max: 6000, cssVar: "--sport-run" },
  { key: "10k", label: "10 km", min: 8500, max: 11500, cssVar: "--gold" },
  { key: "15k", label: "15 km", min: 13500, max: 17000, cssVar: "--sport-ride" },
  { key: "hm", label: "Halbmarathon", min: 17500, max: 23000, cssVar: "--sport-swim" },
];

interface Entry {
  date: string;
  bucket: string;
  pace: number;
}

export function PaceProgress({ activities }: { activities: Activity[] }) {
  const entries = useMemo<Entry[]>(() => {
    const rows: Entry[] = [];
    for (const a of activities) {
      if (a.group !== "run" || !a.distance) continue;
      const b = BUCKETS.find((x) => a.distance! >= x.min && a.distance! <= x.max);
      if (!b) continue;
      // Moving time, not elapsed: breaks and traffic lights made an 18 km run
      // read as 8:54/km instead of the 6:03/km actually run. Garmin's own
      // averageSpeed is no help here — it is the elapsed-time figure too.
      const secs = a.movingDuration || a.duration;
      const pace = secs ? secs / (a.distance / 1000) : null;
      if (!pace || !isFinite(pace)) continue;
      rows.push({ date: a.date, bucket: b.key, pace });
    }
    return rows.sort((x, y) => x.date.localeCompare(y.date));
  }, [activities]);

  const used = BUCKETS.filter((b) => entries.some((e) => e.bucket === b.key));

  const series = useMemo<Series[]>(
    () =>
      used.map((b) => ({
        label: b.label,
        color: themeToken(b.cssVar),
        // One x-slot per run; a class only fills its own slots and the chart
        // spans the gaps, so the lines stay readable side by side.
        data: entries.map((e) => (e.bucket === b.key ? e.pace : null)),
      })),
    [entries, used],
  );

  if (!entries.length) {
    return <Empty>Noch keine Läufe auf 5 km, 10 km oder Halbmarathon-Distanz.</Empty>;
  }

  return (
    <>
      <LineChart
        labels={entries.map((e) => fmtDateShort(e.date))}
        series={series}
        height={280}
        points
        reverseY
        yFormat={(v) => fmtPace(v)}
        tooltipFormat={(v, label) => `${label}: ${fmtPace(v)}`}
      />

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line-soft pt-4">
        {used.map((b) => {
          const own = entries.filter((e) => e.bucket === b.key);
          const first = own[0];
          const last = own[own.length - 1];
          // Pace drops as you get faster, so first-minus-last is the gain.
          const delta = own.length > 1 ? first.pace - last.pace : null;
          return (
            <div key={b.key} className="flex items-center gap-2 text-[12px]">
              <span className="size-2 shrink-0 rounded-full" style={{ background: themeToken(b.cssVar) }} />
              <span className="text-ink-2">{b.label}</span>
              <span className="text-ink-3">
                {own.length === 1
                  ? fmtPace(last.pace)
                  : `${fmtPace(first.pace)} → ${fmtPace(last.pace)}`}
              </span>
              {delta != null && Math.abs(delta) >= 1 && (
                <span className={delta > 0 ? "text-positive" : "text-negative"}>
                  {delta > 0 ? "−" : "+"}
                  {Math.abs(Math.round(delta))} s/km
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
