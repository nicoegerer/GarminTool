"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import { dataUrl } from "@/lib/paths";
import { useData } from "@/lib/data";

type Phase = "idle" | "checking" | "current";

/**
 * "Aktualisieren" — loads the newest published data, on any device, no token.
 *
 * The actual pull from the watch runs server-side every 2h (refresh-data.yml)
 * and redeploys the site (deploy.yml on workflow_run). So this button only has
 * to fetch the newest deployed data: it checks the live manifest, and reloads
 * if it's newer than what's on screen. Embedding a GitHub token here to trigger
 * the workflow would mean publishing it in the public bundle — not worth the
 * risk when the automatic refresh already keeps things current.
 */
export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const { data } = useData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("Aktualisieren");

  async function click() {
    if (phase === "checking") return;
    setPhase("checking");
    setLabel("Prüfe …");

    const loaded = data?.manifest?.generated_at;
    try {
      const res = await fetch(`${dataUrl("manifest.json")}?ts=${Date.now()}`, { cache: "no-store" });
      const m = (await res.json()) as { generated_at?: string };
      if (m.generated_at && m.generated_at !== loaded) {
        setLabel("Neue Daten – lädt …");
        setTimeout(() => location.reload(), 500);
      } else {
        setPhase("current");
        setLabel("Bereits aktuell");
        setTimeout(() => {
          setPhase("idle");
          setLabel("Aktualisieren");
        }, 2500);
      }
    } catch {
      setPhase("idle");
      setLabel("Aktualisieren");
    }
  }

  const Icon = phase === "current" ? Check : RefreshCw;

  return (
    <button
      onClick={click}
      disabled={phase === "checking"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line text-ink-2 transition-colors",
        "hover:border-gold/40 hover:bg-gold/8 hover:text-gold disabled:opacity-60",
        compact ? "size-9 justify-center" : "px-4 py-2 text-[13px] font-medium",
        phase === "current" && "border-positive/40 text-positive",
      )}
      aria-label="Daten aktualisieren"
    >
      <Icon className={cn("size-[15px] shrink-0", phase === "checking" && "animate-spin")} strokeWidth={2} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
