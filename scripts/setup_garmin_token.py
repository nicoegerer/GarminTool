# /// script
# requires-python = ">=3.12"
# dependencies = ["garminconnect==0.3.20", "cryptography>=46,<51"]
# ///
"""Create new Garmin Connect DI tokens locally, including MFA when requested.

    uv run scripts/setup_garmin_token.py
    uv run scripts/setup_garmin_token.py --check

Passwords and MFA state are never saved. Token contents are never printed.
"""

import argparse
import getpass
import json
import logging
import os
from pathlib import Path

from garmin_api import DEFAULT_TOKEN_DIR, GarminClient, error_message, validate_tokens
from garminconnect import Garmin


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="Vorhandene lokale Tokens prüfen"
    )
    parser.add_argument(
        "--token-dir",
        type=Path,
        default=Path(os.environ.get("GARMINTOKENS", str(DEFAULT_TOKEN_DIR))),
    )
    args = parser.parse_args()
    directory = args.token_dir.expanduser()
    logging.getLogger("garminconnect").setLevel(logging.CRITICAL)
    api = None
    try:
        if args.check:
            api = Garmin()
            api.login(str(directory))
        else:
            email = input("Garmin-E-Mail: ").strip()
            password = getpass.getpass("Garmin-Passwort (wird nicht gespeichert): ")
            if not email or not password:
                print("E-Mail und Passwort sind erforderlich.")
                return 1
            api = Garmin(email, password, return_on_mfa=True)
            status, state = api.login()
            password = None
            if status == "needs_mfa":
                code = getpass.getpass("Garmin-MFA-Code: ").strip()
                api = Garmin()
                api.resume_login(state, code)
                state = code = None
        validate_tokens(json.loads(api.client.dumps()))
        api.client.dump(str(directory))
    except Exception as exc:  # noqa: BLE001 - never print upstream credential-bearing errors
        print(error_message(exc))
        return 1
    finally:
        if api is not None:
            GarminClient(api).close()
    print(f"Anmeldung erfolgreich. Token-Datei: {directory / 'garmin_tokens.json'}")
    print(
        "Den gesamten Dateiinhalt als Repository-Secret GARMIN_TOKENS_JSON speichern."
    )
    print("Keine Tokens und kein Passwort im Chat posten.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
