"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Monitor, Moon, Sun } from "lucide-react";
import { NAV, PRIMARY_NAV } from "@/lib/nav";
import { cn } from "@/lib/format";
import { useTheme } from "./theme";
import { RefreshButton } from "./refresh-button";
import { Background } from "./background";
import type { ReactNode } from "react";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/* ---------- Desktop sidebar ---------- */

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line-soft px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-gold/12 text-gold">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 14h4l2.5-7 3.5 11 2.5-6.5L17 14h4" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight">GarminTool</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-10 rounded-xl bg-surface-2"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <item.icon className={cn("size-[18px] shrink-0", active && "text-gold")} strokeWidth={active ? 2.2 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <ThemeToggle />
    </aside>
  );
}

/* ---------- Mobile bottom nav ---------- */

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line-soft lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {PRIMARY_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              // 56px min height keeps every target comfortably thumb-sized
              className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2"
            >
              {active && (
                <motion.span
                  layoutId="bottom-active"
                  className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gold"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <item.icon
                className={cn("size-[21px] transition-colors", active ? "text-gold" : "text-ink-3")}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span className={cn("text-[10px] leading-none transition-colors", active ? "text-ink" : "text-ink-3")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------- Mobile sticky header ---------- */

function MobileHeader() {
  const pathname = usePathname();
  const current = NAV.find((n) => isActive(pathname, n.href));
  return (
    <header className="glass sticky top-0 z-30 flex items-center justify-between border-b border-line-soft px-4 py-3 lg:hidden">
      <span className="text-base font-semibold tracking-tight">{current?.label ?? "GarminTool"}</span>
      <div className="flex items-center gap-1">
        <RefreshButton compact />
        <ThemeToggle compact />
      </div>
    </header>
  );
}

/* ---------- Theme toggle ---------- */

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "light" as const, icon: Sun, label: "Hell" },
    { id: "dark" as const, icon: Moon, label: "Dunkel" },
    { id: "system" as const, icon: Monitor, label: "System" },
  ];

  if (compact) {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    const Icon = options.find((o) => o.id === theme)?.icon ?? Monitor;
    return (
      <button
        onClick={() => setTheme(next)}
        className="grid size-9 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Design wechseln"
      >
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-line-soft p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className={cn(
            "relative flex flex-1 items-center justify-center rounded-lg py-1.5 transition-colors",
            theme === o.id ? "text-ink" : "text-ink-3 hover:text-ink-2",
          )}
          aria-label={o.label}
          aria-pressed={theme === o.id}
        >
          {theme === o.id && (
            <motion.span layoutId="theme-active" className="absolute inset-0 rounded-lg bg-surface-2" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
          )}
          <o.icon className="relative size-4" strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}

/* ---------- Shell ---------- */

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <Background />

      <Sidebar />
      <MobileHeader />

      <div className="lg:pl-60">
        {/* Desktop top bar: only the refresh action lives here */}
        <div className="sticky top-0 z-30 hidden items-center justify-end px-8 py-4 lg:flex">
          <RefreshButton />
        </div>

        <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-24 pt-4 lg:px-8 lg:pb-16 lg:pt-0">
          {/*
            Enter-only page transition, keyed by route: remounting on `key`
            replays the fade-in. No <AnimatePresence> — it doesn't unmount its
            children in this stack, which would stack dead pages on every
            navigation (see lib/use-mount-transition).
          */}
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      <BottomNav />
    </>
  );
}
