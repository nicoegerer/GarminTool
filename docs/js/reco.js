/* ============================================================
   Regelbasierte, erklärbare Trainingsempfehlung.
   Port von backend/app/recommendations.py, angepasst an die
   Signale, die dieses Konto tatsächlich liefert (kein
   HRV-Status / keine Training Readiness auf dem FR945).
   Jede Empfehlung nennt die konkreten Zahlen dahinter.
   ============================================================ */

const HARD_LABELS = new Set(["VO2MAX", "ANAEROBIC_CAPACITY", "LACTATE_THRESHOLD", "TEMPO", "SPRINT", "ANAEROBIC"]);

const SESSION_INFO = {
  rest:      { title: "Ruhetag",                    tone: "critical", icon: "🛌",
               desc: "Heute bewusst auf Belastung verzichten – höchstens ein lockerer Spaziergang. Dein Körper braucht die Pause, um die Anpassung aus den letzten Einheiten umzusetzen." },
  recovery:  { title: "Aktive Erholung",            tone: "serious", icon: "🌿",
               desc: "30–40 Minuten ganz locker (Zone 1–2). Unterhaltung muss jederzeit möglich sein. Alternativ Mobility oder lockeres Technik-Schwimmen." },
  easy:      { title: "Lockere Grundlageneinheit",  tone: "good", icon: "🌤️",
               desc: "45–60 Minuten ruhig in Zone 2. Fokus auf Umfang und saubere Technik statt Tempo – hier wächst die aerobe Basis." },
  long:      { title: "Lange Grundlageneinheit",    tone: "good", icon: "🗺️",
               desc: "75–120 Minuten ruhig in Zone 2. Der lange, ruhige Reiz füllt die niedrig-aerobe Trainingslast auf und baut Ausdauer auf." },
  tempo:     { title: "Tempo- / Schwelleneinheit",  tone: "warn", icon: "🔥",
               desc: "Gutes Ein- und Auslaufen, dazwischen 15–25 Minuten an der Schwelle (Zone 3–4). Kontrolliert hart, nicht maximal." },
  intervals: { title: "Intervalle (VO2max)",        tone: "warn", icon: "⚡",
               desc: "Nach dem Warmfahren/-laufen 5–6 × 3 Minuten hart (Zone 5) mit 2–3 Minuten lockerer Pause. Qualität vor Quantität." },
};

