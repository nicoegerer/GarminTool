from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.db.session import get_db
from app.garmin_client import NotLoggedInError, get_client
from app.sync import sync_all

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/sync-status")
def sync_status(db: Session = Depends(get_db)):
    last = db.execute(select(models.SyncLog).order_by(models.SyncLog.ran_at.desc())).scalars().first()
    try:
        get_client()
        logged_in = True
    except NotLoggedInError:
        logged_in = False
    return {
        "logged_in": logged_in,
        "last_sync_at": last.ran_at.isoformat() if last else None,
        "last_sync_success": last.success if last else None,
        "last_sync_detail": last.detail if last else None,
    }


@router.post("/sync")
def trigger_sync(db: Session = Depends(get_db)):
    try:
        client = get_client()
    except NotLoggedInError as exc:
        raise HTTPException(400, str(exc)) from exc
    detail = sync_all(client, db)
    return {"detail": detail}
