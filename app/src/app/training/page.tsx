"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useData, useGarmin } from "@/lib/data";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ActivitySheet } from "@/components/dashboard/activity-sheet";
import { Tile } from "@/components/dashboard/sheet-parts";
import { themeToken } from "@/lib/theme-tokens";
import { addDays, cn, fmtDur, fmtKm, fmtNum, isoDate, parseDate, weekStart } from "@/lib/format";
import { SPORT_META, SPORT_ORDER, typeLabel } from "@/lib/sports";
import type { Activity, SportGroup } from "@/lib/types";

export default function TrainingPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Training />;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
/** Pixel height of the bar area; the busiest day fills it exactly. */
const CHART_H = 104;

function Training() {
  const { activities, today } = useGarmin();
  // 0 = current week, -1 = last week …
  const [offset, setOffset] = useState(0);
  const [activity, setActivity] = useState<Activity | null>(null);

  const start = useMemo(() => addDays(weekStart(parseDate(today)), offset * 7), [today, offset]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(start, i);
        const iso = isoDate(d);
        return { iso, date: d, future: iso > today, items: activities.filter((a) => a.date === iso) };
      }),
    [start, activities, today],
  );

  const week = days.flatMap((d) => d.items);
  const totalDur = week.reduce((s, a) => s + (a.duration ?? 0), 0);
  const totalLoad = week.reduce((s, a) => s + (a.activityTrainingLoad ?? 0), 0);
  const totalDist = week.reduce((s, a) => s + (a.distance ?? 0), 0);
  const maxDayDur = Math.max(1, ...days.map((d) => d.items.reduce((s, a) => s + (a.duration ?? 0), 0)));

  const groupsUsed = SPORT_ORDER.filter((g) => week.some((a) => a.group === g));
  const isCurrent = offset === 0;
  const oldest = activities.at(-1)?.date;
  const canGoBack = !oldest || start > parseDate(oldest);

  return (
    <>
      <PageHeader kicker="Training" title="Deine Woche" sub="Eine Woche auf einmal — mit Vor und Zurück." />

      <Card className="mb-4 p-5">
        {/* Wochen-Navigation */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            onClick={() => setOffset((o) => o - 1)}
            disabled={!canGoBack}
            className="grid size-9 place-items-center rounded-lg border border-line text-ink-2 transition-colors hover:text-ink disabled:opacity-30"
            aria-label="Vorherige Woche"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </button>

          <div className="text-center">
            <p className="text-sm font-semibold">
              {isCurrent ? "Diese Woche" : offset === -1 ? "Letzte Woche" : `KW ab ${start.toLocaleDateString("de-DE", { day: "numeric", month: "short" })}`}
            </p>
            <p className="text-[11px] text-ink-3">
              {start.toLocaleDateString("de-DE", { day: "numeric", month: "short" })} –{" "}
              {addDays(start, 6).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>

          <button
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrent}
            className="grid size-9 place-items-center rounded-lg border border-line text-ink-2 transition-colors hover:text-ink disabled:opacity-30"
            aria-label="Nächste Woche"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </button>
        </div>

        {/* Balken je Tag, gestapelt nach Sportart. Höhen in px statt %: eine
            Prozent-Höhe braucht einen Eltern-Container mit fester Höhe, die ein
            flex-1-Kind nicht hat — deshalb blieben die Balken vorher unsichtbar. */}
        <div className="flex items-end gap-1.5">
          {days.map((d) => (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-col justify-end gap-[2px]" style={{ height: CHART_H }}>
                {d.items.map((a) => (
                  <button
                    key={a.activityId}
                    onClick={() => setActivity(a)}
                    title={`${a.activityName || typeLabel(a.typeKey)} · ${fmtDur(a.duration, { short: true })}`}
                    className="w-full rounded-[4px] transition-opacity hover:opacity-80"
                    style={{
                      height: Math.max(6, ((a.duration ?? 0) / maxDayDur) * CHART_H),
                      background: themeToken(SPORT_META[a.group].cssVar),
                    }}
                  />
                ))}
                {!d.items.length && (
                  <div className={cn("h-[3px] w-full rounded-full", d.future ? "bg-transparent" : "bg-line-soft")} />
                )}
              </div>
              <span className={cn("text-[11px]", d.iso === today ? "font-semibold text-gold" : "text-ink-3")}>
                {WEEKDAYS[(d.date.getDay() + 6) % 7]}
              </span>
            </div>
          ))}
        </div>

        {groupsUsed.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 border-t border-line-soft pt-4">
            {groupsUsed.map((g) => (
              <span key={g} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <span className="size-2 rounded-full" style={{ background: themeToken(SPORT_META[g].cssVar) }} />
                {SPORT_META[g].label}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Einheiten" value={`${week.length}`} />
        <Tile label="Zeit" value={fmtDur(totalDur, { short: true })} />
        <Tile label="Distanz" value={totalDist ? fmtKm(totalDist) : "–"} />
        <Tile label="Trainingslast" value={fmtNum(totalLoad)} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Einheiten dieser Woche</h2>
        {week.length === 0 ? (
          <Empty>{isCurrent ? "Diese Woche noch nichts trainiert." : "In dieser Woche keine Einheiten."}</Empty>
        ) : (
          <div className="space-y-2">
            {days
              .filter((d) => d.items.length)
              .map((d) => (
                <div key={d.iso}>
                  <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wider text-ink-3">
                    {d.date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "short" })}
                  </p>
                  <div className="space-y-2">
                    {d.items.map((a) => (
                      <ActivityRow key={a.activityId} a={a} onClick={() => setActivity(a)} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <ActivitySheet activity={activity} onClose={() => setActivity(null)} />
    </>
  );
}

export function ActivityRow({ a, onClick }: { a: Activity; onClick: () => void }) {
  const meta = SPORT_META[a.group];
  const Icon = meta.icon;
  return (
    <Card className="p-3.5" onClick={onClick}>
      <div className="flex items-center gap-3.5">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${meta.bg}`}>
          <Icon className={`size-[18px] ${meta.text}`} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.activityName || typeLabel(a.typeKey)}</p>
          <p className="truncate text-xs text-ink-3">
            {typeLabel(a.typeKey)}
            {a.distance ? ` · ${fmtKm(a.distance)}` : ""} · {fmtDur(a.duration, { short: true })}
            {a.averageHR ? ` · ${Math.round(a.averageHR)} bpm` : ""}
          </p>
        </div>
        {a.activityTrainingLoad ? (
          <span className="shrink-0 rounded-full border border-line-soft px-2.5 py-1 text-[11px] tabular text-ink-3">
            {Math.round(a.activityTrainingLoad)}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
