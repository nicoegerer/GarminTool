"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, Send, Settings2, Sparkles } from "lucide-react";
import { useData, useGarmin } from "@/lib/data";
import { usePrefs } from "@/lib/prefs";
import { getProvider, loadConfig, AiError, type ProviderConfig } from "@/lib/ai";
import { COACH_SYSTEM, DEFAULT_PARAMS, chatPrompt, coachPrompt, type CoachParams, type Focus, type Intensity, type Venue } from "@/lib/ai/coach";
import { Card, Empty, PageHeader, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

export default function CoachPage() {
  const { loading, error } = useData();
  if (loading) return <CoachSkeleton />;
  if (error) return <PageHeader title="Keine Daten" sub={error} />;
  return <Coach />;
}

/* ---------- Parameter-Auswahl ---------- */

const SPORTS = [
  { id: "auto", label: "Egal" },
  { id: "run", label: "Laufen" },
  { id: "ride", label: "Rad" },
  { id: "swim", label: "Schwimmen" },
  { id: "gym", label: "Kraft" },
];
const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: "auto", label: "Egal" },
  { id: "recovery", label: "Regeneration" },
  { id: "easy", label: "Locker" },
  { id: "moderate", label: "Moderat" },
  { id: "hard", label: "Hart" },
];
const DURATIONS = [
  { id: null, label: "Egal" },
  { id: 30, label: "30 min" },
  { id: 45, label: "45 min" },
  { id: 60, label: "60 min" },
  { id: 90, label: "90 min" },
  { id: 120, label: "2 h" },
];
const FOCI: { id: Focus; label: string }[] = [
  { id: "auto", label: "Egal" },
  { id: "endurance", label: "Ausdauer" },
  { id: "speed", label: "Schnelligkeit" },
  { id: "strength", label: "Kraft" },
  { id: "recovery", label: "Regeneration" },
  { id: "technique", label: "Technik" },
];
const VENUES: { id: Venue; label: string }[] = [
  { id: "auto", label: "Egal" },
  { id: "outdoor", label: "Draußen" },
  { id: "indoor", label: "Drinnen" },
];

function Coach() {
  const data = useGarmin();
  const { prefs, ready } = usePrefs();
  const [cfg, setCfg] = useState<ProviderConfig | null>(null);
  const [params, setParams] = useState<CoachParams>(DEFAULT_PARAMS);
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => setCfg(loadConfig()), []);

  const generate = useCallback(
    async (p: CoachParams) => {
      if (!cfg) return;
      const provider = getProvider(cfg);
      if (!provider.isConfigured(cfg)) {
        setErr("no-config");
        return;
      }
      abort.current?.abort();
      abort.current = new AbortController();
      setBusy(true);
      setErr(null);
      setPlan("");
      try {
        for await (const chunk of provider.stream(
          {
            system: COACH_SYSTEM,
            messages: [{ role: "user", content: coachPrompt(p, data, prefs) }],
            maxTokens: 2048,
            signal: abort.current.signal,
          },
          cfg,
        )) {
          setPlan((t) => t + chunk);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setErr(e instanceof AiError ? e.message : "Der Coach ist gerade nicht erreichbar.");
        }
      } finally {
        setBusy(false);
      }
    },
    [cfg, data, prefs],
  );

  if (!cfg || !ready) return <CoachSkeleton />;

  const provider = getProvider(cfg);
  const configured = provider.isConfigured(cfg);

  return (
    <>
      <PageHeader kicker="KI-Coach" title="Was steht heute an?" sub="Wähle, was du vorhast — oder lass den Coach entscheiden." />

      {!configured && <NotConfigured providerLabel={provider.label} />}

      <Card className="mb-5 p-5">
        <div className="space-y-4">
          <Row label="Sportart">
            {SPORTS.map((s) => (
              <Chip key={s.id} active={params.sport === s.id} onClick={() => setParams({ ...params, sport: s.id })}>
                {s.label}
              </Chip>
            ))}
          </Row>
          <Row label="Intensität">
            {INTENSITIES.map((s) => (
              <Chip key={s.id} active={params.intensity === s.id} onClick={() => setParams({ ...params, intensity: s.id })}>
                {s.label}
              </Chip>
            ))}
          </Row>
          <Row label="Dauer">
            {DURATIONS.map((s) => (
              <Chip key={String(s.id)} active={params.durationMin === s.id} onClick={() => setParams({ ...params, durationMin: s.id })}>
                {s.label}
              </Chip>
            ))}
          </Row>
          <Row label="Fokus">
            {FOCI.map((s) => (
              <Chip key={s.id} active={params.focus === s.id} onClick={() => setParams({ ...params, focus: s.id })}>
                {s.label}
              </Chip>
            ))}
          </Row>
          <Row label="Ort">
            {VENUES.map((s) => (
              <Chip key={s.id} active={params.venue === s.id} onClick={() => setParams({ ...params, venue: s.id })}>
                {s.label}
              </Chip>
            ))}
          </Row>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <button
            onClick={() => void generate(params)}
            disabled={busy || !configured}
            className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50 dark:text-black"
          >
            <Sparkles className={cn("size-4", busy && "animate-pulse")} strokeWidth={2} />
            {busy ? "Coach denkt nach …" : plan ? "Neu berechnen" : "Vorschlag holen"}
          </button>
          {plan && !busy && (
            <button
              onClick={() => void generate({ ...params, nonce: Date.now() })}
              className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink"
            >
              <RefreshCw className="size-4" strokeWidth={2} />
              Neu generieren
            </button>
          )}
          <span className="ml-auto text-xs text-ink-3">{provider.label}</span>
        </div>
      </Card>

      <AnimatePresence mode="wait">
        {err === "no-config" ? null : err ? (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-negative/30 p-5">
              <p className="text-sm text-negative">{err}</p>
            </Card>
          </motion.div>
        ) : plan ? (
          <motion.div key="plan" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card className="p-6 lg:p-7">
              <Prose text={plan} />
              {busy && <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse bg-gold align-middle" />}
            </Card>
          </motion.div>
        ) : busy ? (
          <Card className="space-y-3 p-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </Card>
        ) : (
          <Empty>Wähle deine Vorgaben und hol dir einen Vorschlag.</Empty>
        )}
      </AnimatePresence>

      <ChatBox cfg={cfg} />
    </>
  );
}

