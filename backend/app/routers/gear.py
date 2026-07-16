from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db

router = APIRouter(prefix="/api/gear", tags=["gear"])


@router.get("")
def list_gear(db: Session = Depends(get_db)):
    rows = db.execute(select(models.Gear)).scalars().all()
    return [
        {
            "gear_uuid": g.gear_uuid,
            "name": g.name,
            "gear_type_name": g.gear_type_name,
            "total_distance_m": g.total_distance_m,
            "status": g.status,
            "activity_count": len(g.activity_links),
        }
        for g in rows
    ]
