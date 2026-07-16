import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { activityTypeLabel, formatDate, formatDistance, formatDuration } from "../format";

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const activityId = Number(id);

  const { data, isLoading, error } = useQuery({
    queryKey: ["activity", activityId],
    queryFn: () => api.activity(activityId),
    enabled: !Number.isNaN(activityId),
  });

  if (isLoading) return <p>Lade Aktivität...</p>;
  if (error) return <div className="empty-state">Fehler: {(error as Error).message}</div>;
  if (!data) return null;

  const zones = [1, 2, 3, 4, 5].map((n) => data.hr_zones[`zone_${n}`] ?? 0);
  const totalZoneSeconds = zones.reduce((a, b) => a + b, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to="/activities">&larr; Zurück zu Aktivitäten</Link>
          <h1 style={{ marginTop: 8 }}>{data.name}</h1>
          <p style={{ opacity: 0.75 }}>
            {activityTypeLabel(data.type_key)} · {formatDate(data.start_time_local)}
          </p>
        </div>
      </div>

      <div className="card-grid">
        <Stat label="Dauer" value={formatDuration(data.duration_s)} />
        <Stat label="Distanz" value={formatDistance(data.distance_m)} />
        <Stat label="Kalorien" value={data.calories} />
        <Stat label="⌀ Herzfrequenz" value={data.average_hr ?? "-"} />
        <Stat label="Max. Herzfrequenz" value={data.max_hr ?? "-"} />
        <Stat label="Trainingseffekt" value={data.training_effect_label ?? "-"} />
        <Stat label="Aerober Effekt" value={data.aerobic_training_effect ?? "-"} />
        <Stat label="Anaerober Effekt" value={data.anaerobic_training_effect ?? "-"} />
        <Stat label="Trainingsbelastung" value={data.activity_training_load ?? "-"} />
      </div>

      {totalZoneSeconds > 0 && (
        <>
          <h2>Herzfrequenz-Zonen</h2>
          <div className="card">
            {zones.map((secs, i) => {
              const pct = totalZoneSeconds > 0 ? Math.round((secs / totalZoneSeconds) * 100) : 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 60 }}>Zone {i + 1}</span>
                  <div style={{ flex: 1, background: "var(--border)", borderRadius: 6, overflow: "hidden", height: 10 }}>
                    <div style={{ width: `${pct}%`, background: "var(--accent)", height: "100%" }} />
                  </div>
                  <span style={{ width: 90, textAlign: "right" }}>{formatDuration(secs)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {data.gear.length > 0 && (
        <>
          <h2>Gear</h2>
          <p>{data.gear.join(", ")}</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
