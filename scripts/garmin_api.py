"""Garmin Connect authentication and persistent, encrypted DI token rotation."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)
from strava_api import write_private

DEFAULT_TOKEN_DIR = Path(".garmin_tokens")


class GarminConfigurationError(ValueError):
    pass


def validate_tokens(value: object) -> dict:
    if not isinstance(value, dict) or not all(
        isinstance(value.get(key), str) and value[key].strip()
        for key in ("di_token", "di_refresh_token", "di_client_id")
    ):
        raise GarminConfigurationError(
            "GARMIN_TOKENS_JSON benötigt neue DI-Tokens. Alte garth-Tokens sind "
            "nicht kompatibel. Einmal 'uv run scripts/setup_garmin_token.py' "
            "ausführen und das Secret durch die erzeugte garmin_tokens.json ersetzen."
        )
    return {key: value[key] for key in ("di_token", "di_refresh_token", "di_client_id")}


class TokenState:
    def __init__(self, configured: dict, directory: Path):
        seed = json.dumps(configured, sort_keys=True, separators=(",", ":")).encode()
        digest = hashlib.sha256(b"garmintool-connect-di-v1:" + seed).digest()
        self.cipher = Fernet(base64.urlsafe_b64encode(digest))
        self.path = directory / f"garmin-{hashlib.sha256(digest).hexdigest()[:24]}.enc"
        self.tokens = configured
        if self.path.exists():
            try:
                self.tokens = validate_tokens(
                    json.loads(self.cipher.decrypt(self.path.read_bytes()))
                )
            except (InvalidToken, ValueError):
                raise GarminConfigurationError(
                    "Verschlüsselter Garmin-Tokenstatus beschädigt. "
                    "setup_garmin_token.py erneut ausführen und das Secret ersetzen."
                ) from None
        self._saved = self.tokens

    def save(self, value: dict) -> None:
        tokens = validate_tokens(value)
        if tokens != self._saved or not self.path.exists():
            write_private(self.path, self.cipher.encrypt(json.dumps(tokens).encode()))
            self._saved = tokens


class GarminClient:
    """Small exporter adapter; requests use python-garminconnect 0.3.20."""

    def __init__(self, api: Garmin, persist=lambda: None):
        self.api = api
        self.persist = persist

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def close(self):
        try:
            self.persist()
        finally:
            for name in ("cs", "_api_session"):
                session = getattr(self.api.client, name, None)
                if session is not None:
                    session.close()

    def __getattr__(self, name):
        method = getattr(self.api, name)
        if not callable(method):
            return method

        def call(*args, **kwargs):
            try:
                return method(*args, **kwargs)
            finally:
                # A later API error must not discard a refreshed DI token.
                self.persist()

        return call

    def get_user_profile_settings(self):
        return {
            "displayName": self.api.get_full_name(),
            "measurementSystem": self.api.get_unit_system(),
        }

    def search_activities(self, *, start, limit):
        return self.get_activities(start, limit)

    def get_daily_stress(self, start, end):
        return self.get_daily_stress_stats(str(start), str(end))

    def get_daily_steps(self, start, end):
        return self.__getattr__("get_daily_steps")(str(start), str(end))

    def get_daily_summaries(self, start, end):
        return self.__getattr__("get_daily_summaries")(str(start), str(end))

    def get_daily_sleep_summaries(self, start, end):
        return self.connectapi(
            "/sleep-service/sleep/dailySleepSummariesByDate",
            params={"startDate": str(start), "endDate": str(end)},
        )

    def get_daily_hrv_summaries(self, start, end):
        return self.get_hrv_data_range(str(start), str(end))

    def get_daily_body_battery(self, start, end):
        return self.get_body_battery(str(start), str(end))

    def get_weight_measurements(self, start, end):
        return self.connectapi(
            f"/weight-service/weight/range/{start}/{end}",
            params={"includeAll": "true"},
        )

    def get_fitness_age(self, day):
        return self.get_fitness_age_details(str(day))

    def get_heart_rate_zones(self):
        return self.get_heart_rate_zones_v2(generate_defaults=False)

    def download_activity(self, activity_id):
        return self.__getattr__("download_activity")(
            activity_id, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL
        )


def create_client() -> GarminClient:
    logging.getLogger("garminconnect").setLevel(logging.CRITICAL)
    raw = os.environ.get("GARMIN_TOKENS_JSON", "").strip()
    api = Garmin(retry_attempts=1)
    if raw:
        try:
            configured = validate_tokens(json.loads(raw))
        except json.JSONDecodeError:
            raise GarminConfigurationError(
                "GARMIN_TOKENS_JSON ist kein gültiges JSON."
            ) from None
        state = TokenState(
            configured, Path(os.environ.get("GARMIN_STATE_DIR", ".api-state"))
        )

        def persist():
            state.save(json.loads(api.client.dumps()))

        try:
            api.login(json.dumps(state.tokens))
        finally:
            if api.client.is_authenticated:
                persist()
    else:
        directory = Path(
            os.environ.get("GARMINTOKENS", str(DEFAULT_TOKEN_DIR))
        ).expanduser()
        if not (directory / "garmin_tokens.json").is_file():
            raise GarminConfigurationError(
                "Garmin-Token fehlt. 'uv run scripts/setup_garmin_token.py' ausführen "
                "und für Actions GARMIN_TOKENS_JSON hinterlegen."
            )
        api.login(str(directory))

        def persist():
            api.client.dump(str(directory))

    return GarminClient(api, persist)


def authentication_failed(exc: Exception) -> bool:
    current = exc
    seen = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(
            current,
            (GarminConnectAuthenticationError, GarminConnectTooManyRequestsError),
        ):
            return True
        if getattr(getattr(current, "response", None), "status_code", None) in (
            401,
            403,
            427,
            429,
        ):
            return True
        current = current.__cause__ or current.__context__
    return False


def error_message(exc: Exception) -> str:
    """Never include Garmin response bodies, URLs, credentials or token values."""
    if isinstance(exc, GarminConfigurationError):
        return str(exc)
    if isinstance(exc, GarminConnectTooManyRequestsError):
        return "Garmin-Anfragelimit erreicht. Später erneut versuchen."
    if authentication_failed(exc):
        return "Garmin-Anmeldung abgelehnt. setup_garmin_token.py erneut ausführen und GARMIN_TOKENS_JSON ersetzen."
    return f"{type(exc).__name__}: Garmin-Anfrage fehlgeschlagen. Letzter Datenstand bleibt erhalten."
