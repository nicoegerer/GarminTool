"use client";

import { motion, useInView, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/format";

/* ---------- Skeleton ---------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-surface-2", className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-black/[0.04] to-transparent dark:via-white/[0.06]" />
      <style jsx>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}

/* ---------- Animierte Zahl ---------- */

/**
 * Counts up once, when it scrolls into view. Uses a spring rather than a
 * linear tween so it settles instead of stopping dead.
 */
export function AnimatedNumber({
  value,
  digits = 0,
  suffix = "",
  prefix = "",
  className,
}: {
  value: number;
  digits?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const spring = useSpring(0, { stiffness: 70, damping: 18, mass: 0.6 });
  const text = useTransform(spring, (v) =>
    `${prefix}${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`,
  );

  useEffect(() => {
    if (inView) spring.set(value);
  }, [inView, value, spring]);

  return (
    <span ref={ref} className={className}>
      <motion.span>{text}</motion.span>
    </span>
  );
}

/* ---------- Karte ---------- */

export function Card({
  children,
  className,
  onClick,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
}) {
  const interactive = Boolean(onClick);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn("card", interactive && "card-interactive", className)}
      onClick={onClick}
      {...(interactive
        ? {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
    >
      {children}
    </motion.div>
  );
}

/* ---------- Seitenkopf ---------- */

export function PageHeader({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <header className="mb-7 pt-2 lg:pt-6">
      {kicker && <p className="kicker mb-1.5">{kicker}</p>}
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] lg:text-[2.125rem]">{title}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-ink-3">{sub}</p>}
    </header>
  );
}

/* ---------- Kennzahl ---------- */

export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; tone: "up" | "down" | "flat" };
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{value}</p>
      {delta && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            delta.tone === "up" && "text-positive",
            delta.tone === "down" && "text-negative",
            delta.tone === "flat" && "text-ink-3",
          )}
        >
          {delta.value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

/* ---------- Leerzustand ---------- */

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-sm text-ink-3">{children}</p>;
}
