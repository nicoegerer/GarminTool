# /// script
# requires-python = ">=3.11"
# dependencies = ["garminconnect>=0.3.5"]
# ///
"""
setup_garmin_token.py — erzeugt den Garmin-Token für das Secret GARMIN_TOKENS_JSON.

Läuft LOKAL auf deinem eigenen Rechner. Dein Garmin-Passwort verlässt dein
Gerät NICHT — es wird nur einmal an Garmin geschickt, um einen Token zu holen.
Ausgegeben wird ausschließlich der Token (nicht das Passwort); den trägst du
danach als GitHub-Secret in deinem Fork ein.

Aufruf:
    uv run scripts/setup_garmin_token.py
(oder:  pip install "garminconnect>=0.3.5"  &&  python scripts/setup_garmin_token.py )
"""

from __future__ import annotations

import getpass
import os
import sys
from pathlib import Path

from garminconnect import Garmin

STORE = Path(os.path.expanduser("~/.garminconnect"))
TOKEN_FILE = STORE / "garmin_tokens.json"


def main() -> int:
    print("Garmin-Login (nur zum Token-Holen; Passwort bleibt lokal)\n")
    email = input("Garmin E-Mail: ").strip()
    password = getpass.getpass("Garmin Passwort: ")

    # prompt_mfa wird nur aufgerufen, wenn dein Konto Zwei-Faktor an hat.
    def prompt_mfa() -> str:
        return input("MFA-Code aus deiner Authenticator-App / SMS: ").strip()

    try:
        try:
            client = Garmin(email=email, password=password, prompt_mfa=prompt_mfa)
        except TypeError:
            # Ältere garminconnect-Versionen kennen prompt_mfa nicht.
            client = Garmin(email, password)
        client.login()
    except Exception as exc:  # noqa: BLE001
        print(f"\nLogin fehlgeschlagen: {type(exc).__name__}: {exc}", file=sys.stderr)
        print("Bei aktivem Zwei-Faktor: garminconnect aktuell halten (uv holt das automatisch).", file=sys.stderr)
        return 1

    STORE.mkdir(parents=True, exist_ok=True)
    client.garth.dump(str(STORE))

    if not TOKEN_FILE.exists():
        print(f"\nUnerwartet: {TOKEN_FILE} wurde nicht angelegt.", file=sys.stderr)
        print("Inhalt des Token-Ordners:", [p.name for p in STORE.glob("*")], file=sys.stderr)
        return 1

    print("\nLogin OK. Kopiere ALLES zwischen den beiden Linien in das GitHub-Secret")
    print("GARMIN_TOKENS_JSON (Repo → Settings → Secrets and variables → Actions):\n")
    print("----------------------------------------------------------------------")
    print(TOKEN_FILE.read_text(encoding="utf-8").strip())
    print("----------------------------------------------------------------------")
    print("\nDer Token ist gültig, bis du dich bei Garmin abmeldest oder das")
    print("Passwort änderst. Danach dieses Skript einfach erneut ausführen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