function buildRecommendation() {
  const rationale = [];
  const chips = [];
  const today = DATA.today;

  // ---- Signale einsammeln -------------------------------------------------
  const lt = DATA.load_trend || [];
  const last = lt.length ? lt[lt.length - 1] : null;
  const acwr = last ? last.acwr : null;
  const tsb = last ? last.tsb : null;
  const ctl = last ? last.ctl : null;

  const acts = DATA.acts || [];
  const todayActs = acts.filter((a) => a.date === today);

  let daysSinceHard = null;
  for (const a of acts) {
    const hard = HARD_LABELS.has(a.trainingEffectLabel || "") || (a.aerobicTrainingEffect || 0) >= 3.5 || (a.anaerobicTrainingEffect || 0) >= 2;
    if (hard) {
      daysSinceHard = Math.round((parseDate(today) - parseDate(a.date)) / 86400000);
      break;
    }
  }

  const lastAct = acts[0] || null;
  const lastCategory = lastAct ? effectCategory(lastAct) : null;

  // Schlaf letzte Nacht (nur wenn aktuell)
  const sleep = DATA.sleep || [];
  const lastSleep = sleep.length ? sleep[sleep.length - 1] : null;
  const sleepFresh = lastSleep && daysBetween(lastSleep.date, today) <= 1 ? lastSleep : null;

  // Body Battery heute/gestern
  const bb = DATA.bodyBattery || [];
  const lastBB = bb.length ? bb[bb.length - 1] : null;
  const bbFresh = lastBB && daysBetween(lastBB.date, today) <= 1 ? lastBB : null;

  // RHR-Abweichung vs. 30-Tage-Median
  const rhr = DATA.rhr || [];
  const lastRhr = rhr.length ? rhr[rhr.length - 1] : null;
  const rhrFresh = lastRhr && daysBetween(lastRhr.date, today) <= 2 ? lastRhr : null;
  const rhrBase = median(rhr.slice(-30).map((x) => x.rhr));

  // Garmin-Trainingsstatus + monatliche Load-Balance
  const ts = (DATA.fitness && DATA.fitness.training_status) || {};
  const balanceMap = ts.mostRecentTrainingLoadBalance && ts.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap;
  const balance = balanceMap ? Object.values(balanceMap)[0] : null;
  let statusPhrase = null;
  const tsData = ts.mostRecentTrainingStatus && ts.mostRecentTrainingStatus.latestTrainingStatusData;
  if (tsData) {
    const first = Object.values(tsData)[0];
    if (first) statusPhrase = first.trainingStatusFeedbackPhrase || null;
  }

  // Geplantes Workout aus dem Garmin-Kalender
  const planned = (DATA.calendar || []).find((c) => c.date === today);

  // ---- Chips (Kontextzahlen, immer sichtbar) ------------------------------
  if (acwr != null) chips.push({ label: "Belastungsquote", value: acwr.toFixed(2) });
  if (tsb != null) chips.push({ label: "Form (TSB)", value: (tsb > 0 ? "+" : "") + Math.round(tsb) });
  if (daysSinceHard != null) chips.push({ label: "Letzte harte Einheit", value: daysSinceHard === 0 ? "heute" : `vor ${daysSinceHard} Tg.` });
  if (sleepFresh && sleepFresh.score != null) chips.push({ label: "Schlaf-Score", value: sleepFresh.score });
  if (bbFresh) chips.push({ label: "Body Battery max", value: bbFresh.highest });
  if (rhrFresh) chips.push({ label: "Ruhepuls", value: `${rhrFresh.rhr} bpm` });

  // ---- Regeln (Reihenfolge = Priorität) -----------------------------------
  const overreached = (statusPhrase || "").toUpperCase().includes("OVERREACH");

  // 1. Notbremse
  if ((acwr != null && acwr > 1.5) || overreached) {
    if (acwr != null && acwr > 1.5) rationale.push(`Deine akute Belastung liegt beim ${acwr.toFixed(2)}-Fachen der chronischen Belastung – ab 1,5 steigt das Verletzungsrisiko deutlich.`);
    if (overreached) rationale.push(`Garmin-Trainingsstatus meldet Überlastung („${statusPhrase}“).`);
    return finalize("rest", rationale, chips, todayActs, planned);
  }

  // 2. Erholungssignale
  let recoveryVotes = 0;
  if (acwr != null && acwr > 1.3) { recoveryVotes++; rationale.push(`Belastungsquote ${acwr.toFixed(2)} – oberer Grenzbereich, heute keine harte Einheit.`); }
  if (tsb != null && tsb < -25) { recoveryVotes++; rationale.push(`Form (TSB) bei ${Math.round(tsb)}: Es steckt viel frische Ermüdung im Körper.`); }
  if (sleepFresh && sleepFresh.score != null && sleepFresh.score < 60) { recoveryVotes++; rationale.push(`Schlaf-Score letzte Nacht nur ${sleepFresh.score}/100.`); }
  if (bbFresh && bbFresh.highest != null && bbFresh.highest < 40) { recoveryVotes++; rationale.push(`Body Battery kam heute nur bis ${bbFresh.highest}/100.`); }
  if (rhrFresh && rhrBase && rhrFresh.rhr >= rhrBase + 5) { recoveryVotes++; rationale.push(`Ruhepuls ${rhrFresh.rhr} bpm – ${Math.round(rhrFresh.rhr - rhrBase)} über deinem 30-Tage-Median (${Math.round(rhrBase)} bpm).`); }

  if (recoveryVotes >= 2) return finalize("recovery", rationale, chips, todayActs, planned);
  if (recoveryVotes === 1 && lastCategory === "intervals") {
    rationale.push("Zusätzlich war die letzte Einheit intensiv – heute bewusst regenerativ.");
    return finalize("recovery", rationale, chips, todayActs, planned);
  }

  // 3. Geplantes Workout gewinnt
  if (planned) {
    rationale.push(`Für heute ist im Garmin-Kalender „${planned.title}“ geplant.`);
    return finalize("planned", rationale, chips, todayActs, planned);
  }

  // 4. Load-Balance-Defizite (Monatslast vs. Garmin-Zielbereich)
  let chosen = null;
  if (balance) {
    const candidates = [
      { type: "intervals", have: balance.monthlyLoadAnaerobic, min: balance.monthlyLoadAnaerobicTargetMin, name: "anaerobe" },
      { type: "tempo", have: balance.monthlyLoadAerobicHigh, min: balance.monthlyLoadAerobicHighTargetMin, name: "hoch-aerobe" },
      { type: "long", have: balance.monthlyLoadAerobicLow, min: balance.monthlyLoadAerobicLowTargetMin, name: "niedrig-aerobe" },
    ].filter((c) => c.have != null && c.min != null && c.have < c.min)
      .sort((a, b) => (b.min - b.have) - (a.min - a.have));

    for (const c of candidates) {
      if (c.type !== lastCategory) {
        chosen = c.type;
        rationale.push(`Deine ${c.name} Monatslast (${Math.round(c.have)}) liegt ${Math.round(c.min - c.have)} Punkte unter dem Garmin-Zielbereich.`);
        break;
      }
    }
  }

  // 5. Reiz-Rotation
  if (!chosen) {
    if (lastCategory === "intervals" || lastCategory === "tempo") {
      chosen = "easy";
      rationale.push("Die letzte Einheit war intensiv – heute locker, damit der Reiz wirken kann.");
    } else if (daysSinceHard != null && daysSinceHard >= 4 && (recoveryVotes === 0)) {
      chosen = "tempo";
      rationale.push(`Seit ${daysSinceHard} Tagen keine intensive Einheit – Zeit für einen kontrollierten Reiz.`);
    } else {
      chosen = "easy";
      rationale.push("Keine Auffälligkeiten in Belastung oder Erholung – lockere Grundlageneinheit füllt das Fundament.");
    }
  }

  if (balance && (chosen === "easy" || chosen === "long")) {
    const ok = balance.trainingBalanceFeedbackPhrase === "BALANCED";
    if (ok) rationale.push("Deine Trainingslast-Balance ist laut Garmin aktuell ausgewogen – so bleibt sie es.");
  }

  return finalize(chosen, rationale, chips, todayActs, planned);
}

