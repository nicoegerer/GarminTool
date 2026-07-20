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

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/training", label: "Training", icon: Dumbbell, primary: true },
  { href: "/aktivitaeten", label: "Aktivitäten", icon: Activity, primary: true },
  { href: "/statistiken", label: "Statistiken", icon: BarChart3 },
  { href: "/gesundheit", label: "Gesundheit", icon: HeartPulse },
  { href: "/wettkaempfe", label: "Wettkämpfe", icon: Flag },
  { href: "/rekorde", label: "Rekorde", icon: Trophy },
  { href: "/coach", label: "KI-Coach", icon: Bot, primary: true },
];

export const PRIMARY_NAV = NAV.filter((n) => n.primary);
