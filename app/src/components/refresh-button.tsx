"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/format";
import { Modal } from "./ui/modal";
import { dataUrl } from "@/lib/paths";

const GH_REPO = "nicoegerer/GarminTool";
const GH_WORKFLOW = "refresh-data.yml";
const TOKEN_KEY = "gt_gh_token";

type Phase = "idle" | "starting" | "waiting" | "done" | "error";

/**
 * Triggers the GitHub Actions workflow that pulls fresh data from the watch,
 * then polls manifest.json until the new build is live and reloads.
 */
export function RefreshButton({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("Aktualisieren");
  const [askToken, setAskToken] = useState(false);
  const [token, setToken] = useState("");

  const running = phase === "starting" || phase === "waiting";

  async function start(tok: string) {
    setPhase("starting");
    setLabel("Workflow startet …");

    let before: string | undefined;
    try {
      before = (await (await fetch(dataUrl("manifest.json"), { cache: "no-store" })).json())?.generated_at;
    } catch {
      /* first run — no baseline to compare against */
    }

    try {
      const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tok}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        setPhase("idle");
        setLabel("Aktualisieren");
        setAskToken(true);
        return;
      }
      if (!res.ok && res.status !== 204) throw new Error(`GitHub: ${res.status}`);

      setPhase("waiting");
      const fresh = await waitForNewData(before, (mins) => setLabel(`Uhr wird abgefragt … (${mins} min)`));
      if (fresh) {
        setPhase("done");
        setLabel("Fertig – lädt neu");
        setTimeout(() => location.reload(), 700);
      } else {
        setPhase("error");
        setLabel("Dauert noch – später neu laden");
        setTimeout(() => (setPhase("idle"), setLabel("Aktualisieren")), 6000);
      }
    } catch {
      setPhase("error");
      setLabel("Fehler – nochmal?");
      setTimeout(() => (setPhase("idle"), setLabel("Aktualisieren")), 5000);
    }
  }

  function click() {
    if (running) return;
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) void start(stored);
    else setAskToken(true);
  }

  return (
    <>
      <button
        onClick={click}
        disabled={running}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-line text-ink-2 transition-colors",
          "hover:border-gold/40 hover:bg-gold/8 hover:text-gold disabled:opacity-60",
          compact ? "size-9 justify-center" : "px-4 py-2 text-[13px] font-medium",
          phase === "error" && "border-negative/40 text-negative",
        )}
        aria-label="Daten von der Uhr aktualisieren"
      >
        <RefreshCw className={cn("size-[15px] shrink-0", running && "animate-spin")} strokeWidth={2} />
        {!compact && <span>{label}</span>}
      </button>

      <Modal
        open={askToken}
        onClose={() => setAskToken(false)}
        title="Daten von der Uhr holen"
        primaryLabel="Speichern & starten"
        onPrimary={() => {
          const t = token.trim();
          if (!t) return;
          localStorage.setItem(TOKEN_KEY, t);
          setToken("");
          setAskToken(false);
          void start(t);
        }}
      >
        <p>
          Der Button startet den GitHub-Workflow, der frische Daten aus Garmin Connect zieht und die Seite neu
          veröffentlicht. Dauert 2–3 Minuten.
        </p>
        <p>
          Dafür braucht es einmalig einen GitHub-Token (Fine-grained, nur Repo <code>GarminTool</code>, Berechtigung
          „Actions: Read and write“).{" "}
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
            Token erstellen ↗
          </a>
        </p>
        <p className="text-ink-3">Der Token bleibt in diesem Browser und geht nur an api.github.com.</p>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="github_pat_…"
          autoFocus
        />
      </Modal>
    </>
  );
}

/** Resolves once manifest.generated_at differs from `before`, or after ~8 min. */
async function waitForNewData(before: string | undefined, onTick: (mins: number) => void): Promise<boolean> {
  const start = Date.now();
  const timeout = 8 * 60 * 1000;
  while (Date.now() - start < timeout) {
    await new Promise((r) => setTimeout(r, 15000));
    onTick(Math.round((Date.now() - start) / 60000));
    try {
      const res = await fetch(`${dataUrl("manifest.json")}?ts=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const m = (await res.json()) as { generated_at?: string };
        if (m.generated_at && m.generated_at !== before) return true;
      }
    } catch {
      /* deploy window — keep polling */
    }
  }
  return false;
}
