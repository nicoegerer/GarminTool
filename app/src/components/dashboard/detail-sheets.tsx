"use client";

import { useMemo } from "react";
import { Sheet } from "@/components/ui/sheet";
import { LineChart } from "@/components/charts";
import { themeToken as chartToken } from "@/lib/theme-tokens";
import { Empty } from "@/components/ui/primitives";
import { Explain, Legend, SheetChart as ChartBlock, Tile } from "./sheet-parts";
import { inRange, useGarmin, useVo2max } from "@/lib/data";
import { fmtDateShort, fmtNum, fmtTime, median } from "@/lib/format";

/* ---------- Form / Trainingslast ---------- */

export function FormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loadTrend, today } = useGarmin();
  const rows = useMemo(() => inRange(loadTrend, today, 180), [loadTrend, today]);
  const last = loadTrend.at(-1);

  return (
    <Sheet open={open} onClose={onClose} title="Form & Trainingslast" subtitle="CTL · ATL · TSB der letzten 180 Tage">
      {!last ? (
        <Empty>Keine Belastungsdaten.</Empty>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Fitness (CTL)" value={fmtNum(last.ctl)} hint="42-Tage-Schnitt" />
            <Tile label="Ermüdung (ATL)" value={fmtNum(last.atl)} hint="7-Tage-Schnitt" />
            <Tile label="Form (TSB)" value={`${last.tsb > 0 ? "+" : ""}${fmtNum(last.tsb)}`} hint={tsbLabel(last.tsb)} />
          </div>

          <ChartBlock title="Verlauf" hint="Ziehen zum Verschieben, Scrollen/Pinch zum Zoomen">
            <LineChart
              labels={rows.map((r) => fmtDateShort(r.date))}
              series={[
                { label: "Fitness (CTL)", data: rows.map((r) => r.ctl), color: chartToken("--sport-ride"), fill: true },
                { label: "Ermüdung (ATL)", data: rows.map((r) => r.atl), color: chartToken("--sport-run") },
                { label: "Form (TSB)", data: rows.map((r) => r.tsb), color: chartToken("--gold") },
              ]}
              yFormat={(v) => fmtNum(v)}
              height={240}
            />
            <Legend
              items={[
                { label: "Fitness (CTL)", color: chartToken("--sport-ride") },
                { label: "Ermüdung (ATL)", color: chartToken("--sport-run") },
                { label: "Form (TSB)", color: chartToken("--gold") },
              ]}
            />
          </ChartBlock>

          <Explain title="Was die Zahlen bedeuten">
            <p>
              <strong>CTL</strong> ist dein Fitnessniveau — ein 42-Tage-Schnitt deiner Trainingslast. Er steigt
              langsam und fällt langsam. <strong>ATL</strong> ist die frische Ermüdung der letzten 7 Tage.
            </p>
            <p>
              <strong>TSB = CTL − ATL</strong> ist deine Form. Über +5 bist du frisch und wettkampfbereit, zwischen
              −10 und +5 im normalen Trainingsbereich, unter −25 stark ermüdet. Ein tiefer TSB ist im Aufbau normal —
              dauerhaft aber ein Übertrainings-Signal.
            </p>
            {last.acwr != null && (
              <p>
                Deine <strong>Belastungsquote (ACWR)</strong> liegt bei {last.acwr.toFixed(2)}: das Verhältnis der
                akuten zur chronischen Last. Ab 1,5 steigt das Verletzungsrisiko messbar.
              </p>
            )}
          </Explain>
        </div>
      )}
    </Sheet>
  );
}

function tsbLabel(tsb: number) {
  if (tsb >= 5) return "Frisch";
  if (tsb >= -10) return "Neutral";
  if (tsb >= -25) return "Belastet";
  return "Stark belastet";
}

/* ---------- VO2max ---------- */

