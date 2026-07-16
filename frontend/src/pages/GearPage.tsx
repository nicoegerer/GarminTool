import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatDistance } from "../format";

export default function GearPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["gear"], queryFn: api.gear });

  return (
    <div>
      <h1>Gear</h1>
      {isLoading && <p>Lade Gear...</p>}
      {error && <div className="empty-state">Fehler: {(error as Error).message}</div>}
      {data && data.length === 0 && (
        <div className="empty-state">
          Noch kein Gear registriert. Schuhe/Rad in Garmin Connect anlegen, dann wird es beim nächsten Sync übernommen.
        </div>
      )}
      {data && data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Typ</th>
              <th>Distanz</th>
              <th>Status</th>
              <th>Aktivitäten</th>
            </tr>
          </thead>
          <tbody>
            {data.map((g) => (
              <tr key={g.gear_uuid}>
                <td>{g.name}</td>
                <td>{g.gear_type_name}</td>
                <td>{g.total_distance_m ? formatDistance(g.total_distance_m) : "-"}</td>
                <td>{g.status ?? "-"}</td>
                <td>{g.activity_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
