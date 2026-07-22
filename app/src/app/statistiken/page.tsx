"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { inRange, useData, useGarmin, useVo2max, useWeekly } from "@/lib/data";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts";
import { PaceProgress } from "@/components/stats/pace-progress";
import { themeToken } from "@/lib/theme-tokens";
import { Tile } from "@/components/dashboard/sheet-parts";
import {
  cn,
  fmtDateShort,
  fmtDur,
  fmtKm,
  fmtNum,
  fmtPace,
  fmtPace100,
  fmtSpeed,
  paceFromSpeed,
  rollingMean,
} from "@/lib/format";
import { SPORT_META, SPORT_ORDER } from "@/lib/sports";

export default function StatsPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Stats />;
}

const RANGES = [
  { days: 90, label: "90 Tage" },
  { days: 180, label: "180 Tage" },
  { days: 365, label: "1 Jahr" },
  { days: 9999, label: "Alles" },
];

function Stats() {
  const { activities, loadTrend, today } = useGarmin();
  const weekly = useWeekly();
  const vo2 = useVo2max();
  const [days, setDays] = useState(180);

  const router = useRouter();

  /* Alle Serien hängen an EINEM Zeitfenster — deshalb kann keine mehr desynchronisieren. */
  const load = useMemo(() => inRange(loadTrend, today, days), [loadTrend, today, days]);
  const weeks = useMemo(() => inRange(weekly.map((w) => ({ ...w, date: w.start })), today, days), [weekly, today, days]);
  const vo2w = useMemo(() => inRange(vo2, today, days), [vo2, today, days]);
  const acts = useMemo(() => inRange([...activities].reverse(), today, days), [activities, today, days]);

  const runs = acts.filter((a) => a.group === "run" && (a.distance ?? 0) > 2000 && a.averageSpeed);
  const rides = acts.filter((a) => a.group === "ride" && (a.distance ?? 0) > 10000 && a.averageSpeed);
  const swims = acts.filter((a) => a.group === "swim" && (a.distance ?? 0) > 400 && a.duration);

  const totalDur = acts.reduce((s, a) => s + (a.duration ?? 0), 0);
  const totalDist = acts.reduce((s, a) => s + (a.distance ?? 0), 0);
  const totalElev = acts.reduce((s, a) => s + (a.elevationGain ?? 0), 0);

  const byGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of acts) m.set(a.group, (m.get(a.group) ?? 0) + (a.duration ?? 0));
    return SPORT_ORDER.filter((g) => m.has(g)).map((g) => ({ g, dur: m.get(g)! }));
  }, [acts]);

  return (
    <>
      <PageHeader kicker="Statistiken" title="Wirst du besser?" />

      {/* Ein Filter für alle Charts der Seite */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setDays(r.days)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              days === r.days ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Einheiten" value={`${acts.length}`} />
        <Tile label="Zeit" value={`${(totalDur / 3600).toFixed(0)} h`} />
        <Tile label="Distanz" value={fmtKm(totalDist, 0)} />
        <Tile label="Höhenmeter" value={`${fmtNum(totalElev)} hm`} />
      </div>

      {byGroup.length > 0 && (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-sm font-semibold">Verteilung nach Sportart</h2>
          <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
            {byGroup.map(({ g, dur }) => (
              <div key={g} style={{ width: `${(dur / totalDur) * 100}%`, background: themeToken(SPORT_META[g].cssVar) }} />
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            {byGroup.map(({ g, dur }) => (
              <div key={g} className="flex items-center gap-2.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: themeToken(SPORT_META[g].cssVar) }} />
                <span className="text-[13px] text-ink-2">{SPORT_META[g].label}</span>
                <span className="ml-auto text-[13px] font-medium tabular">{fmtDur(dur, { short: true })}</span>
                <span className="w-10 text-right text-[11px] tabular text-ink-3">{((dur / totalDur) * 100).toFixed(0)} %</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="space-y-4">
        <ChartCard title="Wochenvolumen" hint="Stunden pro Kalenderwoche">
          {weeks.length >= 2 ? (
            <LineChart
              labels={weeks.map((w) => fmtDateShort(w.start))}
              series={[{ label: "Stunden", data: weeks.map((w) => w.duration / 3600), color: themeToken("--gold"), fill: true }]}
              yFormat={(v) => `${v.toFixed(0)} h`}
              tooltipFormat={(v, _l, i) => `${v.toFixed(1)} h · ${weeks[i]?.count ?? 0} Einheiten`}
              points
            />
          ) : (
            <Empty>Zu wenig Daten im Zeitraum.</Empty>
          )}
        </ChartCard>

        <ChartCard title="Trainingslast & Form" hint="Ziehen zum Verschieben, Scrollen/Pinch zum Zoomen">
          {load.length >= 7 ? (
            <>
              <LineChart
                labels={load.map((r) => fmtDateShort(r.date))}
                series={[
                  { label: "Fitness (CTL)", data: load.map((r) => r.ctl), color: themeToken("--sport-ride"), fill: true },
                  { label: "Ermüdung (ATL)", data: load.map((r) => r.atl), color: themeToken("--sport-run") },
                  { label: "Form (TSB)", data: load.map((r) => r.tsb), color: themeToken("--gold") },
                ]}
                yFormat={(v) => fmtNum(v)}
              />
              <Legend
                items={[
                  { label: "Fitness (CTL)", color: themeToken("--sport-ride") },
                  { label: "Ermüdung (ATL)", color: themeToken("--sport-run") },
                  { label: "Form (TSB)", color: themeToken("--gold") },
                ]}
              />
            </>
          ) : (
            <Empty>Zu wenig Daten im Zeitraum.</Empty>
          )}
        </ChartCard>

        <ChartCard title="VO₂max" hint="aus Laufeinheiten geschätzt">
          {vo2w.length >= 2 ? (
            <LineChart
              labels={vo2w.map((v) => fmtDateShort(v.date))}
              series={[{ label: "VO₂max", data: vo2w.map((v) => v.vo2max), color: themeToken("--sport-ride"), fill: true }]}
              yFormat={(v) => v.toFixed(0)}
              tooltipFormat={(v) => `VO₂max ${v.toFixed(1)}`}
              points
            />
          ) : (
            <Empty>Im Zeitraum keine VO₂max-Messung.</Empty>
          )}
        </ChartCard>

        {/* Ersetzt das frühere "Lauf-Pace"-Chart: das warf alle Distanzen in eine
            Linie, wodurch ein langer Lauf wie ein Formverlust aussah. */}
        <ChartCard title="Werde ich schneller?" hint="Ø-Pace je Distanzklasse · höher = schneller">
          <PaceProgress activities={acts} onSelect={(a) => router.push(`/aktivitaeten/?a=${a.activityId}`)} />
        </ChartCard>

        <ChartCard title="Rad-Tempo" hint="Ø je Fahrt über 10 km">
          {rides.length >= 3 ? (
            <LineChart
              labels={rides.map((a) => fmtDateShort(a.date))}
              series={[
                { label: "Trend", data: rollingMean(rides.map((a) => (a.averageSpeed ?? 0) * 3.6), 5), color: themeToken("--sport-ride") },
              ]}
              yFormat={(v) => `${v.toFixed(0)} km/h`}
              tooltipFormat={(v, _l, i) => `${v.toFixed(1)} km/h · ${rides[i]?.activityName ?? ""}`}
            />
          ) : (
            <Empty>Zu wenige Radfahrten im Zeitraum.</Empty>
          )}
        </ChartCard>

        <ChartCard title="Schwimm-Pace" hint="Ø je Einheit über 400 m · höher = schneller">
          {swims.length >= 3 ? (
            <LineChart
              labels={swims.map((a) => fmtDateShort(a.date))}
              series={[
                {
                  label: "Trend",
                  data: rollingMean(swims.map((a) => (a.duration ?? 0) / ((a.distance ?? 1) / 100)), 5),
                  color: themeToken("--sport-swim"),
                },
              ]}
              yFormat={(v) => fmtPace100(v)}
              tooltipFormat={(v, _l, i) => `${fmtPace100(v)} · ${swims[i]?.activityName ?? ""}`}
              reverseY
            />
          ) : (
            <Empty>Zu wenige Schwimmeinheiten im Zeitraum.</Empty>
          )}
        </ChartCard>
      </div>
    </>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
