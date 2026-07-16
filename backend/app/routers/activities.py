import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("")
def list_activities(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    type_key: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(models.Activity).order_by(models.Activity.start_time_local.desc())
    if type_key:
        stmt = stmt.where(models.Activity.type_key == type_key)
    stmt = stmt.offset(offset).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [_summary(a) for a in rows]


@router.get("/{activity_id}")
def get_activity(activity_id: int, db: Session = Depends(get_db)):
    a = db.get(models.Activity, activity_id)
    if not a:
        raise HTTPException(404, "Activity not found")
    detail = _summary(a)
    detail["hr_zones"] = {
        "zone_1": a.hr_zone_1,
        "zone_2": a.hr_zone_2,
        "zone_3": a.hr_zone_3,
        "zone_4": a.hr_zone_4,
        "zone_5": a.hr_zone_5,
    }
    detail["gear"] = [link.gear.name for link in a.gear_links]
    detail["raw"] = json.loads(a.raw_json) if a.raw_json else None
    return detail


def _summary(a: models.Activity) -> dict:
    return {
        "activity_id": a.activity_id,
        "name": a.name,
        "type_key": a.type_key,
        "start_time_local": a.start_time_local.isoformat(),
        "duration_s": a.duration_s,
        "distance_m": a.distance_m,
        "calories": a.calories,
        "average_hr": a.average_hr,
        "max_hr": a.max_hr,
        "aerobic_training_effect": a.aerobic_training_effect,
        "anaerobic_training_effect": a.anaerobic_training_effect,
        "training_effect_label": a.training_effect_label,
        "activity_training_load": a.activity_training_load,
    }
