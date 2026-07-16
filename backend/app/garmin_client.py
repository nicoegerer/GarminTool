from functools import lru_cache
from pathlib import Path

from garminconnect import Garmin

from app.config import settings


class NotLoggedInError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_client() -> Garmin:
    token_dir = Path(settings.garmin_token_dir)
    if not token_dir.exists() or not any(token_dir.iterdir()):
        raise NotLoggedInError(
            "Kein Garmin-Session-Token gefunden. Bitte einmalig "
            "'python backend/scripts/login.py' im eigenen Terminal ausfuehren."
        )

    client = Garmin()
    client.login(str(token_dir))
    return client


def reset_client_cache() -> None:
    get_client.cache_clear()
