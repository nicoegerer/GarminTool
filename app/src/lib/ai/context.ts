import type { Activity, GarminData } from "../types";
import { fmtDur, fmtKm, fmtPace, fmtTime, median, paceFromSpeed } from "../format";
import { typeLabel } from "../sports";
import type { UserPrefs } from "../prefs";

/**
 * Turns the Garmin export into the block of facts every AI call is grounded in.
 *
 * The FR945 provides no HRV and no Training Readiness — those blocks are stated
 * as missing rather than omitted, so the model says "I don't have that" instead
 * of inventing a number.
 */
export function buildContext(data: GarminData, prefs: UserPrefs): string {
  const { profile, activities, daily, fitness, records, loadTrend, today } = data;
  const last = loadTrend.at(-1);
  const name = profile?.full_name ?? "Nico";
  const out: string[] = [];

  /* --- Athlet --- */
  const vo2Series = (daily.vo2max ?? []).filter((v) => v.vo2max != null);
  const vo2 = vo2Series.at(-1)?.vo2max ?? profile?.user?.vo2max_running;
  const ltHr = profile?.user?.lactate_threshold_hr;
  const ltSpeed = profile?.user?.lactate_threshold_speed;
  out.push(
    [
      `ATHLET: ${name}, Triathlet.`,
      profile?.user?.weight_g ? `Gewicht ${(profile.user.weight_g / 1000).toFixed(0)} kg.` : "",
      profile?.user?.height_cm ? `Größe ${profile.user.height_cm} cm.` : "",
      vo2 ? `VO2max ${Number(vo2).toFixed(1)}.` : "",
      ltHr ? `Laktatschwelle ${ltHr} bpm` : "",
      ltSpeed ? `(${fmtPace(paceFromSpeed(ltSpeed))}).` : "",
      `Geräte: ${(profile?.devices ?? []).map((d) => d.name).filter(Boolean).join(", ") || "unbekannt"}.`,
    ]
      .filter(Boolean)
      .join(" "),
  );

  /* --- Präferenzen & Ziele (kommen vom Nutzer, nicht von Garmin) --- */
  const prefLines: string[] = [];
  if (prefs.preferredSports.length) prefLines.push(`Bevorzugte Sportarten: ${prefs.preferredSports.join(", ")}.`);
  if (prefs.weeklyHours) prefLines.push(`Verfügbare Zeit: ca. ${prefs.weeklyHours} h/Woche.`);
  if (prefs.timePerSessionMin) prefLines.push(`Typische Einheit: ${prefs.timePerSessionMin} min.`);
  if (prefs.goals.trim()) prefLines.push(`Ziele: ${prefs.goals.trim()}`);
  if (prefs.races.length) {
    prefLines.push(
      `Wettkämpfe: ${prefs.races
        .map((r) => `${r.name} am ${r.date}${r.priority ? ` (Prio ${r.priority})` : ""}`)
        .join("; ")}.`,
    );
    const next = [...prefs.races].filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const weeks = Math.round((new Date(next.date).getTime() - new Date(today).getTime()) / (7 * 86400000));
      prefLines.push(`Nächster Wettkampf "${next.name}" in ${weeks} Wochen.`);
    }
  }
  if (prefs.injuries.trim()) prefLines.push(`WICHTIG – Beschwerden/Verletzungen: ${prefs.injuries.trim()}`);
  out.push(prefLines.length ? `NUTZERANGABEN:\n${prefLines.join("\n")}` : "NUTZERANGABEN: keine hinterlegt (Ziele, Wettkämpfe, Verletzungen unbekannt).");

  /* --- Form / Belastung --- */
  if (last) {
    out.push(
      `FORM (Stand ${last.date}): Fitness CTL ${last.ctl.toFixed(0)}, Ermüdung ATL ${last.atl.toFixed(0)}, ` +
        `Form TSB ${last.tsb > 0 ? "+" : ""}${last.tsb.toFixed(0)}, Belastungsquote ACWR ${last.acwr ?? "–"}. ` +
        `Deutung: TSB über +5 frisch, -10 bis +5 neutral, unter -25 stark ermüdet. ACWR über 1.5 = Verletzungsrisiko.`,
    );
    const trend28 = loadTrend.at(-29);
    if (trend28) out.push(`CTL-Trend: ${trend28.ctl.toFixed(0)} vor 4 Wochen → ${last.ctl.toFixed(0)} heute.`);
  }

  const balMap = fitness.training_status?.mostRecentTrainingLoadBalance?.metricsTrainingLoadBalanceDTOMap;
  const bal = balMap ? Object.values(balMap)[0] : null;
  if (bal) {
    const fmtBand = (have?: number, min?: number, max?: number) =>
      have == null ? "–" : `${have.toFixed(0)} (Ziel ${min?.toFixed(0)}–${max?.toFixed(0)})`;
    out.push(
      `GARMIN LOAD-BALANCE (4 Wochen): niedrig-aerob ${fmtBand(bal.monthlyLoadAerobicLow, bal.monthlyLoadAerobicLowTargetMin, bal.monthlyLoadAerobicLowTargetMax)}, ` +
        `hoch-aerob ${fmtBand(bal.monthlyLoadAerobicHigh, bal.monthlyLoadAerobicHighTargetMin, bal.monthlyLoadAerobicHighTargetMax)}, ` +
        `anaerob ${fmtBand(bal.monthlyLoadAnaerobic, bal.monthlyLoadAnaerobicTargetMin, bal.monthlyLoadAnaerobicTargetMax)}. ` +
        `Bewertung: ${bal.trainingBalanceFeedbackPhrase ?? "–"}.`,
    );
  }

  /* --- Erholung --- */
  const rec: string[] = [];
  const sleep = (daily.sleep_scores ?? []).slice(-7);
  rec.push(
    sleep.length
      ? `Schlaf (letzte Nächte mit Uhr): ${sleep.map((s) => `${s.date} Score ${s.score ?? "?"}/${fmtDur(s.total_s, { short: true })}`).join(" · ")}`
      : "Schlaf: keine Daten.",
  );
  const bb = (daily.body_battery ?? []).filter((b) => b.highest != null).slice(-5);
  rec.push(bb.length ? `Body Battery (Hoch/Tief): ${bb.map((b) => `${b.date} ${b.highest}/${b.lowest}`).join(" · ")}` : "Body Battery: keine Daten.");
  const rhrRows = (daily.rhr ?? []).filter((r) => r.values?.restingHR != null);
  const rhrLast = rhrRows.at(-1);
  const rhrBase = median(rhrRows.slice(-30).map((r) => r.values.restingHR));
  rec.push(
    rhrLast
      ? `Ruhepuls: ${rhrLast.values.restingHR} bpm am ${rhrLast.calendarDate}${rhrBase ? ` (30-Tage-Median ${rhrBase.toFixed(0)} bpm — Abweichung ${(rhrLast.values.restingHR! - rhrBase).toFixed(0)})` : ""}.`
      : "Ruhepuls: keine Daten.",
  );
  const stress = (daily.stress ?? []).filter((s) => s.values?.overallStressLevel != null).slice(-3);
  if (stress.length) rec.push(`Stress-Ø: ${stress.map((s) => `${s.calendarDate} ${s.values.overallStressLevel}`).join(" · ")}`);
  out.push(`ERHOLUNG:\n${rec.join("\n")}`);

  /* --- Was fehlt: explizit benennen, damit nichts erfunden wird --- */
  out.push(
    "NICHT VERFÜGBAR (Gerät liefert es nicht — niemals schätzen oder erfinden): " +
      "HRV/HRV-Status, Training Readiness, Muskelbelastung, Regenerationszeit-Countdown, FTP (nie gesetzt), Rad-Leistungsdaten.",
  );

  /* --- Letzte Einheiten --- */
  out.push(`LETZTE EINHEITEN (neueste zuerst):\n${activities.slice(0, 14).map(describeActivity).join("\n")}`);

  const gapDays = activities[0] ? Math.round((new Date(today).getTime() - new Date(activities[0].date).getTime()) / 86400000) : null;
  if (gapDays != null) out.push(`Letzte Einheit war vor ${gapDays} Tag(en).`);

  /* --- Wochenvolumen --- */
  const weeks = weeklyRollup(activities).slice(-6);
  out.push(
    `WOCHENVOLUMEN (letzte 6):\n${weeks
      .map((w) => `KW ab ${w.start}: ${w.count} Einheiten, ${(w.duration / 3600).toFixed(1)} h, Last ${w.load.toFixed(0)}`)
      .join("\n")}`,
  );

  /* --- Prognosen & Rekorde --- */
  const rp = fitness.race_predictions;
  if (rp) {
    out.push(
      `RACE-PROGNOSEN (Garmin): 5 km ${fmtTime(rp.time5K)}, 10 km ${fmtTime(rp.time10K)}, ` +
        `HM ${fmtTime(rp.timeHalfMarathon)}, Marathon ${fmtTime(rp.timeMarathon)}.`,
    );
  }
  if (vo2Series.length > 1) {
    const first = vo2Series[0];
    out.push(`VO2MAX-VERLAUF: ${first.vo2max!.toFixed(1)} (${first.date}) → ${vo2Series.at(-1)!.vo2max!.toFixed(1)} (${vo2Series.at(-1)!.date}).`);
  }

  return out.join("\n\n");
}

