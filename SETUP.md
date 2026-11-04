# Eigene Instanz einrichten oder umstellen

GarminTool verwendet `python-garminconnect==0.3.20` direkt für Garmin Connect und
optional Stravas offizielle OAuth-API. Der Garmin-Client ist inoffiziell; ein
MCP-Server und ein Garmin Personal API Key sind nicht erforderlich.

## Bestehende Instanz umstellen

1. Den aktuellen Repository-Stand lokal holen. Python 3.12+ und
   [uv](https://docs.astral.sh/uv/getting-started/installation/) installieren.
2. Im Repository ausführen:
   ```bash
   uv run scripts/setup_garmin_token.py
   ```
3. Garmin-E-Mail und Passwort eingeben. Falls Garmin einen MFA-Code verlangt,
   diesen anschließend eingeben. Das Skript verwendet den aktuellen Login und
   unterstützt die neue MFA-Fortsetzung. Passwort und MFA-Zwischenzustand werden
   nicht gespeichert.
4. Die erzeugte Datei **`.garmin_tokens/garmin_tokens.json`** lokal öffnen und
   ihren gesamten JSON-Inhalt unter **Settings → Secrets and variables → Actions**
   als Repository-Secret **`GARMIN_TOKENS_JSON`** speichern beziehungsweise ersetzen.
   Die Datei enthält `di_token`, `di_refresh_token` und `di_client_id`.
5. Unter **Actions → Garmin-Daten aktualisieren → Run workflow** einmal starten.
6. Nach einem erfolgreichen neuen Abruf kann das ungenutzte Secret
   **`GARMIN_PERSONAL_API_KEY`** entfernt und der zugehörige Schlüssel bei Garmin
   widerrufen werden. Strava-, Gemini- und Dispatch-Zugangsdaten bleiben gültig.

**Wichtig:** `python-garminconnect` verwendet seit Version 0.3.0 kein `garth` mehr.
Alte `oauth1_token.json`/`oauth2_token.json` und deren frühere JSON-Pakete sind
nicht konvertierbar. Dafür ist die einmalige neue Anmeldung erforderlich.
[Hinweise der Bibliothek](https://github.com/cyberjunky/python-garminconnect#upgrading-from-02x-garth).

Tokens weder in Issues noch im Chat posten. Die Token-Datei bleibt lokal und ist
von Git ausgeschlossen. Die Dateirechte werden auf Unix auf `0600`, die des
Tokenordners auf `0700` gesetzt. Die neuen Tokens können das Garmin-Konto
weitergehend berechtigen; GarminTool verwendet ausschließlich lesende Funktionen.

## Neue Instanz

Repository forken und anschließend denselben Garmin-Setup-Ablauf ausführen.
Der Workflow aktualisiert alle zwei Stunden die Daten. GitHub Pages muss mit
**GitHub Actions** als Veröffentlichungsquelle eingerichtet sein. Eine eigene
Domain steht optional in `app/public/CNAME`; ohne eigene Domain wird die
Projektadresse unter `<account>.github.io/<repo>/` verwendet.

## Lokale Befehle

```bash
uv run scripts/setup_garmin_token.py --check
uv run scripts/export_data.py
uv run scripts/export_details.py
```

Standardmäßig werden neue Tokens unter `.garmin_tokens/` gespeichert. Mit
`--token-dir PFAD` beim Setup und `GARMINTOKENS=PFAD` für lokale Exporte lässt sich
ein anderer **Tokenordner** wählen. Die Umgebung `GARMIN_TOKENS_JSON` hat Vorrang.
Der alte Personal-API-Setup-Befehl `setup_garmin_api.py` wurde entfernt.

## Token-Erneuerung in GitHub Actions

Die Bibliothek erneuert die kurzlebigen DI-Access-Tokens automatisch. GarminTool
speichert auch den erneuerten Refresh-Token verschlüsselt in
`.github/api-state/garmin-*.enc`; lokal bei Verwendung des JSON-Secrets in
`.api-state/`. Dadurch gehen erneuerte Tokens bei einem späteren Abfragefehler
oder zwischen den beiden Export-Skripten nicht verloren. Der Workflow sichert
den verschlüsselten Garmin-Tokenstatus auch bei einem fehlgeschlagenen Export.
Es werden keine unverschlüsselten Token-Dateien eingecheckt oder veröffentlicht.

Die Verschlüsselung wird aus dem ursprünglichen `GARMIN_TOKENS_JSON` abgeleitet.
**Diesen Secret-Inhalt unverändert lassen.** Die Laufzeit-Erneuerung benötigt keine
manuelle Aktualisierung des Secrets und keinen weiteren Schlüssel. Bei Widerruf,
abgelaufenem Refresh-Token oder einer neuen Anmeldung das Setup erneut ausführen
und das Secret komplett ersetzen; dadurch beginnt ein neuer verschlüsselter
Tokenstatus. Dieselben Zugangsdaten nicht parallel in mehreren Automationen
verwenden. Der Refresh-Workflow läuft serialisiert auf der Standardbranch.

## Benötigte Secrets

| Secret | Verwendung |
| --- | --- |
| `GARMIN_TOKENS_JSON` | Garmin-Connect-Anmeldung; erforderlich |
| `STRAVA_CONFIG_JSON` | Optional: Aktivitätsnamen von Strava |
| `NEXT_PUBLIC_GEMINI_KEY` | Optional: Google-Gemini-Coach |
| `NEXT_PUBLIC_DISPATCH_TOKEN` | Optional: GitHub-Workflow aus dem Browser starten |

`GARMIN_PERSONAL_API_KEY` wird nicht mehr verwendet. Für Garmin reicht der eine
Token-Secret-Eintrag. Der Workflow erhält seinen eingebauten `GITHUB_TOKEN`
automatisch. Ohne Dispatch-Token lädt der Aktualisieren-Button nur den letzten
veröffentlichten Stand; der automatische Zwei-Stunden-Abruf funktioniert weiter.
Garmin-/Strava-Tokens bleiben im Workflow. Die beiden `NEXT_PUBLIC_…`-Werte sind
für ihre Browserfunktionen im ausgelieferten JavaScript sichtbar.

### Anzeigename

Der Export verwendet einen lesbaren Namen aus Garmin Connect und behält den
vorigen Namen, falls Garmin eine Konto-ID oder keinen Namen zurückliefert.
Optional kann eine normale Actions-Variable `DASHBOARD_DISPLAY_NAME` den Namen
überschreiben. Dafür wird kein weiteres Secret benötigt.

## Strava-Namen (optional)

1. Unter [strava.com/settings/api](https://www.strava.com/settings/api) eine App
   anlegen. **Authorization Callback Domain:** `localhost`.
2. `uv run scripts/sync_strava_names.py --setup` ausführen und die offizielle
   Freigabe im Browser bestätigen. Der lokale Rückruf läuft auf `127.0.0.1:8721`
   und prüft OAuth-`state`. Benötigter Scope: `activity:read_all`.
3. `strava-sync-local/config.json` als `STRAVA_CONFIG_JSON` speichern.
4. Lokal nach dem Garmin-Export: `uv run scripts/sync_strava_names.py --execute`.

Ein gültiges vorhandenes Strava-Secret bleibt unverändert nutzbar. Strava-Namen
werden ausschließlich in den Dashboard-Dateien ergänzt; Garmin-Aktivitäten
werden nicht umbenannt. Automatische Namen werden standardmäßig übersprungen.
`--alle-namen` übernimmt sie, `--tage 60` erweitert den Zeitraum.

Rotierte Strava-Tokens bleiben verschlüsselt unter `.github/api-state/strava-*.enc`
erhalten. Auch das ursprüngliche Strava-Secret unverändert aufbewahren und nur
bei einer neuen Freigabe ersetzen. Die lokale Konfiguration ist von Git
ausgeschlossen. [Strava OAuth](https://developers.strava.com/docs/authentication/).

## Daten und aktuelle Bibliotheksfunktionen

Der Export ruft wieder Garmins VO₂max-Verlauf, Trainingsstatus, Readiness,
Wettkampfprognosen, Originalrekorde und Badges ab. Geräteabhängige Werte ohne
Messungen bleiben leer. Optional fehlgeschlagene Bereiche behalten ihren letzten
Stand; Anmeldung und Anfragelimits brechen den Export vor der Veröffentlichung
neuer Dashboard-Dateien ab.

Zusätzlich werden die neuen lesenden Funktionen für wöchentlichen Trainingsstatus,
aktuelle VO₂max-Werte nach Sportart, Herzfrequenzzonen v2, Fitnessalter mit Details,
Hitze-/Höhenanpassung, Cycling Ability, Laufökonomie, Critical Swim Speed,
Laktatschwelle, Rad-FTP, Leistungszonen und die Rad-Leistungskurve der letzten
90 Tage angebunden. Erkannte Kennzahlen und Kurven erscheinen unter
**Training → Garmin-Leistung**, verfügbare Kennzahlen auch im KI-Kontext.
Nicht eindeutig bekannte Antwortformate und Einheiten werden nicht geraten;
zusätzliche Rohantworten bleiben bereinigt im Export verfügbar.

Geräte-IDs, Seriennummern, Geburtsdatum und neue Standortangaben werden für diese
Ansichten nicht exportiert. Aktivitätsdetails bleiben gecacht. Original-FIT-Dateien
werden nur im Arbeitsspeicher verarbeitet. Routenkoordinaten sind standardmäßig
ausgeschlossen; `--include-gps` ist nur für eine zugriffsgeschützte Instanz gedacht.
`--force` lädt Details neu; `--limit 10` begrenzt den Detailabruf, ohne die
Aktivitätsliste zu kürzen.

Die Oberfläche nutzt einen kleinen aufklappbaren Hinweis für Einrichtung oder
teilweise gespeicherte Daten. CTL/ATL/TSB bleiben eigene Berechnungen; Garmins
Statuswerte und Rekorde werden direkt übernommen. Strava bleibt offiziell,
Garmin verwendet ausschließlich den inoffiziellen Python-Client.
