# GarminTool

Ein selbst gehostetes Trainings-Dashboard mit Aktivitäten, Trainingslast
(CTL/ATL/TSB), Gesundheitswerten, Garmin-Leistungsdaten und KI-Coach.
Der Garmin-Abruf verwendet **[python-garminconnect 0.3.20](https://github.com/cyberjunky/python-garminconnect)**
direkt. Strava ergänzt Aktivitätsnamen über die **offizielle Strava API**.

GitHub Actions aktualisiert alle zwei Stunden die JSON-Dateien unter `docs/data/`.
GitHub Pages veröffentlicht das statisch exportierte Next.js-Frontend.
Garmin-Tokens bleiben im Workflow; es ist kein MCP-Server erforderlich.
`python-garminconnect` ist ein inoffizieller Client für Garmin Connect.

**Einrichtung und Umstellung: [SETUP.md](SETUP.md)**

## Garmin-Anmeldung

Einmal lokal im Repository anmelden, einschließlich MFA, wenn Garmin danach fragt:

```bash
uv run scripts/setup_garmin_token.py
```

Den gesamten Inhalt der erzeugten `.garmin_tokens/garmin_tokens.json` als
GitHub-Actions-Secret **`GARMIN_TOKENS_JSON`** speichern und den Workflow
**„Garmin-Daten aktualisieren“** starten. Passwort und MFA-Code werden nicht
mitgespeichert; Token-Inhalte werden nicht in der Konsole ausgegeben.

**Alte `garth`-Tokens aus Version 0.2.x funktionieren nicht mehr.** Ein vorhandenes
`GARMIN_TOKENS_JSON` deshalb mit der neu erzeugten Datei ersetzen. Der zuvor
verwendete `GARMIN_PERSONAL_API_KEY` wird nicht mehr gelesen und kann nach einem
erfolgreichen neuen Datenabruf entfernt werden.

## Funktionen

- Aktivitätsliste, Details, Runden, Schwimmbahnen und Kraftsätze.
- Schritte, Schlaf, Stress, Ruhepuls, Body Battery, HRV und Gewicht.
- Garmin-Originalwerte für VO₂max-Verlauf, Trainingsstatus, Readiness,
  Wettkampfprognosen, Rekorde und Badges.
- Neue lesende Funktionen: wöchentlicher Trainingsstatus-Verlauf, aktuelle
  VO₂max-Werte nach Sportart, Herzfrequenzzonen v2, Fitnessalter mit Details,
  Hitze-/Höhenanpassung, Cycling Ability, Laufökonomie, Critical Swim Speed,
  Laktatschwelle, FTP, Leistungszonen und Rad-Leistungskurve.
- Unter **Training → Garmin-Leistung** erscheinen vorhandene Kennzahlen sowie
  erkannte Last- und Leistungskurven. Leere oder unbekannte Datenformate erzeugen
  keine erfundenen Messwerte oder geratenen Einheiten. Einige zusätzliche
  Antworten bleiben zunächst nur im Export verfügbar.
- Der Coach berücksichtigt vorhandene HRV-, Readiness-, FTP- und Leistungsdaten
  und unterscheidet fehlende Messwerte von einem fehlgeschlagenen Abruf.

Welche Werte verfügbar sind, hängt vom Gerät und von aufgezeichneten Messungen
ab. Bei optionalen Abruffehlern bleibt der letzte Stand erhalten; die Oberfläche
kennzeichnet ihn dezent. Ein kleiner aufklappbarer Hinweis nennt noch ausstehende
Einrichtung oder gespeicherte Daten. Authentifizierungsfehler und Anfragelimits
brechen den Export ab, bevor neue Dashboard-Dateien geschrieben werden.

CTL/ATL/TSB werden weiterhin im Dashboard selbst aus den Trainingslasten
berechnet. Garmin-Einstufungen und Garmin-Rekorde werden direkt abgerufen.

## Zugangsdaten

| Secret | Zweck |
| --- | --- |
| `GARMIN_TOKENS_JSON` | Neue Garmin-Connect-DI-Tokens aus dem lokalen Setup |
| `STRAVA_CONFIG_JSON` | Optional: offizielle Strava-OAuth-Anmeldung für Aktivitätsnamen |
| `NEXT_PUBLIC_GEMINI_KEY` | Optional: KI-Coach mit Google Gemini |
| `NEXT_PUBLIC_DISPATCH_TOKEN` | Optional: Datenabruf per Website-Button |

Für Garmin braucht es **einen Secret-Eintrag**, keinen zusätzlichen API-Key.
Stravas Client-ID, Client-Secret und Refresh-Token liegen zusammen in einem
weiteren Secret. Google und GitHub benötigen für ihre Zusatzfunktionen eigene
Berechtigungen. Ohne Dispatch-Token läuft der geplante Zwei-Stunden-Abruf weiter.
Die beiden `NEXT_PUBLIC_…`-Werte werden für die Browserfunktionen ins Frontend
übernommen; Garmin- und Strava-Tokens werden nicht veröffentlicht.

Erneuerte Garmin- und Strava-Tokens werden verschlüsselt unter
`.github/api-state/*.enc` gespeichert. Die Verschlüsselung wird aus dem jeweiligen
Secret abgeleitet; es wird kein weiterer Schlüssel benötigt. Den ursprünglichen
Secret-Inhalt unverändert lassen, bis eine neue Anmeldung nötig ist.

## Entwicklung

Python 3.12+ und [uv](https://docs.astral.sh/uv/); die Skripte deklarieren ihre
Abhängigkeiten selbst. Integrationstests verwenden die gepinnte Bibliothek mit
Testantworten und benötigen weder Zugangsdaten noch echte Garmin-Anfragen.

```bash
uv run tests/test_api_integration.py
cd app
npm ci
npm test
npm run typecheck
npm run build
```

Der Workflow **„Dashboard im Browser prüfen“** testet alle acht Seiten,
Aktivitätsdetails, Suche und mobile Navigation. Optional prüft er einen echten
Coach-Aufruf oder den Sofort-Refresh. Die CI prüft Coach-Antworten, Fehlerfälle
und Wiederherstellung mit simulierten Antworten ohne Google-Aufrufe.

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Chart.js · Google Gemini ·
[python-garminconnect](https://github.com/cyberjunky/python-garminconnect/releases/tag/0.3.20) ·
[Garmin FIT SDK](https://github.com/garmin/fit-python-sdk) ·
[Strava API v3](https://developers.strava.com/docs/).
