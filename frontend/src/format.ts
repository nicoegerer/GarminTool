export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

export function formatDistance(meters: number): string {
  if (meters <= 0) return "-";
  return `${(meters / 1000).toFixed(2)} km`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatSecondsAsTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  running: "Laufen",
  lap_swimming: "Schwimmen",
  strength_training: "Krafttraining",
  cycling: "Radfahren",
  open_water_swimming: "Freiwasserschwimmen",
  walking: "Gehen",
  hiking: "Wandern",
};

export function activityTypeLabel(typeKey: string): string {
  return ACTIVITY_TYPE_LABELS[typeKey] ?? typeKey;
}