export function Vo2maxSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const vo2 = useVo2max();
  const { loadTrend } = useGarmin();

  const trend = useMemo(() => {
    if (vo2.length < 2) return null;
    const first = vo2[0];
    const last = vo2.at(-1)!;
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
    const perYear = days > 0 ? ((last.vo2max - first.vo2max) / days) * 365 : 0;
    return { first, last, perYear };
  }, [vo2]);

  return (
    <Sheet open={open} onClose={onClose} title="VO₂max" subtitle="Maximale Sauerstoffaufnahme, aus Laufeinheiten geschätzt">
      {!vo2.length ? (
        <Empty>Noch keine VO₂max-Messungen.</Empty>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Aktuell" value={vo2.at(-1)!.vo2max.toFixed(1)} hint="ml/kg/min" />
            <Tile label="Bestwert" value={Math.max(...vo2.map((v) => v.vo2max)).toFixed(1)} hint="im Verlauf" />
            {trend && (
              <Tile
                label="Trend"
                value={`${trend.perYear > 0 ? "+" : ""}${trend.perYear.toFixed(1)}`}
                hint="pro Jahr hochgerechnet"
              />
            )}
          </div>

          <ChartBlock title="Verlauf">
            <LineChart
              labels={vo2.map((v) => fmtDateShort(v.date))}
              series={[{ label: "VO₂max", data: vo2.map((v) => v.vo2max), color: chartToken("--sport-ride"), fill: true }]}
              yFormat={(v) => v.toFixed(0)}
              tooltipFormat={(v) => `VO₂max ${v.toFixed(1)}`}
              points
              height={220}
            />
          </ChartBlock>

          <Explain title="Was VO₂max beeinflusst">
            <p>
              VO₂max ist die Menge Sauerstoff, die dein Körper pro Minute und Kilogramm verwerten kann — der
              wichtigste Einzelmarker für aerobe Leistungsfähigkeit. Garmin schätzt ihn aus dem Verhältnis von
              Pace zu Herzfrequenz bei Läufen; es ist eine Schätzung, kein Labortest.
            </p>
            <p>
              Nach oben treiben ihn vor allem: hohe Intervalle nahe VO₂max (3–5 Minuten hart), Schwellentraining
              und schlicht Umfang in Zone 2 — letzterer baut die Kapillaren und Mitochondrien, die den Sauerstoff
              überhaupt erst verwerten.
            </p>
            <p>
              Nach unten: Trainingspausen, Hitze (verfälscht die Schätzung nach unten), Krankheit, Gewichtszunahme.
              Einzelne Ausreißer nach einem Lauf bei 30 °C sagen wenig — der Trend über Wochen zählt.
            </p>
            {loadTrend.at(-1) && (
              <p className="text-ink-3">
                Zum Einordnen: bei einer Fitness (CTL) von {fmtNum(loadTrend.at(-1)!.ctl)} sind Sprünge von mehr als
                1–2 Punkten pro Monat unrealistisch — VO₂max bewegt sich träge.
              </p>
            )}
          </Explain>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Wettkampfprognosen ---------- */

const RACE_DISTS = [
  { key: "time5K", label: "5 km" },
  { key: "time10K", label: "10 km" },
  { key: "timeHalfMarathon", label: "Halbmarathon" },
  { key: "timeMarathon", label: "Marathon" },
] as const;

export function RaceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { fitness, today } = useGarmin();
  const now = fitness.race_predictions;
  const hist = useMemo(
    () =>
      (fitness.race_predictions_history ?? [])
        .filter((h) => h.calendarDate && RACE_DISTS.some((d) => h[d.key] != null))
        .map((h) => ({ ...h, date: h.calendarDate }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [fitness],
  );
  const windowed = useMemo(() => inRange(hist, today, 365), [hist, today]);

  return (
    <Sheet open={open} onClose={onClose} title="Wettkampfprognosen" subtitle="Garmins Schätzung aus VO₂max und Laufhistorie">
      {!now ? (
        <Empty>Keine Prognosen vorhanden.</Empty>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-2 gap-3">
            {RACE_DISTS.map((d) => {
              const cur = now[d.key];
              if (cur == null) return null;
              const old = [...hist].reverse().find((h) => h[d.key] != null && h.date <= isoMinus(today, 90));
              const delta = old ? cur - (old[d.key] as number) : null;
              return (
                <Tile
                  key={d.key}
                  label={d.label}
                  value={fmtTime(cur)}
                  hint={
                    delta == null
                      ? undefined
                      : delta < 0
                        ? `${fmtTime(-delta)} schneller als vor 3 Mon.`
                        : delta > 0
                          ? `${fmtTime(delta)} langsamer als vor 3 Mon.`
                          : "unverändert"
                  }
                  tone={delta == null ? undefined : delta < 0 ? "up" : delta > 0 ? "down" : "flat"}
                />
              );
            })}
          </div>

          {RACE_DISTS.map((d) => {
            const rows = windowed.filter((h) => h[d.key] != null);
            if (rows.length < 3) return null;
            return (
              <ChartBlock key={d.key} title={d.label} hint="niedriger = schneller">
                <LineChart
                  labels={rows.map((r) => fmtDateShort(r.date))}
                  series={[{ label: d.label, data: rows.map((r) => r[d.key] as number), color: chartToken("--gold"), fill: true }]}
                  yFormat={(v) => fmtTime(v)}
                  tooltipFormat={(v) => `Prognose ${fmtTime(v)}`}
                  reverseY
                  height={170}
                />
              </ChartBlock>
            );
          })}

          <Explain title="Wie Garmin das berechnet">
            <p>
              Die Prognose leitet sich aus deinem geschätzten VO₂max, deiner Laktatschwelle und dem Verlauf deiner
              Laufeinheiten ab — nicht aus tatsächlichen Wettkampfzeiten. Sie unterstellt, dass du auf die Distanz
              trainiert bist.
            </p>
            <p>
              Heißt praktisch: Die 5-km-Prognose ist meist realistisch, Marathon deutlich optimistischer als die
              Realität, wenn du keine langen Läufe machst. Der <em>Trend</em> ist aussagekräftiger als der
              Absolutwert.
            </p>
          </Explain>
        </div>
      )}
    </Sheet>
  );
}

function isoMinus(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
