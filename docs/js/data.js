/* ============================================================
   Daten-Layer: JSON laden, normalisieren, abgeleitete Serien
   ============================================================ */

const DATA = {}; // rohe + abgeleitete Daten, global für app.js/charts.js

const SPORT_GROUPS = {
  cycling: "rad", road_biking: "rad", indoor_cycling: "rad", cyclocross: "rad",
  virtual_ride: "rad", gravel_cycling: "rad", mountain_biking: "rad",
  running: "laufen", treadmill_running: "laufen", trail_running: "laufen", track_running: "laufen",
  lap_swimming: "schwimmen", open_water_swimming: "schwimmen",
  strength_training: "kraft", indoor_cardio: "kraft",
  hiking: "wandern", walking: "wandern",
};

const GROUP_META = {
  rad:       { label: "Rad",       color: "#3987e5", icon: "🚴" },
  schwimmen: { label: "Schwimmen", color: "#199e70", icon: "🏊" },
  laufen:    { label: "Laufen",    color: "#c98500", icon: "🏃" },
  kraft:     { label: "Kraft",     color: "#008300", icon: "🏋️" },
  wandern:   { label: "Wandern",   color: "#9085e9", icon: "🥾" },
  sonstiges: { label: "Sonstiges", color: "#57616e", icon: "⚡" },
};
const GROUP_ORDER = ["rad", "schwimmen", "laufen", "kraft", "wandern", "sonstiges"];

const TYPE_LABELS = {
  cycling: "Radfahren", road_biking: "Rennrad", indoor_cycling: "Indoor-Rad", cyclocross: "Cyclocross",
  gravel_cycling: "Gravel", mountain_biking: "MTB", virtual_ride: "Virtuelles Rad",
  running: "Laufen", treadmill_running: "Laufband", trail_running: "Trailrun",
  lap_swimming: "Schwimmen (Pool)", open_water_swimming: "Freiwasser",
  strength_training: "Krafttraining", hiking: "Wandern", walking: "Gehen",
  multi_sport: "Triathlon", elliptical: "Crosstrainer", other: "Sonstiges",
};

function sportGroup(typeKey) { return SPORT_GROUPS[typeKey] || "sonstiges"; }

/* ---------- Utilities ---------- */

function clean(s) { return (s || "").replace(/[​‌‍]/g, ""); }

function isoDate(d) { return d.toISOString().slice(0, 10); }

function parseDate(s) { return new Date(s.slice(0, 10) + "T12:00:00"); }

function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekStart(d) {
  const c = new Date(d);
  const day = (c.getDay() + 6) % 7; // Mo = 0
  c.setDate(c.getDate() - day);
  c.setHours(0, 0, 0, 0);
  return c;
}

function fmtDur(seconds, opts = {}) {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} h`;
  if (opts.short) return `${m} min`;
  return `${m}:${String(s % 60).padStart(2, "0")} min`;
}

function fmtTime(seconds) {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtKm(meters, digits = 1) {
  if (meters == null) return "–";
  return (meters / 1000).toLocaleString("de-DE", { maximumFractionDigits: digits, minimumFractionDigits: 0 }) + " km";
}

function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return "–";
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function fmtPace100(secPer100) {
  if (!secPer100 || !isFinite(secPer100)) return "–";
  const m = Math.floor(secPer100 / 60), s = Math.round(secPer100 % 60);
  return `${m}:${String(s).padStart(2, "0")}/100m`;
}

function fmtDateShort(iso) {
  const d = parseDate(iso);
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function fmtDateLong(iso) {
  const d = parseDate(iso);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }

function rollingMean(arr, window) {
  return arr.map((_, i) => {
    const slice = arr.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });
}

function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

/* ---------- Laden ---------- */

async function loadJSON(name) {
  try {
    const res = await fetch(`./data/${name}.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadAll() {
  const names = ["manifest", "profile", "activities", "daily", "sleep_detail", "fitness",
    "body", "records", "strength", "load_trend", "gear", "goals", "calendar"];
  const results = await Promise.all(names.map(loadJSON));
  names.forEach((n, i) => { DATA[n] = results[i]; });
  deriveAll();
}

/* ---------- Ableitungen ---------- */

