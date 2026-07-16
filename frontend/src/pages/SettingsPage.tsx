import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { formatDateTime } from "../format";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["sync-status"], queryFn: api.syncStatus });

  const syncMutation = useMutation({
    mutationFn: api.triggerSync,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return (
    <div>
      <h1>Einstellungen</h1>

      {isLoading && <p>Lade Status...</p>}
      {error && <div className="empty-state">Fehler: {(error as Error).message}</div>}

      {data && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p>
            Garmin-Login: {data.logged_in ? <strong style={{ color: "var(--good)" }}>verbunden</strong> : <strong style={{ color: "var(--bad)" }}>nicht verbunden</strong>}
          </p>
          {!data.logged_in && (
            <p style={{ marginTop: 8, opacity: 0.8 }}>
              Führe einmalig <code>python backend/scripts/login.py</code> in deinem eigenen Terminal aus, um dich mit
              deinem Garmin-Konto zu verbinden.
            </p>
          )}
          <p style={{ marginTop: 12 }}>Letzter Sync: {data.last_sync_at ? formatDateTime(data.last_sync_at) : "noch nie"}</p>
          {data.last_sync_detail && (
            <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13, background: "var(--code-bg)", padding: 12, borderRadius: 8 }}>
              {data.last_sync_detail}
            </pre>
          )}
        </div>
      )}

      <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending || (data && !data.logged_in)}>
        {syncMutation.isPending ? "Synchronisiere..." : "Jetzt synchronisieren"}
      </button>

      {syncMutation.isError && <p style={{ color: "var(--bad)", marginTop: 8 }}>Fehler: {(syncMutation.error as Error).message}</p>}
      {syncMutation.isSuccess && <p style={{ color: "var(--good)", marginTop: 8 }}>Sync abgeschlossen.</p>}
    </div>
  );
}
