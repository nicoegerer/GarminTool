"use client";

import { useMemo } from "react";
import { Sheet } from "@/components/ui/sheet";
import { LineChart } from "@/components/charts";
import { themeToken } from "@/lib/theme-tokens";
import { Empty } from "@/components/ui/primitives";
import { inRange, useGarmin, useStreaks, useWeekly } from "@/lib/data";
import { fmtDateShort, fmtDur, fmtKm, fmtNum, isoDate, median, parseDate, weekStart } from "@/lib/format";
import { SPORT_META, typeLabel } from "@/lib/sports";
import { Explain, Legend, SheetChart, Tile } from "./sheet-parts";

/* ---------- Ruhepuls ---------- */

export function RhrSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { daily, today } = useGarmin();

  const rows = useMemo(
    () =>
      (daily.rhr ?? [])
        .filter((r) => r.values?.restingHR != null)
        .map((r) => ({ date: r.calendarDate, rhr: r.values.restingHR! })),
    [daily],
  );
  const windowed = useMemo(() => inRange(rows, today, 180), [rows, today]);
  const last = rows.at(-1);
  const base = median(rows.slice(-30).map((r) => r.rhr));
  const best = rows.length ? Math.min(...rows.map((r) => r.rhr)) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Ruhepuls" subtitle="Der ehrlichste Frühwarnindikator, den deine Uhr hat">
      {!last ? (
        <Empty>Keine Ruhepuls-Daten.</Empty>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Aktuell" value={`${last.rhr}`} hint={`bpm · ${fmtDateShort(last.date)}`} />
            {base && (
              <Tile
                label="30-Tage-Median"
                value={fmtNum(base)}
                hint={`Abweichung ${last.rhr - base > 0 ? "+" : ""}${fmtNum(last.rhr - base)}`}
                tone={last.rhr > base + 2 ? "down" : last.rhr < base - 1 ? "up" : "flat"}
              />
            )}
            {best && <Tile label="Bestwert" value={`${best}`} hint="niedrigster gemessen" />}
          </div>

          <SheetChart title="Verlauf" hint="Ziehen zum Verschieben, Scrollen/Pinch zum Zoomen">
            <LineChart
              labels={windowed.map((r) => fmtDateShort(r.date))}
              series={[{ label: "Ruhepuls", data: windowed.map((r) => r.rhr), color: themeToken("--sport-run"), fill: true }]}
              yFormat={(v) => `${v.toFixed(0)}`}
              tooltipFormat={(v, _l, i) => `${v} bpm · ${fmtDateShort(windowed[i]?.date ?? "")}`}
              height={230}
            />
          </SheetChart>

          <Explain title="Wie du das liest">
            <p>
              Der Ruhepuls ist die Herzfrequenz, die deine Uhr in den ruhigsten Phasen der Nacht misst. Er reagiert
              auf Erholung, Stress, Alkohol, Hitze und beginnende Infekte — oft <strong>bevor</strong> du selbst
              etwas merkst.
            </p>
            {base && (
              <p>
                Dein Referenzwert liegt bei {fmtNum(base)} bpm. Ein einzelner Tag <strong>3–5 bpm darüber</strong> ist
                Rauschen. Zwei, drei Tage deutlich darüber sind ein Signal: schlechte Erholung, ein Infekt im Anmarsch
                oder schlicht zu viel Last. Dann ist eine harte Einheit die falsche Antwort.
              </p>
            )}
            <p>
              Nach unten wandert er langsam, über Monate, wenn deine Grundlage wächst. Ein sinkender Ruhepuls bei
              gleichbleibendem Training ist eines der schönsten Zeichen, die es gibt.
            </p>
          </Explain>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Schlaf ---------- */

export function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { daily, today } = useGarmin();
  const rows = useMemo(() => (daily.sleep_scores ?? []).filter((s) => s.total_s), [daily]);
  const windowed = useMemo(() => inRange(rows, today, 90), [rows, today]);
  const last = rows.at(-1);
  const avgScore = median(rows.slice(-14).map((s) => s.score));
  const avgDur = median(rows.slice(-14).map((s) => s.total_s));

  const stages = last
    ? [
        { label: "Tief", v: last.deep_s ?? 0, color: themeToken("--sport-ride") },
        { label: "REM", v: last.rem_s ?? 0, color: themeToken("--sport-swim") },
        { label: "Leicht", v: last.light_s ?? 0, color: themeToken("--sport-gym") },
        { label: "Wach", v: last.awake_s ?? 0, color: themeToken("--ink-3") },
      ].filter((s) => s.v > 0)
    : [];
  const stageTotal = stages.reduce((s, x) => s + x.v, 0);

  return (
    <Sheet open={open} onClose={onClose} title="Schlaf" subtitle="Nur Nächte, in denen du die Uhr getragen hast">
      {!last ? (
        <Empty>Keine Schlafdaten.</Empty>
      ) : (
        <div className="space-y-7">
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Letzte Nacht" value={last.score ? `${last.score}` : "–"} hint={last.score ? "/100" : undefined} />
            <Tile label="Dauer" value={fmtDur(last.total_s, { short: true })} hint={fmtDateShort(last.date)} />
            {avgScore && <Tile label="Ø 14 Nächte" value={fmtNum(avgScore)} hint={avgDur ? fmtDur(avgDur, { short: true }) : undefined} />}
          </div>

          {stageTotal > 0 && (
            <section>
              <h3 className="mb-3 text-sm font-semibold">Schlafphasen letzte Nacht</h3>
              {/* Stacked bar: 2px surface gaps do the separating, not borders */}
              <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
                {stages.map((s) => (
                  <div key={s.label} style={{ width: `${(s.v / stageTotal) * 100}%`, background: s.color }} />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stages.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                    <span className="text-xs text-ink-2">{s.label}</span>
                    <span className="ml-auto text-xs font-medium tabular">{fmtDur(s.v, { short: true })}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {windowed.length >= 3 && (
            <SheetChart title="Score-Verlauf">
              <LineChart
                labels={windowed.map((s) => fmtDateShort(s.date))}
                series={[{ label: "Schlaf-Score", data: windowed.map((s) => s.score), color: themeToken("--sport-gym"), fill: true }]}
                yMin={0}
                yMax={100}
                tooltipFormat={(v, _l, i) => `Score ${v} · ${fmtDur(windowed[i]?.total_s, { short: true })}`}
                height={200}
              />
            </SheetChart>
          )}

          <Explain title="Warum das fürs Training zählt">
            <p>
              Im <strong>Tiefschlaf</strong> passiert die körperliche Reparatur: Wachstumshormon, Muskelaufbau,
              Immunsystem. Im <strong>REM-Schlaf</strong> konsolidiert dein Nervensystem Bewegungsmuster — genau das,
              was Technik und Ansteuerung besser macht.
            </p>
            <p>
              Praktisch heißt das: Nach einer schlechten Nacht ist nicht deine Muskulatur das Problem, sondern dein
              Zentralnervensystem. Intervalle brauchen ein waches ZNS. Grundlage in Zone 2 nicht — die geht auch
              müde.
            </p>
            <p className="text-ink-3">
              Deine Uhr misst nur die Nächte, in denen du sie trägst. Von {rows.length} erfassten Nächten leitet der
              Coach ab — Lücken kennt er, er erfindet sie nicht.
            </p>
          </Explain>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- Streaks / Konsistenz ---------- */

export function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const streaks = useStreaks();
  const weekly = useWeekly();
  const { today } = useGarmin();

  const last12 = weekly.slice(-12);
  const delta = streaks.vol28prev ? ((streaks.vol28 - streaks.vol28prev) / streaks.vol28prev) * 100 : null;

  return (
    <Sheet open={open} onClose={onClose} title="Konsistenz" subtitle="Serien, aktive Tage und Volumen">
      <div className="space-y-7">
        <div className="grid grid-cols-2 gap-3">
          <Tile label="Aktuelle Serie" value={`${streaks.currentWeekStreak}`} hint="Wochen in Folge mit Training" />
          <Tile label="Rekord" value={`${streaks.longestWeekStreak}`} hint="längste Serie aller Zeiten" />
          <Tile label="Aktive Tage" value={`${streaks.daysActive28}`} hint="von 28 Tagen" />
          <Tile
            label="Volumen 4 Wochen"
            value={`${(streaks.vol28 / 3600).toFixed(1)} h`}
            hint={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)} % vs. davor` : undefined}
            tone={delta == null ? undefined : delta > 5 ? "up" : delta < -5 ? "down" : "flat"}
          />
        </div>

        <SheetChart title="Wochenvolumen" hint="Stunden pro Kalenderwoche">
          <LineChart
            labels={last12.map((w) => fmtDateShort(w.start))}
            series={[{ label: "Stunden", data: last12.map((w) => w.duration / 3600), color: themeToken("--gold"), fill: true }]}
            yFormat={(v) => `${v.toFixed(0)} h`}
            tooltipFormat={(v, _l, i) => `${v.toFixed(1)} h · ${last12[i]?.count ?? 0} Einheiten`}
            points
            height={200}
          />
        </SheetChart>

        <Calendar activeDays={streaks.activeDays} today={today} />

        <Explain title="Warum Serien wirklich zählen">
          <p>
            Ausdauer ist ein Zinseszins-Spiel. Eine herausragende Woche bringt wenig; zwanzig unauffällige Wochen
            hintereinander verändern deinen Körper. Deshalb ist die <strong>Serie</strong> die ehrlichere Zahl als
            jede Einzelleistung.
          </p>
          <p>
            Deine {streaks.daysActive28} aktiven Tage der letzten vier Wochen sagen mehr über deine kommende Form aus
            als dein bester Lauf darin.
          </p>
        </Explain>
      </div>
    </Sheet>
  );
}

/** 12-week grid — dense enough to read consistency at a glance, not a year-wall. */
function Calendar({ activeDays, today }: { activeDays: Set<string>; today: string }) {
  const cols = useMemo(() => {
    const end = weekStart(parseDate(today));
    const out: { week: string; days: { iso: string; active: boolean; future: boolean }[] }[] = [];
    for (let w = 11; w >= 0; w--) {
      const start = new Date(end.getTime() - w * 7 * 86400000);
      const days = Array.from({ length: 7 }, (_, i) => {
        const iso = isoDate(new Date(start.getTime() + i * 86400000));
        return { iso, active: activeDays.has(iso), future: iso > today };
      });
      out.push({ week: isoDate(start), days });
    }
    return out;
  }, [activeDays, today]);

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">Letzte 12 Wochen</h3>
      <div className="flex gap-1">
        {cols.map((c) => (
          <div key={c.week} className="flex flex-1 flex-col gap-1">
            {c.days.map((d) => (
              <div
                key={d.iso}
                title={`${new Date(d.iso).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })}${d.active ? " · trainiert" : ""}`}
                className={
                  d.future
                    ? "aspect-square rounded-[3px] bg-transparent"
                    : d.active
                      ? "aspect-square rounded-[3px] bg-gold/75"
                      : "aspect-square rounded-[3px] bg-surface-2"
                }
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] text-ink-3">Jede Spalte ist eine Woche, jede Zelle ein Tag.</p>
    </section>
  );
}

/* ---------- Diese Woche ---------- */

export function WeekSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activities, today } = useGarmin();

  const week = useMemo(() => {
    const start = weekStart(parseDate(today));
    const startIso = isoDate(start);
    const endIso = isoDate(new Date(start.getTime() + 6 * 86400000));
    return activities.filter((a) => a.date >= startIso && a.date <= endIso);
  }, [activities, today]);

  const byGroup = useMemo(() => {
    const m = new Map<string, { duration: number; distance: number; count: number }>();
    for (const a of week) {
      const g = m.get(a.group) ?? { duration: 0, distance: 0, count: 0 };
      g.duration += a.duration ?? 0;
      g.distance += a.distance ?? 0;
      g.count += 1;
      m.set(a.group, g);
    }
    return [...m.entries()].sort((a, b) => b[1].duration - a[1].duration);
  }, [week]);

  const total = week.reduce((s, a) => s + (a.duration ?? 0), 0);
  const load = week.reduce((s, a) => s + (a.activityTrainingLoad ?? 0), 0);

  return (
    <Sheet open={open} onClose={onClose} title="Diese Woche" subtitle="Seit Montag">
      <div className="space-y-7">
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Einheiten" value={`${week.length}`} />
          <Tile label="Zeit" value={fmtDur(total, { short: true })} />
          <Tile label="Trainingslast" value={fmtNum(load)} />
        </div>

        {byGroup.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold">Verteilung</h3>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              {byGroup.map(([g, v]) => (
                <div
                  key={g}
                  style={{ width: `${(v.duration / total) * 100}%`, background: themeToken(SPORT_META[g as keyof typeof SPORT_META].cssVar) }}
                />
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {byGroup.map(([g, v]) => {
                const meta = SPORT_META[g as keyof typeof SPORT_META];
                return (
                  <div key={g} className="flex items-center gap-2.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: themeToken(meta.cssVar) }} />
                    <span className="text-[13px] text-ink-2">{meta.label}</span>
                    <span className="ml-auto text-[13px] font-medium tabular">
                      {fmtDur(v.duration, { short: true })}
                      {v.distance > 0 && <span className="ml-2 text-ink-3">{fmtKm(v.distance)}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold">Einheiten</h3>
          {week.length === 0 ? (
            <Empty>Diese Woche noch nichts.</Empty>
          ) : (
            <div className="space-y-2">
              {week.map((a) => {
                const meta = SPORT_META[a.group];
                const Icon = meta.icon;
                return (
                  <div key={a.activityId} className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface-2 p-3">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${meta.bg}`}>
                      <Icon className={`size-4 ${meta.text}`} strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{a.activityName || typeLabel(a.typeKey)}</p>
                      <p className="text-[11px] text-ink-3">
                        {new Date(a.date).toLocaleDateString("de-DE", { weekday: "long" })}
                        {a.distance ? ` · ${fmtKm(a.distance)}` : ""} · {fmtDur(a.duration, { short: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
}
