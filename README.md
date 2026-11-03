# GarminTool

Ein selbst gehostetes Trainings-Dashboard mit Aktivitäten, Trainingslast
(CTL/ATL/TSB), Gesundheitswerten und KI-Coach. Der Datenabruf verwendet die
**offizielle Garmin Connect Personal API**. Optional ergänzt die **offizielle
Strava API** die Aktivitätsnamen im Dashboard.

GitHub Actions aktualisiert die Daten alle zwei Stunden; GitHub Pages liefert
bei entsprechender Einrichtung das statisch exportierte Next.js-Frontend aus.
Der Datenabruf läuft direkt von GitHub Actions zu Garmin und Strava. Die Seite
liest anschließend die exportierten JSON-Dateien; die Garmin- und
Strava-Zugangsdaten bleiben im jeweiligen Workflow.

**Einrichtung und Migration: [SETUP.md](SETUP.md)**

Für Garmin genügt ein persönlicher API-Schlüssel aus
[Garmin Connect](https://connect.garmin.com/app/settings/personalApiToken), der als
Repository-Secret `GARMIN_PERSONAL_API_KEY` hinterlegt wird. API-Schlüssel und
OAuth-Tokens bleiben außerhalb des Frontend-Bundles und der veröffentlichten Daten.

Die Garmin Personal API liefert Aktivitäten, Aktivitätsdetails/FIT-Dateien und
verfügbare Gesundheitsdaten. Strava ergänzt Aktivitätsnamen im Dashboard.
Beide Anbindungen verwenden die offiziellen Anmeldeverfahren.

**Funktionsgrenzen:** Die Garmin Personal API ist lesend. VO₂max-Zeitreihen,
Trainingsstatus, Wettkampfprognosen und Rekorde werden darüber derzeit nicht
aktualisiert. Vorhandene Exporte bleiben erhalten und sind in der Oberfläche
als gespeicherter Stand gekennzeichnet. Details stehen in [SETUP.md](SETUP.md).

Der Anzeigename bleibt beim Daten-Refresh erhalten. Bei Bedarf lässt er sich
über die normale GitHub-Actions-Variable `DASHBOARD_DISPLAY_NAME` einstellen;
dafür ist kein zusätzlicher API-Key erforderlich.

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

Ohne die beiden optionalen Secrets funktioniert der automatische Datenabruf
alle zwei Stunden weiterhin. Hinweise zum Wechsel älterer Installationen stehen
im Abschnitt „Bestehende Instanz umstellen“ in [SETUP.md](SETUP.md).

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
cd app
npm ci
npm test
npm run typecheck
npm run build
```

Der Workflow **„Dashboard im Browser prüfen“** testet alle acht Seiten,
Aktivitätsdetails, Suche und mobile Navigation auf der veröffentlichten Seite.
Optional prüft er einen kurzen echten Coach-Aufruf und startet einmal den
Sofort-Refresh. Er benötigt keine zusätzlichen Secrets.
Die CI prüft den Coach außerdem mit simulierten Antworten, einem Dienstausfall
und anschließender Wiederherstellung, ohne Google-Aufrufe oder echte API-Keys.

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Chart.js · Google Gemini ·
[Garmins offizielles Personal API SDK](https://github.com/garmin/connect-personal-api-python) ·
[Garmin FIT SDK](https://github.com/garmin/fit-python-sdk) ·
[Strava API v3](https://developers.strava.com/docs/).
