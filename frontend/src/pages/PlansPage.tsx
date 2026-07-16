import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatDate } from "../format";

export default function PlansPage() {
  const plans = useQuery({ queryKey: ["plans"], queryFn: api.plans });
  const workouts = useQuery({ queryKey: ["upcoming-workouts"], queryFn: api.upcomingWorkouts });

  return (
    <div>
      <h1>Trainingspläne</h1>

      <h2>Aktive Pläne</h2>
      {plans.isLoading && <p>Lade Pläne...</p>}
      {plans.data && plans.data.length === 0 && (
        <div className="empty-state">Keine Trainingspläne gefunden (Garmin Coach oder eigene Pläne).</div>
      )}
      {plans.data && plans.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Start</th>
              <th>Ende</th>
            </tr>
          </thead>
          <tbody>
            {plans.data.map((p) => (
              <tr key={p.plan_id}>
                <td>{p.name}</td>
                <td>{p.plan_type}</td>
                <td>{p.start_date ? formatDate(p.start_date) : "-"}</td>
                <td>{p.end_date ? formatDate(p.end_date) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: 28 }}>Anstehende Workouts</h2>
      {workouts.isLoading && <p>Lade Workouts...</p>}
      {workouts.data && workouts.data.length === 0 && <div className="empty-state">Keine geplanten Workouts.</div>}
      {workouts.data && workouts.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Name</th>
              <th>Sportart</th>
            </tr>
          </thead>
          <tbody>
            {workouts.data.map((w) => (
              <tr key={w.workout_id}>
                <td>{w.scheduled_date ? formatDate(w.scheduled_date) : "-"}</td>
                <td>{w.name}</td>
                <td>{w.sport_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
