import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- Datum ---------- */

/** Parses an export date (YYYY-MM-DD…) at local noon, so DST never shifts the day. */
export function parseDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Monday-based week start. */
export function weekStart(d: Date): Date {
  const c = new Date(d);
  c.setDate(c.getDate() - ((c.getDay() + 6) % 7));
  c.setHours(0, 0, 0, 0);
  return c;
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000));
}

export function fmtDateShort(iso: string): string {
  return parseDate(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

export function fmtDateLong(iso: string): string {
  return parseDate(iso).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function fmtWeekday(iso: string): string {
  return parseDate(iso).toLocaleDateString("de-DE", { weekday: "short" });
}

/**
 * How many days a dated value lags behind the export date. 0 = current.
 *
 * Health series only have entries for days the watch actually recorded, so the
 * newest entry can be days old. Showing it without saying so reads as "this is
 * today's value" — the reason a two-day-old sleep score looked like a bug.
 */
export function lagDays(iso: string | undefined, today: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((parseDate(today).getTime() - parseDate(iso).getTime()) / 86400000));
}

/** Relative day label for a lagging value; null when the value is current. */
export function fmtLag(iso: string | undefined, today: string): string | null {
  const d = lagDays(iso, today);
  if (!iso || d <= 0) return null;
  if (d === 1) return "gestern";
  if (d <= 6) return `vor ${d} Tagen`;
  return fmtDateShort(iso);
}

/**
 * Which night a sleep entry describes. Garmin dates a night by the morning it
 * ended, so an entry dated like the export day is genuinely last night.
 */
export function fmtSleepNight(iso: string | undefined, today: string): string {
  const d = lagDays(iso, today);
  if (!iso) return "Letzte Nacht";
  if (d <= 0) return "Letzte Nacht";
  if (d === 1) return "Nacht zuvor";
  return `Nacht zum ${fmtDateShort(iso)}`;
}

/* ---------- Zahlen & Einheiten ---------- */

export function fmtDur(seconds?: number | null, opts: { short?: boolean } = {}): string {
  if (seconds == null || !isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} h`;
  if (opts.short) return `${m} min`;
  return `${m}:${String(s % 60).padStart(2, "0")} min`;
}

/** h:mm:ss / m:ss — for race times and splits. */
export function fmtTime(seconds?: number | null): string {
  if (seconds == null || !isFinite(seconds)) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function fmtKm(meters?: number | null, digits = 1): string {
  if (meters == null) return "–";
  return `${(meters / 1000).toLocaleString("de-DE", { maximumFractionDigits: digits })} km`;
}

/** Speed (m/s) → running pace. */
export function fmtPace(secPerKm?: number | null): string {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

export function paceFromSpeed(metersPerSec?: number | null): number | null {
  if (!metersPerSec || metersPerSec <= 0) return null;
  return 1000 / metersPerSec;
}

export function fmtPace100(secPer100?: number | null): string {
  if (!secPer100 || !isFinite(secPer100)) return "–";
  const m = Math.floor(secPer100 / 60);
  const s = Math.round(secPer100 % 60);
  return `${m}:${String(s).padStart(2, "0")}/100m`;
}

export function fmtSpeed(metersPerSec?: number | null): string {
  if (!metersPerSec) return "–";
  return `${(metersPerSec * 3.6).toFixed(1)} km/h`;
}

export function fmtNum(v?: number | null, digits = 0): string {
  if (v == null || !isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Garmin reports activity weather in °F regardless of the account's unit system. */
export function fToC(f?: number | null): number | null {
  return f == null ? null : Math.round(((f - 32) * 5) / 9);
}

/* ---------- Statistik ---------- */

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

export function rollingMean(arr: (number | null)[], window: number): (number | null)[] {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

/** Strips the zero-width characters Garmin puts in some activity names. */
export function clean(s?: string | null): string {
  return (s ?? "").replace(/[​‌‍]/g, "").trim();
}
