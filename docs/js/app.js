/* ============================================================
   App-Orchestrierung: alle Sektionen rendern
   ============================================================ */

let rangeDays = 180;

document.addEventListener("DOMContentLoaded", async () => {
  await loadAll();

  if (!DATA.acts || !DATA.acts.length) {
    document.getElementById("loading").innerHTML =
      "<p>Keine Daten gefunden. Bitte zuerst <code>uv run scripts/export_data.py</code> ausführen<br>und die Seite über einen lokalen Server öffnen (nicht per file://).</p>";
    return;
  }

  renderTopbar();
  renderToday();
  renderStreaks();
  renderHeatmap();
  renderActivities();
  setupFilter();
  renderTrends();
  renderRecords();
  renderBadges();
  renderFooter();

  document.getElementById("loading").classList.add("done");
});

/* ---------- Topbar & Kopf ---------- */

function renderTopbar() {
  const meta = document.getElementById("topbar-meta");
  const gen = DATA.manifest && DATA.manifest.generated_at;
  const name = (DATA.profile && DATA.profile.full_name) || "";
  const primary = ((DATA.profile && DATA.profile.devices) || []).find((d) => d.primary);

  document.getElementById("brand-sub").textContent = name ? `${name} · Trainings-Dashboard` : "Trainings-Dashboard";
  const chips = [];
  if (primary) chips.push(`<span class="meta-chip">⌚ ${primary.name}</span>`);
  if (gen) chips.push(`<span class="meta-chip">Stand: ${fmtDateLong(gen.slice(0, 10))}</span>`);
  meta.innerHTML = chips.join("");

  const t = parseDate(DATA.today);
  document.getElementById("today-title").textContent =
    t.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

/* ---------- Heute: Empfehlung + KPIs ---------- */

function renderToday() {
  const reco = buildRecommendation();

  const badge = document.getElementById("reco-badge");
  badge.textContent = { rest: "Erholung nötig", recovery: "Locker bleiben", easy: "Grünes Licht", long: "Grünes Licht", tempo: "Bereit für Intensität", intervals: "Bereit für Intensität", planned: "Geplant" }[reco.type] || "";
  badge.className = `reco-badge tone-${reco.tone}`;

  const sportPrefix = reco.sport ? `${reco.sport.icon} ` : `${reco.icon} `;
  document.getElementById("reco-title").textContent =
    sportPrefix + (reco.sport && reco.type !== "planned" ? `${reco.title} · ${reco.sport.label}` : reco.title);
  document.getElementById("reco-desc").textContent = reco.desc;

  const metaEl = document.getElementById("reco-meta");
  metaEl.innerHTML = reco.chips.map((c) => `<span class="reco-chip">${c.label}: <strong>${c.value}</strong></span>`).join("");
  if (reco.done) {
    metaEl.innerHTML = `<span class="reco-chip">✅ Heute bereits absolviert: <strong>${reco.done.names}</strong></span>` + metaEl.innerHTML;
  }

  document.getElementById("reco-rationale").innerHTML = reco.rationale.map((r) => `<li>${r}</li>`).join("");

  renderKpis();
}

function sparkline(values, color = "#717d8d", w = 72, h = 26) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return "";
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = values.map((val, i) => {
    if (val == null) return null;
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const y = h - 3 - ((val - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean);
  return `<svg class="kpi-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
    <polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function deltaHTML(delta, { goodUp = true, fmt = (v) => Math.abs(v).toFixed(0), suffix = "" } = {}) {
  if (delta == null || !isFinite(delta)) return "";
  if (Math.abs(delta) < 1e-9) return `<span class="kpi-delta flat">±0${suffix}</span>`;
  const up = delta > 0;
  const good = up === goodUp;
  const arrow = up ? "▲" : "▼";
  return `<span class="kpi-delta ${good ? "up" : "down"}">${arrow} ${fmt(delta)}${suffix}</span>`;
}

function renderKpis() {
  const grid = document.getElementById("kpi-grid");
  const tiles = [];
  const lt = DATA.load_trend || [];
  const last = lt[lt.length - 1];

  if (last) {
    const tsbTone = last.tsb >= 5 ? "Frisch" : last.tsb >= -10 ? "Neutral" : last.tsb >= -25 ? "Belastet" : "Sehr belastet";
    tiles.push({
      label: "Form (TSB)",
      value: `${last.tsb > 0 ? "+" : ""}${Math.round(last.tsb)}`,
      foot: `<span class="kpi-delta flat">${tsbTone}</span>`,
      spark: sparkline(lt.slice(-42).map((x) => x.tsb)),
    });
    const ctl28 = lt[lt.length - 29];
    tiles.push({
      label: "Fitness (CTL)",
      value: Math.round(last.ctl),
      foot: deltaHTML(ctl28 ? last.ctl - ctl28.ctl : null, { goodUp: true, suffix: " vs. 4 Wo." }),
      spark: sparkline(lt.slice(-90).map((x) => x.ctl), "#3987e5"),
    });
    if (last.acwr != null) {
      const tone = last.acwr > 1.5 ? "down" : last.acwr > 1.3 ? "flat" : "up";
      tiles.push({
        label: "Belastungsquote (7T/42T)",
        value: last.acwr.toFixed(2),
        foot: `<span class="kpi-delta ${tone}">${last.acwr > 1.5 ? "zu hoch" : last.acwr > 1.3 ? "Grenzbereich" : "im grünen Bereich"}</span>`,
        spark: sparkline(lt.slice(-42).map((x) => x.acwr)),
      });
    }
  }

  const vo2 = DATA.vo2max || [];
  if (vo2.length) {
    const lastV = vo2[vo2.length - 1];
    const prevV = vo2.length > 1 ? vo2[vo2.length - 2] : null;
    tiles.push({
      label: "VO₂max (Laufen)",
      value: lastV.vo2max.toFixed(1),
      foot: deltaHTML(prevV ? lastV.vo2max - prevV.vo2max : null, { goodUp: true, fmt: (v) => Math.abs(v).toFixed(1) }),
      spark: sparkline(vo2.slice(-20).map((x) => x.vo2max), "#3987e5"),
    });
  }

  const rhr = DATA.rhr || [];
  if (rhr.length) {
    const lastR = rhr[rhr.length - 1];
    const base = median(rhr.slice(-30).map((x) => x.rhr));
    tiles.push({
      label: `Ruhepuls (${fmtDateShort(lastR.date)})`,
      value: `${lastR.rhr}<span class="unit">bpm</span>`,
      foot: deltaHTML(base ? lastR.rhr - base : null, { goodUp: false, suffix: " vs. Median" }),
      spark: sparkline(rhr.slice(-30).map((x) => x.rhr), "#e66767"),
    });
  }

  const sleep = DATA.sleep || [];
  if (sleep.length) {
    const lastS = sleep[sleep.length - 1];
    tiles.push({
      label: `Schlaf (${fmtDateShort(lastS.date)})`,
      value: lastS.score != null ? `${lastS.score}<span class="unit">/100</span>` : fmtDur(lastS.total_s, { short: true }),
      foot: `<span class="kpi-delta flat">${fmtDur(lastS.total_s, { short: true })}</span>`,
      spark: sparkline(sleep.slice(-14).map((x) => x.score), "#9085e9"),
    });
  }

  const bb = DATA.bodyBattery || [];
  if (bb.length) {
    const lastB = bb[bb.length - 1];
    tiles.push({
      label: `Body Battery (${fmtDateShort(lastB.date)})`,
      value: `${lastB.highest}<span class="unit">max</span>`,
      foot: `<span class="kpi-delta flat">Tief: ${lastB.lowest ?? "–"}</span>`,
      spark: sparkline(bb.slice(-14).map((x) => x.highest), "#199e70"),
    });
  }

  const s = DATA.streaks;
  tiles.push({
    label: "Diese Woche",
    value: `${s.thisWeekCount}<span class="unit">Einheiten</span>`,
    foot: `<span class="kpi-delta flat">${fmtDur(s.thisWeekDuration, { short: true })}</span>`,
    spark: sparkline(DATA.weekly.slice(-12).map((w) => w.count), "#3987e5"),
  });

  grid.innerHTML = tiles.map((t) => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}</div>
      <div class="kpi-foot">${t.foot || ""}${t.spark || ""}</div>
    </div>`).join("");
}

/* ---------- Streaks ---------- */

function renderStreaks() {
  const s = DATA.streaks;
  const delta = s.vol28prev ? ((s.vol28 - s.vol28prev) / s.vol28prev) * 100 : null;
  const tiles = [
    { icon: "🔥", num: s.currentWeekStreak, unit: "Wochen", label: "Aktuelle Trainings-Serie (Wochen in Folge)" },
    { icon: "🏆", num: s.longestWeekStreak, unit: "Wochen", label: "Längste Serie aller Zeiten" },
    { icon: "📆", num: s.daysActive28, unit: "/ 28 Tagen", label: "Aktive Tage im letzten Monat" },
    {
      icon: "⏱️", num: (s.vol28 / 3600).toFixed(1), unit: "h",
      label: `Volumen letzte 4 Wochen ${delta != null ? `(${delta > 0 ? "+" : ""}${Math.round(delta)} % vs. davor)` : ""}`,
    },
  ];
  document.getElementById("streak-grid").innerHTML = tiles.map((t) => `
    <div class="streak-tile">
      <div class="streak-icon">${t.icon}</div>
      <div>
        <div class="streak-num">${t.num} <span class="unit">${t.unit}</span></div>
        <div class="streak-label">${t.label}</div>
      </div>
    </div>`).join("");
}

/* ---------- Heatmap-Kalender ---------- */

function renderHeatmap() {
  const byDay = new Map();
  for (const a of DATA.acts) {
    byDay.set(a.date, (byDay.get(a.date) || 0) + (a.duration || 0));
  }

  const today = parseDate(DATA.today);
  const end = today;
  let start = addDays(end, -364);
  start = weekStart(start);

  const monthNames = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  let html = "";
  let cursor = new Date(start);
  let lastMonth = -1;

  while (cursor <= end) {
    let cells = "";
    const colMonth = cursor.getMonth();
    const monthLabel = colMonth !== lastMonth && cursor.getDate() <= 7 ? monthNames[colMonth] : "";
    if (monthLabel) lastMonth = colMonth;

    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      if (day > end) { cells += `<span class="hm-cell" style="visibility:hidden"></span>`; continue; }
      const iso = isoDate(day);
      const dur = byDay.get(iso) || 0;
      const mins = dur / 60;
      const lvl = mins === 0 ? 0 : mins < 30 ? 1 : mins < 60 ? 2 : mins < 120 ? 3 : 4;
      const tip = `${fmtDateLong(iso)}: ${mins ? fmtDur(dur, { short: true }) + " Training" : "kein Training"}`;
      cells += `<span class="hm-cell" data-lvl="${lvl}" title="${tip}"></span>`;
    }
    html += `<div class="hm-col" data-month="${monthLabel}">${cells}</div>`;
    cursor = addDays(cursor, 7);
  }

  document.getElementById("heatmap").innerHTML = html;
  document.getElementById("heatmap-legend").innerHTML =
    `<span>weniger</span>` +
    [0, 1, 2, 3, 4].map((l) => `<span class="hm-cell" data-lvl="${l}"></span>`).join("") +
    `<span>mehr</span><span style="margin-left:14px">Stufen: 0 · &lt;30 min · &lt;1 h · &lt;2 h · ≥2 h</span>`;
}

/* ---------- Letzte Einheiten ---------- */

let shownActivities = 8;

function activityMetrics(a) {
  const m = [];
  if (a.distance) m.push({ v: fmtKm(a.distance), l: "Distanz" });
  m.push({ v: fmtDur(a.duration, { short: true }), l: "Dauer" });

  if (a.group === "laufen" && a.distance > 500) m.push({ v: fmtPace(a.duration / (a.distance / 1000)), l: "Pace" });
  else if (a.group === "rad" && a.avgPower) m.push({ v: `${Math.round(a.avgPower)} W`, l: "Ø Leistung" });
  else if (a.group === "rad" && a.distance) m.push({ v: `${((a.distance / 1000) / (a.duration / 3600)).toFixed(1)} km/h`, l: "Ø Tempo" });
  else if (a.group === "schwimmen" && a.distance) m.push({ v: fmtPace100(a.duration / (a.distance / 100)), l: "Pace" });
  else if (a.totalSets) m.push({ v: `${a.activeSets || a.totalSets} Sätze`, l: `${a.totalReps || "?"} Wdh.` });

  if (a.averageHR) m.push({ v: `${Math.round(a.averageHR)} bpm`, l: "Ø Puls" });
  if (a.activityTrainingLoad) m.push({ v: Math.round(a.activityTrainingLoad), l: "Last" });
  return m.slice(0, 4);
}

const TE_LABELS = {
  RECOVERY: "Erholung", AEROBIC_BASE: "Aerobe Basis", TEMPO: "Tempo", LACTATE_THRESHOLD: "Schwelle",
  VO2MAX: "VO2max", ANAEROBIC_CAPACITY: "Anaerob", SPRINT: "Sprint", UNKNOWN: "", NO_BENEFIT: "Kein Effekt",
};

function renderActivities() {
  const list = document.getElementById("activity-list");
  const acts = DATA.acts.slice(0, shownActivities);

  list.innerHTML = acts.map((a) => {
    const g = GROUP_META[a.group];
    const metrics = activityMetrics(a);
    const te = TE_LABELS[a.trainingEffectLabel] || "";
    const name = a.activityName || TYPE_LABELS[a.typeKey] || a.typeKey;
    const isRace = a.eventType === "race" || a.typeKey === "multi_sport";
    return `
    <div class="act-row">
      <div class="act-icon" style="border-left-color:${g.color}">${a.typeKey === "multi_sport" ? "🏆" : g.icon}</div>
      <div>
        <div class="act-name">${isRace ? "⭐ " : ""}${name}</div>
        <div class="act-date">${fmtDateLong(a.date)} · ${TYPE_LABELS[a.typeKey] || a.typeKey}</div>
      </div>
      ${metrics.map((m) => `<div class="act-metric"><b>${m.v}</b><span>${m.l}</span></div>`).join("")}
      ${"<div class='act-metric'></div>".repeat(Math.max(0, 4 - metrics.length))}
      <div class="act-te">${te || "–"}</div>
    </div>`;
  }).join("");

  const btn = document.getElementById("more-activities");
  btn.style.display = DATA.acts.length > shownActivities ? "" : "none";
  btn.onclick = () => { shownActivities += 12; renderActivities(); };
}

/* ---------- Filter ---------- */

function setupFilter() {
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      rangeDays = parseInt(chip.dataset.days, 10);
      renderTrends();
    });
  });
}

