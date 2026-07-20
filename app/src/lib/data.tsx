"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  Activity,
  ActivityDetail,
  ActivityIndex,
  DailyData,
  FitnessData,
  GarminData,
  LoadPoint,
  Manifest,
  PersonalRecord,
  Profile,
} from "./types";
import { clean, daysBetween, isoDate, parseDate, weekStart } from "./format";
import { sportGroup } from "./sports";
import { dataUrl } from "./paths";

/** Sorts an array in place, ascending by an ISO-date field. No-op if absent. */
function sortByDate<K extends string>(arr: Array<Record<K, string>> | undefined, key: K): void {
  arr?.sort((a, b) => (a[key] ?? "").localeCompare(b[key] ?? ""));
}

async function loadJSON<T>(name: string, fallback: T): Promise<T> {
  try {
    // "no-cache" = always revalidate against the server (cheap 304 when
    // unchanged). These files change every refresh, so a reload after a deploy
    // must pick up the new version — force-cache would serve stale data.
    const res = await fetch(dataUrl(`${name}.json`), { cache: "no-cache" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

/** Detail files are fetched on demand and memoised — 230 files, ~1.3 MB total. */
const detailCache = new Map<number, Promise<ActivityDetail | null>>();

export function loadActivityDetail(id: number): Promise<ActivityDetail | null> {
  let p = detailCache.get(id);
  if (!p) {
    p = fetch(dataUrl(`activity/${id}.json`), { cache: "force-cache" })
      .then((r) => (r.ok ? (r.json() as Promise<ActivityDetail>) : null))
      .catch(() => null);
    detailCache.set(id, p);
  }
  return p;
}

/* ---------- Context ---------- */

interface DataState {
  data: GarminData | null;
  loading: boolean;
  error: string | null;
}

const DataContext = createContext<DataState>({ data: null, loading: true, error: null });

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [manifest, profile, rawActs, daily, fitness, records, loadTrend, strength] =
          await Promise.all([
            loadJSON<Manifest | null>("manifest", null),
            loadJSON<Profile | null>("profile", null),
            loadJSON<ActivityIndex[]>("activities", []),
            loadJSON<DailyData>("daily", {}),
            loadJSON<FitnessData>("fitness", {}),
            loadJSON<{ personal_records?: PersonalRecord[] } | null>("records", null),
            loadJSON<LoadPoint[]>("load_trend", []),
            loadJSON<GarminData["strength"]>("strength", []),
          ]);

        if (cancelled) return;

        // Normalise every daily series to chronological (oldest → newest).
        // The exporter builds sleep_scores backwards, so `.at(-1)` was picking
        // the OLDEST night instead of the newest. Rather than trust the export
        // order anywhere, sort here once — everything downstream relies on it.
        sortByDate(daily.sleep_scores, "date");
        sortByDate(daily.body_battery, "date");
        sortByDate(daily.vo2max, "date");
        sortByDate(daily.rhr, "calendarDate");
        sortByDate(daily.stress, "calendarDate");
        sortByDate(daily.steps, "calendarDate");
        sortByDate(daily.intensity_minutes_weekly, "calendarDate");

        const activities: Activity[] = rawActs
          .map((a) => ({
            ...a,
            activityName: clean(a.activityName),
            date: (a.startTimeLocal ?? "").slice(0, 10),
            group: a.typeKey === "multi_sport" ? ("other" as const) : sportGroup(a.typeKey),
          }))
          // Drop accidental sub-2-minute recordings; they distort every average.
          .filter((a) => a.date && (a.duration ?? 0) >= 120)
          .sort((a, b) => (b.startTimeLocal ?? "").localeCompare(a.startTimeLocal ?? ""));

        setState({
          loading: false,
          error: null,
          data: {
            manifest,
            profile,
            activities,
            daily,
            fitness,
            records,
            loadTrend,
            strength,
            // "Today" is the export date, not the viewer's clock — otherwise
            // every derived window silently drifts between refreshes.
            today: manifest?.generated_at?.slice(0, 10) ?? isoDate(new Date()),
          },
        });
      } catch (err) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: err instanceof Error ? err.message : "Ladefehler" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}

/** Throws if data isn't ready — use inside components rendered after the loader. */
export function useGarmin(): GarminData {
  const { data } = useContext(DataContext);
  if (!data) throw new Error("useGarmin outside a loaded DataProvider");
  return data;
}

/* ---------- Abgeleitete Serien ---------- */

export interface WeekBucket {
  week: string;
  start: string;
  count: number;
  duration: number;
  distance: number;
  load: number;
  byGroup: Record<string, { duration: number; distance: number; count: number }>;
}

export function useWeekly(): WeekBucket[] {
  const { activities } = useGarmin();
  return useMemo(() => {
    const weeks = new Map<string, WeekBucket>();
    for (const a of activities) {
      const start = isoDate(weekStart(parseDate(a.date)));
      let w = weeks.get(start);
      if (!w) {
        w = { week: start, start, count: 0, duration: 0, distance: 0, load: 0, byGroup: {} };
        weeks.set(start, w);
      }
      w.count += 1;
      w.duration += a.duration ?? 0;
      w.distance += a.distance ?? 0;
      w.load += a.activityTrainingLoad ?? 0;
      const g = (w.byGroup[a.group] ??= { duration: 0, distance: 0, count: 0 });
      g.duration += a.duration ?? 0;
      g.distance += a.distance ?? 0;
      g.count += 1;
    }
    return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
  }, [activities]);
}

export interface Streaks {
  currentWeekStreak: number;
  longestWeekStreak: number;
  daysActive28: number;
  thisWeekCount: number;
  thisWeekDuration: number;
  vol28: number;
  vol28prev: number;
  activeDays: Set<string>;
}

export function useStreaks(): Streaks {
  const { activities, today } = useGarmin();
  return useMemo(() => {
    const activeDays = new Set(activities.map((a) => a.date));
    const weekKey = (d: Date) => isoDate(weekStart(d));
    const activeWeeks = new Set(activities.map((a) => weekKey(parseDate(a.date))));
    const t = parseDate(today);

    let currentWeekStreak = 0;
    let cursor = weekStart(t);
    // The running week only counts once it has a session; otherwise start at last week.
    if (!activeWeeks.has(weekKey(cursor))) cursor = new Date(cursor.getTime() - 7 * 86400000);
    while (activeWeeks.has(weekKey(cursor))) {
      currentWeekStreak += 1;
      cursor = new Date(cursor.getTime() - 7 * 86400000);
    }

    let longestWeekStreak = 0;
    if (activities.length) {
      let run = 0;
      let c = weekStart(parseDate(activities[activities.length - 1].date));
      const end = weekStart(t);
      while (c <= end) {
        run = activeWeeks.has(weekKey(c)) ? run + 1 : 0;
        longestWeekStreak = Math.max(longestWeekStreak, run);
        c = new Date(c.getTime() + 7 * 86400000);
      }
    }

    const sum = (arr: Activity[], f: (a: Activity) => number | undefined) =>
      arr.reduce((s, a) => s + (f(a) ?? 0), 0);
    const dayOffset = (n: number) => isoDate(new Date(t.getTime() - n * 86400000));
    const d28 = dayOffset(28);
    const d56 = dayOffset(56);
    const thisWeekIso = weekKey(t);

    const thisWeek = activities.filter((a) => weekKey(parseDate(a.date)) === thisWeekIso);
    const cur = activities.filter((a) => a.date > d28);
    const prev = activities.filter((a) => a.date > d56 && a.date <= d28);

    return {
      currentWeekStreak,
      longestWeekStreak,
      daysActive28: Array.from({ length: 28 }, (_, i) => dayOffset(i)).filter((d) => activeDays.has(d)).length,
      thisWeekCount: thisWeek.length,
      thisWeekDuration: sum(thisWeek, (a) => a.duration),
      vol28: sum(cur, (a) => a.duration),
      vol28prev: sum(prev, (a) => a.duration),
      activeDays,
    };
  }, [activities, today]);
}

export function useVo2max(): { date: string; vo2max: number }[] {
  const { activities, daily } = useGarmin();
  return useMemo(() => {
    const byDate = new Map<string, number>();
    for (const v of daily.vo2max ?? []) {
      if (v.date && v.vo2max != null) byDate.set(v.date, v.vo2max);
    }
    for (const a of activities) {
      if (a.vO2MaxValue != null && a.group === "run" && !byDate.has(a.date)) {
        byDate.set(a.date, a.vO2MaxValue);
      }
    }
    return [...byDate.entries()]
      .map(([date, vo2max]) => ({ date, vo2max }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [activities, daily]);
}

/**
 * Filters a dated series to a window ending at the export date.
 * `days >= 9999` means "everything" — this is the single place the range is
 * applied, so a range switch can never desync one chart from another.
 */
export function inRange<T extends { date: string }>(rows: T[], today: string, days: number): T[] {
  if (days >= 9999) return rows;
  return rows.filter((r) => daysBetween(r.date, today) <= days);
}
