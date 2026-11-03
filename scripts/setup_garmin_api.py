# /// script
# requires-python = ">=3.12"
# dependencies = ["garmin-connect-personal-api-python==1.0.0"]
# ///
"""Validate an official Garmin Personal API key and optionally save it locally.

    uv run scripts/setup_garmin_api.py
    uv run scripts/setup_garmin_api.py --check

Create the key at https://connect.garmin.com/app/settings/personalApiToken.
For GitHub Actions, store that key directly as GARMIN_PERSONAL_API_KEY.
Authentication and bearer-token renewal use Garmin's official Python SDK.
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

from garmin_api import create_client, error_message


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Vorhandenen Schlüssel nur prüfen"
    )
    parser.add_argument(
        "--key-file",
        type=Path,
        default=Path.home() / ".config/garmin/connect-personal-api-key",
    )
    args = parser.parse_args()
    key = None
    if not args.check:
        print(
            "Offiziellen Schlüssel in Garmin Connect erstellen:\nhttps://connect.garmin.com/app/settings/personalApiToken"
        )
        key = (
            os.environ.get("GARMIN_PERSONAL_API_KEY")
            or getpass.getpass("Personal API Key (wird nicht angezeigt): ").strip()
        )
        if not key:
            print("Kein API-Schlüssel angegeben.", file=sys.stderr)
            return 1
    elif args.key_file.exists() and "GARMIN_PERSONAL_API_KEY" not in os.environ:
        key = args.key_file.read_text(encoding="utf-8").strip()
    try:
        with create_client(key) as client:
            client.get_user_profile_settings()
        if key and not args.check:
            args.key_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(args.key_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                stream.write(key + "\n")
            args.key_file.chmod(0o600)
            print(f"API-Schlüssel lokal in {args.key_file} gespeichert.")
    except Exception as exc:  # noqa: BLE001 - sanitize provider errors at the CLI boundary
        print(error_message(exc), file=sys.stderr)
        return 1
    print(
        "Garmin Personal API erreichbar. Für Actions den Schlüssel als Secret GARMIN_PERSONAL_API_KEY hinterlegen."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
