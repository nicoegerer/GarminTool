"""Rule-based, explainable workout recommendation engine.

Deliberately not a black-box model: every recommendation carries a list of
the concrete numbers that drove the decision, so Nico can see *why* and
override it when he disagrees.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models

HARD_EFFECT_LABELS = {"VO2MAX", "ANAEROBIC_CAPACITY", "LACTATE_THRESHOLD", "TEMPO", "SPRINT", "ANAEROBIC"}

EFFECT_TO_CATEGORY = {
    "RECOVERY": "recovery",
    "AEROBIC_BASE": "easy",
    "TEMPO": "tempo",
    "LACTATE_THRESHOLD": "tempo",
    "VO2MAX": "intervals",
    "ANAEROBIC_CAPACITY": "intervals",
    "SPRINT": "intervals",
    "ANAEROBIC": "intervals",
}

SESSION_LABELS = {
    "rest": "Ruhetag",
    "recovery": "Aktive Erholung",
    "easy": "Lockere Einheit (Zone 1-2)",
    "long_run": "Langer Lauf (Zone 2)",
    "tempo": "Tempo-/Schwellenlauf",
    "intervals": "Intervalle / VO2max",
    "strength": "Krafttraining",
}


@dataclass
class TrainingContext:
    today: date
    readiness_score: int | None = None
    readiness_level: str | None = None
    hrv_status: str | None = None
    sleep_score: int | None = None
    body_battery_level: int | None = None
    acute_load: float | None = None
    chronic_load: float | None = None
    training_status_phrase: str | None = None
    days_since_hard_session: int | None = None
    recent_effect_labels: list[str] = field(default_factory=list)
    aerobic_low: float | None = None
    aerobic_low_target_min: float | None = None
    aerobic_high: float | None = None
    aerobic_high_target_min: float | None = None
    anaerobic: float | None = None
    anaerobic_target_min: float | None = None
    scheduled_workout_name: str | None = None

    @property
    def acwr(self) -> float | None:
        if self.acute_load is None or not self.chronic_load:
            return None
        return round(self.acute_load / self.chronic_load, 2)


@dataclass
class Recommendation:
    session_type: str
    title: str
    description: str
    suggested_duration_minutes: int | None
    rationale: list[str]


def recommend(ctx: TrainingContext) -> Recommendation:
    rationale: list[str] = []
    acwr = ctx.acwr

    overreaching = (ctx.training_status_phrase or "").upper().find("OVERREACH") >= 0
    if (acwr is not None and acwr > 1.5) or overreaching or (ctx.readiness_score is not None and ctx.readiness_score < 25):
        if acwr is not None:
            rationale.append(f"Belastungsverhältnis (7-Tage vs. 28-Tage-Schnitt) liegt bei {acwr}, ab 1.5 gilt das als erhöhtes Verletzungsrisiko.")
        if overreaching:
            rationale.append(f"Garmin-Trainingsstatus meldet: {ctx.training_status_phrase}.")
        if ctx.readiness_score is not None and ctx.readiness_score < 25:
            rationale.append(f"Training Readiness ist mit {ctx.readiness_score}/100 sehr niedrig.")
        return Recommendation("rest", SESSION_LABELS["rest"], "Heute ganz auf Belastung verzichten oder nur ganz leicht bewegen (Spaziergang). Der Körper braucht Erholung.", None, rationale)

    low_readiness = ctx.readiness_score is not None and 25 <= ctx.readiness_score < 50
    hrv_off = (ctx.hrv_status or "").upper() in {"UNBALANCED", "LOW"}
    bad_sleep = ctx.sleep_score is not None and ctx.sleep_score < 60
    if low_readiness or hrv_off or bad_sleep:
        if low_readiness:
            rationale.append(f"Training Readiness bei {ctx.readiness_score}/100 (mittel) – heute keine harte Einheit.")
        if hrv_off:
            rationale.append(f"HRV-Status ist '{ctx.hrv_status}', also außerhalb der Balance.")
        if bad_sleep:
            rationale.append(f"Schlaf-Score der letzten Nacht war nur {ctx.sleep_score}/100.")
        return Recommendation("recovery", SESSION_LABELS["recovery"], "Lockere Regenerationseinheit: 30-40 Min, Puls durchgehend in Zone 1-2, Gespräch muss locker möglich sein.", 35, rationale)

    if ctx.scheduled_workout_name:
        rationale.append(f"Für heute ist im Trainingsplan '{ctx.scheduled_workout_name}' vorgesehen.")
        moderate_readiness = ctx.readiness_score is not None and 50 <= ctx.readiness_score < 65
        if moderate_readiness:
            rationale.append(f"Readiness ist mit {ctx.readiness_score}/100 nur mittelgut – Intensität ggf. etwas drosseln.")
        return Recommendation("planned", ctx.scheduled_workout_name, "Geplante Einheit aus deinem Trainingsplan." + (" Intensität bei Bedarf leicht reduzieren." if moderate_readiness else ""), None, rationale)

    recent_categories = [EFFECT_TO_CATEGORY.get(lbl, "easy") for lbl in ctx.recent_effect_labels]
    last_category = recent_categories[0] if recent_categories else None

    candidates: list[tuple[str, float]] = []
    if ctx.aerobic_high is not None and ctx.aerobic_high_target_min is not None:
        deficit = ctx.aerobic_high_target_min - ctx.aerobic_high
        candidates.append(("intervals", deficit))
    if ctx.aerobic_low is not None and ctx.aerobic_low_target_min is not None:
        deficit = ctx.aerobic_low_target_min - ctx.aerobic_low
        candidates.append(("long_run", deficit))
    if ctx.anaerobic is not None and ctx.anaerobic_target_min is not None:
        deficit = ctx.anaerobic_target_min - ctx.anaerobic
        candidates.append(("intervals", deficit))

    candidates.sort(key=lambda c: c[1], reverse=True)
    chosen = None
    for session_type, deficit in candidates:
        if deficit > 0 and session_type != last_category:
            chosen = session_type
            rationale.append(f"Monatliche Trainingslast in dieser Kategorie liegt {abs(round(deficit))} Punkte unter dem Zielbereich.")
            break

    if chosen is None:
        if last_category in {"intervals", "tempo"}:
            chosen = "easy"
            rationale.append("Gestern/zuletzt war eine harte Einheit – heute bewusst locker halten, um die Reize zu variieren.")
        elif ctx.days_since_hard_session is not None and ctx.days_since_hard_session >= 4:
            chosen = "tempo"
            rationale.append(f"Seit {ctx.days_since_hard_session} Tagen keine intensive Einheit mehr – Zeit für einen Reiz.")
        else:
            chosen = "easy"
            rationale.append("Keine besonderen Auffälligkeiten – lockere Grundlageneinheit zur Auffüllung des Trainingsvolumens.")

    duration_map = {"easy": 45, "long_run": 75, "tempo": 40, "intervals": 45, "strength": 45}
    return Recommendation(chosen, SESSION_LABELS.get(chosen, chosen), _description_for(chosen), duration_map.get(chosen), rationale)


def _description_for(session_type: str) -> str:
    return {
        "easy": "Lockerer Grundlagenlauf, Puls in Zone 2, Fokus auf Umfang statt Tempo.",
        "long_run": "Langer, ruhiger Lauf in Zone 2 zum Aufbau der aeroben Basis.",
        "tempo": "Einlaufen, dann 15-20 Min im Schwellentempo (Zone 3-4), lockeres Auslaufen.",
        "intervals": "Einlaufen, dann Intervalle im VO2max-Bereich (z.B. 5-6x 3 Min hart / 2 Min locker), Auslaufen.",
        "strength": "Ganzkörper-Krafttraining, Fokus auf Rumpf und läuferrelevante Muskulatur.",
    }.get(session_type, "")


def build_context(db: Session, today: date | None = None) -> TrainingContext:
    today = today or date.today()
    ctx = TrainingContext(today=today)

    readiness = _latest(db, models.TrainingReadiness, today)
    if readiness:
        ctx.readiness_score = readiness.score
        ctx.readiness_level = readiness.level

    hrv = _latest(db, models.Hrv, today)
    if hrv:
        ctx.hrv_status = hrv.status

    sleep = _latest(db, models.SleepData, today)
    if sleep:
        ctx.sleep_score = sleep.sleep_score

    battery = _latest(db, models.BodyBattery, today)
    if battery:
        ctx.body_battery_level = battery.highest

    status = _latest(db, models.TrainingStatus, today)
    if status:
        ctx.training_status_phrase = status.training_status_phrase
        ctx.aerobic_low = status.monthly_load_aerobic_low
        ctx.aerobic_low_target_min = status.aerobic_low_target_min
        ctx.aerobic_high = status.monthly_load_aerobic_high
        ctx.aerobic_high_target_min = status.aerobic_high_target_min
        ctx.anaerobic = status.monthly_load_anaerobic
        ctx.anaerobic_target_min = status.anaerobic_target_min

    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=28)
    acute = db.execute(
        select(models.Activity).where(models.Activity.start_time_local >= week_ago)
    ).scalars().all()
    chronic = db.execute(
        select(models.Activity).where(models.Activity.start_time_local >= month_ago)
    ).scalars().all()
    ctx.acute_load = sum(a.activity_training_load or 0 for a in acute)
    chronic_total = sum(a.activity_training_load or 0 for a in chronic)
    ctx.chronic_load = (chronic_total / 28) * 7 if chronic_total else None

    recent = sorted(chronic, key=lambda a: a.start_time_local, reverse=True)
    ctx.recent_effect_labels = [a.training_effect_label for a in recent[:7] if a.training_effect_label]

    hard_dates = [a.start_time_local.date() for a in recent if (a.training_effect_label or "") in HARD_EFFECT_LABELS]
    ctx.days_since_hard_session = (today - max(hard_dates)).days if hard_dates else None

    workout = db.execute(
        select(models.Workout).where(models.Workout.scheduled_date == today)
    ).scalars().first()
    if workout:
        ctx.scheduled_workout_name = workout.name

    return ctx


def _latest(db: Session, model: type, today: date, lookback_days: int = 7):
    stmt = (
        select(model)
        .where(model.date <= today, model.date >= today - timedelta(days=lookback_days))
        .order_by(model.date.desc())
    )
    return db.execute(stmt).scalars().first()