function inRange(dateStr) {
  if (rangeDays >= 9999) return true;
  return daysBetween(dateStr, DATA.today) <= rangeDays;
}

/* ---------- Trends rendern (Filter-abhängig) ---------- */

function renderTrends() {
  renderLoadChart();
  renderWeeklyVolume();
  renderVo2maxChart();
  renderLoadBalance();
  renderRaceSection();
  renderTempoCharts();
  renderHealthCharts();
  renderStrengthChart();
}

function renderLoadChart() {
  const data = (DATA.load_trend || []).filter((x) => inRange(x.date));
  if (data.length < 7) return emptyCard("card-load", "Trainingslast & Form");

  const canvas = chartCard("card-load", {
    title: "Trainingslast & Form",
    sub: "CTL = Fitness (42-Tage-Schnitt) · ATL = Ermüdung (7 Tage) · TSB = Form (CTL−ATL)",
    legend: legendHTML([
      { label: "Fitness (CTL)", color: "#3987e5" },
      { label: "Ermüdung (ATL)", color: "#199e70" },
      { label: "Form (TSB)", color: "#c98500" },
    ]),
  });

  makeChart(canvas, {
    type: "line",
    data: {
      labels: data.map((x) => fmtDateShort(x.date)),
      datasets: [
        lineDataset({ label: "Fitness (CTL)", data: data.map((x) => x.ctl), color: "#3987e5", fill: true }),
        lineDataset({ label: "Ermüdung (ATL)", data: data.map((x) => x.atl), color: "#199e70" }),
        lineDataset({ label: "Form (TSB)", data: data.map((x) => x.tsb), color: "#c98500" }),
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: hoverLine,
      scales: baseScales({ yTitle: "Trainingslast" }),
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.y)}` } } },
    },
  });

  attachTable("card-load", ["Datum", "Tageslast", "CTL", "ATL", "TSB", "Quote"],
    [...data].reverse().slice(0, 120).map((x) => [fmtDateShort(x.date), x.load, x.ctl, x.atl, x.tsb, x.acwr ?? "–"]));
}

function renderWeeklyVolume() {
  const weeks = (DATA.weekly || []).filter((w) => inRange(w.start));
  if (!weeks.length) return emptyCard("card-weekly-volume", "Wochenvolumen");

  const groups = GROUP_ORDER.filter((g) => weeks.some((w) => w.byGroup[g]));
  const canvas = chartCard("card-weekly-volume", {
    title: "Wochenvolumen nach Sportart",
    sub: "Stunden pro Kalenderwoche",
    legend: legendHTML(groups.map((g) => ({ label: GROUP_META[g].label, color: GROUP_META[g].color }))),
  });

  makeChart(canvas, {
    type: "bar",
    data: {
      labels: weeks.map((w) => fmtDateShort(w.start)),
      datasets: groups.map((g) => barDataset({
        label: GROUP_META[g].label,
        data: weeks.map((w) => (w.byGroup[g] ? w.byGroup[g].duration / 3600 : 0)),
        color: GROUP_META[g].color,
      })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: hoverLine,
      scales: baseScales({ stacked: true, yTitle: "Stunden", fmt: (v) => v + " h" }),
      plugins: { tooltip: { callbacks: {
        label: (c) => c.parsed.y ? ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} h` : null,
        footer: (items) => "Gesamt: " + items.reduce((s, i) => s + i.parsed.y, 0).toFixed(1) + " h",
      } } },
    },
  });

  attachTable("card-weekly-volume", ["Woche", ...groups.map((g) => GROUP_META[g].label), "Gesamt"],
    [...weeks].reverse().map((w) => [
      fmtDateShort(w.start),
      ...groups.map((g) => (w.byGroup[g] ? (w.byGroup[g].duration / 3600).toFixed(1) : "–")),
      (w.duration / 3600).toFixed(1) + " h",
    ]));
}