/* ---------- Freier Chat ---------- */

function ChatBox({ cfg }: { cfg: ProviderConfig }) {
  const data = useGarmin();
  const { prefs } = usePrefs();
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const provider = getProvider(cfg);
      let acc = "";
      for await (const chunk of provider.stream(
        { system: chatPrompt(data, prefs), messages: next.slice(-12), maxTokens: 1024 },
        cfg,
      )) {
        acc += chunk;
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: e instanceof AiError ? e.message : "Verbindungsfehler." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-[-0.01em]">Frag nach</h2>
      {msgs.length > 0 && (
        <div className="mb-3 space-y-3">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[88%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed",
                m.role === "user"
                  ? "ml-auto rounded-br-md bg-gold/12 text-ink"
                  : "rounded-bl-md border border-line-soft bg-surface text-ink-2",
              )}
            >
              {m.role === "assistant" ? <Prose text={m.content} small /> : m.content}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      <form onSubmit={send} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Warum keine harte Einheit heute?"
          className="flex-1 rounded-full border border-line bg-surface px-5 py-3 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-gold/50"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-gold text-white transition-[filter] hover:brightness-110 disabled:opacity-40 dark:text-black"
          aria-label="Senden"
        >
          <Send className="size-4" strokeWidth={2} />
        </button>
      </form>
    </section>
  );
}

/* ---------- Bausteine ---------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-ink-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-full px-3.5 py-1.5 text-[13px] transition-colors",
        active ? "text-ink" : "text-ink-3 hover:text-ink-2",
      )}
    >
      {active && (
        <motion.span layoutId={`chip-${children}`} className="absolute inset-0 rounded-full border border-gold/40 bg-gold/10" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

/** Renders the model's plain text: paragraphs, and **bold** where it uses it. */
function Prose({ text, small = false }: { text: string; small?: boolean }) {
  return (
    <div className={cn("space-y-3 leading-relaxed", small ? "text-[13.5px]" : "text-[15px] text-ink-2")}>
      {text.split(/\n\n+/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={j} className="font-semibold text-ink">
                {part.slice(2, -2)}
              </strong>
            ) : (
              part
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function NotConfigured({ providerLabel }: { providerLabel: string }) {
  return (
    <Card className="mb-5 border-gold/25 bg-gold/5 p-5">
      <div className="flex items-start gap-3">
        <Settings2 className="mt-0.5 size-5 shrink-0 text-gold" strokeWidth={1.9} />
        <div className="text-sm">
          <p className="font-medium text-ink">{providerLabel} ist noch nicht eingerichtet.</p>
          <p className="mt-1 text-ink-2">
            Hinterlege einmalig deinen Zugang in den{" "}
            <Link href="/einstellungen" className="text-gold underline-offset-2 hover:underline">
              Einstellungen
            </Link>
            . Er bleibt in diesem Browser.
          </p>
        </div>
      </div>
    </Card>
  );
}

function CoachSkeleton() {
  return (
    <div className="space-y-4 pt-6">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-64 w-full rounded-[1.25rem]" />
    </div>
  );
}
