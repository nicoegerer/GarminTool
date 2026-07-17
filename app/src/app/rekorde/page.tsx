"use client";

import { useMemo, useState } from "react";
import { useData, useGarmin } from "@/lib/data";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { cn, clean, fmtDateShort, fmtKm, fmtNum, fmtTime } from "@/lib/format";
import { SPORT_META } from "@/lib/sports";
import type { SportGroup } from "@/lib/types";

export default function RecordsPage() {
  const { loading, error } = useData();
  if (loading) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Records />;
}

/**
 * Garmin's personal-record type IDs. The mapping is undocumented — these were
 * read off this account's own records, so unknown IDs are dropped rather than
 * guessed at.
 */
interface PrType {
  label: string;
  group: SportGroup;
  fmt: (v: number) => string;
  /** Shown on the dashboard-style highlight row. */
  key?: boolean;
}

const PR_TYPES: Record<number, PrType> = {
  1: { label: "Schnellster Kilometer", group: "run", fmt: fmtTime, key: true },
  2: { label: "Schnellste Meile", group: "run", fmt: fmtTime },
  3: { label: "Schnellste 5 km", group: "run", fmt: fmtTime, key: true },
  4: { label: "Schnellste 10 km", group: "run", fmt: fmtTime, key: true },
  5: { label: "Schnellster Halbmarathon", group: "run", fmt: fmtTime, key: true },
  6: { label: "Schnellster Marathon", group: "run", fmt: fmtTime },
  7: { label: "Längster Lauf", group: "run", fmt: (v) => fmtKm(v, 2) },
  8: { label: "Längste Radtour", group: "ride", fmt: (v) => fmtKm(v, 1), key: true },
  9: { label: "Meiste Höhenmeter (Rad)", group: "ride", fmt: (v) => `${fmtNum(v)} hm` },
  10: { label: "Beste 20-Minuten-Leistung", group: "ride", fmt: (v) => `${fmtNum(v)} W` },
  11: { label: "Schnellste 40 km (Rad)", group: "ride", fmt: fmtTime },
  12: { label: "Meiste Schritte an einem Tag", group: "walk", fmt: (v) => fmtNum(v) },
  13: { label: "Meiste Schritte in einer Woche", group: "walk", fmt: (v) => fmtNum(v) },
  14: { label: "Meiste Schritte in einem Monat", group: "walk", fmt: (v) => fmtNum(v) },
  15: { label: "Längste Ziel-Serie", group: "walk", fmt: (v) => `${fmtNum(v)} Tage` },
  17: { label: "Längste Schwimmstrecke", group: "swim", fmt: (v) => `${fmtNum(v)} m`, key: true },
  18: { label: "Schnellste 100 m", group: "swim", fmt: fmtTime },
  19: { label: "Schnellste 100 yd", group: "swim", fmt: fmtTime },
  20: { label: "Schnellste 400 m", group: "swim", fmt: fmtTime },
  21: { label: "Schnellste 500 yd", group: "swim", fmt: fmtTime },
  22: { label: "Schnellste 1.000 m", group: "swim", fmt: fmtTime },
  23: { label: "Schnellste 1.500 m", group: "swim", fmt: fmtTime },
};

function Records() {
  const { records } = useGarmin();
  const [filter, setFilter] = useState<SportGroup | "all">("all");

  const all = useMemo(
    () =>
      (records?.personal_records ?? [])
        .filter((p) => PR_TYPES[p.type_id] && p.value > 0)
        .map((p) => ({ ...p, meta: PR_TYPES[p.type_id] }))
        .sort((a, b) => a.type_id - b.type_id),
    [records],
  );

  const groups = useMemo(() => {
    const present = new Set(all.map((p) => p.meta.group));
    return (["run", "ride", "swim", "walk"] as SportGroup[]).filter((g) => present.has(g));
  }, [all]);

  const shown = filter === "all" ? all : all.filter((p) => p.meta.group === filter);
  const highlights = all.filter((p) => p.meta.key);

  if (!all.length) return <PageHeader title="Rekorde" sub="Noch keine persönlichen Rekorde erfasst." />;

  return (
    <>
      <PageHeader kicker="Bestleistungen" title="Rekorde" sub={`${all.length} persönliche Bestwerte`} />

      {filter === "all" && highlights.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">Die wichtigsten</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map((p, i) => (
              <RecordCard key={p.type_id} p={p} delay={i * 0.03} highlight />
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          Alle
        </Chip>
        {groups.map((g) => (
          <Chip key={g} active={filter === g} onClick={() => setFilter(g)} dot={SPORT_META[g].cssVar}>
            {SPORT_META[g].label}
          </Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty>Keine Rekorde in dieser Sportart.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p, i) => (
            <RecordCard key={p.type_id} p={p} delay={i * 0.02} />
          ))}
        </div>
      )}
    </>
  );
}

function RecordCard({
  p,
  delay,
  highlight = false,
}: {
  p: { type_id: number; value: number; date?: string; activity_name?: string; meta: PrType };
  delay: number;
  highlight?: boolean;
}) {
  const meta = SPORT_META[p.meta.group];
  const Icon = meta.icon;
  const date = typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(p.date) ? fmtDateShort(p.date.slice(0, 10)) : null;

  return (
    <Card delay={delay} className={cn("p-4", highlight && "border-gold/25 bg-gold/[0.04]")}>
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${meta.bg}`}>
          <Icon className={`size-4 ${meta.text}`} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold tracking-[-0.02em]">{p.meta.fmt(p.value)}</p>
          <p className="truncate text-[13px] text-ink-2">{p.meta.label}</p>
          {(date || p.activity_name) && (
            <p className="mt-0.5 truncate text-[11px] text-ink-3">{[date, clean(p.activity_name)].filter(Boolean).join(" · ")}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function Chip({
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
