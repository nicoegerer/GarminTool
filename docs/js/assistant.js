/* ============================================================
   ATLAS – persönlicher KI-Trainingsassistent (Jarvis-Stil).
   Spricht mit der Claude-API von Anthropic direkt aus dem
   Browser (eigener API-Key, bleibt im localStorage) und kennt
   alle Dashboard-Daten über einen kompakten Kontext.
   ============================================================ */

const CLAUDE_KEY_STORAGE = "gt_claude_key";
const CLAUDE_MODEL = "claude-opus-4-8";

const atlas = {
  panel: document.getElementById("atlas-panel"),
  fab: document.getElementById("atlas-fab"),
  messages: document.getElementById("atlas-messages"),
  chipsEl: document.getElementById("atlas-chips"),
  form: document.getElementById("atlas-form"),
  input: document.getElementById("atlas-text"),
  status: document.getElementById("atlas-status"),
  orb: document.querySelector(".atlas-orb"),
  history: [],          // {role, content} für die API
  busy: false,
  greeted: false,
};

const ATLAS_CHIPS = [
  "Was trainiere ich heute?",
  "Wie war meine Woche?",
  "Werde ich schneller?",
  "Analysier meine Erholung",
];

/* ---------- UI-Verkabelung ---------- */

atlas.fab.addEventListener("click", () => {
  const open = atlas.panel.classList.toggle("is-open");
  if (open && !atlas.greeted) {
    atlas.greeted = true;
    addMsg("atlas", atlasBriefing());
    renderChips();
  }
  if (open) atlas.input.focus();
});

document.getElementById("atlas-close").addEventListener("click", () => atlas.panel.classList.remove("is-open"));
document.getElementById("atlas-settings").addEventListener("click", openKeyModal);

atlas.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = atlas.input.value.trim();
  if (!text || atlas.busy) return;
  atlas.input.value = "";
  sendToAtlas(text);
});

function renderChips() {
  atlas.chipsEl.innerHTML = ATLAS_CHIPS.map((c) => `<button class="atlas-chip" type="button">${c}</button>`).join("");
  atlas.chipsEl.querySelectorAll(".atlas-chip").forEach((b) =>
    b.addEventListener("click", () => { if (!atlas.busy) sendToAtlas(b.textContent); }));
}

function addMsg(from, text, isError = false) {
  const div = document.createElement("div");
  div.className = `atlas-msg from-${from}${isError ? " is-error" : ""}`;
  div.textContent = text;
  atlas.messages.appendChild(div);
  atlas.messages.scrollTop = atlas.messages.scrollHeight;
  return div;
}

function setBusy(busy, statusText) {
  atlas.busy = busy;
  atlas.status.textContent = statusText || (busy ? "Denkt nach …" : "Bereit");
  atlas.orb.classList.toggle("is-thinking", busy);
  atlas.form.querySelector("button").disabled = busy;
}

/* ---------- Lokale Begrüßung (ohne API-Call) ---------- */

function atlasBriefing() {
  const name = (DATA.profile && DATA.profile.full_name) || "Nico";
  const h = new Date().getHours();
  const gruss = h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
  const reco = buildRecommendation();
  const lt = DATA.load_trend || [];
  const last = lt[lt.length - 1];
  const lines = [`${gruss}, ${name}. Alle Systeme laufen, die Datenlage ist gesichtet.`];
  lines.push(`Meine Empfehlung für heute: ${reco.title}${reco.sport ? ` – am besten ${reco.sport.label}` : ""}.`);
  if (last) lines.push(`Form (TSB): ${last.tsb > 0 ? "+" : ""}${Math.round(last.tsb)} · Belastungsquote: ${last.acwr ?? "–"}.`);
  lines.push("Womit kann ich dienen?");
  return lines.join("\n");
}

/* ---------- Datenkontext für Claude ---------- */

