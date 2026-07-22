"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/primitives";
import { loadActivityDetail } from "@/lib/data";
import type { Activity, ActivityDetail } from "@/lib/types";
import { fToC, fmtDur, fmtKm, fmtNum, fmtPace, fmtPace100, fmtSpeed, fmtTime, paceFromSpeed } from "@/lib/format";
import { SPORT_META, TE_LABELS, typeLabel } from "@/lib/sports";
import { themeToken } from "@/lib/theme-tokens";
import { Explain, Tile } from "./sheet-parts";

/**
 * Everything the watch recorded for one activity, arranged per sport.
 * Fields absent for this activity simply don't render — no "–" wall.
 */
export function ActivitySheet({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setLoading(true);
    setDetail(null);
    let cancelled = false;
    void loadActivityDetail(activity.activityId).then((d) => {
      if (!cancelled) {
        setDetail(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activity]);

  if (!activity) return <Sheet open={false} onClose={onClose} title="" children={null} />;

  const meta = SPORT_META[activity.group];
  const date = new Date(activity.startTimeLocal ?? activity.date);

  return (
    <Sheet
      open
      onClose={onClose}
      title={activity.activityName || typeLabel(activity.typeKey)}
      subtitle={`${date.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })} · ${date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · ${typeLabel(activity.typeKey)}`}
    >
      <div className="space-y-7">
        <HeadlineStats a={activity} d={detail} />

        {loading && <Skeleton className="h-40 w-full" />}

        {detail && (
          <>
            {detail.hrZones && detail.hrZones.some((z) => z.secs > 0) && <HrZones zones={detail.hrZones} />}
            {detail.powerZones && detail.powerZones.some((z) => z.secs > 0) && (
              <HrZones zones={detail.powerZones} title="Leistungszonen" unit="W" />
            )}
            {detail.running && <RunningDynamics r={detail.running} />}
            {detail.cycling && Object.keys(detail.cycling).length > 0 && <CyclingBlock c={detail.cycling} />}
            {detail.swimming && <SwimBlock s={detail.swimming} />}
            {detail.laps && detail.laps.length > 1 && <Splits laps={detail.laps} group={activity.group} />}
            {detail.lengths && detail.lengths.length > 0 && <SwimLengths lengths={detail.lengths} />}
            {detail.weather && <Weather w={detail.weather} />}
            <MoreStats s={detail.summary ?? {}} />
            {activity.trainingEffectLabel && activity.trainingEffectLabel !== "UNKNOWN" && (
              <Explain title="Trainingseffekt">
                <p>
                  Garmin ordnet diese Einheit als <strong>{TE_LABELS[activity.trainingEffectLabel] ?? activity.trainingEffectLabel}</strong>{" "}
                  ein
                  {activity.aerobicTrainingEffect != null && <> — aerober Effekt {activity.aerobicTrainingEffect.toFixed(1)} von 5</>}
                  {activity.anaerobicTrainingEffect ? <>, anaerober Effekt {activity.anaerobicTrainingEffect.toFixed(1)}</> : null}.
                </p>
                <p className="text-ink-3">
                  Die Trainingslast von {fmtNum(activity.activityTrainingLoad)} fließt in deine Fitness (CTL) und
                  Ermüdung (ATL) ein.
                </p>
              </Explain>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function HeadlineStats({ a, d }: { a: Activity; d: ActivityDetail | null }) {
  const s = d?.summary ?? {};
  const tiles: { label: string; value: string; hint?: string }[] = [];

  if (a.distance) tiles.push({ label: "Distanz", value: fmtKm(a.distance, 2) });
  tiles.push({ label: "Zeit", value: fmtTime(a.duration), hint: a.movingDuration ? `${fmtTime(a.movingDuration)} in Bewegung` : undefined });

  if (a.group === "run" && a.averageSpeed) {
    tiles.push({ label: "Ø Pace", value: fmtPace(paceFromSpeed(a.averageSpeed)) });
    if (a.maxSpeed) tiles.push({ label: "Beste Pace", value: fmtPace(paceFromSpeed(a.maxSpeed)) });
  } else if (a.group === "ride" && a.averageSpeed) {
    tiles.push({ label: "Ø Tempo", value: fmtSpeed(a.averageSpeed) });
    if (a.maxSpeed) tiles.push({ label: "Max Tempo", value: fmtSpeed(a.maxSpeed) });
  } else if (a.group === "swim" && a.distance && a.duration) {
    tiles.push({ label: "Ø Pace", value: fmtPace100(a.duration / (a.distance / 100)) });
  }

  if (a.averageHR) tiles.push({ label: "Ø Puls", value: `${Math.round(a.averageHR)}`, hint: a.maxHR ? `max ${Math.round(a.maxHR)} bpm` : "bpm" });
  if (a.elevationGain && a.elevationGain > 5) tiles.push({ label: "Höhenmeter", value: `${Math.round(a.elevationGain)} hm`, hint: a.elevationLoss ? `${Math.round(a.elevationLoss)} hm bergab` : undefined });
  if (a.calories) tiles.push({ label: "Kalorien", value: `${Math.round(a.calories)}`, hint: "kcal" });
  if (a.activityTrainingLoad) tiles.push({ label: "Trainingslast", value: fmtNum(a.activityTrainingLoad) });
  if (typeof s.avgRespirationRate === "number") tiles.push({ label: "Ø Atemfrequenz", value: s.avgRespirationRate.toFixed(0), hint: "pro Minute" });
  if (a.totalSets) tiles.push({ label: "Sätze", value: `${a.activeSets ?? a.totalSets}`, hint: a.totalReps ? `${a.totalReps} Wiederholungen` : undefined });

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <Tile key={t.label} {...t} />
      ))}
    </div>
  );
}

function HrZones({
  zones,
  title = "Herzfrequenz-Zonen",
  unit = "bpm",
}: {
  zones: { zone: number; secs: number; floor: number }[];
  title?: string;
  unit?: string;
}) {
  const total = zones.reduce((s, z) => s + z.secs, 0);
  if (!total) return null;
  // One hue, darker with intensity — an ordinal ramp, not five identities.
  const shades = ["0.28", "0.44", "0.62", "0.82", "1"];

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {zones.map((z, i) => (
          <div
            key={z.zone}
            style={{ width: `${(z.secs / total) * 100}%`, background: `hsl(var(--sport-run) / ${shades[i]})` }}
          />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {zones.map((z, i) => (
          <div key={z.zone} className="flex items-center gap-2.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: `hsl(var(--sport-run) / ${shades[i]})` }} />
            <span className="text-[13px] text-ink-2">
              Zone {z.zone} <span className="text-ink-3">ab {z.floor} {unit}</span>
            </span>
            <span className="ml-auto text-[13px] font-medium tabular">{fmtDur(z.secs, { short: true })}</span>
            <span className="w-10 text-right text-[11px] tabular text-ink-3">{((z.secs / total) * 100).toFixed(0)} %</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RunningDynamics({ r }: { r: NonNullable<ActivityDetail["running"]> }) {
  const items = [
    r.averageRunCadence && {
      label: "Schrittfrequenz",
      value: `${r.averageRunCadence.toFixed(0)}`,
      hint: r.maxRunCadence ? `max ${r.maxRunCadence.toFixed(0)} Schritte/min` : "Schritte/min",
    },
    r.strideLength && { label: "Schrittlänge", value: `${(r.strideLength / 100).toFixed(2)} m` },
    r.groundContactTime && { label: "Bodenkontakt", value: `${r.groundContactTime.toFixed(0)} ms` },
    r.verticalOscillation && { label: "Vertikale Bewegung", value: `${r.verticalOscillation.toFixed(1)} cm` },
    r.verticalRatio && { label: "Vertical Ratio", value: `${r.verticalRatio.toFixed(1)} %` },
    r.groundContactBalanceLeft && { label: "Balance L/R", value: `${r.groundContactBalanceLeft.toFixed(1)} / ${(100 - r.groundContactBalanceLeft).toFixed(1)}` },
    r.steps && { label: "Schritte", value: fmtNum(r.steps) },
    r.maxVerticalSpeed && { label: "Max Steigrate", value: `${(r.maxVerticalSpeed * 60).toFixed(0)} m/min` },
    r.lactateThresholdHeartRate && {
      label: "Laktatschwelle",
      value: `${r.lactateThresholdHeartRate.toFixed(0)} bpm`,
      hint: r.lactateThresholdSpeed ? fmtPace(paceFromSpeed(r.lactateThresholdSpeed)) : undefined,
    },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  if (!items.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Running Dynamics</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Diese Werte liefert dein HRM 600. Niedrigerer Bodenkontakt und ein kleineres Vertical Ratio bedeuten
        ökonomischeren Laufstil — beides verbessert sich mit Frequenz, nicht mit mehr Kraft.
      </p>
    </section>
  );
}

function CyclingBlock({ c }: { c: NonNullable<ActivityDetail["cycling"]> }) {
  const items = [
    c.averagePower && { label: "Ø Leistung", value: `${c.averagePower.toFixed(0)} W` },
    c.normalizedPower && { label: "Normalized Power", value: `${c.normalizedPower.toFixed(0)} W` },
    c.maxPower && { label: "Max Leistung", value: `${c.maxPower.toFixed(0)} W` },
    c.trainingStressScore && { label: "TSS", value: c.trainingStressScore.toFixed(0) },
    c.intensityFactor && { label: "Intensity Factor", value: c.intensityFactor.toFixed(2) },
    c.averageBikeCadence && {
      label: "Ø Trittfrequenz",
      value: `${c.averageBikeCadence.toFixed(0)}`,
      hint: c.maxBikeCadence ? `max ${c.maxBikeCadence.toFixed(0)} U/min` : "U/min",
    },
    c.totalWork && { label: "Arbeit", value: `${(c.totalWork / 1000).toFixed(0)} kJ` },
    c.leftRightBalance != null && { label: "Balance L/R", value: `${c.leftRightBalance.toFixed(1)} / ${(100 - c.leftRightBalance).toFixed(1)}` },
    c.beginPotentialStamina != null && { label: "Stamina Start", value: `${c.beginPotentialStamina.toFixed(0)} %` },
    c.endPotentialStamina != null && { label: "Stamina Ende", value: `${c.endPotentialStamina.toFixed(0)} %` },
    c.minAvailableStamina != null && { label: "Stamina Tief", value: `${c.minAvailableStamina.toFixed(0)} %` },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  if (!items.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Rad-Daten</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
    </section>
  );
}

function SwimBlock({ s }: { s: NonNullable<ActivityDetail["swimming"]> }) {
  const items = [
    s.averageSWOLF && { label: "Ø SWOLF", value: s.averageSWOLF.toFixed(0), hint: "niedriger = effizienter" },
    s.averageStrokes && { label: "Ø Züge/Bahn", value: s.averageStrokes.toFixed(1) },
    s.totalNumberOfStrokes && { label: "Züge gesamt", value: `${s.totalNumberOfStrokes}` },
    s.averageSwimCadence && { label: "Zugfrequenz", value: `${s.averageSwimCadence.toFixed(0)}`, hint: "Züge/min" },
    s.numberOfActiveLengths && { label: "Bahnen", value: `${s.numberOfActiveLengths}`, hint: s.poolLength ? `à ${s.poolLength} m` : undefined },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  if (!items.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Schwimm-Daten</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        SWOLF ist Zeit plus Züge pro Bahn. Er sinkt, wenn du schneller wirst <em>oder</em> mit weniger Zügen
        auskommst — die kompakteste Effizienzzahl, die es im Wasser gibt.
      </p>
    </section>
  );
}

function Splits({ laps, group }: { laps: NonNullable<ActivityDetail["laps"]>; group: string }) {
  const max = Math.max(...laps.map((l) => l.averageSpeed ?? 0));

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Splits</h3>
      <div className="space-y-1">
        {laps.map((l, i) => {
          const pace =
            group === "run" ? fmtPace(paceFromSpeed(l.averageSpeed)) : group === "ride" ? fmtSpeed(l.averageSpeed) : fmtDur(l.duration, { short: true });
          const width = max && l.averageSpeed ? (l.averageSpeed / max) * 100 : 0;
          return (
            <div key={i} className="relative overflow-hidden rounded-lg bg-surface-2 px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-gold/12" style={{ width: `${width}%` }} />
              <div className="relative flex items-center gap-3 text-[13px]">
                <span className="w-6 shrink-0 tabular text-ink-3">{l.lapIndex ?? i + 1}</span>
                <span className="w-16 shrink-0 tabular text-ink-3">{l.distance ? fmtKm(l.distance, 2) : "–"}</span>
                <span className="font-medium tabular">{pace}</span>
                {l.averageHR && <span className="ml-auto tabular text-ink-3">{Math.round(l.averageHR)} bpm</span>}
                {l.elevationGain != null && l.elevationGain > 3 && (
                  <span className="w-12 shrink-0 text-right tabular text-ink-3">+{Math.round(l.elevationGain)} hm</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const STROKE_LABELS: Record<string, string> = {
  FREESTYLE: "Kraul",
  BACKSTROKE: "Rücken",
  BREASTSTROKE: "Brust",
  BUTTERFLY: "Schmetterling",
  DRILL: "Technik",
  MIXED: "Gemischt",
  IM: "Lagen",
};

/** Per-length swim data — the finest grain the watch records in the pool. */
function SwimLengths({ lengths }: { lengths: NonNullable<ActivityDetail["lengths"]> }) {
  const active = lengths.filter((l) => l.duration);
  if (!active.length) return null;
  const slowest = Math.max(...active.map((l) => l.duration ?? 0));

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">
        Bahnen <span className="font-normal text-ink-3">· {active.length} gesamt</span>
      </h3>
      <div className="space-y-1">
        {active.map((l, i) => {
          // Faster length = fuller bar, so the eye reads speed left to right.
          const width = slowest && l.duration ? ((slowest - l.duration) / slowest) * 100 + 20 : 0;
          return (
            <div key={i} className="relative overflow-hidden rounded-lg bg-surface-2 px-3 py-2">
              <div className="absolute inset-y-0 left-0 bg-gold/12" style={{ width: `${Math.min(100, width)}%` }} />
              <div className="relative flex items-center gap-3 text-[13px]">
                <span className="w-6 shrink-0 tabular text-ink-3">{i + 1}</span>
                <span className="font-medium tabular">{fmtDur(l.duration, { short: true })}</span>
                {l.totalNumberOfStrokes != null && (
                  <span className="tabular text-ink-3">{l.totalNumberOfStrokes} Züge</span>
                )}
                {l.averageSWOLF != null && (
                  <span className="ml-auto tabular text-ink-3">SWOLF {l.averageSWOLF.toFixed(0)}</span>
                )}
                {l.swimStroke && (
                  <span className="w-20 shrink-0 text-right text-[11px] text-ink-3">
                    {STROKE_LABELS[l.swimStroke] ?? l.swimStroke}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Everything else the watch recorded. These are secondary readings — kept out
 * of the headline so it stays scannable, but shown rather than dropped.
 */
function MoreStats({ s }: { s: Record<string, number | string> }) {
  const n = (k: string) => (typeof s[k] === "number" ? (s[k] as number) : undefined);
  const items = [
    n("elapsedDuration") && { label: "Gesamtzeit", value: fmtTime(n("elapsedDuration")), hint: "inkl. Pausen" },
    n("minHR") && { label: "Min Puls", value: `${n("minHR")!.toFixed(0)}`, hint: "bpm" },
    n("averageMovingSpeed") && { label: "Ø Tempo in Bewegung", value: fmtSpeed(n("averageMovingSpeed")) },
    n("waterEstimated") && { label: "Schweißverlust", value: `${n("waterEstimated")!.toFixed(0)} ml`, hint: "geschätzt" },
    n("bmrCalories") && { label: "Grundumsatz", value: `${n("bmrCalories")!.toFixed(0)}`, hint: "kcal im Zeitraum" },
    n("maxElevation") != null && {
      label: "Höhe max",
      value: `${n("maxElevation")!.toFixed(0)} m`,
      hint: n("minElevation") != null ? `min ${n("minElevation")!.toFixed(0)} m` : undefined,
    },
    n("averageTemperature") != null && {
      label: "Ø Temperatur",
      value: `${n("averageTemperature")!.toFixed(0)} °C`,
      hint:
        n("minTemperature") != null && n("maxTemperature") != null
          ? `${n("minTemperature")!.toFixed(0)}–${n("maxTemperature")!.toFixed(0)} °C`
          : undefined,
    },
    n("maxRespirationRate") && {
      label: "Atemfrequenz Spanne",
      value: `${n("minRespirationRate")?.toFixed(0) ?? "?"}–${n("maxRespirationRate")!.toFixed(0)}`,
      hint: "pro Minute",
    },
    n("moderateIntensityMinutes") != null && {
      label: "Intensitätsminuten",
      value: `${n("moderateIntensityMinutes")!.toFixed(0)}`,
      hint: n("vigorousIntensityMinutes") ? `+ ${n("vigorousIntensityMinutes")!.toFixed(0)} intensiv` : "moderat",
    },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  if (!items.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Weitere Messwerte</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
    </section>
  );
}

function Weather({ w }: { w: NonNullable<ActivityDetail["weather"]> }) {
  const items = [
    w.tempF != null && { label: "Temperatur", value: `${fToC(w.tempF)} °C`, hint: w.apparentTempF != null ? `gefühlt ${fToC(w.apparentTempF)} °C` : undefined },
    w.humidity != null && {
      label: "Luftfeuchte",
      value: `${w.humidity} %`,
      hint: w.dewPointF != null ? `Taupunkt ${fToC(w.dewPointF)} °C` : undefined,
    },
    w.windSpeed != null && {
      label: "Wind",
      value: `${w.windSpeed} km/h`,
      hint: [w.windDirection?.toUpperCase(), w.windGust != null ? `Böen ${w.windGust} km/h` : null].filter(Boolean).join(" · ") || undefined,
    },
  ].filter(Boolean) as { label: string; value: string; hint?: string }[];

  if (!items.length) return null;

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Wetter {w.desc && <span className="font-normal text-ink-3">· {w.desc}</span>}</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((i) => (
          <Tile key={i.label} {...i} />
        ))}
      </div>
      {w.tempF != null && fToC(w.tempF)! > 24 && (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          Bei über 24 °C kostet Hitze Leistung: dein Körper schickt Blut in die Haut statt in die Muskulatur. Die
          Pace bei gleichem Puls fällt — das ist kein Formverlust.
        </p>
      )}
    </section>
  );
}
