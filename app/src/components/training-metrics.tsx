"use client";

import { Card } from "@/components/ui/primitives";
import { LineChart } from "@/components/charts";
import { useGarmin } from "@/lib/data";
import { fmtDateShort, fmtNum } from "@/lib/format";
import { performanceMetrics, powerCurvePoints, trainingLoadHistory, trainingStatusLabel } from "@/lib/performance";
import { themeToken } from "@/lib/theme-tokens";

export function TrainingMetrics() {
  const { daily, fitness, manifest } = useGarmin();
  const metrics = performanceMetrics(fitness, daily);
  const status = trainingStatusLabel(fitness);
  const history = trainingLoadHistory(fitness.training_status_history);
  const power = powerCurvePoints(fitness.power_curve);
  if (!status && !metrics.length && !history.length && !power.length) return null;
  const saved = manifest?.source !== "python_garminconnect";

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Garmin-Leistung</h2>
        <span className="text-[11px] text-ink-3">{saved ? "Gespeicherter Stand" : "Garmin Connect"}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
        {status && <div><p className="text-[12px] text-ink-3">Trainingsstatus</p><p className="mt-1 text-lg font-semibold">{status}</p></div>}
        {metrics.map((metric) => (
          <div key={metric.key}>
            <p className="text-[12px] text-ink-3">{metric.label}{!saved && manifest?.sections[metric.section]?.retained && " · gespeichert"}</p>
            <p className="mt-1 text-lg font-semibold tabular">{fmtNum(metric.value, metric.key.startsWith("cycling_") ? 1 : 0)} <span className="text-[12px] font-normal text-ink-3">{metric.unit}</span></p>
            {metric.date && <p className="text-[11px] text-ink-3">{fmtDateShort(metric.date)}</p>}
          </div>
        ))}
      </div>
      {(history.length > 1 || power.length > 1) && (
        <details className="mt-5 border-t border-line pt-3">
          <summary className="cursor-pointer text-[12px] text-ink-3">Leistungsverlauf</summary>
          <div className="mt-4 space-y-5">
            {history.length > 1 && <div><h3 className="mb-2 text-[12px] font-medium">Garmin-Wochenlast</h3><LineChart labels={history.map((row) => fmtDateShort(row.date))} series={[{ label: "Trainingslast", data: history.map((row) => row.value), color: themeToken("--gold") }]} /></div>}
            {power.length > 1 && <div><h3 className="mb-2 text-[12px] font-medium">Leistungskurve Rad · 90 Tage</h3><LineChart labels={power.map((row) => row.seconds < 60 ? `${row.seconds} s` : `${row.seconds / 60} min`)} series={[{ label: "Leistung", data: power.map((row) => row.watts), color: themeToken("--sport-ride") }]} yFormat={(value) => `${fmtNum(value)} W`} /></div>}
          </div>
        </details>
      )}
    </Card>
  );
}
