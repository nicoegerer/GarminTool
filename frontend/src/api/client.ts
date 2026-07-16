const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface Recommendation {
  session_type: string;
  title: string;
  description: string;
  suggested_duration_minutes: number | null;
  rationale: string[];
}

export interface DashboardContext {
  readiness_score: number | null;
  readiness_level: string | null;
  hrv_status: string | null;
  sleep_score: number | null;
  body_battery_level: number | null;
  training_status_phrase: string | null;
  acute_load: number | null;
  chronic_load: number | null;
  acwr: number | null;
  days_since_hard_session: number | null;
}

export interface ActivitySummary {
  activity_id: number;
  name: string;
  type_key: string;
  start_time_local: string;
  duration_s: number;
  distance_m: number;
  calories: number;
  average_hr: number | null;
  max_hr?: number | null;
  aerobic_training_effect?: number | null;
  anaerobic_training_effect?: number | null;
  training_effect_label: string | null;
  activity_training_load?: number | null;
}

export interface ActivityDetail extends ActivitySummary {
  hr_zones: Record<string, number | null>;
  gear: string[];
  raw: Record<string, unknown> | null;
}

export interface DashboardResponse {
  recommendation: Recommendation;
  context: DashboardContext;
  recent_activities: ActivitySummary[];
}

export interface GearItem {
  gear_uuid: string;
  name: string;
  gear_type_name: string;
  total_distance_m: number | null;
  status: string | null;
  activity_count: number;
}

export interface TrainingPlan {
  plan_id: string;
  name: string;
  plan_type: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Workout {
  workout_id: string;
  name: string;
  scheduled_date: string | null;
  sport_type: string;
  plan_id: string | null;
}

export interface SyncStatus {
  logged_in: boolean;
  last_sync_at: string | null;
  last_sync_success: boolean | null;
  last_sync_detail: string | null;
}

export const api = {
  dashboardToday: () => request<DashboardResponse>("/dashboard/today"),
  activities: (params: { limit?: number; offset?: number; type_key?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.offset) qs.set("offset", String(params.offset));
    if (params.type_key) qs.set("type_key", params.type_key);
    const suffix = qs.toString() ? `?${qs}` : "";
    return request<ActivitySummary[]>(`/activities${suffix}`);
  },
  activity: (id: number) => request<ActivityDetail>(`/activities/${id}`),
  trendMetrics: () => request<string[]>("/trends"),
  trend: (metric: string, days = 90) => request<Array<Record<string, unknown>>>(`/trends/${metric}?days=${days}`),
  gear: () => request<GearItem[]>("/gear"),
  plans: () => request<TrainingPlan[]>("/plans"),
  upcomingWorkouts: () => request<Workout[]>("/plans/workouts/upcoming"),
  syncStatus: () => request<SyncStatus>("/settings/sync-status"),
  triggerSync: () => request<{ detail: string }>("/settings/sync", { method: "POST" }),
};
