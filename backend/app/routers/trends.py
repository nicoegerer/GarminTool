from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/trends", tags=["trends"])

_METRIC_MODELS: dict[str, tuple[type, list[str]]] = {
    "vo2max": (models.Vo2Max, ["vo2max_value", "vo2max_precise"]),
    "resting_hr": (models.DailySummary, ["resting_heart_rate"]),
    "hrv": (models.Hrv, ["last_night_avg"]),
    "weight": (models.WeighIn, ["weight_kg"]),
    "sleep_score": (models.SleepData, ["sleep_score"]),
    "training_load": (models.TrainingStatus, ["weekly_training_load"]),
    "steps": (models.DailySummary, ["total_steps"]),
    "stress": (models.DailySummary, ["avg_stress_level"]),
    "body_battery": (models.BodyBattery, ["charged", "drained", "highest", "lowest"]),
    "race_predictions": (
        models.RacePrediction,
        ["time_5k_s", "time_10k_s", "time_half_marathon_s", "time_marathon_s"],
    ),
}


@router.get("")
def list_metrics():
    return sorted(_METRIC_MODELS)


@router.get("/{metric}")
def get_trend(metric: str, days: int = Query(90, ge=1, le=730), db: Session = Depends(get_db)):
    if metric not in _METRIC_MODELS:
        raise HTTPException(404, f"Unbekannte Metrik. Verfuegbar: {sorted(_METRIC_MODELS)}")
    model, fields = _METRIC_MODELS[metric]
    since = date.today() - timedelta(days=days)
    rows = db.execute(select(model).where(model.date >= since).order_by(model.date)).scalars().all()
    return [{"date": r.date.isoformat(), **{f: getattr(r, f) for f in fields}} for r in rows]