function renderVo2maxChart() {
  const data = (DATA.vo2max || []).filter((x) => inRange(x.date));
  if (data.length < 2) return emptyCard("card-vo2max", "VO₂max", "Noch zu wenige VO₂max-Messungen im Zeitraum.");

  const canvas = chartCard("card-vo2max", { title: "VO₂max-Verlauf", sub: "aus Laufeinheiten geschätzt" });
  makeChart(canvas, {
    type: "line",
    data: {
      labels: data.map((x) => fmtDateShort(x.date)),
      datasets: [lineDataset({ label: "VO₂max", data: data.map((x) => x.vo2max), color: "#3987e5", fill: true, points: true })],
    },
    options: {
      maintainAspectRatio: false,
      interaction: hoverNearest,
      scales: baseScales({ yTitle: "ml/kg/min" }),
    },
  });
  attachTable("card-vo2max", ["Datum", "VO₂max"], [...data].reverse().map((x) => [fmtDateShort(x.date), x.vo2max.toFixed(1)]));
}

/* Monatliche Load-Balance als Meter-Reihen (Wert vs. Zielband) */
function renderLoadBalance() {
  const card = document.getElementById("card-load-balance");
  const ts = (DATA.fitness && DATA.fitness.training_status) || {};
  const map = ts.mostRecentTrainingLoadBalance && ts.mostRecentTrainingLoadBalance.metricsTrainingLoadBalanceDTOMap;
  const b = map ? Object.values(map)[0] : null;
  if (!b) return emptyCard("card-load-balance", "Trainingslast-Fokus");

  const rows = [
    { label: "Anaerob", have: b.monthlyLoadAnaerobic, min: b.monthlyLoadAnaerobicTargetMin, max: b.monthlyLoadAnaerobicTargetMax },
    { label: "Aerob hoch", have: b.monthlyLoadAerobicHigh, min: b.monthlyLoadAerobicHighTargetMin, max: b.monthlyLoadAerobicHighTargetMax },
    { label: "Aerob niedrig", have: b.monthlyLoadAerobicLow, min: b.monthlyLoadAerobicLowTargetMin, max: b.monthlyLoadAerobicLowTargetMax },
  ].filter((r) => r.have != null && r.max);

  const phrase = { BALANCED: "Ausgewogen ✓", LOW_AEROBIC_SHORTAGE: "Zu wenig ruhiges Training", HIGH_AEROBIC_SHORTAGE: "Zu wenig intensives Training", ANAEROBIC_SHORTAGE: "Zu wenig anaerobes Training" }[b.trainingBalanceFeedbackPhrase] || b.trainingBalanceFeedbackPhrase || "";

  card.innerHTML = `
    <div class="card-head"><h3>Trainingslast-Fokus <span class="card-sub">4-Wochen-Last vs. Garmin-Zielbereich · ${phrase}</span></h3></div>
    <div class="balance-rows">
      ${rows.map((r) => {
        const scale = r.max * 1.15;
        const inBand = r.have >= r.min && r.have <= r.max;
        const below = r.have < r.min;
        const color = inBand ? "var(--s-good)" : below ? "var(--s-warn)" : "var(--s-serious)";
        const state = inBand ? "im Ziel" : below ? "unter Ziel" : "über Ziel";
        return `
        <div class="balance-row">
          <div class="balance-label">${r.label} <span class="balance-state" style="color:${color}">● ${state}</span></div>
          <div class="balance-track" role="img" aria-label="${r.label}: ${Math.round(r.have)} von Zielbereich ${Math.round(r.min)}–${Math.round(r.max)}">
            <div class="balance-band" style="left:${(r.min / scale) * 100}%;width:${((r.max - r.min) / scale) * 100}%"></div>
            <div class="balance-fill" style="width:${Math.min(100, (r.have / scale) * 100)}%"></div>
          </div>
          <div class="balance-nums">${Math.round(r.have)} <span>/ Ziel ${Math.round(r.min)}–${Math.round(r.max)}</span></div>
        </div>`;
      }).join("")}
    </div>`;
}