function describeActivity(a: Activity): string {
  const bits: string[] = [`${a.date} ${typeLabel(a.typeKey)}`];
  if (a.distance) bits.push(fmtKm(a.distance));
  bits.push(fmtDur(a.duration, { short: true }));
  if (a.group === "run" && a.distance && a.duration) bits.push(fmtPace(a.duration / (a.distance / 1000)));
  if (a.group === "ride" && a.distance && a.duration) bits.push(`${((a.distance / 1000) / (a.duration / 3600)).toFixed(1)} km/h`);
  if (a.averageHR) bits.push(`Ø${Math.round(a.averageHR)} bpm`);
  if (a.activityTrainingLoad) bits.push(`Last ${Math.round(a.activityTrainingLoad)}`);
  if (a.aerobicTrainingEffect) bits.push(`TE ${a.aerobicTrainingEffect.toFixed(1)}`);
  if (a.trainingEffectLabel && a.trainingEffectLabel !== "UNKNOWN") bits.push(a.trainingEffectLabel);
  if (a.elevationGain && a.elevationGain > 50) bits.push(`${Math.round(a.elevationGain)} hm`);
  return `- ${bits.join(", ")}`;
}

function weeklyRollup(activities: Activity[]) {
  const weeks = new Map<string, { start: string; count: number; duration: number; load: number }>();
  for (const a of activities) {
    const d = new Date(`${a.date}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const start = d.toISOString().slice(0, 10);
    const w = weeks.get(start) ?? { start, count: 0, duration: 0, load: 0 };
    w.count += 1;
    w.duration += a.duration ?? 0;
    w.load += a.activityTrainingLoad ?? 0;
    weeks.set(start, w);
  }
  return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}