function deriveAll() {
  const acts = (DATA.activities || []).map((a) => ({
    ...a,
    activityName: clean(a.activityName),
    date: (a.startTimeLocal || "").slice(0, 10),
    group: a.typeKey === "multi_sport" ? "sonstiges" : sportGroup(a.typeKey),
  })).filter((a) => a.date && (a.duration || 0) >= 120); // versehentliche Mini-Aufnahmen ausblenden

  acts.sort((a, b) => b.startTimeLocal.localeCompare(a.startTimeLocal));
  DATA.acts = acts;

  // Referenz "heute" = Datum des Datenexports, nicht Betrachtungszeitpunkt
  const gen = DATA.manifest && DATA.manifest.generated_at;
  DATA.today = gen ? gen.slice(0, 10) : isoDate(new Date());

  deriveWeekly(acts);
  deriveStreaks(acts);
  deriveDaily();
  deriveVo2max(acts);
  derivePaceSeries(acts);
  deriveStrength();
}

function deriveWeekly(acts) {
  const weeks = new Map();
  for (const a of acts) {
    const wk = isoWeekKey(parseDate(a.date));
    if (!weeks.has(wk)) {
      weeks.set(wk, { week: wk, start: isoDate(weekStart(parseDate(a.date))), count: 0, duration: 0, distance: 0, load: 0, byGroup: {} });
    }
    const w = weeks.get(wk);
    w.count += 1;
    w.duration += a.duration || 0;
    w.distance += a.distance || 0;
    w.load += a.activityTrainingLoad || 0;
    const g = a.group;
    if (!w.byGroup[g]) w.byGroup[g] = { duration: 0, distance: 0, count: 0 };
    w.byGroup[g].duration += a.duration || 0;
    w.byGroup[g].distance += a.distance || 0;
    w.byGroup[g].count += 1;
  }
  DATA.weekly = [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function deriveStreaks(acts) {
  const activeDays = new Set(acts.map((a) => a.date));
  const activeWeeks = new Set(acts.map((a) => isoWeekKey(parseDate(a.date))));

  const today = parseDate(DATA.today);

  // Wochen-Streak: aufeinanderfolgende Kalenderwochen mit >=1 Einheit
  let currentWeekStreak = 0;
  let cursor = weekStart(today);
  // laufende Woche zählt, wenn schon trainiert – sonst ab Vorwoche zählen
  if (!activeWeeks.has(isoWeekKey(cursor))) cursor = addDays(cursor, -7);
  while (activeWeeks.has(isoWeekKey(cursor))) {
    currentWeekStreak += 1;
    cursor = addDays(cursor, -7);
  }

  let longestWeekStreak = 0;
  if (acts.length) {
    let run = 0;
    let c = weekStart(parseDate(acts[acts.length - 1].date));
    const end = weekStart(today);
    while (c <= end) {
      run = activeWeeks.has(isoWeekKey(c)) ? run + 1 : 0;
      longestWeekStreak = Math.max(longestWeekStreak, run);
      c = addDays(c, 7);
    }
  }

  const last28 = [...Array(28)].map((_, i) => isoDate(addDays(today, -i)));
  const daysActive28 = last28.filter((d) => activeDays.has(d)).length;

  const thisWeekKey = isoWeekKey(today);
  const thisWeek = acts.filter((a) => isoWeekKey(parseDate(a.date)) === thisWeekKey);

  // Volumen: letzte 28 Tage vs. 28 davor
  const d28 = isoDate(addDays(today, -28));
  const d56 = isoDate(addDays(today, -56));
  const cur = acts.filter((a) => a.date > d28);
  const prev = acts.filter((a) => a.date > d56 && a.date <= d28);
  const sum = (arr, f) => arr.reduce((s, a) => s + (f(a) || 0), 0);

  DATA.streaks = {
    currentWeekStreak,
    longestWeekStreak,
    daysActive28,
    thisWeekCount: thisWeek.length,
    thisWeekDuration: sum(thisWeek, (a) => a.duration),
    vol28: sum(cur, (a) => a.duration),
    vol28prev: sum(prev, (a) => a.duration),
    load28: sum(cur, (a) => a.activityTrainingLoad),
    load28prev: sum(prev, (a) => a.activityTrainingLoad),
    activeDays,
  };
}

function deriveDaily() {
  const d = DATA.daily || {};

  DATA.steps = (d.steps || [])
    .filter((x) => num(x.totalSteps) != null)
    .map((x) => ({ date: x.calendarDate, steps: x.totalSteps, goal: x.stepGoal }))
    .sort((a, b) => a.date.localeCompare(b.date));

  DATA.rhr = (d.rhr || [])
    .filter((x) => x.values && num(x.values.restingHR) != null)
    .map((x) => ({ date: x.calendarDate, rhr: x.values.restingHR }))
    .sort((a, b) => a.date.localeCompare(b.date));

  DATA.stress = (d.stress || [])
    .filter((x) => x.values && num(x.values.overallStressLevel) != null)
    .map((x) => ({
      date: x.calendarDate,
      level: x.values.overallStressLevel,
      rest: x.values.restStressDuration,
      low: x.values.lowStressDuration,
      medium: x.values.mediumStressDuration,
      high: x.values.highStressDuration,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  DATA.sleep = (d.sleep_scores || [])
    .filter((x) => num(x.total_s) != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  DATA.bodyBattery = (d.body_battery || [])
    .filter((x) => num(x.highest) != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  DATA.intensityWeeks = (d.intensity_minutes_weekly || [])
    .map((x) => ({
      date: x.calendarDate,
      goal: x.weeklyGoal || 150,
      moderate: x.moderateValue || 0,
      vigorous: x.vigorousValue || 0,
      total: (x.moderateValue || 0) + 2 * (x.vigorousValue || 0),
    }))
    .filter((x) => x.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function deriveVo2max(acts) {
  const byDate = new Map();
  for (const v of (DATA.daily && DATA.daily.vo2max) || []) {
    if (v.date && num(v.vo2max) != null) byDate.set(v.date, v.vo2max);
  }
  for (const a of acts) {
    if (num(a.vO2MaxValue) != null && a.group === "laufen" && !byDate.has(a.date)) {
      byDate.set(a.date, a.vO2MaxValue);
    }
  }
  DATA.vo2max = [...byDate.entries()]
    .map(([date, v]) => ({ date, vo2max: v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function derivePaceSeries(acts) {
  const chrono = [...acts].reverse();

  const runs = chrono.filter((a) => a.group === "laufen" && a.distance > 2000 && a.duration > 0);
  DATA.runPace = runs.map((a) => ({
    date: a.date, name: a.activityName,
    pace: a.duration / (a.distance / 1000),
    hr: num(a.averageHR), dist: a.distance,
  }));

  const rides = chrono.filter((a) => ["cycling", "road_biking", "cyclocross", "gravel_cycling", "mountain_biking"].includes(a.typeKey) && a.distance > 10000 && a.duration > 0);
  DATA.rideSpeed = rides.map((a) => ({
    date: a.date, name: a.activityName,
    speed: (a.distance / 1000) / (a.duration / 3600),
    power: num(a.avgPower), hr: num(a.averageHR), dist: a.distance,
  }));

  const swims = chrono.filter((a) => a.group === "schwimmen" && a.distance > 400 && a.duration > 0);
  DATA.swimPace = swims.map((a) => ({
    date: a.date, name: a.activityName,
    pace100: a.duration / (a.distance / 100),
    dist: a.distance,
  }));
}

function deriveStrength() {
  const sessions = (DATA.strength || []).map((s) => {
    let volume = 0, reps = 0, setCount = 0;
    const perExercise = new Map();
    for (const set of s.sets || []) {
      const w = (set.weight_g || 0) / 1000;
      const r = set.reps || 0;
      volume += w * r;
      reps += r;
      setCount += 1;
      const name = prettifyExercise(set.exercise);
      if (!perExercise.has(name)) perExercise.set(name, { sets: 0, reps: 0, volume: 0 });
      const e = perExercise.get(name);
      e.sets += 1; e.reps += r; e.volume += w * r;
    }
    return { date: s.date, volume, reps, sets: setCount, perExercise };
  }).sort((a, b) => a.date.localeCompare(b.date));

  const exerciseTotals = new Map();
  for (const s of sessions) {
    for (const [name, e] of s.perExercise) {
      if (!exerciseTotals.has(name)) exerciseTotals.set(name, { sets: 0, reps: 0, volume: 0 });
      const t = exerciseTotals.get(name);
      t.sets += e.sets; t.reps += e.reps; t.volume += e.volume;
    }
  }

  DATA.strengthSessions = sessions;
  DATA.exerciseTotals = [...exerciseTotals.entries()]
    .map(([name, t]) => ({ name, ...t }))
    .sort((a, b) => b.sets - a.sets);
}

function prettifyExercise(name) {
  if (!name) return "Unbekannte Übung";
  return name.toLowerCase().split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
