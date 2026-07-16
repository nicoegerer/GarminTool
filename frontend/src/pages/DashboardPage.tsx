import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { activityTypeLabel, formatDate, formatDistance, formatDuration } from "../format";

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: api.dashboardToday,
  });

  if (isLoading) return <p>Lade Dashboard...</p>;
  if (error) return <ErrorState message={(error as Error).message} />;
  if (!data) return null;

  const { recommendation, context, recent_activities } = data;

  return (
    <div>
      <div className="page-header">
        <h1>Heute</h1>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <span className={`badge ${recommendation.session_type}`}>{recommendation.title}</span>
        <p style={{ marginTop: 12 }}>{recommendation.description}</p>
        {recommendation.suggested_duration_minutes && (
          <p style={{ marginTop: 8, opacity: 0.8 }}>Empfohlene Dauer: ~{recommendation.suggested_duration_minutes} Minuten</p>
        )}
        {recommendation.rationale.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Warum?</h3>
            <ul className="rationale">
              {recommendation.rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <h2>Körper-Status</h2>
      <div className="card-grid">
        <Stat label="Training Readiness" value={context.readiness_score ?? "-"} sub={context.readiness_level ?? undefined} />
        <Stat label="HRV-Status" value={context.hrv_status ?? "-"} />
        <Stat label="Schlaf-Score" value={context.sleep_score ?? "-"} />
        <Stat label="Body Battery" value={context.body_battery_level ?? "-"} />
        <Stat label="Trainingsstatus" value={context.training_status_phrase ?? "-"} />
        <Stat label="Belastung 7T/28T-Ratio" value={context.acwr ?? "-"} sub={ratioHint(context.acwr)} />
        <Stat label="Tage seit harter Einheit" value={context.days_since_hard_session ?? "-"} />
      </div>

      <h2>Letzte Aktivitäten</h2>
      {recent_activities.length === 0 ? (
        <div className="empty-state">Noch keine Aktivitäten synchronisiert.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Name</th>
              <th>Typ</th>
              <th>Dauer</th>
              <th>Distanz</th>
              <th>⌀ HF</th>
            </tr>
          </thead>
          <tbody>
            {recent_activities.map((a) => (
              <tr key={a.activity_id} className="clickable" onClick={() => (window.location.href = `/activities/${a.activity_id}`)}>
                <td>{formatDate(a.start_time_local)}</td>
                <td>
                  <Link to={`/activities/${a.activity_id}`}>{a.name}</Link>
                </td>
                <td>{activityTypeLabel(a.type_key)}</td>
                <td>{formatDuration(a.duration_s)}</td>
                <td>{formatDistance(a.distance_m)}</td>
                <td>{a.average_hr ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ratioHint(acwr: number | null): string | undefined {
  if (acwr === null) return undefined;
  if (acwr > 1.5) return "erhöhtes Risiko";
  if (acwr < 0.8) return "niedrige Belastung";
  return "im grünen Bereich";
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <p>Konnte Dashboard nicht laden: {message}</p>
      <p style={{ marginTop: 8 }}>
        Läuft das Backend? Und wurde schon einmal <code>python backend/scripts/login.py</code> ausgeführt bzw. die
        Seed-Daten geladen?
      </p>
    </div>
  );
}
