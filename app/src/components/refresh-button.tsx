"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import { dataUrl } from "@/lib/paths";
import { useData } from "@/lib/data";

type Phase = "idle" | "checking" | "current" | "pulling";

/**
 * "Aktualisieren" — works on any device with no per-user setup.
 *
 * Two modes, chosen at build time:
 *
 * 1. If NEXT_PUBLIC_DISPATCH_TOKEN is compiled in, the button actually triggers
 *    a fresh pull from the watch: it dispatches the refresh workflow, then polls
 *    the live manifest until the new data is deployed and reloads. The token is
 *    a fine-grained PAT scoped to *only* Actions:write on *only* this repo — if
 *    it leaks, the worst anyone can do is start a refresh run. No code, data or
 *    account access.
 *
 * 2. Without a token it falls back to loading the newest already-published data
 *    (the workflow runs itself every 2h). Still no key, still any device.
 */
const DISPATCH_TOKEN = process.env.NEXT_PUBLIC_DISPATCH_TOKEN ?? "";
const REPO = "nicoegerer/GarminTool";
const WORKFLOW = "refresh-data.yml";
const POLL_EVERY = 6000;
const POLL_FOR = 5 * 60 * 1000;

export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const { data } = useData();
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("Aktualisieren");

  function reset(delay = 2500) {
    setTimeout(() => {
      setPhase("idle");
      setLabel("Aktualisieren");
    }, delay);
  }

  async function liveManifest(): Promise<string | undefined> {
    const res = await fetch(`${dataUrl("manifest.json")}?ts=${Date.now()}`, { cache: "no-store" });
    const m = (await res.json()) as { generated_at?: string };
    return m.generated_at;
  }

  /** Poll the deployed manifest until it moves past `prev`, then reload. */
  async function waitForNewData(prev: string | undefined) {
    const deadline = Date.now() + POLL_FOR;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_EVERY));
      try {
        const gen = await liveManifest();
        if (gen && gen !== prev) {
          setLabel("Neue Daten – lädt …");
          setTimeout(() => location.reload(), 400);
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    // The run can outlast the poll window. It keeps going server-side either
    // way, so say so instead of implying it failed.
    setPhase("current");
    setLabel("Läuft weiter im Hintergrund");
    reset(5000);
  }

  async function triggerPull() {
    setPhase("pulling");
    setLabel("Hole von der Uhr …");
    const prev = data?.manifest?.generated_at;
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${DISPATCH_TOKEN}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main" }),
        // Let the request finish even if the page is closed right after the
        // tap — the pull itself then runs server-side to completion.
        keepalive: true,
      });
      if (!res.ok) throw new Error(String(res.status));
      // Deliberately no throttle: after deleting or fixing something in Garmin
      // you want to pull again immediately, not wait out a cooldown.
      await waitForNewData(prev);
    } catch {
      // Fall back to just loading whatever is freshest.
      await checkLatest();
    }
  }

  /** Fallback / no-token path: reload if the deployed data is newer. */
  async function checkLatest() {
    setPhase("checking");
    setLabel("Prüfe …");
    const loaded = data?.manifest?.generated_at;
    try {
      const gen = await liveManifest();
      if (gen && gen !== loaded) {
        setLabel("Neue Daten – lädt …");
        setTimeout(() => location.reload(), 400);
      } else {
        setPhase("current");
        setLabel("Bereits aktuell");
        reset();
      }
    } catch {
      setPhase("idle");
      setLabel("Aktualisieren");
    }
  }

  function click() {
    if (phase === "checking" || phase === "pulling") return;
    if (DISPATCH_TOKEN) void triggerPull();
    else void checkLatest();
  }

  const spinning = phase === "checking" || phase === "pulling";
  const Icon = phase === "current" ? Check : RefreshCw;

  return (
    <button
      onClick={click}
      disabled={spinning}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-line text-ink-2 transition-colors",
        "hover:border-gold/40 hover:bg-gold/8 hover:text-gold disabled:opacity-60",
        compact ? "size-9 justify-center" : "px-4 py-2 text-[13px] font-medium",
        phase === "current" && "border-positive/40 text-positive",
      )}
      aria-label="Daten aktualisieren"
    >
      <Icon className={cn("size-[15px] shrink-0", spinning && "animate-spin")} strokeWidth={2} />
      {!compact && <span>{label}</span>}
    </button>
  );
}
