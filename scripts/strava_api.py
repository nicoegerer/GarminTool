"""Official Strava OAuth/API client with encrypted, persistent token rotation."""

import base64
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

DEFAULT_CONFIG = Path("strava-sync-local/config.json")


class StravaError(RuntimeError):
    pass


def write_private(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(content)
    temporary.chmod(0o600)
    temporary.replace(path)


def load_config(path: Path = DEFAULT_CONFIG) -> dict:
    raw = os.environ.get("STRAVA_CONFIG_JSON", "").strip()
    if not raw:
        if not path.exists():
            raise StravaError(
                "Strava-Konfiguration fehlt. Zuerst namen_sync.py --setup ausführen."
            )
        raw = path.read_text(encoding="utf-8")
    try:
        config = json.loads(raw)
        if not isinstance(config, dict) or not all(
            config.get(key) for key in ("strava_client_id", "strava_client_secret")
        ):
            raise ValueError
    except (ValueError, TypeError):
        raise StravaError(
            "STRAVA_CONFIG_JSON/config.json: Client ID oder Client Secret fehlt."
        ) from None
    return config


def request_json(url: str, *, data: dict | None = None, token: str | None = None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    payload = urllib.parse.urlencode(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Do not log response bodies, authorization codes or tokens.
        raise StravaError(f"Strava API: HTTP {exc.code}.") from None
    except (urllib.error.URLError, ValueError):
        raise StravaError(
            "Strava API: Netzwerkfehler oder ungültige Antwort."
        ) from None


def post_token(config: dict, **payload) -> dict:
    token = request_json(
        "https://www.strava.com/oauth/token",
        data={
            **payload,
            "client_id": config["strava_client_id"],
            "client_secret": config["strava_client_secret"],
        },
    )
    if not isinstance(token, dict) or not all(
        token.get(key) for key in ("access_token", "refresh_token", "expires_at")
    ):
        raise StravaError("Strava hat keine vollständigen OAuth-Tokens geliefert.")
    return {key: token[key] for key in ("access_token", "refresh_token", "expires_at")}


class StravaClient:
    def __init__(self, config: dict, state_dir: Path | None = None):
        self.config = config
        state_dir = state_dir or Path(os.environ.get("STRAVA_STATE_DIR", ".api-state"))
        # Changing the configured credentials starts a separate token history.
        seed = json.dumps(
            [
                str(config.get(key, ""))
                for key in (
                    "strava_client_id",
                    "strava_client_secret",
                    "strava_refresh_token",
                )
            ],
            separators=(",", ":"),
        ).encode()
        digest = hashlib.sha256(seed).digest()
        self.cache_id = hashlib.sha256(digest).hexdigest()[:24]
        self.cipher = Fernet(base64.urlsafe_b64encode(digest))
        self.state_path = state_dir / f"strava-{self.cache_id}.enc"
        self.state = {}
        if self.state_path.exists():
            try:
                self.state = json.loads(
                    self.cipher.decrypt(self.state_path.read_bytes())
                )
                if not isinstance(self.state, dict) or not self.state.get(
                    "refresh_token"
                ):
                    raise ValueError
            except (InvalidToken, ValueError):
                raise StravaError(
                    "Verschlüsselter Strava-Tokenstatus ist beschädigt. OAuth-Setup erneut ausführen."
                ) from None

    def save_token(self, token: dict) -> None:
        # Persist before querying activities: rotation survives a later failure.
        write_private(self.state_path, self.cipher.encrypt(json.dumps(token).encode()))
        self.state = token

    def access_token(self) -> str:
        if (
            self.state.get("access_token")
            and self.state.get("expires_at", 0) > time.time() + 60
        ):
            return self.state["access_token"]
        refresh = self.state.get("refresh_token") or self.config.get(
            "strava_refresh_token"
        )
        if not refresh:
            raise StravaError(
                "Strava Refresh-Token fehlt. Zuerst namen_sync.py --setup ausführen."
            )
        token = post_token(
            self.config, grant_type="refresh_token", refresh_token=refresh
        )
        self.save_token(token)
        return token["access_token"]

    def activities(self, after: int) -> list[dict]:
        token = self.access_token()
        result, page = [], 1
        while True:
            query = urllib.parse.urlencode(
                {"after": after, "per_page": 100, "page": page}
            )
            batch = request_json(
                "https://www.strava.com/api/v3/athlete/activities?" + query, token=token
            )
            if not isinstance(batch, list) or any(
                not isinstance(row, dict) for row in batch
            ):
                raise StravaError("Strava hat keine gültige Aktivitätsliste geliefert.")
            result.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return result
