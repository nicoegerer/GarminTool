"""One-time interactive Garmin Connect login.

Run this yourself in your own terminal:

    python backend/scripts/login.py

You will be prompted for your Garmin email and password (password input is
hidden via getpass and is never written to disk or logged). On success, a
session token cache is written to GARMIN_TOKEN_DIR (see .env / .env.example).
The backend reuses that token cache afterwards, so this only needs to run
again if the tokens expire or are deleted.
"""

import sys
from getpass import getpass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from garminconnect import Garmin  # noqa: E402

from app.config import settings  # noqa: E402


def main() -> None:
    email = input("Garmin email: ").strip()
    password = getpass("Garmin password: ")

    token_dir = Path(settings.garmin_token_dir)
    token_dir.mkdir(parents=True, exist_ok=True)

    client = Garmin(email=email, password=password)
    client.login()
    client.garth.dump(str(token_dir))

    print(f"Login successful. Session tokens stored in: {token_dir.resolve()}")
    print("The backend will now reuse this token cache automatically.")


if __name__ == "__main__":
    main()
