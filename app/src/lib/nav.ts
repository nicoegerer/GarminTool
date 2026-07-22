import {
  Activity,
  BarChart3,
  Bot,
  Dumbbell,
  HeartPulse,
  LayoutDashboard,
  Trophy,
  Flag,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the mobile bottom bar (max 5). */
  primary?: boolean;
}

// `primary` drives the mobile bottom bar (max 5). Training und Aktivitäten
// zeigen weitgehend dasselbe — in der Leiste steht deshalb nur Training,
// Aktivitäten bleibt über das volle Menü erreichbar. Der frei gewordene Platz
// geht an Gesundheit.
export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/training", label: "Training", icon: Dumbbell, primary: true },
  { href: "/gesundheit", label: "Gesundheit", icon: HeartPulse, primary: true },
  { href: "/coach", label: "KI-Coach", icon: Bot, primary: true },
  { href: "/aktivitaeten", label: "Aktivitäten", icon: Activity },
  { href: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { href: "/wettkaempfe", label: "Wettkämpfe", icon: Flag },
  { href: "/rekorde", label: "Rekorde", icon: Trophy },
];

export const PRIMARY_NAV = NAV.filter((n) => n.primary);
