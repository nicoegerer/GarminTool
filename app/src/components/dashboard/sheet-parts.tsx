"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** Shared building blocks for every detail sheet — one look across all of them. */

export function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface-2 p-3.5">
      <p className="text-[11px] leading-tight text-ink-3">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.02em]">{value}</p>
      {hint && (
        <p
          className={cn(
            "mt-0.5 text-[11px]",
            tone === "up" && "font-medium text-positive",
            tone === "down" && "font-medium text-negative",
            (!tone || tone === "flat") && "text-ink-3",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export function SheetChart({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="size-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Explain({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line-soft bg-surface-2 p-5">
      <h3 className="mb-2.5 text-sm font-semibold">{title}</h3>
      <div className="space-y-2.5 text-[13px] leading-relaxed text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}
