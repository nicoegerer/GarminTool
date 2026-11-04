import type { DailyData, FitnessData } from "./types";

type Row = Record<string, unknown>;
export interface PerformanceMetric {
  key: string;
  label: string;
  value: number;
  unit: string;
  section: string;
  date?: string;
}

function object(value: unknown): Row | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

/** Only recorded fields are used; no synthetic scores or implicit unit conversions. */
export function metricRows(value: unknown, keys: string[], depth = 0): { value: number; date?: string }[] {
  if (depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap((item) => metricRows(item, keys, depth + 1));
  const row = object(value);
  if (!row) return [];
  const date = [row.calendarDate, row.date, row.timestampLocal].find((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}/.test(item));
  const key = keys.find((key) => typeof row[key] === "number" && Number.isFinite(row[key]));
  if (key) return [{ value: row[key] as number, ...(typeof date === "string" ? { date: date.slice(0, 10) } : {}) }];
  return Object.values(row).flatMap((item) => metricRows(item, keys, depth + 1));
}

export function latestMetric(value: unknown, keys: string[]) {
  return metricRows(value, keys).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).at(-1);
}

export function performanceMetrics(fitness: FitnessData, daily: DailyData): PerformanceMetric[] {
  const latest = object(fitness.max_metrics_latest);
  const definitions: [string, string, unknown, string[], string][] = [
    ["readiness", "Trainingsbereitschaft", daily.readiness, ["score"], "/ 100"],
    ["weekly_load", "Garmin-Wochenlast", fitness.training_status, ["weeklyTrainingLoad"], ""],
    ["cycling_vo2", "VO₂max Rad", latest?.cycling, ["vo2MaxPreciseValue", "vo2MaxValue"], ""],
    ["fitness_age", "Fitnessalter", fitness.fitness_age, ["fitnessAge"], "Jahre"],
    ["ftp", "FTP Rad", fitness.cycling_ftp, ["functionalThresholdPower", "ftp"], "W"],
    ["threshold_hr", "Laktatschwelle", fitness.lactate_threshold, ["heartRate"], "bpm"],
    ["cycling_endurance", "Rad: aerobe Ausdauer", fitness.cycling_ability, ["aerobicEndurance"], ""],
    ["cycling_aerobic", "Rad: aerobe Kapazität", fitness.cycling_ability, ["aerobicCapacity"], ""],
    ["cycling_anaerobic", "Rad: anaerobe Kapazität", fitness.cycling_ability, ["anaerobicCapacity"], ""],
    ["running_economy", "Laufökonomie", fitness.running_economy, ["runningEconomyScore", "score"], ""],
    ["heat", "Hitzeanpassung", fitness.heat_altitude_acclimation, ["heatAcclimationPercentage"], "%"],
    ["altitude", "Höhenanpassung", fitness.heat_altitude_acclimation, ["altitudeAcclimation"], "m"],
    ["endurance", "Ausdauer-Score", fitness.endurance_score, ["enduranceScore"], ""],
    ["hill", "Hill Score", fitness.hill_score, ["overallScore"], ""],
  ];
  const sources: Record<string, string> = {
    readiness: "daily.readiness", weekly_load: "fitness.training_status", cycling_vo2: "fitness.max_metrics_latest",
    fitness_age: "fitness.fitness_age", ftp: "fitness.cycling_ftp", threshold_hr: "fitness.lactate_threshold",
    cycling_endurance: "fitness.cycling_ability", cycling_aerobic: "fitness.cycling_ability", cycling_anaerobic: "fitness.cycling_ability",
    running_economy: "fitness.running_economy", heat: "fitness.heat_altitude_acclimation",
    altitude: "fitness.heat_altitude_acclimation", endurance: "fitness.endurance_score", hill: "fitness.hill_score",
  };
  return definitions.flatMap(([key, label, data, fields, unit]) => {
    const point = latestMetric(data, fields);
    if (!point || point.value < 0 || (point.value === 0 && !["readiness", "heat", "altitude", "weekly_load"].includes(key))) return [];
    return [{ key, label, ...point, unit, section: sources[key] }];
  });
}

const STATUS: Record<string, string> = {
  NO_STATUS: "Noch kein Status", UNPRODUCTIVE: "Unproduktiv", PRODUCTIVE: "Produktiv",
  PEAKING: "Höchstform", MAINTAINING: "Form halten", RECOVERY: "Erholung",
  DETRAINING: "Formverlust", OVERREACHING: "Überlastung", STRAINED: "Belastet", PAUSED: "Pausiert",
};

export function trainingStatusLabel(fitness: FitnessData): string | null {
  const entries = fitness.training_status?.mostRecentTrainingStatus?.latestTrainingStatusData;
  const row = entries ? Object.values(entries).sort((a, b) => (a.calendarDate ?? "").localeCompare(b.calendarDate ?? "")).at(-1) : null;
  const phrase = row?.trainingStatusFeedbackPhrase;
  if (!phrase) return null;
  const normalized = phrase.toUpperCase();
  return Object.entries(STATUS).find(([key]) => normalized.includes(key))?.[1] ?? null;
}

export function trainingLoadHistory(value: unknown) {
  const rows = metricRows(value, ["weeklyTrainingLoad"]).filter((row) => row.date);
  return [...new Map(rows.map((row) => [row.date!, { date: row.date!, value: row.value }])).values()]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function powerCurvePoints(value: unknown, depth = 0): { seconds: number; watts: number }[] {
  if (depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap((item) => powerCurvePoints(item, depth + 1)).sort((a, b) => a.seconds - b.seconds);
  const row = object(value);
  if (!row) return [];
  const seconds = row.durationInSeconds ?? row.duration;
  const watts = row.maxAveragePower ?? row.power;
  if (typeof seconds === "number" && typeof watts === "number" && Number.isFinite(seconds) && Number.isFinite(watts) && seconds > 0 && watts > 0) return [{ seconds, watts }];
  return Object.values(row).flatMap((item) => powerCurvePoints(item, depth + 1)).sort((a, b) => a.seconds - b.seconds);
}
