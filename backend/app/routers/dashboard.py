from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.recommendations import build_context, recommend

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/today")
def get_today(db: Session = Depends(get_db)):
    ctx = build_context(db)
    rec = recommend(ctx)
    recent = (
        db.execute(select(models.Activity).order_by(models.Activity.start_time_local.desc()).limit(5))
        .scalars()
        .all()
    )
    return {
        "recommendation": {
            "session_type": rec.session_type,
            "title": rec.title,
            "description": rec.description,
            "suggested_duration_minutes": rec.suggested_duration_minutes,
            "rationale": rec.rationale,
        },
        "context": {
            "readiness_score": ctx.readiness_score,
            "readiness_level": ctx.readiness_level,
            "hrv_status": ctx.hrv_status,
            "sleep_score": ctx.sleep_score,
            "body_battery_level": ctx.body_battery_level,
            "training_status_phrase": ctx.training_status_phrase,
            "acute_load": ctx.acute_load,
            "chronic_load": ctx.chronic_load,
            "acwr": ctx.acwr,
            "days_since_hard_session": ctx.days_since_hard_session,
        },
        "recent_activities": [_activity_summary(a) for a in recent],
    }


def _activity_summary(a: models.Activity) -> dict:
    return {
        "activity_id": a.activity_id,
        "name": a.name,
        "type_key": a.type_key,
        "start_time_local": a.start_time_local.isoformat(),
        "duration_s": a.duration_s,
        "distance_m": a.distance_m,
        "calories": a.calories,
        "average_hr": a.average_hr,
        "training_effect_label": a.training_effect_label,
    }
