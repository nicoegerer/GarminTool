# /// script
# requires-python = ">=3.12"
# dependencies = ["cryptography>=46,<51"]
# ///
"""Use official Strava OAuth to apply activity names to the local dashboard.

    uv run scripts/namen_sync.py --setup
    uv run scripts/namen_sync.py --execute [--out docs/data]

Garmin's Personal API is read-only. This script updates exported JSON and never
writes to Garmin Connect. STRAVA_CONFIG_JSON remains compatible with old setups.
"""

import argparse
import getpass
import http.server
import json
import re
import secrets
import sys
import time
import urllib.parse
import webbrowser
from datetime import UTC, datetime, timedelta
from pathlib import Path

from strava_api import (
    DEFAULT_CONFIG,
    StravaClient,
    StravaError,
    load_config,
    post_token,
    write_private,
)

PORT = 8721
STANDARD = re.compile(
    r"^(Morning|Lunch|Afternoon|Evening|Night)\s+"
    r"(Run|Ride|Swim|Walk|Hike|Hiking|Workout|Weight Training|Elliptical|Yoga|"
    r"Velomobile|E-Bike Ride|Gravel Ride|Mountain Bike Ride|Virtual Ride|Virtual Run)$",
    re.IGNORECASE,
)


def setup(path: Path) -> None:
    if path.exists():
        config = load_config(path)
    else:
        config = {
            "strava_client_id": input("Strava Client ID: ").strip(),
            "strava_client_secret": getpass.getpass("Strava Client Secret: ").strip(),
        }
    if not config.get("strava_client_id") or not config.get("strava_client_secret"):
        raise StravaError("Client ID und Client Secret sind erforderlich.")
    state = secrets.token_urlsafe(32)
    callback = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            query = urllib.parse.parse_qs(parsed.query)
            if parsed.path != "/callback" or not secrets.compare_digest(
                query.get("state", [""])[0], state
            ):
                self.send_error(400, "Invalid OAuth state")
                return
            callback.update({key: values[0] for key, values in query.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                "Zurück zum Terminal. Du kannst dieses Fenster schließen.".encode()
            )

        def log_message(self, *args):
            pass  # The callback URL contains a secret authorization code.

    url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode(
        {
            "client_id": config["strava_client_id"],
            "redirect_uri": f"http://localhost:{PORT}/callback",
            "response_type": "code",
            "approval_prompt": "force",
            "scope": "activity:read_all",
            "state": state,
        }
    )
    with http.server.HTTPServer(("127.0.0.1", PORT), Handler) as server:
        server.timeout = 1
        print("Strava-Freigabe im Browser öffnen:\n" + url)
        webbrowser.open(url)
        deadline = time.monotonic() + 180
        while not callback and time.monotonic() < deadline:
            server.handle_request()
    if callback.get("error") or not callback.get("code"):
        raise StravaError("Keine Strava-Freigabe erhalten oder Zeit abgelaufen.")
    scopes = set(callback.get("scope", "").replace(",", " ").split())
    if "activity:read_all" not in scopes:
        raise StravaError(
            "Die Strava-Freigabe activity:read_all ist für private Aktivitäten erforderlich."
        )
    token = post_token(config, grant_type="authorization_code", code=callback["code"])
    config["strava_refresh_token"] = token["refresh_token"]
    write_private(path, json.dumps(config, ensure_ascii=False, indent=2).encode())
    StravaClient(config).save_token(token)
    print(
        f"OAuth eingerichtet. {path} als Secret STRAVA_CONFIG_JSON hinterlegen. Keine Tokens in Logs kopieren."
    )


def local_time(raw):
    try:
        # Strava's start_date_local ends in Z but encodes the local wall clock.
        return datetime.fromisoformat(raw).replace(tzinfo=None)
    except (ValueError, TypeError, AttributeError):
        return None


def sport_group(value: str) -> str:
    value = value.lower().replace("_", "")
    if "run" in value:
        return "run"
    if any(word in value for word in ("ride", "bik", "cycl")):
        return "ride"
    if "swim" in value:
        return "swim"
    if "hike" in value or "hiking" in value:
        return "hike"
    if "walk" in value:
        return "walk"
    if "weighttraining" in value or "strength" in value:
        return "strength"
    return value


def pair_up(strava: list[dict], garmin: list[dict], tolerance: int):
    candidates = []
    for s in strava:
        for g in garmin:
            if sport_group(s["typ"]) != sport_group(g["typ"]):
                continue
            delta = abs((g["start"] - s["start"]).total_seconds())
            if delta <= tolerance:
                candidates.append((delta, s, g))
    candidates.sort(key=lambda item: item[0])
    used_s, used_g, pairs = set(), set(), []
    for _, s, g in candidates:
        if s["id"] not in used_s and g["id"] not in used_g:
            used_s.add(s["id"])
            used_g.add(g["id"])
            pairs.append((s, g))
    return pairs


def apply_names(
    activities: list[dict],
    strava: list[dict],
    since: datetime,
    tolerance: int,
    automatic=False,
):
    garmin = [
        {
            "id": row["activityId"],
            "start": local_time(row.get("startTimeLocal")),
            "name": row.get("activityName") or "",
            "typ": row.get("typeKey") or "",
        }
        for row in activities
    ]
    garmin = [row for row in garmin if row["start"] and row["start"] >= since]
    source = [
        {
            "id": row["id"],
            "start": local_time(row.get("start_date_local")),
            "name": (row.get("name") or "").strip(),
            "typ": row.get("sport_type") or row.get("type") or "",
        }
        for row in strava
    ]
    source = [row for row in source if row["start"]]
    changes = {}
    for s, g in pair_up(source, garmin, tolerance):
        if (
            s["name"]
            and s["name"] != g["name"]
            and (automatic or not STANDARD.match(s["name"]))
        ):
            changes[g["id"]] = s["name"]
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--setup", action="store_true")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out", type=Path, default=Path("docs/data"))
    parser.add_argument(
        "--execute", action="store_true", help="Namen im Dashboard speichern"
    )
    parser.add_argument("--tage", type=int)
    parser.add_argument("--tolerance", type=int, default=600)
    parser.add_argument("--alle-namen", action="store_true")
    args = parser.parse_args()
    try:
        if args.setup:
            setup(args.config)
            return 0
        config = load_config(args.config)
        client = StravaClient(config)
        days = args.tage if args.tage is not None else config.get("tage_zurueck", 30)
        if days < 1 or args.tolerance < 0:
            parser.error("--tage muss positiv und --tolerance darf nicht negativ sein")
        # Compare local start times, but fetch with a one-day UTC margin for
        # activities in timezones on either side of UTC.
        since = datetime.now() - timedelta(days=days)
        after = int((since.replace(tzinfo=UTC) - timedelta(days=1)).timestamp())
        index = args.out / "activities.json"
        activities = json.loads(index.read_text(encoding="utf-8"))
        changes = apply_names(
            activities,
            client.activities(after),
            since,
            args.tolerance,
            args.alle_namen or config.get("standardnamen_uebernehmen", False),
        )
        print(f"{len(changes)} Aktivitätsnamen für das Dashboard gefunden.")
        if args.execute:
            for row in activities:
                name = changes.get(row["activityId"])
                if name:
                    row["activityName"] = name
                    detail_path = args.out / "activity" / f"{row['activityId']}.json"
                    if detail_path.exists():
                        detail = json.loads(detail_path.read_text(encoding="utf-8"))
                        detail["name"] = name
                        detail_path.write_text(
                            json.dumps(
                                detail, ensure_ascii=False, separators=(",", ":")
                            ),
                            encoding="utf-8",
                        )
            index.write_text(
                json.dumps(activities, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
        else:
            print("Vorschau. Mit --execute im Dashboard speichern.")
    except (StravaError, OSError, ValueError) as exc:
        print(
            str(exc)
            if isinstance(exc, StravaError)
            else "Lokale Strava-Konfiguration oder Exportdatei nicht lesbar.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
