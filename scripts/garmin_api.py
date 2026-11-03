"""Shared authentication for Garmin's official, read-only Personal API."""

from pathlib import Path
from urllib.parse import urlsplit

from garmin_personal_api import (
    GarminPersonalApiClient,
    PersonalApiAuthenticator,
    resolve_api_key,
)
from garmin_personal_api.errors import HttpError


def create_client(api_key: str | None = None) -> GarminPersonalApiClient:
    cache = Path(".api-state/garmin-bearer.json")
    cache.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with PersonalApiAuthenticator(bearer_token_cache_file=cache) as auth:
        token = auth.obtain_token(resolve_api_key(api_key=api_key))
    return GarminPersonalApiClient(token.access_token)


def error_message(exc: Exception) -> str:
    """Keep response bodies and credentials out of logs and public manifests."""
    if isinstance(exc, HttpError):
        return f"Garmin Personal API: HTTP {exc.status_code} ({urlsplit(exc.url).path})"
    return (
        f"{type(exc).__name__}: Anfrage oder lokale API-Konfiguration fehlgeschlagen."
    )


def authentication_failed(exc: Exception) -> bool:
    return isinstance(exc, HttpError) and exc.status_code in (401, 403)
