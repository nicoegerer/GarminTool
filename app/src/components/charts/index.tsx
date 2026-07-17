"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/primitives";

/**
 * Charts are client-only: chart.js and chartjs-plugin-zoom read `window` at
 * import time, which breaks the static prerender. Everything imports the chart
 * through here so that constraint is enforced in one place.
 */
export const LineChart = dynamic(() => import("./line-chart").then((m) => m.LineChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[260px] w-full" />,
});

export type { Series } from "./line-chart";