function effectCategory(act) {
  const label = act.trainingEffectLabel || "";
  if (["VO2MAX", "ANAEROBIC_CAPACITY", "SPRINT", "ANAEROBIC"].includes(label)) return "intervals";
  if (["TEMPO", "LACTATE_THRESHOLD"].includes(label)) return "tempo";
  if (label === "RECOVERY") return "recovery";
  return "easy";
}

function daysBetween(a, b) {
  return Math.abs(Math.round((parseDate(b) - parseDate(a)) / 86400000));
}

/* Sport-Rotation: welcher der drei Tri-Sportarten ist am längsten her? */
function suggestSport() {
  const lastByGroup = {};
  for (const a of DATA.acts || []) {
    if (!lastByGroup[a.group]) lastByGroup[a.group] = a.date;
  }
  const rotation = ["laufen", "rad", "schwimmen"]
    .map((g) => ({ g, last: lastByGroup[g] || "2000-01-01" }))
    .sort((a, b) => a.last.localeCompare(b.last));
  const pick = rotation[0];
  const days = daysBetween(pick.last, DATA.today);
  return { group: pick.g, label: GROUP_META[pick.g].label, icon: GROUP_META[pick.g].icon, days };
}

function finalize(type, rationale, chips, todayActs, planned) {
  let info;
  if (type === "planned") {
    info = { title: planned.title, tone: "good", icon: "📅", desc: "Geplante Einheit aus deinem Garmin-Kalender." };
  } else {
    info = SESSION_INFO[type];
  }

  let sport = null;
  if (["easy", "long", "tempo", "intervals"].includes(type)) {
    sport = suggestSport();
    rationale.push(`Sport-Empfehlung ${sport.label}: davon hattest du am längsten nichts (zuletzt vor ${sport.days} Tagen).`);
  }

  const done = todayActs.length
    ? { count: todayActs.length, names: todayActs.map((a) => a.activityName || TYPE_LABELS[a.typeKey] || a.typeKey).join(", ") }
    : null;

  return { type, ...info, rationale, chips, sport, done };
}
