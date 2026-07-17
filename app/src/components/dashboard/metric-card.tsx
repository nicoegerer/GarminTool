"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/format";
import type { ReactNode } from "react";

/**
 * The dashboard's atom: one number, minimal context, opens a detail sheet.
 * Deliberately sparse — depth lives behind the click, not on the tile.
 */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  hint,
  spark,
  onClick,
  delay = 0,
  accent,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { text: string; tone: "up" | "down" | "flat" };
  hint?: string;
  spark?: (number | null)[];
  onClick?: () => void;
  delay?: number;
  accent?: string;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "card group relative flex flex-col justify-between gap-3 p-5 text-left",
        onClick && "card-interactive",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-tight text-ink-3">{label}</p>
        {onClick && (
          <ChevronRight className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />
        )}
      </div>

      <div>
        <p className="flex items-baseline gap-1 text-[1.75rem] font-semibold leading-none tracking-[-0.03em]">
          {value}
          {unit && <span className="text-sm font-medium text-ink-3">{unit}</span>}
        </p>
        {delta && (
          <p
            className={cn(
              "mt-1.5 text-xs font-medium",
              delta.tone === "up" && "text-positive",
              delta.tone === "down" && "text-negative",
              delta.tone === "flat" && "text-ink-3",
            )}
          >
            {delta.text}
          </p>
        )}
        {hint && !delta && <p className="mt-1.5 text-xs text-ink-3">{hint}</p>}
      </div>

      {spark && spark.filter((v) => v != null).length > 1 && (
        <Sparkline values={spark} color={accent ?? "hsl(var(--ink-3))"} />
      )}
    </motion.button>
  );
}

function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const v = values.filter((x): x is number => x != null);
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const w = 100;
  const h = 22;

  const pts = values
    .map((val, i) => {
      if (val == null) return null;
      const x = (i / (values.length - 1)) * w;
      const y = h - ((val - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <motion.polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 0.85 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
}
