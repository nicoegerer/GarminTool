"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { useData, useGarmin, useStreaks, useVo2max } from "@/lib/data";
import { MetricCard } from "@/components/dashboard/metric-card";
import { FormSheet, RaceSheet, Vo2maxSheet } from "@/components/dashboard/detail-sheets";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { themeToken as chartToken } from "@/lib/theme-tokens";
import { fmtDur, fmtKm, fmtNum, fmtTime, median } from "@/lib/format";
import { SPORT_META, typeLabel } from "@/lib/sports";

export default function DashboardPage() {
  const { loading, error } = useData();
  if (loading) return <DashboardSkeleton />;
  if (error) return <PageHeader title="Daten konnten nicht geladen werden" sub={error} />;
  return <Dashboard />;
}

function Dashboard() {
  const data = useGarmin();
  const streaks = useStreaks();
  const vo2 = useVo2max();
  const [sheet, setSheet] = useState<"form" | "vo2" | "race" | null>(null);

  const last = data.loadTrend.at(-1);
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 14 ? "Guten Tag" : h < 18 ? "Servus" : "Guten Abend";
  }, []);

  const rhrRows = (data.daily.rhr ?? []).filter((r) => r.values?.restingHR != null);
  const rhrLast = rhrRows.at(-1);
  const rhrBase = median(rhrRows.slice(-30).map((r) => r.values.restingHR));
  const sleepLast = (data.daily.sleep_scores ?? []).at(-1);
  const race = data.fitness.race_predictions;
  const recent = data.activities.slice(0, 4);

  return (
    <>
      <PageHeader
        kicker={new Date(data.today).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting}, ${data.profile?.full_name ?? "Nico"}.`}
        sub={
          data.manifest
            ? `Datenstand ${new Date(data.manifest.generated_at).toLocaleString("de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} Uhr`
            : undefined
        }
      />

      {/* Coach-Einstieg: die KI ist der Kern, nicht ein Feature am Rand */}
      <Card className="mb-5 overflow-hidden p-0">
        <Link href="/coach" className="group flex items-center gap-5 p-6">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold/12">
            <span className="size-2.5 rounded-full bg-gold shadow-[0_0_12px_hsl(var(--gold))]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="kicker mb-1">Dein Coach</p>
            <p className="text-[15px] font-medium leading-snug">
              {streaks.thisWeekCount === 0
                ? "Diese Woche noch nichts gelaufen. Lass uns schauen, was heute Sinn ergibt."
                : `Was heute ansteht — auf Basis deiner ${data.activities.length} Einheiten.`}
            </p>
          </div>
          <ArrowRight className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </Link>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {last && (
          <MetricCard
            label="Form (TSB)"
            value={`${last.tsb > 0 ? "+" : ""}${fmtNum(last.tsb)}`}
            hint={last.tsb >= 5 ? "Frisch" : last.tsb >= -10 ? "Neutral" : last.tsb >= -25 ? "Belastet" : "Stark belastet"}
            spark={data.loadTrend.slice(-42).map((r) => r.tsb)}
            accent={chartToken("--gold")}
            onClick={() => setSheet("form")}
            delay={0.02}
          />
        )}
        {last && (
          <MetricCard
            label="Fitness (CTL)"
            value={fmtNum(last.ctl)}
            delta={ctlDelta(data.loadTrend)}
            spark={data.loadTrend.slice(-90).map((r) => r.ctl)}
            accent={chartToken("--sport-ride")}
            onClick={() => setSheet("form")}
            delay={0.05}
          />
        )}
        {vo2.length > 0 && (
          <MetricCard
            label="VO₂max"
            value={vo2.at(-1)!.vo2max.toFixed(1)}
            hint="ml/kg/min"
            spark={vo2.slice(-20).map((v) => v.vo2max)}
            accent={chartToken("--sport-ride")}
            onClick={() => setSheet("vo2")}
            delay={0.08}
          />
        )}
        {race?.time5K != null && (
          <MetricCard
            label="5-km-Prognose"
            value={fmtTime(race.time5K)}
            hint="Garmin-Schätzung"
            onClick={() => setSheet("race")}
            delay={0.11}
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MetricCard
          label="Wochen-Serie"
          value={
            <span className="flex items-center gap-1.5">
              <Flame className="size-5 text-gold" strokeWidth={2} />
              {streaks.currentWeekStreak}
            </span>
          }
          unit="Wochen"
          hint={`Rekord: ${streaks.longestWeekStreak}`}
          delay={0.14}
        />
        <MetricCard
          label="Diese Woche"
          value={streaks.thisWeekCount}
          unit="Einheiten"
          hint={fmtDur(streaks.thisWeekDuration, { short: true })}
          delay={0.17}
        />
        {rhrLast && (
          <MetricCard
            label="Ruhepuls"
            value={rhrLast.values.restingHR!}
            unit="bpm"
            delta={
              rhrBase
                ? {
                    text: `${rhrLast.values.restingHR! - rhrBase > 0 ? "+" : ""}${fmtNum(rhrLast.values.restingHR! - rhrBase)} vs. Median`,
                    tone: rhrLast.values.restingHR! > rhrBase + 2 ? "down" : rhrLast.values.restingHR! < rhrBase - 1 ? "up" : "flat",
                  }
                : undefined
            }
            spark={rhrRows.slice(-30).map((r) => r.values.restingHR)}
            accent={chartToken("--sport-run")}
            delay={0.2}
          />
        )}
        {sleepLast && (
          <MetricCard
            label="Schlaf"
            value={sleepLast.score ?? "–"}
            unit={sleepLast.score ? "/100" : undefined}
            hint={fmtDur(sleepLast.total_s, { short: true })}
            spark={(data.daily.sleep_scores ?? []).slice(-14).map((s) => s.score)}
            accent={chartToken("--sport-gym")}
            delay={0.23}
          />
        )}
      </div>

      {/* Letzte Einheiten: nur ein Anriss, Tiefe auf der Aktivitätenseite */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Zuletzt trainiert</h2>
          <Link href="/aktivitaeten" className="text-[13px] text-ink-3 transition-colors hover:text-gold">
            Alle ansehen →
          </Link>
        </div>
        {recent.length === 0 ? (
          <Empty>Noch keine Aktivitäten.</Empty>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {recent.map((a, i) => {
              const meta = SPORT_META[a.group];
              const Icon = meta.icon;
              return (
                <Card key={a.activityId} delay={0.26 + i * 0.03} className="p-0">
                  <Link href={`/aktivitaeten/${a.activityId}`} className="flex items-center gap-3.5 p-4">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${meta.bg}`}>
                      <Icon className={`size-[18px] ${meta.text}`} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.activityName || typeLabel(a.typeKey)}</p>
                      <p className="truncate text-xs text-ink-3">
                        {new Date(a.date).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}
                        {a.distance ? ` · ${fmtKm(a.distance)}` : ""} · {fmtDur(a.duration, { short: true })}
                      </p>
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <FormSheet open={sheet === "form"} onClose={() => setSheet(null)} />
      <Vo2maxSheet open={sheet === "vo2"} onClose={() => setSheet(null)} />
      <RaceSheet open={sheet === "race"} onClose={() => setSheet(null)} />
    </>
  );
}

function ctlDelta(trend: { ctl: number }[]): { text: string; tone: "up" | "down" | "flat" } | undefined {
  const last = trend.at(-1);
  const prev = trend.at(-29);
  if (!last || !prev) return undefined;
  const d = last.ctl - prev.ctl;
  if (Math.abs(d) < 0.5) return { text: "stabil vs. 4 Wo.", tone: "flat" };
  return { text: `${d > 0 ? "+" : ""}${fmtNum(d)} vs. 4 Wo.`, tone: d > 0 ? "up" : "down" };
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 pt-6">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-6 h-24 w-full rounded-[1.25rem]" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-[1.25rem]" />
        ))}
      </div>
    </div>
  );
}
