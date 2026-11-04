# GarminTool einrichten

Diese Anleitung führt dich durch die Einrichtung einer eigenen GarminTool-Instanz
mit GitHub Actions und GitHub Pages. Garmin ist die Datenquelle des Dashboards;
Strava, der KI-Coach und der Sofort-Abruf per Button sind optional.

## Voraussetzungen

- Ein GitHub-Account und ein Garmin-Connect-Account.
- Git, Python 3.12 oder neuer und
  [uv](https://docs.astral.sh/uv/getting-started/installation/) auf deinem Rechner.
- Für lokale Frontend-Entwicklung zusätzlich Node.js 22 oder neuer.

## 1. Repository vorbereiten

Forke GarminTool in deinen eigenen GitHub-Account und klone deinen Fork:

```bash
git clone https://github.com/DEIN-GITHUB-NAME/GarminTool.git
cd GarminTool
```

Ersetze `DEIN-GITHUB-NAME` durch deinen Accountnamen. Wenn dein Fork anders heißt,
passe auch den Repository-Namen und den lokalen Ordner an.

### Mit eigenen Daten starten

Im Repository liegt ein vorhandener Datenstand. Entferne bei einer **neuen
Instanz** die mitgelieferten Exportdateien und Unterordner aus `docs/data/` sowie
die übernommenen `.enc`-Dateien aus `.github/api-state/`. So beginnt dein erster
Abruf ohne Daten oder Tokenstatus einer anderen Instanz.

Behalte `docs/data/` im Repository, beispielsweise mit einer leeren `.gitkeep`-Datei.
Die folgenden Workflows füllen den Ordner mit deinen eigenen Exporten.

### Domain auswählen

- **GitHub-Pages-Adresse:** Entferne `app/public/CNAME`. Deine Seite wird unter
  `https://DEIN-GITHUB-NAME.github.io/GarminTool/` veröffentlicht. Der Build setzt
  den passenden Repository-Pfad automatisch.
- **Eigene Domain:** Ersetze den Inhalt von `app/public/CNAME` durch deine Domain
  und richte die Domain und DNS-Einträge für GitHub Pages ein. Die Anwendung wird
  in diesem Fall im Wurzelverzeichnis der Domain ausgeliefert.

Committe und pushe deine Änderungen in deinen Fork.

## 2. Garmin anmelden

Führe im Projektordner aus:

```bash
uv run scripts/setup_garmin_token.py
```

Gib deine Garmin-E-Mail und dein Passwort ein. Falls Garmin einen MFA-Code
verlangt, fragt das Skript anschließend danach. Passwort und MFA-Zwischenzustand
werden nicht gespeichert. Die Anmeldung erzeugt die Datei:

```text
.garmin_tokens/garmin_tokens.json
```

Öffne in deinem GitHub-Fork **Settings → Secrets and variables → Actions →
New repository secret**. Lege `GARMIN_TOKENS_JSON` an und kopiere den **gesamten
JSON-Inhalt** der Datei in das Secret.

Die Token-Datei ist von Git ausgeschlossen und sollte wie ein Passwort behandelt
werden. Auf Unix-Systemen werden der Tokenordner mit `0700` und die Datei mit
`0600` angelegt. Zum Prüfen einer lokalen Anmeldung kannst du ausführen:

```bash
uv run scripts/setup_garmin_token.py --check
```

## 3. GitHub Actions und Pages aktivieren

1. Aktiviere unter **Actions** die Workflows in deinem Fork.
2. Wähle unter **Settings → Pages → Build and deployment → Source** den Eintrag
   **GitHub Actions**.
3. Starte unter **Actions → Garmin-Daten aktualisieren → Run workflow** einen
   ersten Datenabruf auf der Standardbranch.
4. Prüfe, ob die Export-Schritte erfolgreich durchgelaufen sind. Falls der
   Token-Check den Export überspringt, enthält die Workflow-Ausgabe den
   Einrichtungshinweis.
5. Warte auf **„Seite bauen & veröffentlichen“**. Die Adresse deiner Instanz steht
   anschließend in den Pages-Einstellungen beziehungsweise beim Deployment.

Danach ruft der Daten-Workflow alle zwei Stunden neue Daten ab. Nach einem Abruf
wird die Website automatisch neu gebaut. Für den Betrieb über GitHub Actions
muss dein Rechner nicht eingeschaltet bleiben.

## 4. Optionale Funktionen

### Aktivitätsnamen aus Strava

1. Lege unter [strava.com/settings/api](https://www.strava.com/settings/api) eine
   Anwendung an. Verwende `localhost` als **Authorization Callback Domain**.
2. Starte im Projektordner:

   ```bash
   uv run scripts/sync_strava_names.py --setup
   ```

3. Gib Client-ID und Client-Secret ein und bestätige die Strava-Freigabe im Browser.
4. Speichere den Inhalt von `strava-sync-local/config.json` als Repository-Secret
   `STRAVA_CONFIG_JSON`.

Der Abgleich benötigt den Scope `activity:read_all`, um auch private Aktivitäten
zu berücksichtigen. Der lokale OAuth-Rückruf läuft auf `127.0.0.1:8721` und wird
mit `state` geprüft. Die lokale Konfiguration ist von Git ausgeschlossen.

Strava-Namen werden in den Dashboard-Dateien übernommen. Die Aktivitäten im
Garmin-Konto werden dabei nicht umbenannt. Automatisch erzeugte Strava-Namen
werden standardmäßig übersprungen.

Für einen lokalen Abgleich nach dem Garmin-Export:

```bash
uv run scripts/sync_strava_names.py --execute
```

`--alle-namen` berücksichtigt auch automatische Namen; `--tage 60` erweitert den
Zeitraum. Details zur Anmeldung beschreibt die
[Strava-OAuth-Dokumentation](https://developers.strava.com/docs/authentication/).

### KI-Coach mit Google Gemini

Erstelle einen Gemini-API-Key in
[Google AI Studio](https://aistudio.google.com/apikey) und hinterlege ihn als
Repository-Secret `NEXT_PUBLIC_GEMINI_KEY`. Baue die Website anschließend über
**„Seite bauen & veröffentlichen“** neu. Ohne diesen Key bleibt der Coach deaktiviert.

Der Coach übermittelt bei einer Anfrage den ausgewählten Trainingskontext an
Google. Der API-Key wird für den direkten Browserzugriff ins Frontend eingebunden
und ist dort sichtbar. Verwende dafür einen eigenen Schlüssel mit passenden
Beschränkungen und einem geeigneten Kontingent.

### Datenabruf per Website-Button

Ohne zusätzliche Konfiguration lädt der Aktualisieren-Button den zuletzt
veröffentlichten Datenstand. Für einen sofortigen neuen Garmin-Abruf:

1. Erstelle einen GitHub Fine-grained Personal Access Token mit Zugriff
   ausschließlich auf deinen Fork und der Repository-Berechtigung **Actions:
   Read and write**.
2. Hinterlege ihn als `NEXT_PUBLIC_DISPATCH_TOKEN`.
3. Setze in `app/src/components/refresh-button.tsx` die Konstante `REPO` auf
   `DEIN-GITHUB-NAME/DEIN-REPOSITORY`.
4. Committe die Anpassung und baue die Website neu.

Dieser Token ist ebenfalls im Browser sichtbar. Der geplante Zwei-Stunden-Abruf
benötigt ihn nicht; dafür verwendet GitHub Actions seinen eingebauten `GITHUB_TOKEN`.

### Anzeigename

Der Export verwendet einen lesbaren Namen aus Garmin Connect. Optional kannst du
unter **Settings → Secrets and variables → Actions → Variables** die Variable
`DASHBOARD_DISPLAY_NAME` setzen. Sie überschreibt den Namen beim nächsten Abruf
und benötigt kein zusätzliches Secret.

## Betrieb und Zugangsdaten

### Token-Erneuerung

Die Workflows erneuern die Garmin- und Strava-Tokens automatisch und speichern
den aktuellen Stand verschlüsselt in `.github/api-state/*.enc`.
Die Verschlüsselung wird aus dem jeweiligen ursprünglichen Repository-Secret
abgeleitet. Lass diese Secrets deshalb unverändert, solange die Anmeldung gültig
ist. Ein zusätzlicher Verschlüsselungsschlüssel ist nicht erforderlich.

Bei einer abgelaufenen oder widerrufenen Garmin-Anmeldung führst du das Setup
lokal erneut aus und ersetzt `GARMIN_TOKENS_JSON` vollständig. Für Strava startest
du bei Bedarf eine neue OAuth-Freigabe und ersetzt `STRAVA_CONFIG_JSON`.
Verwende für unabhängige Automationen getrennte Anmeldungen, damit sich deren
Token-Erneuerungen nicht gegenseitig beeinträchtigen.

### Daten und Veröffentlichung

GarminTool ist eine statische Anwendung ohne eigene Benutzeranmeldung. Eine
öffentlich erreichbare Website liefert auch ihre JSON-Exporte öffentlich aus.
In einem öffentlichen Repository sind zusätzlich die eingecheckten Dateien unter
`docs/data/` einsehbar. Wähle eine zugriffsgeschützte Hosting-Umgebung, wenn deine
Trainingsdaten privat bleiben sollen.

Garmin- und Strava-Tokens werden nicht als Trainingsdaten veröffentlicht.
Die optionalen Werte `NEXT_PUBLIC_GEMINI_KEY` und `NEXT_PUBLIC_DISPATCH_TOKEN`
sind dagegen Bestandteil des Frontends und können im Browser ausgelesen werden.

Messwerte hängen vom Gerät und den aufgezeichneten Daten ab. Leere Antworten
führen nicht zu geschätzten Ersatzwerten. Bei optionalen Abruffehlern bleibt der
letzte Stand erhalten; Anmeldefehler und Anfragelimits brechen den Export ab.
Der Hinweis zum Datenstand in der Oberfläche lässt sich bei Bedarf aufklappen.

## Lokale Exporte und Entwicklung

Wenn du die Daten lokal statt über GitHub Actions abrufen möchtest:

```bash
uv run scripts/export_data.py
uv run scripts/export_details.py
```

Standardmäßig liegen die lokalen Garmin-Tokens unter `.garmin_tokens/`. Mit
`--token-dir PFAD` beim Setup und `GARMINTOKENS` beim Export kannst du einen anderen
Tokenordner verwenden. `GARMIN_TOKENS_JSON` hat Vorrang, wenn diese
Umgebungsvariable gesetzt ist.

Aktivitätsdetails werden gecacht. `--force` lädt sie neu; `--limit 10` begrenzt den
Detailabruf, ohne die Aktivitätsliste zu kürzen. FIT-Dateien werden im
Arbeitsspeicher verarbeitet. Routenkoordinaten sind standardmäßig ausgeschlossen;
`--include-gps` ergänzt sie für entsprechend geschützte Instanzen.

Für die lokale Frontend-Entwicklung benötigst du nur den exportierten Datenstand
unter `docs/data/`. Entwicklungs- und Testbefehle stehen in der
[README](README.md#lokal-entwickeln).

## Bestehende Installationen aktualisieren

Aktualisiere zunächst deinen Fork und deinen lokalen Checkout. Wenn die
Garmin-Anmeldung erneuert werden muss, folge [Schritt 2](#2-garmin-anmelden) und
ersetze das Token-Secret.

`python-garminconnect` verwendet seit Version 0.3.0 DI-Tokens. Ältere
`garth`-Token-Dateien (`oauth1_token.json` und `oauth2_token.json`) lassen sich nicht
konvertieren und erfordern eine erneute Anmeldung.
[Upgrade-Hinweise der Bibliothek](https://github.com/cyberjunky/python-garminconnect#upgrading-from-02x-garth).

Falls deine Installation ein `GARMIN_PERSONAL_API_KEY`-Secret verwendet, richte
ebenfalls die Garmin-Connect-Anmeldung aus Schritt 2 ein. Der Personal-API-Key
wird nicht ausgewertet und kann nach einem erfolgreichen Abruf entfernt werden.
