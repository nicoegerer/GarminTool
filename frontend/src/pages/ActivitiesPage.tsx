import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { activityTypeLabel, formatDate, formatDistance, formatDuration } from "../format";

const PAGE_SIZE = 20;

export default function ActivitiesPage() {
  const [offset, setOffset] = useState(0);
  const [typeKey, setTypeKey] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["activities", offset, typeKey],
    queryFn: () => api.activities({ limit: PAGE_SIZE, offset, type_key: typeKey || undefined }),
  });

  return (
    <div>
      <div className="page-header">
        <h1>Aktivitäten</h1>
        <div className="filters">
          <select
            value={typeKey}
            onChange={(e) => {
              setTypeKey(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Alle Typen</option>
            <option value="running">Laufen</option>
            <option value="lap_swimming">Schwimmen</option>
            <option value="strength_training">Krafttraining</option>
            <option value="cycling">Radfahren</option>
          </select>
        </div>
      </div>

      {isLoading && <p>Lade Aktivitäten...</p>}
      {error && <div className="empty-state">Fehler: {(error as Error).message}</div>}
      {data && data.length === 0 && <div className="empty-state">Keine Aktivitäten gefunden.</div>}

      {data && data.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Name</th>
                <th>Typ</th>
                <th>Dauer</th>
                <th>Distanz</th>
                <th>⌀ HF</th>
                <th>Trainingseffekt</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.activity_id} className="clickable">
                  <td>
                    <Link to={`/activities/${a.activity_id}`}>{formatDate(a.start_time_local)}</Link>
                  </td>
                  <td>{a.name}</td>
                  <td>{activityTypeLabel(a.type_key)}</td>
                  <td>{formatDuration(a.duration_s)}</td>
                  <td>{formatDistance(a.distance_m)}</td>
                  <td>{a.average_hr ?? "-"}</td>
                  <td>{a.training_effect_label ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Zurück
            </button>
            <button disabled={data.length < PAGE_SIZE} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Weiter
            </button>
          </div>
        </>
      )}
    </div>
  );
}