/* ---------- Wettkampf-Prognosen ---------- */

const RACE_DISTS = [
  { key: "time5K", label: "5 km" },
  { key: "time10K", label: "10 km" },
  { key: "timeHalfMarathon", label: "Halbmarathon" },
  { key: "timeMarathon", label: "Marathon" },
];

function renderRaceSection() {
  const f = DATA.fitness || {};
  const now = f.race_predictions;
  const hist = (f.race_predictions_history || [])
    .filter((x) => x.calendarDate && RACE_DISTS.some((d) => num(x[d.key]) != null))
    .sort((a, b) => a.calendarDate.localeCompare(b.calendarDate));

  const sec = document.getElementById("sec-race");
  if (!now && !hist.length) { sec.style.display = "none"; return; }

  const histInRange = hist.filter((x) => inRange(x.calendarDate));

  // aktuelle Kacheln + Delta vs. vor 90 Tagen
  const tiles = RACE_DISTS.map((d) => {
    const cur = now ? num(now[d.key]) : null;
    if (cur == null) return "";
    const old = [...hist].reverse().find((x) => num(x[d.key]) != null && daysBetween(x.calendarDate, DATA.today) >= 85);
    const delta = old ? cur - old[d.key] : null;
    const deltaHtml = delta == null ? "" :
      `<div class="race-delta ${delta < 0 ? "up" : delta > 0 ? "down" : "flat"}">
        ${delta < 0 ? "▲ " + fmtTime(-delta) + " schneller" : delta > 0 ? "▼ " + fmtTime(delta) + " langsamer" : "unverändert"} <span style="color:var(--ink-3)">vs. vor 3 Mon.</span>
      </div>`;
    return `<div class="race-tile"><div class="race-dist">${d.label}</div><div class="race-time">${fmtTime(cur)}</div>${deltaHtml}</div>`;
  }).join("");
  document.getElementById("race-now").innerHTML = tiles;

  // kleine Multiples (eine Achse pro Distanz – niemals Doppelachse)
  const grid = document.getElementById("race-charts");
  grid.innerHTML = RACE_DISTS.map((d) => `<article class="card chart-card" id="race-${d.key}"></article>`).join("");

  for (const d of RACE_DISTS) {
    const series = histInRange.filter((x) => num(x[d.key]) != null);
    if (series.length < 2) { emptyCard(`race-${d.key}`, d.label, "Zu wenig Verlauf im Zeitraum."); continue; }
    const canvas = chartCard(`race-${d.key}`, { title: d.label, sub: "niedriger = schneller" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: series.map((x) => fmtDateShort(x.calendarDate)),
        datasets: [lineDataset({ label: d.label, data: series.map((x) => x[d.key]), color: "#3987e5", fill: true })],
      },
      options: {
        maintainAspectRatio: false,
        interaction: hoverLine,
        scales: { ...baseScales({ fmt: (v) => fmtTime(v) }), },
        plugins: { tooltip: { callbacks: { label: (c) => ` Prognose: ${fmtTime(c.parsed.y)}` } } },
      },
    });
  }
}

