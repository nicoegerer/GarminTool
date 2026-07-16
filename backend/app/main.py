import logging
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.session import SessionLocal, init_db
from app.garmin_client import NotLoggedInError, get_client
from app.routers import activities, dashboard, gear, plans, trends
from app.routers import settings as settings_router
from app.sync import sync_all

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

scheduler = BackgroundScheduler()


def scheduled_sync() -> None:
    db = SessionLocal()
    try:
        client = get_client()
        sync_all(client, db)
        logger.info("Scheduled sync completed")
    except NotLoggedInError:
        logger.warning("Scheduled sync skipped: not logged in yet (see backend/scripts/login.py)")
    except Exception:
        logger.exception("Scheduled sync failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.add_job(scheduled_sync, "interval", minutes=settings.sync_interval_minutes, id="garmin_sync")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Garmin Manager", lifespan=lifespan)

app.include_router(dashboard.router)
app.include_router(activities.router)
app.include_router(trends.router)
app.include_router(gear.router)
app.include_router(plans.router)
app.include_router(settings_router.router)

_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
