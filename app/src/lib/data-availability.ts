import type { Manifest } from "./types";

const HISTORICAL_SECTIONS = [
  ["daily.vo2max", "VO₂max"],
  ["fitness.training_status", "Trainingsstatus"],
  ["fitness.race_predictions", "Wettkampfprognosen"],
  ["records", "Rekorde"],
] as const;

export function historicalDataLabels(manifest: Manifest | null): string[] {
  return HISTORICAL_SECTIONS.filter(([key]) => {
    const section = manifest?.sections?.[key];
    return section?.status === "unavailable" && section.retained;
  }).map(([, label]) => label);
}