/* ---------- Tempo-Trends ---------- */

function renderTempoCharts() {
  const grid = document.getElementById("tempo-charts");
  grid.innerHTML = "";

  const runs = (DATA.runPace || []).filter((x) => inRange(x.date));
  const rides = (DATA.rideSpeed || []).filter((x) => inRange(x.date));
  const ridesPower = rides.filter((x) => x.power != null);
  const swims = (DATA.swimPace || []).filter((x) => inRange(x.date));

  const blocks = [];
  if (runs.length >= 3) blocks.push({ id: "tempo-run" });
  if (rides.length >= 3) blocks.push({ id: "tempo-ride" });
  if (ridesPower.length >= 3) blocks.push({ id: "tempo-power" });
  if (swims.length >= 3) blocks.push({ id: "tempo-swim" });
  grid.innerHTML = blocks.map((b) => `<article class="card chart-card" id="${b.id}"></article>`).join("");
  if (!blocks.length) { document.getElementById("sec-tempo").style.display = "none"; return; }
  document.getElementById("sec-tempo").style.display = "";

  if (runs.length >= 3) {
    const canvas = chartCard("tempo-run", { title: "Lauf-Pace", sub: "Ø-Pace je Lauf (>2 km) · höher = schneller" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: runs.map((x) => fmtDateShort(x.date)),
        datasets: [
          { ...lineDataset({ label: "Pace", data: runs.map((x) => x.pace), color: "#c98500", points: true, width: 0 }), showLine: false },
          lineDataset({ label: "Trend (5er-Schnitt)", data: rollingMean(runs.map((x) => x.pace), 5), color: "#c98500" }),
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: hoverNearest,
        scales: baseScales({ reverse: true, fmt: (v) => fmtPace(v) }),
        plugins: { tooltip: { callbacks: {
          title: (items) => runs[items[0].dataIndex] ? runs[items[0].dataIndex].name : "",
          label: (c) => ` ${c.dataset.label}: ${fmtPace(c.parsed.y)}` + (c.datasetIndex === 0 && runs[c.dataIndex].hr ? ` · ${Math.round(runs[c.dataIndex].hr)} bpm` : ""),
        } } },
      },
    });
    attachTable("tempo-run", ["Datum", "Lauf", "Distanz", "Pace", "Ø Puls"],
      [...runs].reverse().map((x) => [fmtDateShort(x.date), x.name, fmtKm(x.dist), fmtPace(x.pace), x.hr ? Math.round(x.hr) : "–"]));
  }

  if (rides.length >= 3) {
    const canvas = chartCard("tempo-ride", { title: "Rad-Tempo", sub: "Ø-Geschwindigkeit je Fahrt (>10 km)" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: rides.map((x) => fmtDateShort(x.date)),
        datasets: [
          { ...lineDataset({ label: "Tempo", data: rides.map((x) => x.speed), color: "#3987e5", points: true, width: 0 }), showLine: false },
          lineDataset({ label: "Trend (5er-Schnitt)", data: rollingMean(rides.map((x) => x.speed), 5), color: "#3987e5" }),
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: hoverNearest,
        scales: baseScales({ fmt: (v) => v.toFixed(0) + " km/h" }),
        plugins: { tooltip: { callbacks: {
          title: (items) => rides[items[0].dataIndex] ? rides[items[0].dataIndex].name : "",
          label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)} km/h`,
        } } },
      },
    });
    attachTable("tempo-ride", ["Datum", "Fahrt", "Distanz", "Ø km/h", "Ø Watt"],
      [...rides].reverse().map((x) => [fmtDateShort(x.date), x.name, fmtKm(x.dist), x.speed.toFixed(1), x.power ? Math.round(x.power) : "–"]));
  }

  if (ridesPower.length >= 3) {
    const canvas = chartCard("tempo-power", { title: "Rad-Leistung", sub: "Ø-Watt je Fahrt mit Powermeter" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: ridesPower.map((x) => fmtDateShort(x.date)),
        datasets: [
          { ...lineDataset({ label: "Ø Watt", data: ridesPower.map((x) => x.power), color: "#9085e9", points: true, width: 0 }), showLine: false },
          lineDataset({ label: "Trend (5er-Schnitt)", data: rollingMean(ridesPower.map((x) => x.power), 5), color: "#9085e9" }),
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: hoverNearest,
        scales: baseScales({ fmt: (v) => v.toFixed(0) + " W" }),
        plugins: { tooltip: { callbacks: { title: (items) => ridesPower[items[0].dataIndex].name, label: (c) => ` ${c.dataset.label}: ${Math.round(c.parsed.y)} W` } } },
      },
    });
  }

  if (swims.length >= 3) {
    const canvas = chartCard("tempo-swim", { title: "Schwimm-Pace", sub: "Ø-Pace je Einheit (>400 m) · höher = schneller" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: swims.map((x) => fmtDateShort(x.date)),
        datasets: [
          { ...lineDataset({ label: "Pace", data: swims.map((x) => x.pace100), color: "#199e70", points: true, width: 0 }), showLine: false },
          lineDataset({ label: "Trend (5er-Schnitt)", data: rollingMean(swims.map((x) => x.pace100), 5), color: "#199e70" }),
        ],
      },
      options: {
        maintainAspectRatio: false,
        interaction: hoverNearest,
        scales: baseScales({ reverse: true, fmt: (v) => fmtPace100(v) }),
        plugins: { tooltip: { callbacks: {
          title: (items) => swims[items[0].dataIndex] ? swims[items[0].dataIndex].name : "",
          label: (c) => ` ${c.dataset.label}: ${fmtPace100(c.parsed.y)}`,
        } } },
      },
    });
    attachTable("tempo-swim", ["Datum", "Einheit", "Distanz", "Pace /100m"],
      [...swims].reverse().map((x) => [fmtDateShort(x.date), x.name, `${Math.round(x.dist)} m`, fmtPace100(x.pace100)]));
  }
}

/* ---------- Gesundheit ---------- */

function renderHealthCharts() {
  const grid = document.getElementById("health-charts");
  grid.innerHTML = "";
  const blocks = [];

  const rhr = (DATA.rhr || []).filter((x) => inRange(x.date));
  const sleep = (DATA.sleep || []).filter((x) => inRange(x.date));
  const stages = (DATA.sleep || []).filter((x) => inRange(x.date)).slice(-21);
  const stress = (DATA.stress || []).filter((x) => inRange(x.date));
  const steps = (DATA.steps || []).filter((x) => inRange(x.date));
  const bb = (DATA.bodyBattery || []).filter((x) => inRange(x.date));
  const im = (DATA.intensityWeeks || []).filter((x) => inRange(x.date));

  if (rhr.length >= 3) blocks.push("health-rhr");
  if (sleep.length >= 3) blocks.push("health-sleep");
  if (stages.length >= 3) blocks.push("health-stages");
  if (bb.length >= 3) blocks.push("health-bb");
  if (stress.length >= 3) blocks.push("health-stress");
  if (steps.length >= 3) blocks.push("health-steps");
  if (im.length >= 3) blocks.push("health-im");
  grid.innerHTML = blocks.map((b) => `<article class="card chart-card" id="${b}"></article>`).join("");
  if (!blocks.length) { document.getElementById("sec-gesundheit").style.display = "none"; return; }
  document.getElementById("sec-gesundheit").style.display = "";

  if (rhr.length >= 3) {
    const canvas = chartCard("health-rhr", { title: "Ruhepuls", sub: "niedriger = besser erholt" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: rhr.map((x) => fmtDateShort(x.date)),
        datasets: [lineDataset({ label: "Ruhepuls", data: rhr.map((x) => x.rhr), color: "#e66767", fill: true })],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverLine,
        scales: baseScales({ fmt: (v) => v + " bpm" }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} bpm` } } },
      },
    });
    attachTable("health-rhr", ["Datum", "Ruhepuls"], [...rhr].reverse().map((x) => [fmtDateShort(x.date), x.rhr + " bpm"]));
  }

  if (sleep.length >= 3) {
    const canvas = chartCard("health-sleep", { title: "Schlaf-Score", sub: "pro Nacht mit Uhr" });
    makeChart(canvas, {
      type: "bar",
      data: {
        labels: sleep.map((x) => fmtDateShort(x.date)),
        datasets: [barDataset({ label: "Score", data: sleep.map((x) => x.score), color: "#9085e9" })],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverNearest,
        scales: baseScales({ yMin: 0, yMax: 100 }),
        plugins: { tooltip: { callbacks: {
          label: (c) => ` Score: ${c.parsed.y}/100 · ${fmtDur(sleep[c.dataIndex].total_s, { short: true })} Schlaf`,
        } } },
      },
    });
    attachTable("health-sleep", ["Datum", "Score", "Dauer"],
      [...sleep].reverse().map((x) => [fmtDateShort(x.date), x.score ?? "–", fmtDur(x.total_s, { short: true })]));
  }

  if (stages.length >= 3) {
    const canvas = chartCard("health-stages", {
      title: "Schlafphasen", sub: "Stunden je Nacht",
      legend: legendHTML([
        { label: "Tief", color: "#184f95" }, { label: "REM", color: "#3987e5" },
        { label: "Leicht", color: "#86b6ef" }, { label: "Wach", color: "#57616e" },
      ]),
    });
    const h = (s) => (s || 0) / 3600;
    makeChart(canvas, {
      type: "bar",
      data: {
        labels: stages.map((x) => fmtDateShort(x.date)),
        datasets: [
          barDataset({ label: "Tief", data: stages.map((x) => h(x.deep_s)), color: "#184f95" }),
          barDataset({ label: "REM", data: stages.map((x) => h(x.rem_s)), color: "#3987e5" }),
          barDataset({ label: "Leicht", data: stages.map((x) => h(x.light_s)), color: "#86b6ef" }),
          barDataset({ label: "Wach", data: stages.map((x) => h(x.awake_s)), color: "#57616e" }),
        ],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverLine,
        scales: baseScales({ stacked: true, fmt: (v) => v + " h" }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${fmtDur(c.parsed.y * 3600, { short: true })}` } } },
      },
    });
  }

  if (bb.length >= 3) {
    const canvas = chartCard("health-bb", {
      title: "Body Battery", sub: "Tageshoch und -tief",
      legend: legendHTML([{ label: "Höchstwert", color: "#4ec39a" }, { label: "Tiefstwert", color: "#199e70" }]),
    });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: bb.map((x) => fmtDateShort(x.date)),
        datasets: [
          { ...lineDataset({ label: "Höchstwert", data: bb.map((x) => x.highest), color: "#4ec39a" }), fill: "+1", backgroundColor: hexA("#199e70", 0.12) },
          lineDataset({ label: "Tiefstwert", data: bb.map((x) => x.lowest), color: "#199e70" }),
        ],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverLine,
        scales: baseScales({ yMin: 0, yMax: 100 }),
      },
    });
    attachTable("health-bb", ["Datum", "Hoch", "Tief", "Geladen", "Verbraucht"],
      [...bb].reverse().slice(0, 90).map((x) => [fmtDateShort(x.date), x.highest, x.lowest ?? "–", x.charged ?? "–", x.drained ?? "–"]));
  }

  if (stress.length >= 3) {
    const canvas = chartCard("health-stress", { title: "Stresslevel", sub: "Tagesdurchschnitt (0–100)" });
    makeChart(canvas, {
      type: "line",
      data: {
        labels: stress.map((x) => fmtDateShort(x.date)),
        datasets: [lineDataset({ label: "Stress", data: stress.map((x) => x.level), color: "#c98500", fill: true })],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverLine,
        scales: baseScales({ yMin: 0, yMax: 100 }),
        plugins: { tooltip: { callbacks: {
          label: (c) => ` Ø Stress: ${c.parsed.y}`,
          footer: (items) => {
            const s = stress[items[0].dataIndex];
            const f = (v) => v ? Math.round(v / 60) + " min" : "0 min";
            return `Ruhe ${f(s.rest)} · niedrig ${f(s.low)} · mittel ${f(s.medium)} · hoch ${f(s.high)}`;
          },
        } } },
      },
    });
    attachTable("health-stress", ["Datum", "Ø Stress", "Ruhe", "Niedrig", "Mittel", "Hoch"],
      [...stress].reverse().map((x) => [fmtDateShort(x.date), x.level,
        Math.round((x.rest || 0) / 60) + " min", Math.round((x.low || 0) / 60) + " min",
        Math.round((x.medium || 0) / 60) + " min", Math.round((x.high || 0) / 60) + " min"]));
  }

  if (steps.length >= 3) {
    const canvas = chartCard("health-steps", { title: "Schritte", sub: "pro Tag mit Uhr" });
    makeChart(canvas, {
      type: "bar",
      data: {
        labels: steps.map((x) => fmtDateShort(x.date)),
        datasets: [barDataset({ label: "Schritte", data: steps.map((x) => x.steps), color: "#199e70" })],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverNearest,
        scales: baseScales({ fmt: (v) => (v / 1000) + "k" }),
        plugins: { tooltip: { callbacks: { label: (c) => ` ${c.parsed.y.toLocaleString("de-DE")} Schritte` } } },
      },
    });
  }

  if (im.length >= 3) {
    const canvas = chartCard("health-im", {
      title: "Intensitätsminuten", sub: "pro Woche · intensiv zählt doppelt · Ziel-Linie: 150",
      legend: legendHTML([{ label: "Moderat", color: "#86b6ef" }, { label: "Intensiv (×2)", color: "#3987e5" }]),
    });
    makeChart(canvas, {
      type: "bar",
      data: {
        labels: im.map((x) => fmtDateShort(x.date)),
        datasets: [
          barDataset({ label: "Moderat", data: im.map((x) => x.moderate), color: "#86b6ef" }),
          barDataset({ label: "Intensiv (×2)", data: im.map((x) => x.vigorous * 2), color: "#3987e5" }),
          { label: "Wochenziel", data: im.map((x) => x.goal), type: "line", borderColor: "#717d8d",
            borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, fill: false, tension: 0, stack: "ziel" },
        ],
      },
      options: {
        maintainAspectRatio: false, interaction: hoverLine,
        scales: baseScales({ stacked: true, fmt: (v) => v + " min" }),
        plugins: { tooltip: { callbacks: {
          label: (c) => c.dataset.type === "line" ? ` Ziel: ${c.parsed.y} min` : ` ${c.dataset.label}: ${c.parsed.y} min`,
        } } },
      },
    });
  }
}

/* ---------- Kraft ---------- */

function renderStrengthChart() {
  const area = document.getElementById("strength-area");
  const sessions = (DATA.strengthSessions || []).filter((x) => x.reps > 0 || x.volume > 0);
  if (!sessions.length) { document.getElementById("sec-kraft").style.display = "none"; return; }
  document.getElementById("sec-kraft").style.display = "";

  // Übungsnamen/Gewichte liefert die Uhr nicht immer – dann Wiederholungen statt Tonnage
  const hasWeights = sessions.some((x) => x.volume > 0);
  const knownExercises = (DATA.exerciseTotals || []).filter((e) => e.name !== "Unknown" && e.name !== "Unbekannte Übung");

  area.innerHTML = `
    <article class="card chart-card ${knownExercises.length ? "" : "chart-wide"}" id="strength-vol"></article>
    ${knownExercises.length ? `
    <article class="card" id="strength-ex">
      <div class="card-head"><h3>Meistgemachte Übungen <span class="card-sub">nach Sätzen, letzte 6 Monate</span></h3></div>
      <div class="exercise-list"></div>
    </article>` : ""}`;

  const canvas = hasWeights
    ? chartCard("strength-vol", { title: "Kraft-Volumen je Einheit", sub: "Gewicht × Wiederholungen, in Tonnen" })
    : chartCard("strength-vol", { title: "Kraft-Arbeit je Einheit", sub: "Wiederholungen gesamt (die Uhr speichert keine Gewichte)" });

  makeChart(canvas, {
    type: "bar",
    data: {
      labels: sessions.map((x) => fmtDateShort(x.date)),
      datasets: [barDataset({
        label: hasWeights ? "Volumen" : "Wiederholungen",
        data: sessions.map((x) => hasWeights ? x.volume / 1000 : x.reps),
        color: "#008300",
      })],
    },
    options: {
      maintainAspectRatio: false, interaction: hoverNearest,
      scales: baseScales({ fmt: (v) => hasWeights ? v.toFixed(1) + " t" : v }),
      plugins: { tooltip: { callbacks: {
        label: (c) => {
          const s = sessions[c.dataIndex];
          return hasWeights
            ? ` ${(s.volume / 1000).toFixed(2)} t · ${s.sets} Sätze · ${s.reps} Wdh.`
            : ` ${s.reps} Wdh. in ${s.sets} Sätzen`;
        },
      } } },
    },
  });
  attachTable("strength-vol", ["Datum", hasWeights ? "Volumen" : "Wdh.", "Sätze"],
    [...sessions].reverse().map((s) => [fmtDateShort(s.date), hasWeights ? (s.volume / 1000).toFixed(2) + " t" : s.reps, s.sets]));

  if (knownExercises.length) {
    const top = knownExercises.slice(0, 8);
    const maxSets = top[0].sets;
    document.querySelector("#strength-ex .exercise-list").innerHTML = top.map((e) => `
      <div class="exercise-row">
        <span class="ex-name">${e.name}</span>
        <span class="ex-meta">${e.sets} Sätze · ${e.reps} Wdh.</span>
        <span class="ex-meta">${e.volume >= 1000 ? (e.volume / 1000).toFixed(1) + " t" : e.volume > 0 ? Math.round(e.volume) + " kg" : ""}</span>
        <div class="ex-bar-track"><div class="ex-bar-fill" style="width:${(e.sets / maxSets) * 100}%"></div></div>
      </div>`).join("");
  }
}

/* ---------- Rekorde ---------- */

const PR_TYPES = {
  1:  { label: "Schnellster 1 km",        fmt: fmtTime, icon: "🏃" },
  2:  { label: "Schnellste 1 Meile",      fmt: fmtTime, icon: "🏃" },
  3:  { label: "Schnellste 5 km",         fmt: fmtTime, icon: "🏃" },
  4:  { label: "Schnellste 10 km",        fmt: fmtTime, icon: "🏃" },
  5:  { label: "Schnellster Halbmarathon", fmt: fmtTime, icon: "🏃" },
  6:  { label: "Schnellster Marathon",    fmt: fmtTime, icon: "🏃" },
  7:  { label: "Längster Lauf",           fmt: (v) => fmtKm(v, 2), icon: "🏃" },
  8:  { label: "Längste Radfahrt",        fmt: (v) => fmtKm(v, 1), icon: "🚴" },
  9:  { label: "Meiste Höhenmeter (Rad)", fmt: (v) => Math.round(v).toLocaleString("de-DE") + " m", icon: "⛰️" },
  10: { label: "Beste 20-min-Leistung",   fmt: (v) => Math.round(v) + " W", icon: "🚴" },
  11: { label: "Schnellste 40 km (Rad)",  fmt: fmtTime, icon: "🚴" },
  12: { label: "Meiste Schritte an einem Tag",   fmt: (v) => Math.round(v).toLocaleString("de-DE"), icon: "👟" },
  13: { label: "Meiste Schritte in einer Woche", fmt: (v) => Math.round(v).toLocaleString("de-DE"), icon: "👟" },
  14: { label: "Meiste Schritte in einem Monat", fmt: (v) => Math.round(v).toLocaleString("de-DE"), icon: "👟" },
  15: { label: "Längste Ziel-Serie",      fmt: (v) => Math.round(v) + " Tage", icon: "🎯" },
  17: { label: "Längste Schwimmstrecke",  fmt: (v) => Math.round(v).toLocaleString("de-DE") + " m", icon: "🏊" },
  18: { label: "Schnellste 100 m (Schwimmen)",  fmt: fmtTime, icon: "🏊" },
  19: { label: "Schnellste 100 yd (Schwimmen)", fmt: fmtTime, icon: "🏊" },
  20: { label: "Schnellste 400 m (Schwimmen)",  fmt: fmtTime, icon: "🏊" },
  21: { label: "Schnellste 500 yd (Schwimmen)", fmt: fmtTime, icon: "🏊" },
  22: { label: "Schwimm-Bestzeit (1.000 m)",    fmt: fmtTime, icon: "🏊" },
  23: { label: "Schwimm-Bestzeit (1.500 m)",    fmt: fmtTime, icon: "🏊" },
};

function renderRecords() {
  const prs = ((DATA.records && DATA.records.personal_records) || [])
    .filter((p) => PR_TYPES[p.type_id] && p.value > 0);
  if (!prs.length) { document.getElementById("sec-rekorde").style.display = "none"; return; }

  prs.sort((a, b) => a.type_id - b.type_id);
  document.getElementById("pr-grid").innerHTML = prs.map((p) => {
    const t = PR_TYPES[p.type_id];
    const date = typeof p.date === "string" && p.date.match(/^\d{4}-\d{2}-\d{2}/) ? fmtDateShort(p.date.slice(0, 10)) : "";
    return `
    <div class="pr-tile">
      <div class="pr-icon">${t.icon}</div>
      <div>
        <div class="pr-value">${t.fmt(p.value)}</div>
        <div class="pr-label">${t.label}</div>
        <div class="pr-date">${[date, clean(p.activity_name)].filter(Boolean).join(" · ")}</div>
      </div>
    </div>`;
  }).join("");
}

/* ---------- Badges ---------- */

function renderBadges() {
  const badges = ((DATA.records && DATA.records.badges) || [])
    .filter((b) => b.name)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!badges.length) { document.getElementById("sec-badges").style.display = "none"; return; }

  const shown = badges.slice(0, 16);
  document.getElementById("badge-row").innerHTML =
    shown.map((b) => `<span class="badge-chip">🏅 ${b.name}${b.date ? ` <span class="b-date">${fmtDateShort(b.date.slice(0, 10))}</span>` : ""}</span>`).join("") +
    (badges.length > shown.length ? `<span class="badge-more">+ ${badges.length - shown.length} weitere</span>` : "");
}

/* ---------- Footer ---------- */

function renderFooter() {
  const gen = DATA.manifest && DATA.manifest.generated_at;
  const sections = (DATA.manifest && DATA.manifest.sections) || {};
  const failed = Object.entries(sections).filter(([, v]) => !v.ok);
  document.getElementById("footer").innerHTML = `
    <span>Datenexport: ${gen ? new Date(gen).toLocaleString("de-DE") : "unbekannt"} ·
      Aktualisieren mit <code>uv run scripts/export_data.py</code></span>
    <span>${DATA.acts.length} Aktivitäten seit ${fmtDateShort(DATA.acts[DATA.acts.length - 1].date)}
      ${failed.length ? ` · ${failed.length} Datenquellen ohne Daten` : ""}</span>`;
}
