import type { GarminData } from "../types";
import type { UserPrefs } from "../prefs";
import { buildContext } from "./context";

export type Intensity = "auto" | "recovery" | "easy" | "moderate" | "hard";
export type Focus = "auto" | "endurance" | "speed" | "strength" | "recovery" | "technique";
export type Venue = "auto" | "indoor" | "outdoor";

export interface CoachParams {
  sport: string; // "auto" | SportGroup
  intensity: Intensity;
  durationMin: number | null;
  focus: Focus;
  venue: Venue;
  /** Bumped by "Neu generieren" so the model doesn't repeat itself verbatim. */
  nonce?: number;
}

export const DEFAULT_PARAMS: CoachParams = {
  sport: "auto",
  intensity: "auto",
  durationMin: null,
  focus: "auto",
  venue: "auto",
};

const SPORT_LABEL: Record<string, string> = {
  auto: "freie Wahl — entscheide selbst, welche Sportart heute am meisten bringt",
  run: "Laufen",
  ride: "Radfahren",
  swim: "Schwimmen",
  gym: "Krafttraining",
  hike: "Wandern",
  walk: "Spazieren",
};

const INTENSITY_LABEL: Record<Intensity, string> = {
  auto: "du entscheidest anhand der Datenlage",
  recovery: "Regeneration (Zone 1)",
  easy: "locker (Zone 2)",
  moderate: "moderat/Tempo (Zone 3–4)",
  hard: "hart (Zone 4–5)",
};

const FOCUS_LABEL: Record<Focus, string> = {
  auto: "du entscheidest",
  endurance: "Ausdauer / aerobe Basis",
  speed: "Schnelligkeit / VO2max",
  strength: "Kraft",
  recovery: "Regeneration",
  technique: "Technik",
};

const VENUE_LABEL: Record<Venue, string> = {
  auto: "egal",
  indoor: "drinnen",
  outdoor: "draußen",
};

/**
 * The coach persona.
 *
 * Deliberately verbose about *reasoning*: the ask is a real coach, not a plan
 * generator. The hard rules exist because the model is talking to one specific
 * athlete about his own body — a fabricated HRV reading or a hard session on a
 * wrecked day is the failure mode that matters.
 */
export const COACH_SYSTEM = `Du bist der persönliche Trainingscoach von Nico — ein erfahrener Triathlon-Coach mit sportwissenschaftlichem Hintergrund. Du duzt ihn und sprichst Deutsch.

DEINE HALTUNG
Du kennst diesen Athleten. Du redest knapp und fundiert, wie ein Coach, der weiß, dass Nico wenig Zeit hat. Kein Volltext, keine Vorträge. Du schlägst ein Training vor — die Begründung hältst du für den Fall zurück, dass er nachfragt.

HARTE REGELN
0. Antworte AUSSCHLIESSLICH auf Deutsch — immer, egal in welcher Sprache die Frage oder die Daten formuliert sind. Kein Wort Englisch außer etablierten Fachbegriffen (VO2max, Zone 2, Threshold).
1. Stütze JEDE Aussage auf die Daten unten. Erfinde niemals Werte. Wenn etwas unter "NICHT VERFÜGBAR" steht, existiert es nicht — sag "dazu habe ich keine Daten", statt zu schätzen.
2. Wenn Beschwerden/Verletzungen hinterlegt sind, haben sie Vorrang. Bei akuten Schmerzen: keine Belastungsempfehlung, sondern Hinweis auf ärztliche Abklärung. Du bist Coach, kein Arzt.
3. Rechne nach, bevor du behauptest. TSB, ACWR und Load-Balance stehen als Zahlen da — nutze sie, aber schütte sie nicht ungefragt aus.
4. Widersprich, wenn nötig. Wenn Nico eine harte Einheit will und die Daten sagen nein, sag es in einem Satz — die Details erklärst du, wenn er fragt.

FORMAT DES TRAININGSVORSCHLAGS
Halte dich KURZ — insgesamt höchstens ~120 Wörter. Struktur:
- Eine Zeile Einordnung: welche Sportart/Intensität heute und in einem Halbsatz warum (z. B. "Lockerer Dauerlauf — dein TSB ist tief, heute wird regeneriert.").
- Dann die Einheit kompakt: Aufwärmen / Hauptteil / Ausfahren mit Dauer und Pulszone bzw. Pace. Gern als kurze Zeilen.
- Zum Schluss ein Satz: "Frag nach, wenn du wissen willst, warum."
Keine Physiologie-Vorträge, keine Aufzählung aller Metriken, keine Emojis, kein "Los geht's". Erst wenn Nico im Chat nach dem Warum fragt, erklärst du — dann auch nur so ausführlich wie nötig.`;

export function coachPrompt(params: CoachParams, data: GarminData, prefs: UserPrefs): string {
  const wish: string[] = [];
  wish.push(`- Sportart: ${SPORT_LABEL[params.sport] ?? params.sport}`);
  wish.push(`- Intensität: ${INTENSITY_LABEL[params.intensity]}`);
  wish.push(`- Dauer: ${params.durationMin ? `${params.durationMin} Minuten` : "du entscheidest"}`);
  wish.push(`- Fokus: ${FOCUS_LABEL[params.focus]}`);
  wish.push(`- Ort: ${VENUE_LABEL[params.venue]}`);

  const doneToday = data.activities.filter((a) => a.date === data.today);
  const doneNote = doneToday.length
    ? `\nACHTUNG: Heute wurde bereits trainiert (${doneToday.map((a) => a.activityName || a.typeKey).join(", ")}). Berücksichtige das — ggf. ist eine zweite Einheit unpassend oder muss regenerativ sein.`
    : "";

  const variation = params.nonce
    ? "\nHinweis: Nico hat um einen alternativen Vorschlag gebeten. Wähle bewusst einen anderen Ansatz als naheliegend wäre — aber nur, wenn er physiologisch vertretbar ist. Wenn die Datenlage wirklich nur eine sinnvolle Antwort zulässt, sag das ehrlich und begründe es neu."
    : "";

  return `Heute ist ${new Date(data.today).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.

Nico möchte einen Trainingsvorschlag für heute. Seine Vorgaben:
${wish.join("\n")}${doneNote}${variation}

=== DATENLAGE ===
${buildContext(data, prefs)}`;
}

/** Same context, but for the free-form chat rather than a session proposal. */
export function chatPrompt(data: GarminData, prefs: UserPrefs): string {
  return `${COACH_SYSTEM}

Nico stellt dir jetzt Fragen zu seinem Training. Antworte kurz und auf den Punkt — meist 2–4 Sätze. Erklär nur das, wonach er fragt; hol nicht aus. Nur wenn er ausdrücklich um Tiefe bittet, gehst du weiter ins Detail. Dieselben harten Regeln gelten: nur Daten, nichts erfinden.

Heute ist ${new Date(data.today).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.

=== DATENLAGE ===
${buildContext(data, prefs)}`;
}
