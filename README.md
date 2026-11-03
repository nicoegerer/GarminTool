# GarminTool

Ein selbst gehostetes Trainings-Dashboard mit Aktivitäten, Trainingslast
(CTL/ATL/TSB), Gesundheitswerten und KI-Coach. Der Datenabruf verwendet die
**offizielle Garmin Connect Personal API**. Optional ergänzt die **offizielle
Strava API** die Aktivitätsnamen im Dashboard.

GitHub Actions aktualisiert die Daten alle zwei Stunden; GitHub Pages liefert
bei entsprechender Einrichtung das statisch exportierte Next.js-Frontend aus.
Garmin-Passwort, Garmin-MCP und inoffizielle Connect-Clients werden nicht benötigt.

**Einrichtung und Migration: [SETUP.md](SETUP.md)**

Für Garmin genügt ein persönlicher API-Schlüssel aus
[Garmin Connect](https://connect.garmin.com/app/settings/personalApiToken), der als
Repository-Secret `GARMIN_PERSONAL_API_KEY` hinterlegt wird. API-Schlüssel und
OAuth-Tokens bleiben außerhalb des Frontend-Bundles und der veröffentlichten Daten.

Die Personal API ist lesend und stellt noch nicht alle bisherigen Datenbereiche
bereit. Vorhandene historische Exporte bleiben erhalten; `manifest.json`
kennzeichnet nicht verfügbare Bereiche. Strava-Namen werden im Dashboard
übernommen. Ein Zurückschreiben nach Garmin wird nicht mehr ausgeführt.

## Aufbau

- `app/` – Next.js-Frontend, liest `docs/data/*.json`.
- `scripts/export_data.py` – offizielle Garmin-Daten und abgeleitete Trainingslast.
- `scripts/export_details.py`, `scripts/fit_details.py` – Aktivitätsdetails und
  FIT-Dateien über die offizielle API und das offizielle Garmin FIT SDK.
- `scripts/setup_garmin_token.py` – persönlichen API-Schlüssel lokal prüfen/speichern.
- `scripts/namen_sync.py`, `scripts/strava_api.py` – Strava-OAuth und Dashboard-Namen.
- `.github/workflows/` – automatischer Datenabruf, API-Tests und Seiten-Build.

## Entwicklung

Python 3.12+ und [uv](https://docs.astral.sh/uv/); die Skripte deklarieren ihre
Abhängigkeiten selbst. Die Integrationstests laufen ohne Zugangsdaten oder Netz:

```bash
uv run tests/test_api_integration.py
```

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Chart.js · Google Gemini ·
[Garmins offizielles Personal API SDK](https://github.com/garmin/connect-personal-api-python) ·
[Garmin FIT SDK](https://github.com/garmin/fit-python-sdk) ·
[Strava API v3](https://developers.strava.com/docs/).
