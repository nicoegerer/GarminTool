import type { SportGroup } from "./types";
import {
  Bike,
  Dumbbell,
  Footprints,
  Mountain,
  Sparkles,
  Waves,
  type LucideIcon,
} from "lucide-react";

const TYPE_TO_GROUP: Record<string, SportGroup> = {
  running: "run",
  treadmill_running: "run",
  trail_running: "run",
  track_running: "run",
  cycling: "ride",
  road_biking: "ride",
  indoor_cycling: "ride",
  cyclocross: "ride",
  gravel_cycling: "ride",
  mountain_biking: "ride",
  virtual_ride: "ride",
  lap_swimming: "swim",
  open_water_swimming: "swim",
  strength_training: "gym",
  indoor_cardio: "gym",
  elliptical: "gym",
  yoga: "gym",
  hiking: "hike",
  walking: "walk",
};

export function sportGroup(typeKey?: string): SportGroup {
  if (!typeKey) return "other";
  return TYPE_TO_GROUP[typeKey] ?? "other";
}

interface SportMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind token — resolves to the muted sport colors in globals.css */
  color: string;
  text: string;
  bg: string;
  /** Raw CSS var, for canvas/chart contexts that can't use Tailwind classes */
  cssVar: string;
}

export const SPORT_META: Record<SportGroup, SportMeta> = {
  run: { label: "Laufen", icon: Footprints, color: "bg-sport-run", text: "text-sport-run", bg: "bg-sport-run/10", cssVar: "--sport-run" },
  ride: { label: "Radfahren", icon: Bike, color: "bg-sport-ride", text: "text-sport-ride", bg: "bg-sport-ride/10", cssVar: "--sport-ride" },
  swim: { label: "Schwimmen", icon: Waves, color: "bg-sport-swim", text: "text-sport-swim", bg: "bg-sport-swim/10", cssVar: "--sport-swim" },
  gym: { label: "Kraft", icon: Dumbbell, color: "bg-sport-gym", text: "text-sport-gym", bg: "bg-sport-gym/10", cssVar: "--sport-gym" },
  hike: { label: "Wandern", icon: Mountain, color: "bg-sport-hike", text: "text-sport-hike", bg: "bg-sport-hike/10", cssVar: "--sport-hike" },
  walk: { label: "Spazieren", icon: Footprints, color: "bg-sport-walk", text: "text-sport-walk", bg: "bg-sport-walk/10", cssVar: "--sport-walk" },
  other: { label: "Sonstiges", icon: Sparkles, color: "bg-sport-other", text: "text-sport-other", bg: "bg-sport-other/10", cssVar: "--sport-other" },
};

export const SPORT_ORDER: SportGroup[] = ["run", "ride", "swim", "gym", "hike", "walk", "other"];

/** Resolves a sport's colour to a concrete hsl() string usable on a canvas. */
export function sportColor(group: SportGroup, alpha = 1): string {
  if (typeof window === "undefined") return "hsl(0 0% 50%)";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(SPORT_META[group].cssVar).trim();
  return alpha === 1 ? `hsl(${raw})` : `hsl(${raw} / ${alpha})`;
}

export const TYPE_LABELS: Record<string, string> = {
  running: "Laufen",
  treadmill_running: "Laufband",
  trail_running: "Trailrun",
  track_running: "Bahn",
  cycling: "Radfahren",
  road_biking: "Rennrad",
  indoor_cycling: "Indoor-Rad",
  cyclocross: "Cyclocross",
  gravel_cycling: "Gravel",
  mountain_biking: "Mountainbike",
  virtual_ride: "Virtuelles Rad",
  lap_swimming: "Bahnenschwimmen",
  open_water_swimming: "Freiwasser",
  strength_training: "Krafttraining",
  indoor_cardio: "Indoor-Cardio",
  elliptical: "Crosstrainer",
  yoga: "Yoga",
  hiking: "Wandern",
  walking: "Spazieren",
  multi_sport: "Triathlon",
  other: "Sonstiges",
};

export function typeLabel(typeKey?: string): string {
  if (!typeKey) return "Aktivität";
  return TYPE_LABELS[typeKey] ?? typeKey.replace(/_/g, " ");
}

/** Garmin's training-effect labels, in German. */
export const TE_LABELS: Record<string, string> = {
  RECOVERY: "Erholung",
  AEROBIC_BASE: "Aerobe Basis",
  TEMPO: "Tempo",
  LACTATE_THRESHOLD: "Schwelle",
  VO2MAX: "VO₂max",
  ANAEROBIC_CAPACITY: "Anaerobe Kapazität",
  SPRINT: "Sprint",
  NO_BENEFIT: "Kein Effekt",
  UNKNOWN: "",
};
