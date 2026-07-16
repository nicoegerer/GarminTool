from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("")
def list_plans(db: Session = Depends(get_db)):
    rows = db.execute(select(models.TrainingPlan)).scalars().all()
    return [
        {
            "plan_id": p.plan_id,
            "name": p.name,
            "plan_type": p.plan_type,
            "start_date": p.start_date.isoformat() if p.start_date else None,
            "end_date": p.end_date.isoformat() if p.end_date else None,
        }
        for p in rows
    ]


@router.get("/workouts/upcoming")
def upcoming_workouts(db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(models.Workout)
            .where(models.Workout.scheduled_date >= date.today())
            .order_by(models.Workout.scheduled_date)
        )
        .scalars()
        .all()
    )
    return [
        {
            "workout_id": w.workout_id,
            "name": w.name,
            "scheduled_date": w.scheduled_date.isoformat() if w.scheduled_date else None,
            "sport_type": w.sport_type,
            "plan_id": w.plan_id,
        }
        for w in rows
    ]
