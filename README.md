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

## Welche Zugangsdaten werden gebraucht?

Für Garmin und Strava genügen **zwei Repository-Secrets**. Die weiteren Secrets
gehören zu optionalen Zusatzfunktionen:

| Secret | Zweck | Benötigt |
| --- | --- | --- |
| `GARMIN_PERSONAL_API_KEY` | Eigene Garmin-Daten über die offizielle Personal API abrufen | Ja |
| `STRAVA_CONFIG_JSON` | Offizielle Strava-OAuth-Anmeldung für Aktivitätsnamen | Bei Nutzung von Strava |
| `NEXT_PUBLIC_GEMINI_KEY` | Anfragen des KI-Coachs an Google Gemini | Nur für den KI-Coach |
| `NEXT_PUBLIC_DISPATCH_TOKEN` | GitHub-Refresh-Workflow direkt aus der Website starten | Nur für Sofort-Abruf per Button |

Strava verwendet OAuth statt eines einzelnen dauerhaften API-Schlüssels.
Client-ID, Client-Secret und Refresh-Token sind gemeinsam in
`STRAVA_CONFIG_JSON` gespeichert; daraus erneuert das Skript den kurzlebigen
Access-Token automatisch. Es wird kein zusätzlicher Strava-Key benötigt.
Garmin- und Strava-Zugangsdaten gelten jeweils für ihren Anbieter; Google und
GitHub benötigen für ihre Zusatzfunktionen eigene Berechtigungen.

Das alte Secret `GARMIN_TOKENS_JSON` kann nach einem erfolgreichen offiziellen
Abruf gelöscht werden. Ohne die beiden optionalen Secrets funktioniert der
automatische Datenabruf alle zwei Stunden weiterhin.

## Aufbau

- `app/` – Next.js-Frontend, liest `docs/data/*.json`.
- `scripts/export_data.py` – offizielle Garmin-Daten und abgeleitete Trainingslast.
- `scripts/export_details.py`, `scripts/fit_details.py` – Aktivitätsdetails und
  FIT-Dateien über die offizielle API und das offizielle Garmin FIT SDK.
- `scripts/setup_garmin_api.py` – persönlichen API-Schlüssel lokal prüfen/speichern.
- `scripts/sync_strava_names.py`, `scripts/strava_api.py` – Strava-OAuth und Dashboard-Namen.
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