function atlasContext() {
  const p = DATA.profile || {};
  const reco = buildRecommendation();
  const lt = DATA.load_trend || [];
  const last = lt[lt.length - 1] || {};
  const s = DATA.streaks || {};

  const acts = (DATA.acts || []).slice(0, 12).map((a) =>
    `${a.date} ${TYPE_LABELS[a.typeKey] || a.typeKey}: ${a.distance ? fmtKm(a.distance) + ", " : ""}${fmtDur(a.duration, { short: true })}${a.averageHR ? ", Ø" + Math.round(a.averageHR) + "bpm" : ""}${a.activityTrainingLoad ? ", Last " + Math.round(a.activityTrainingLoad) : ""}${a.trainingEffectLabel ? ", " + a.trainingEffectLabel : ""}`);

  const weeks = (DATA.weekly || []).slice(-6).map((w) =>
    `KW ab ${w.start}: ${w.count} Einheiten, ${(w.duration / 3600).toFixed(1)}h, Last ${Math.round(w.load)}`);

  const rp = (DATA.fitness && DATA.fitness.race_predictions) || {};
  const sleep = (DATA.sleep || []).slice(-5).map((x) => `${x.date}: Score ${x.score ?? "–"}, ${fmtDur(x.total_s, { short: true })}`);
  const rhr = (DATA.rhr || []).slice(-5).map((x) => `${x.date}: ${x.rhr}bpm`);
  const vo2 = DATA.vo2max || [];
  const prs = ((DATA.records && DATA.records.personal_records) || [])
    .filter((r) => PR_TYPES[r.type_id] && r.value > 0)
    .map((r) => `${PR_TYPES[r.type_id].label}: ${PR_TYPES[r.type_id].fmt(r.value)}`);

  return [
    `PROFIL: ${p.full_name || "Nico"}, Triathlet aus Wolfratshausen (Laufen/Rad/Schwimmen), Geräte: Forerunner 945, Edge 1050. VO2max ${vo2.length ? vo2[vo2.length - 1].vo2max.toFixed(1) : "?"}.`,
    `HEUTE (${DATA.today}): Empfehlung „${reco.title}${reco.sport ? " · " + reco.sport.label : ""}“. Gründe: ${reco.rationale.join(" ")}${reco.done ? ` Bereits absolviert: ${reco.done.names}.` : ""}`,
    `FORM: CTL ${Math.round(last.ctl ?? 0)}, ATL ${Math.round(last.atl ?? 0)}, TSB ${Math.round(last.tsb ?? 0)}, ACWR ${last.acwr ?? "–"}.`,
    `STREAKS: aktuelle Wochen-Serie ${s.currentWeekStreak}, Rekord ${s.longestWeekStreak}, aktive Tage (28T) ${s.daysActive28}, Volumen 4 Wochen ${(s.vol28 / 3600).toFixed(1)}h (davor ${(s.vol28prev / 3600).toFixed(1)}h).`,
    `LETZTE EINHEITEN:\n${acts.join("\n")}`,
    `WOCHEN:\n${weeks.join("\n")}`,
    `RACE-PROGNOSEN: 5km ${fmtTime(rp.time5K)}, 10km ${fmtTime(rp.time10K)}, HM ${fmtTime(rp.timeHalfMarathon)}, Marathon ${fmtTime(rp.timeMarathon)}.`,
    `SCHLAF (letzte Nächte mit Uhr): ${sleep.join(" · ") || "keine Daten"}.`,
    `RUHEPULS: ${rhr.join(" · ") || "keine Daten"}.`,
    `BESTLEISTUNGEN: ${prs.join(" · ")}.`,
  ].join("\n\n");
}

