# GarminTool

GarminTool ist ein selbst gehostetes Dashboard für deine Trainingsdaten aus
Garmin Connect. Du kannst Aktivitäten auswerten, deine Trainingsbelastung
verfolgen und einen KI-Coach mit deinen Zielen und aufgezeichneten Daten nutzen.
Optional übernimmt GarminTool die Aktivitätsnamen aus Strava.

Die Anwendung läuft als statische Website. GitHub Actions ruft die Daten alle
zwei Stunden ab; GitHub Pages stellt das Dashboard bereit. Du betreibst deine
Instanz unter deinem eigenen GitHub-Account und mit deinen eigenen Zugangsdaten.

## Funktionen

- **Aktivitäten:** Suche, Filter und Detailansichten für Laufen, Radfahren,
  Schwimmen, Krafttraining und weitere Sportarten.
- **Trainingsübersicht:** Wochenvolumen, Zeit, Distanz sowie Fitness (CTL),
  Ermüdung (ATL) und Form (TSB).
- **Gesundheit und Erholung:** Schritte, Schlaf, Stress, Ruhepuls, Body Battery,
  HRV und Gewicht.
- **Garmin-Leistungsdaten:** VO₂max-Verlauf, Trainingsstatus, Trainingsbereitschaft,
  Wettkampfprognosen und persönliche Rekorde.
- **Weitere Kennzahlen:** Cycling Ability, Laktatschwelle, FTP, Hitze- und
  Höhenanpassung sowie Trainingslast- und Rad-Leistungskurven.
- **KI-Coach:** Trainingsfragen und Vorschläge auf Grundlage der verfügbaren
  Daten sowie deiner persönlichen Ziele und Präferenzen.
- **Strava-Abgleich:** Aktivitätsnamen aus Strava im Dashboard übernehmen.

Die verfügbaren Messwerte hängen von deinem Garmin-Gerät und den aufgezeichneten
Aktivitäten ab. Garmin-Einstufungen und Rekorde werden direkt übernommen;
CTL/ATL/TSB berechnet GarminTool aus den Trainingslasten. Bei einem fehlgeschlagenen
optionalen Abruf bleibt der letzte verfügbare Stand erhalten und wird gekennzeichnet.

## Eigene Instanz einrichten

Du benötigst einen GitHub-Account, einen Garmin-Connect-Account sowie Git,
Python 3.12 oder neuer und [uv](https://docs.astral.sh/uv/getting-started/installation/).

1. Forke das Repository und klone deinen Fork auf deinen Rechner.
2. Entferne den mitgelieferten Datenstand und passe die Domain-Konfiguration an.
3. Melde dich im Projektordner einmal bei Garmin an:

   ```bash
   uv run scripts/setup_garmin_token.py
   ```

4. Hinterlege den Inhalt von `.garmin_tokens/garmin_tokens.json` als
   Repository-Secret `GARMIN_TOKENS_JSON`.
5. Aktiviere die Workflows und GitHub Pages in deinem Fork und starte
   **„Garmin-Daten aktualisieren“**.

Die vollständige Anleitung mit Domain-Einrichtung, optionalen Integrationen und
Hinweisen zu den Zugangsdaten steht in **[SETUP.md](SETUP.md)**.

## Integrationen und Zugangsdaten

Der Garmin-Abruf verwendet
[python-garminconnect](https://github.com/cyberjunky/python-garminconnect), einen
inoffiziellen Python-Client für Garmin Connect. Strava wird über die
[offizielle Strava API](https://developers.strava.com/docs/) angebunden.
Aktivitätsdateien werden mit dem offiziellen
[Garmin FIT SDK](https://github.com/garmin/fit-python-sdk) verarbeitet.

| Repository-Secret | Funktion | Erforderlich |
| --- | --- | --- |
| `GARMIN_TOKENS_JSON` | Anmeldung bei Garmin Connect | Ja |
| `STRAVA_CONFIG_JSON` | Aktivitätsnamen aus Strava | Nur für den Strava-Abgleich |
| `NEXT_PUBLIC_GEMINI_KEY` | KI-Coach mit Google Gemini | Nur für den Coach |
| `NEXT_PUBLIC_DISPATCH_TOKEN` | Datenabruf per Website-Button starten | Nur für den Sofort-Abruf |

Für Garmin genügt der eine Token-Secret-Eintrag. Die Workflows verwalten die
Token-Erneuerung und speichern erneuerte Garmin- und Strava-Tokens verschlüsselt.
Dafür ist kein zusätzlicher Verschlüsselungsschlüssel nötig.

## Daten und Zugriff

Das Dashboard liest die exportierten JSON-Dateien aus `docs/data/`. GarminTool
bringt keine eigene Zugriffskontrolle mit. Bei einer öffentlich gehosteten
Instanz sind auch die ausgelieferten Trainingsdaten öffentlich zugänglich;
in einem öffentlichen Repository gilt das zusätzlich für die eingecheckten Exporte.

Garmin- und Strava-Zugangsdaten werden nicht ins Frontend eingebunden. Die
beiden optionalen `NEXT_PUBLIC_…`-Werte werden dagegen ins Frontend übernommen
und sind im Browser sichtbar. Wenn du private Trainingsdaten anzeigen möchtest,
benötigst du eine entsprechend geschützte Hosting-Umgebung.

## Lokal entwickeln

Für das Frontend benötigst du zusätzlich Node.js 22 oder neuer. Verwende einen
lokalen Checkout mit deinen exportierten Daten unter `docs/data/`:

```bash
cd app
npm ci
npm run dev
```

Das Dashboard ist anschließend unter `http://localhost:3000` erreichbar.
`npm run build` erzeugt die statische Website unter `app/out/`.

### Prüfungen

Im Repository-Verzeichnis:

```bash
uv run tests/test_api_integration.py
cd app
npm test
npm run typecheck
npm run build
```

Die Integrationstests benötigen keine Garmin-Zugangsdaten und senden keine echten
Garmin-Anfragen. Die CI prüft außerdem Navigation, Aktivitätsdetails, Suche,
mobile Darstellung und Coach-Fehlerfälle mit simulierten Antworten.

Der manuelle Workflow **„Dashboard im Browser prüfen“** prüft die veröffentlichte
Instanz. Ein echter Coach-Aufruf oder der Aktualisieren-Button lässt sich dort
jeweils optional zuschalten.

## Technik

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Chart.js · Python ·
python-garminconnect · Garmin FIT SDK · Strava API · Google Gemini · GitHub Actions
