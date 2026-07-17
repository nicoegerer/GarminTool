"use client";

import { useMemo, useState } from "react";
import { inRange, useData, useGarmin } from "@/lib/data";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts";
import { themeToken } from "@/lib/theme-tokens";
import { Explain, Tile } from "@/components/dashboard/sheet-parts";
import { cn, fmtDateShort, fmtDur, fmtNum, median } from "@/lib/format";

export default function HealthPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Health />;
}

const RANGES = [
  { days: 30, label: "30 Tage" },
  { days: 90, label: "90 Tage" },
  { days: 180, label: "180 Tage" },
  { days: 9999, label: "Alles" },
];

function Health() {
  const { daily, today } = useGarmin();
  const [days, setDays] = useState(90);

  const rhr = useMemo(
    () => inRange((daily.rhr ?? []).filter((r) => r.values?.restingHR != null).map((r) => ({ date: r.calendarDate, v: r.values.restingHR! })), today, days),
    [daily, today, days],
  );
  const sleep = useMemo(() => inRange((daily.sleep_scores ?? []).filter((s) => s.total_s), today, days), [daily, today, days]);
  const bb = useMemo(() => inRange((daily.body_battery ?? []).filter((b) => b.highest != null), today, days), [daily, today, days]);
  const stress = useMemo(
    () => inRange((daily.stress ?? []).filter((s) => s.values?.overallStressLevel != null).map((s) => ({ date: s.calendarDate, v: s.values.overallStressLevel! })), today, days),
    [daily, today, days],
  );
  const steps = useMemo(
    () => inRange((daily.steps ?? []).filter((s) => s.totalSteps != null).map((s) => ({ date: s.calendarDate, v: s.totalSteps! })), today, days),
    [daily, today, days],
  );
  const im = useMemo(
    () =>
      inRange(
        (daily.intensity_minutes_weekly ?? [])
          .filter((w) => w.calendarDate)
          .map((w) => ({ date: w.calendarDate, v: (w.moderateValue ?? 0) + 2 * (w.vigorousValue ?? 0), goal: w.weeklyGoal ?? 150 })),
        today,
        days,
      ),
    [daily, today, days],
  );

  const rhrBase = median(rhr.slice(-30).map((r) => r.v));

  return (
    <>
      <PageHeader kicker="Gesundheit" title="Erholung & Alltag" sub="Nur Tage, an denen du die Uhr getragen hast." />

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
        <Tile label="Ruhepuls" value={rhr.at(-1) ? `${rhr.at(-1)!.v}` : "–"} hint={rhrBase ? `Median ${fmtNum(rhrBase)}` : "bpm"} />
        <Tile label="Schlaf" value={sleep.at(-1)?.score ? `${sleep.at(-1)!.score}` : "–"} hint={sleep.at(-1) ? fmtDur(sleep.at(-1)!.total_s, { short: true }) : undefined} />
        <Tile label="Body Battery" value={bb.at(-1)?.highest != null ? `${bb.at(-1)!.highest}` : "–"} hint={bb.at(-1)?.lowest != null ? `Tief ${bb.at(-1)!.lowest}` : undefined} />
        <Tile label="Stress Ø" value={stress.at(-1) ? `${stress.at(-1)!.v}` : "–"} hint="0–100" />
      </div>

      <div className="space-y-4">
        <Block title="Ruhepuls" hint="niedriger = besser erholt">
          {rhr.length >= 3 ? (
            <LineChart
              labels={rhr.map((r) => fmtDateShort(r.date))}
              series={[{ label: "Ruhepuls", data: rhr.map((r) => r.v), color: themeToken("--sport-run"), fill: true }]}
              yFormat={(v) => `${v.toFixed(0)}`}
              tooltipFormat={(v, _l, i) => `${v} bpm · ${fmtDateShort(rhr[i]?.date ?? "")}`}
            />
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>

        <Block title="Schlaf-Score">
          {sleep.length >= 3 ? (
            <LineChart
              labels={sleep.map((s) => fmtDateShort(s.date))}
              series={[{ label: "Score", data: sleep.map((s) => s.score), color: themeToken("--sport-gym"), fill: true }]}
              yMin={0}
              yMax={100}
              tooltipFormat={(v, _l, i) => `Score ${v} · ${fmtDur(sleep[i]?.total_s, { short: true })}`}
            />
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>

        <Block title="Body Battery" hint="Tageshoch und -tief">
          {bb.length >= 3 ? (
            <>
              <LineChart
                labels={bb.map((b) => fmtDateShort(b.date))}
                series={[
                  { label: "Höchstwert", data: bb.map((b) => b.highest), color: themeToken("--sport-swim"), fill: true },
                  { label: "Tiefstwert", data: bb.map((b) => b.lowest), color: themeToken("--sport-hike") },
                ]}
                yMin={0}
                yMax={100}
              />
              <div className="mt-3 flex gap-4">
                <Dot color={themeToken("--sport-swim")} label="Höchstwert" />
                <Dot color={themeToken("--sport-hike")} label="Tiefstwert" />
              </div>
            </>
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>

        <Block title="Stresslevel" hint="Tagesdurchschnitt">
          {stress.length >= 3 ? (
            <LineChart
              labels={stress.map((s) => fmtDateShort(s.date))}
              series={[{ label: "Stress", data: stress.map((s) => s.v), color: themeToken("--caution"), fill: true }]}
              yMin={0}
              yMax={100}
            />
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>

        <Block title="Schritte">
          {steps.length >= 3 ? (
            <LineChart
              labels={steps.map((s) => fmtDateShort(s.date))}
              series={[{ label: "Schritte", data: steps.map((s) => s.v), color: themeToken("--sport-walk"), fill: true }]}
              yFormat={(v) => `${(v / 1000).toFixed(0)}k`}
              tooltipFormat={(v) => `${v.toLocaleString("de-DE")} Schritte`}
            />
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>

        <Block title="Intensitätsminuten" hint="pro Woche · intensiv zählt doppelt">
          {im.length >= 3 ? (
            <>
              <LineChart
                labels={im.map((w) => fmtDateShort(w.date))}
                series={[
                  { label: "Minuten", data: im.map((w) => w.v), color: themeToken("--gold"), fill: true },
                  { label: "Wochenziel", data: im.map((w) => w.goal), color: themeToken("--ink-3"), dashed: true },
                ]}
                yFormat={(v) => `${v.toFixed(0)}`}
              />
              <div className="mt-3 flex gap-4">
                <Dot color={themeToken("--gold")} label="Erreicht" />
                <Dot color={themeToken("--ink-3")} label="Wochenziel" />
              </div>
            </>
          ) : (
            <Empty>Keine Daten im Zeitraum.</Empty>
          )}
        </Block>
      </div>

      <div className="mt-4">
        <Explain title="Was dein Forerunner 945 nicht misst">
          <p>
            <strong>HRV</strong> (Herzratenvariabilität) und <strong>Training Readiness</strong> tauchen hier nicht
            auf, weil dein Gerät sie nicht erfasst — Garmin hat beides erst ab dem Forerunner 955 eingeführt. Auch
            Muskelbelastung und eine Regenerationszeit-Anzeige fehlen.
          </p>
          <p>
            Der Coach weiß das und schätzt diese Werte nicht. Er arbeitet stattdessen mit dem, was du wirklich hast:
            Trainingslast, Ruhepuls-Abweichung, Schlaf und Body Battery. Das reicht für gute Entscheidungen.
          </p>
        </Explain>
      </div>
    </>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
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

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
