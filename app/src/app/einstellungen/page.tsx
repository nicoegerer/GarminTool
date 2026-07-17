"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { PROVIDER_LIST, getProvider, loadConfig, saveConfig, type ProviderConfig, type ProviderId } from "@/lib/ai";
import { usePrefs } from "@/lib/prefs";
import { Card, PageHeader, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/format";
import { useTheme } from "@/components/theme";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<ProviderConfig | null>(null);
  const { prefs, update, ready } = usePrefs();
  const { theme, setTheme } = useTheme();

  useEffect(() => setCfg(loadConfig()), []);

  if (!cfg || !ready) return <Skeleton className="mt-6 h-96 w-full rounded-[1.25rem]" />;

  const patch = (p: Partial<ProviderConfig>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    saveConfig(next);
  };

  return (
    <>
      <PageHeader kicker="Einstellungen" title="Konfiguration" />

      {/* ---- KI-Provider ---- */}
      <Card className="mb-4 p-6">
        <h2 className="text-base font-semibold">KI-Modell</h2>
        <p className="mt-1 text-[13px] text-ink-3">Welches Modell den Coach antreibt. Jederzeit umschaltbar.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {PROVIDER_LIST.map((p) => (
            <button
              key={p.id}
              onClick={() => patch({ provider: p.id as ProviderId })}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                cfg.provider === p.id ? "border-gold/50 bg-gold/8" : "border-line-soft hover:border-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                {cfg.provider === p.id && <Check className="size-4 text-gold" strokeWidth={2.4} />}
              </div>
              <p className="mt-1 text-xs leading-snug text-ink-3">{p.privacyNote}</p>
            </button>
          ))}
        </div>

        {cfg.provider === "gemini" ? (
          <div className="mt-5 space-y-4 border-t border-line-soft pt-5">
            <Field
              label="Google API-Key"
              type="password"
              value={cfg.geminiKey}
              onChange={(v) => patch({ geminiKey: v })}
              placeholder="AIza…"
              help={
                <>
                  Kostenloses Kontingent bei{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                    Google AI Studio <ExternalLink className="inline size-3" />
                  </a>
                </>
              }
            />
            <ModelPicker cfg={cfg} onPick={(m) => patch({ geminiModel: m })} current={cfg.geminiModel} />
          </div>
        ) : (
          <div className="mt-5 space-y-4 border-t border-line-soft pt-5">
            <Field label="Ollama-Adresse" value={cfg.ollamaUrl} onChange={(v) => patch({ ollamaUrl: v })} placeholder="http://localhost:11434" />
            <ModelPicker cfg={cfg} onPick={(m) => patch({ ollamaModel: m })} current={cfg.ollamaModel} />
            <p className="rounded-xl border border-line-soft bg-surface-2 p-3.5 text-xs leading-relaxed text-ink-3">
              Ollama läuft nur auf deinem Rechner — auf dem Handy ist der Coach damit nicht erreichbar. Damit diese
              Seite Ollama ansprechen darf, muss die Umgebungsvariable{" "}
              <code className="rounded bg-surface px-1 py-0.5">OLLAMA_ORIGINS</code> die Domain dieser Seite enthalten.
            </p>
          </div>
        )}

        <p className="mt-5 flex items-start gap-2 text-xs text-ink-3">
          <ShieldCheck className="mt-px size-3.5 shrink-0" strokeWidth={1.8} />
          Keys werden ausschließlich lokal in diesem Browser gespeichert und nie ins Repo geschrieben.
        </p>
      </Card>

      {/* ---- Trainingsprofil ---- */}
      <Card className="mb-4 p-6">
        <h2 className="text-base font-semibold">Dein Trainingsprofil</h2>
        <p className="mt-1 text-[13px] text-ink-3">
          Das kann die Uhr nicht wissen — der Coach nutzt es aber für jede Empfehlung.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium">Bevorzugte Sportarten</label>
            <div className="flex flex-wrap gap-1.5">
              {["Laufen", "Rad", "Schwimmen", "Kraft", "Wandern"].map((s) => {
                const on = prefs.preferredSports.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      update({ preferredSports: on ? prefs.preferredSports.filter((x) => x !== s) : [...prefs.preferredSports, s] })
                    }
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                      on ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Zeit pro Woche (h)"
              type="number"
              value={prefs.weeklyHours?.toString() ?? ""}
              onChange={(v) => update({ weeklyHours: v ? Number(v) : null })}
              placeholder="8"
            />
            <Field
              label="Typische Einheit (min)"
              type="number"
              value={prefs.timePerSessionMin?.toString() ?? ""}
              onChange={(v) => update({ timePerSessionMin: v ? Number(v) : null })}
              placeholder="60"
            />
          </div>

          <Area
            label="Ziele"
            value={prefs.goals}
            onChange={(v) => update({ goals: v })}
            placeholder="z.B. Sub-40 auf 10 km bis Oktober, Ironman 70.3 nächstes Jahr unter 5:30"
          />
          <Area
            label="Beschwerden / Verletzungen"
            value={prefs.injuries}
            onChange={(v) => update({ injuries: v })}
            placeholder="z.B. linke Achillessehne zwickt beim Bergablaufen"
            help="Der Coach behandelt das mit Vorrang vor allem anderen."
          />
        </div>
      </Card>

      {/* ---- Design ---- */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">Design</h2>
        <div className="mt-4 flex gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] transition-colors",
                theme === t ? "border-gold/40 bg-gold/10 text-ink" : "border-line text-ink-3 hover:text-ink-2",
              )}
            >
              {t === "light" ? "Hell" : t === "dark" ? "Dunkel" : "System"}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

/* ---------- Felder ---------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  help?: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-gold/50"
      />
      {help && <p className="mt-1.5 text-xs text-ink-3">{help}</p>}
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-3 focus:border-gold/50"
      />
      {help && <p className="mt-1.5 text-xs text-ink-3">{help}</p>}
    </div>
  );
}

/** Asks the provider which models it actually has, instead of hard-coding a list. */
function ModelPicker({ cfg, current, onPick }: { cfg: ProviderConfig; current: string; onPick: (m: string) => void }) {
  const [models, setModels] = useState<string[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function fetchModels() {
    const provider = getProvider(cfg);
    if (!provider.listModels) return;
    setState("loading");
    try {
      setModels(await provider.listModels(cfg));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[13px] font-medium">Modell</label>
        <button onClick={fetchModels} className="flex items-center gap-1.5 text-xs text-ink-3 transition-colors hover:text-gold">
          {state === "loading" && <Loader2 className="size-3 animate-spin" />}
          Verfügbare laden
        </button>
      </div>
      {models?.length ? (
        <select
          value={current}
          onChange={(e) => onPick(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-gold/50"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={current}
          onChange={(e) => onPick(e.target.value)}
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none transition-colors focus:border-gold/50"
        />
      )}
      {state === "error" && <p className="mt-1.5 text-xs text-negative">Modelle konnten nicht geladen werden — Zugang prüfen.</p>}
    </div>
  );
}
