"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useData, useGarmin } from "@/lib/data";
import { Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { ActivitySheet } from "@/components/dashboard/activity-sheet";
import { ActivityRow } from "../training/page";
import { cn, fmtDur, fmtKm, fmtNum } from "@/lib/format";
import { SPORT_META, SPORT_ORDER, typeLabel } from "@/lib/sports";
import type { Activity, SportGroup } from "@/lib/types";

export default function ActivitiesPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Activities />;
}

const PAGE = 25;

function Activities() {
  const { activities } = useGarmin();
  const [sport, setSport] = useState<SportGroup | "all">("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [activity, setActivity] = useState<Activity | null>(null);

  // Deep link from the stats charts: /aktivitaeten/?a=<id> opens that activity
  // straight away, so tapping a point in a chart lands on its full detail.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("a"));
    if (!id) return;
    const match = activities.find((a) => a.activityId === id);
    if (match) setActivity(match);
  }, [activities]);

  const groups = useMemo(() => SPORT_ORDER.filter((g) => activities.some((a) => a.group === g)), [activities]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((a) => {
      if (sport !== "all" && a.group !== sport) return false;
      if (!q) return true;
      return (
        (a.activityName ?? "").toLowerCase().includes(q) ||
        typeLabel(a.typeKey).toLowerCase().includes(q) ||
        a.date.includes(q)
      );
    });
  }, [activities, sport, query]);

  // Reset paging whenever the slice changes, or "Mehr" would reveal the wrong rows.
  const visible = filtered.slice(0, shown);
  const stats = useMemo(
    () => ({
      count: filtered.length,
      duration: filtered.reduce((s, a) => s + (a.duration ?? 0), 0),
      distance: filtered.reduce((s, a) => s + (a.distance ?? 0), 0),
    }),
    [filtered],
  );

  const setFilter = (g: SportGroup | "all") => {
    setSport(g);
    setShown(PAGE);
  };

  return (
    <>
      <PageHeader kicker="Aktivitäten" title="Alles, was du gemacht hast" sub={`${activities.length} Einheiten seit ${activities.at(-1)?.date.slice(0, 4) ?? "–"}`} />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" strokeWidth={1.9} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Suchen — Name, Sportart oder Datum"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-gold/50"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={sport === "all"} onClick={() => setFilter("all")}>
            Alle
          </FilterChip>
          {groups.map((g) => (
            <FilterChip key={g} active={sport === g} onClick={() => setFilter(g)} dot={SPORT_META[g].cssVar}>
              {SPORT_META[g].label}
            </FilterChip>
          ))}
        </div>

        <p className="text-[11px] text-ink-3">
          {stats.count} {stats.count === 1 ? "Einheit" : "Einheiten"} · {fmtDur(stats.duration, { short: true })}
          {stats.distance > 0 && ` · ${fmtKm(stats.distance)}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <Empty>Nichts gefunden.</Empty>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <ActivityRow key={a.activityId} a={a} onClick={() => setActivity(a)} />
          ))}
        </div>
      )}

      {shown < filtered.length && (
        <button
          onClick={() => setShown((s) => s + PAGE)}
          className="mx-auto mt-5 block rounded-full border border-line px-5 py-2.5 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink"
        >
          Weitere {Math.min(PAGE, filtered.length - shown)} laden
        </button>
      )}

      <ActivitySheet activity={activity} onClose={() => setActivity(null)} />
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
        active ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
      )}
    >
      {dot && <span className="size-2 rounded-full" style={{ background: `hsl(var(${dot}))` }} />}
      {children}
    </button>
  );
}