function atlasSystemPrompt() {
  return `Du bist ATLAS, der persönliche KI-Trainingsassistent von Nico – im Stil von Jarvis aus Iron Man: souverän, loyal, blitzgescheit, mit trockenem britischem Humor und einer Prise Understatement. Du duzt Nico, sprichst Deutsch und redest ihn gelegentlich mit "Sir" an (augenzwinkernd).

Deine Aufgabe: Nicos Garmin-Trainingsdaten interpretieren, Fragen beantworten, Trainingsempfehlungen begründen und ihn motivieren – wie ein Cheftrainer mit Vollzugriff auf die Telemetrie.

Regeln:
- Antworte kurz und pointiert (meist 2-6 Sätze), außer Nico bittet um Details.
- Stütze jede Aussage auf die Daten unten. Wenn etwas nicht in den Daten steht, sag das ehrlich.
- Kein Markdown-Overkill: normale Sätze, höchstens mal ein Spiegelstrich.
- Bei Gesundheitsthemen: du bist kein Arzt, bei echten Beschwerden Profi aufsuchen.
- Heute ist ${new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, Datenstand ${DATA.manifest?.generated_at ? new Date(DATA.manifest.generated_at).toLocaleString("de-DE") : "unbekannt"}.

=== NICOS DATEN ===
${atlasContext()}`;
}

/* ---------- Claude-API (Streaming) ---------- */

async function sendToAtlas(text) {
  const key = localStorage.getItem(CLAUDE_KEY_STORAGE);
  if (!key) { openKeyModal(); return; }

  addMsg("user", text);
  atlas.history.push({ role: "user", content: text });
  // Verlauf begrenzen (Kontext bleibt über den Systemprompt erhalten)
  if (atlas.history.length > 16) atlas.history = atlas.history.slice(-16);

  setBusy(true);
  const msgEl = addMsg("atlas", "…");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        stream: true,
        system: atlasSystemPrompt(),
        messages: atlas.history,
      }),
    });

    if (res.status === 401) {
      localStorage.removeItem(CLAUDE_KEY_STORAGE);
      msgEl.remove();
      atlas.history.pop();
      setBusy(false);
      openKeyModal();
      return;
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new Error(errBody?.error?.message || `API-Fehler ${res.status}`);
    }

    // SSE-Stream lesen, text_delta einsammeln
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", full = "", stopReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          full += ev.delta.text;
          msgEl.textContent = full;
          atlas.messages.scrollTop = atlas.messages.scrollHeight;
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stopReason = ev.delta.stop_reason;
        } else if (ev.type === "error") {
          throw new Error(ev.error?.message || "Stream-Fehler");
        }
      }
    }

    if (stopReason === "refusal" || !full.trim()) {
      msgEl.textContent = full.trim() || "Das kann ich leider nicht beantworten, Sir.";
    }
    atlas.history.push({ role: "assistant", content: full || "…" });
    setBusy(false);
  } catch (err) {
    console.error("ATLAS-Fehler:", err);
    msgEl.remove();
    atlas.history.pop();
    addMsg("atlas", `Verbindungsproblem mit meinem Sprachzentrum: ${err.message}`, true);
    setBusy(false, "Fehler");
    setTimeout(() => { atlas.status.textContent = "Bereit"; }, 5000);
  }
}

/* ---------- API-Key-Modal ---------- */

function openKeyModal() {
  const backdrop = document.getElementById("modal-backdrop");
  backdrop.classList.add("is-open");
  document.getElementById("modal-key").hidden = false;
  document.getElementById("modal-refresh").hidden = true;
  document.getElementById("claude-key-input").focus();
}

document.getElementById("modal-key-cancel").addEventListener("click", () => {
  document.getElementById("modal-backdrop").classList.remove("is-open");
});
document.getElementById("modal-key-save").addEventListener("click", () => {
  const key = document.getElementById("claude-key-input").value.trim();
  if (!key) return;
  localStorage.setItem(CLAUDE_KEY_STORAGE, key);
  document.getElementById("claude-key-input").value = "";
  document.getElementById("modal-backdrop").classList.remove("is-open");
  if (!atlas.panel.classList.contains("is-open")) atlas.fab.click();
  atlas.status.textContent = "Verbunden";
  setTimeout(() => { atlas.status.textContent = "Bereit"; }, 3000);
});
