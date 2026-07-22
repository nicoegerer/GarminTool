"use client";

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
  type ScriptableContext,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import { Line } from "react-chartjs-2";
import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, zoomPlugin);

import { themeToken as token } from "@/lib/theme-tokens";

export interface Series {
  label: string;
  data: (number | null)[];
  color: string;
  /** Gradient fill under the line — the Apple Health look. */
  fill?: boolean;
  dashed?: boolean;
}

export function LineChart({
  labels,
  series,
  height = 260,
  yFormat,
  tooltipFormat,
  reverseY = false,
  yMin,
  yMax,
  zoomable = true,
  points = false,
  onPointClick,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  yFormat?: (v: number) => string;
  tooltipFormat?: (v: number, seriesLabel: string, index: number) => string;
  reverseY?: boolean;
  yMin?: number;
  yMax?: number;
  zoomable?: boolean;
  points?: boolean;
  /** Called with the data index when a point is tapped. */
  onPointClick?: (index: number) => void;
}) {
  const ref = useRef<ChartJS<"line">>(null);
  const [zoomed, setZoomed] = useState(false);
  // Chart.js reads colours from the DOM at draw time; remount on theme flips.
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeKey((k) => k + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const data = useMemo(
    () => ({
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.data,
        borderColor: s.color,
        borderWidth: 2,
        borderDash: s.dashed ? [4, 4] : undefined,
        // Vertical gradient: strong at the line, gone at the axis.
        backgroundColor: s.fill
          ? (ctx: ScriptableContext<"line">) => {
              const { chartArea, ctx: c } = ctx.chart;
              if (!chartArea) return "transparent";
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0, `${s.color.replace(")", " / 0.22)").replace("hsl(", "hsl(")}`);
              g.addColorStop(1, `${s.color.replace(")", " / 0)").replace("hsl(", "hsl(")}`);
              return g;
            }
          : s.color,
        fill: s.fill ? "origin" : false,
        tension: 0.38,
        spanGaps: true,
        pointRadius: points ? 3 : 0,
        pointHoverRadius: 5,
        pointBackgroundColor: s.color,
        pointBorderColor: token("--surface"),
        pointBorderWidth: 2,
        pointHitRadius: 16,
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [labels, series, points, themeKey],
  );

  const options = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 6, right: 4 } },
      onHover: (e, els) => {
        const el = e.native?.target as HTMLElement | undefined;
        if (el) el.style.cursor = onPointClick && els.length ? "pointer" : "default";
      },
      onClick: (_e, els) => {
        if (onPointClick && els.length) onPointClick(els[0].index);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: token("--surface"),
          titleColor: token("--ink"),
          bodyColor: token("--ink-2"),
          borderColor: token("--line"),
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 5,
          usePointStyle: true,
          titleFont: { size: 12, weight: 600 },
          bodyFont: { size: 12 },
          callbacks: {
            label: (c) => {
              const y = c.parsed.y;
              if (y == null) return "";
              return tooltipFormat
                ? ` ${tooltipFormat(y, c.dataset.label ?? "", c.dataIndex)}`
                : ` ${c.dataset.label}: ${yFormat ? yFormat(y) : y}`;
            },
          },
        },
        zoom: zoomable
          ? {
              pan: { enabled: true, mode: "x", onPanComplete: () => setZoomed(true) },
              zoom: {
                wheel: { enabled: true, speed: 0.08 },
                pinch: { enabled: true },
                mode: "x",
                onZoomComplete: () => setZoomed(true),
              },
              limits: { x: { minRange: 4 } },
            }
          : undefined,
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: token("--line") },
          ticks: {
            color: token("--ink-3"),
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 20,
          },
        },
        y: {
          reverse: reverseY,
          min: yMin,
          max: yMax,
          grid: { color: token("--line-soft"), drawTicks: false },
          border: { display: false },
          ticks: {
            color: token("--ink-3"),
            font: { size: 11 },
            padding: 8,
            callback: (v) => (yFormat ? yFormat(Number(v)) : String(v)),
          },
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yFormat, tooltipFormat, reverseY, yMin, yMax, zoomable, themeKey, onPointClick],
  );

  return (
    <div className="relative" style={{ height }}>
      <Line key={themeKey} ref={ref} data={data} options={options} />
      {zoomed && (
        <button
          onClick={() => {
            ref.current?.resetZoom();
            setZoomed(false);
          }}
          className="absolute right-1 top-0 flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink-2 transition-colors hover:text-ink"
        >
          <RotateCcw className="size-3" strokeWidth={2} />
          Zoom zurücksetzen
        </button>
      )}
    </div>
  );
}

