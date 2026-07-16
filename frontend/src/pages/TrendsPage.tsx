import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { api } from "../api/client";

const METRIC_LABELS: Record<string, string> = {
  vo2max: "VO2max",
  resting_hr: "Ruhepuls",
  hrv: "HRV",
  weight: "Gewicht (kg)",
  sleep_score: "Schlaf-Score",
  training_load: "Wöchentliche Trainingslast",
  steps: "Schritte",
  stress: "Stress-Level",
  body_battery: "Body Battery",
  race_predictions: "Wettkampf-Prognosen (Sekunden)",
};

const LINE_COLORS = ["#aa3bff", "#1a9e5c", "#c98a00", "#d33a3a", "#3b82f6"];

export default function TrendsPage() {
  const [metric, setMetric] = useState("vo2max");
  const [days, setDays] = useState(90);

  const { data: metrics } = useQuery({ queryKey: ["trend-metrics"], queryFn: api.trendMetrics });
  const { data, isLoading, error } = useQuery({
    queryKey: ["trend", metric, days],
    queryFn: () => api.trend(metric, days),
  });

  const fields = data && data.length > 0 ? Object.keys(data[0]).filter((k) => k !== "date") : [];

  return (
    <div>
      <div className="page-header">
        <h1>Trends</h1>
        <div className="filters">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>30 Tage</option>
            <option value={90}>90 Tage</option>
            <option value={180}>180 Tage</option>
            <option value={365}>1 Jahr</option>
          </select>
        </div>
      </div>

      <div className="tabs">
        {(metrics ?? Object.keys(METRIC_LABELS)).map((m) => (
          <button key={m} className={m === metric ? "active" : ""} onClick={() => setMetric(m)}>
            {METRIC_LABELS[m] ?? m}
          </button>
        ))}
      </div>

      {isLoading && <p>Lade Trend-Daten...</p>}
      {error && <div className="empty-state">Fehler: {(error as Error).message}</div>}
      {data && data.length === 0 && <div className="empty-state">Noch keine Daten für diese Metrik.</div>}

      {data && data.length > 0 && (
        <div className="card" style={{ height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {fields.map((f, i) => (
                <Line key={f} type="monotone" dataKey={f} stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
