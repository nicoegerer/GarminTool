"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { inRange, useData, useGarmin } from "@/lib/data";
import { usePrefs, type Race } from "@/lib/prefs";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts";
import { themeToken } from "@/lib/theme-tokens";
import { Explain, Tile } from "@/components/dashboard/sheet-parts";
import { Modal } from "@/components/ui/modal";
import { cn, fmtDateShort, fmtTime } from "@/lib/format";

export default function RacesPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Races />;
}

const DISTS = [
  { key: "time5K", label: "5 km" },
  { key: "time10K", label: "10 km" },
  { key: "timeHalfMarathon", label: "Halbmarathon" },
  { key: "timeMarathon", label: "Marathon" },
] as const;

function Races() {
  const { fitness, activities, today } = useGarmin();
  const { prefs, update, ready } = usePrefs();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ name: string; date: string; priority: Race["priority"] }>({
    name: "",
    date: "",
    priority: "A",
  });

  const now = fitness.race_predictions;
  const hist = useMemo(
    () =>
      (fitness.race_predictions_history ?? [])
        .filter((h) => h.calendarDate && DISTS.some((d) => h[d.key] != null))
        .map((h) => ({ ...h, date: h.calendarDate }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [fitness],
  );
  const windowed = useMemo(() => inRange(hist, today, 365), [hist, today]);

  const upcoming = useMemo(
    () => [...prefs.races].filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [prefs.races, today],
  );
  const past = useMemo(
    () => [...prefs.races].filter((r) => r.date < today).sort((a, b) => b.date.localeCompare(a.date)),
    [prefs.races, today],
  );

  /* Aktivitäten, die als Wettkampf getaggt sind — das weiß Garmin selbst. */
  const raced = useMemo(() => activities.filter((a) => a.eventType === "race").slice(0, 6), [activities]);

  function addRace() {
    if (!draft.name.trim() || !draft.date) return;
    update({
      races: [...prefs.races, { id: `${Date.now()}`, name: draft.name.trim(), date: draft.date, priority: draft.priority }],
    });
    setDraft({ name: "", date: "", priority: "A" });
    setAdding(false);
  }

  if (!ready) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;

  return (
    <>
      <PageHeader kicker="Wettkämpfe" title="Ziele & Prognosen" sub="Deine Termine kennt Garmin nicht — die trägst du hier ein." />

      {/* Anstehende Wettkämpfe */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em]">Anstehend</h2>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-gold/40 hover:text-gold"
          >
            <Plus className="size-3.5" strokeWidth={2.2} />
            Hinzufügen
          </button>
        </div>

        {upcoming.length === 0 ? (
          <Empty>Kein Wettkampf eingetragen. Der Coach richtet sein Training danach aus.</Empty>
        ) : (
          <div className="space-y-2">
            {upcoming.map((r) => {
              const weeks = Math.round((new Date(r.date).getTime() - new Date(today).getTime()) / (7 * 86400000));
              return (
                <Card key={r.id} className="flex items-center gap-4 p-4">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-gold/10">
                    <span className="text-lg font-semibold tabular text-gold">{weeks}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-ink-3">
                      {new Date(r.date).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
                      {r.priority && ` · Priorität ${r.priority}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-ink-3">{weeks === 0 ? "diese Woche" : weeks === 1 ? "in 1 Woche" : `in ${weeks} Wochen`}</span>
                  <button
                    onClick={() => update({ races: prefs.races.filter((x) => x.id !== r.id) })}
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-negative"
                    aria-label="Entfernen"
                  >
                    <Trash2 className="size-4" strokeWidth={1.8} />
                  </button>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Prognosen */}
      {now && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Garmins Prognose</h2>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DISTS.map((d) => {
              const cur = now[d.key];
              if (cur == null) return null;
              const old = [...hist].reverse().find((h) => h[d.key] != null && h.date <= isoMinus(today, 90));
              const delta = old ? cur - (old[d.key] as number) : null;
              return (
                <Tile
                  key={d.key}
                  label={d.label}
                  value={fmtTime(cur)}
                  tone={delta == null ? undefined : delta < 0 ? "up" : delta > 0 ? "down" : "flat"}
                  hint={
                    delta == null
                      ? undefined
                      : delta < 0
                        ? `${fmtTime(-delta)} schneller`
                        : delta > 0
                          ? `${fmtTime(delta)} langsamer`
                          : "unverändert"
                  }
                />
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {DISTS.map((d) => {
              const rows = windowed.filter((h) => h[d.key] != null);
              if (rows.length < 3) return null;
              return (
                <Card key={d.key} className="p-5">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold">{d.label}</h3>
                    <p className="text-[11px] text-ink-3">niedriger = schneller</p>
                  </div>
                  <LineChart
                    labels={rows.map((r) => fmtDateShort(r.date))}
                    series={[{ label: d.label, data: rows.map((r) => r[d.key] as number), color: themeToken("--gold"), fill: true }]}
                    yFormat={(v) => fmtTime(v)}
                    tooltipFormat={(v) => `Prognose ${fmtTime(v)}`}
                    reverseY
                    height={170}
                  />
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {raced.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Als Wettkampf markiert</h2>
          <div className="space-y-2">
            {raced.map((a) => (
              <Card key={a.activityId} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.activityName}</p>
                  <p className="text-xs text-ink-3">{new Date(a.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <span className="shrink-0 text-[13px] tabular text-ink-2">{fmtTime(a.duration)}</span>
              </Card>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Vergangen</h2>
          <div className="space-y-2">
            {past.map((r) => (
              <Card key={r.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink-2">{r.name}</p>
                  <p className="text-[11px] text-ink-3">{new Date(r.date).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}</p>
                </div>
                <button
                  onClick={() => update({ races: prefs.races.filter((x) => x.id !== r.id) })}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:text-negative"
                  aria-label="Entfernen"
                >
                  <Trash2 className="size-4" strokeWidth={1.8} />
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Explain title="Wie Garmin die Prognose berechnet">
        <p>
          Sie leitet sich aus deinem geschätzten VO₂max, deiner Laktatschwelle und dem Verlauf deiner Laufeinheiten
          ab — <strong>nicht</strong> aus echten Wettkampfzeiten. Sie unterstellt, dass du auf die Distanz trainiert
          bist.
        </p>
        <p>
          Praktisch heißt das: Die 5-km-Prognose ist meist realistisch, Marathon deutlich zu optimistisch, wenn keine
          langen Läufe dahinterstehen. Der <em>Trend</em> sagt mehr als der Absolutwert.
        </p>
      </Explain>

      <Modal open={adding} onClose={() => setAdding(false)} title="Wettkampf hinzufügen" primaryLabel="Speichern" onPrimary={addRace}>
        <p>Der Coach richtet Aufbau und Tapering danach aus.</p>
        <div className="space-y-3 pt-1">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="z.B. Halbmarathon München"
            autoFocus
          />
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          <div className="flex gap-1.5">
            {(["A", "B", "C"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDraft({ ...draft, priority: p })}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                  draft.priority === p ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
                )}
              >
                Priorität {p}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

function isoMinus(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
