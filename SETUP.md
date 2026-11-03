# Eigene Instanz aufsetzen oder migrieren

Jeder betreibt seine eigene Kopie unter dem eigenen GitHub-Account. Die
Datenabfrage läuft über die offiziellen Garmin- und Strava-APIs. Es wird kein
Garmin-Passwort und kein Garmin-MCP benötigt.

## Bestehende Instanz umstellen

1. In [Garmin Connect → Personal API Key](https://connect.garmin.com/app/settings/personalApiToken)
   einen Schlüssel erstellen und seine Gültigkeitsdauer auswählen.
2. Im Repo unter **Settings → Secrets and variables → Actions** als Secret
   `GARMIN_PERSONAL_API_KEY` hinterlegen.
3. Den aktualisierten Workflow **„Garmin-Daten aktualisieren“** manuell starten.
4. Nach erfolgreichem Wechsel das alte Secret `GARMIN_TOKENS_JSON` entfernen.
   Alte lokale Garmin-MCP-/`garminconnect`-Tokenstores werden nicht mehr gelesen.

Die alten Skriptnamen `setup_garmin_token.py` und `namen_sync.py` wurden
entfernt. Die aktuellen Befehle heißen `scripts/setup_garmin_api.py` und
`scripts/sync_strava_names.py`; die offizielle Strava-Freigabe bleibt gültig.

Ein vorhandenes `STRAVA_CONFIG_JSON` mit `strava_client_id`,
`strava_client_secret` und `strava_refresh_token` kann weiterverwendet werden,
sofern der Refresh-Token noch gültig ist. Andernfalls Strava wie unten erneut
freigeben. Die Tokens werden bei der Umstellung nicht in Logs ausgegeben.

Die Garmin Personal API ist **read-only**. Der Strava-Namensabgleich aktualisiert
jetzt ausschließlich die Dashboard-Dateien. Er benennt keine Aktivitäten im
Garmin-Konto um. Siehe [offizielle Endpunktdokumentation](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/).

## Warum nicht einfach zwei Keys?

Für den Datenabruf sind es tatsächlich nur **zwei Secret-Einträge**:

| Secret | Funktion | Kann weg? |
| --- | --- | --- |
| `GARMIN_PERSONAL_API_KEY` | Offizieller persönlicher Garmin-API-Schlüssel | Nein, solange Garmin genutzt wird |
| `STRAVA_CONFIG_JSON` | Die offiziellen Strava-OAuth-Zugangsdaten in einem JSON-Block | Nur wenn Strava-Namen nicht benötigt werden |
| `NEXT_PUBLIC_GEMINI_KEY` | Zugriff des KI-Coachs auf Google Gemini | Wenn der KI-Coach nicht benötigt wird |
| `NEXT_PUBLIC_DISPATCH_TOKEN` | Berechtigung, von der Website aus einen GitHub-Workflow zu starten | Wenn der automatische Zwei-Stunden-Abruf genügt |
| `GARMIN_TOKENS_JSON` | Früherer inoffizieller Garmin-Login | Nach erfolgreicher Migration löschen |

Stravas offizieller Anmeldeweg ist OAuth. Dabei identifiziert die **Client-ID**
die Anwendung, das **Client-Secret** authentifiziert sie, und der
**Refresh-Token** repräsentiert die erteilte Kontofreigabe. Alle drei Werte
liegen zusammen in `STRAVA_CONFIG_JSON`. Der daraus bezogene **Access-Token**
wird automatisch erneuert und braucht keinen eigenen Secret-Eintrag. Der
Abruf läuft direkt zwischen GitHub Actions und Strava.

Die lokale Datei `strava-sync-local/config.json` enthält dieselben offiziellen
OAuth-Zugangsdaten für lokale Aufrufe. Sie wird nicht eingecheckt. Der
verschlüsselte Tokenstatus unter `.github/api-state/` ist für die automatische
Strava-Tokenrotation weiterhin erforderlich.

Die beiden optionalen Secrets gehören zu Google und GitHub. Ein Garmin- oder
Strava-Key berechtigt nicht zu deren Diensten. GitHub stellt dem geplanten
Workflow seinen eingebauten `GITHUB_TOKEN` automatisch bereit; dafür muss kein
weiteres Secret angelegt werden. Der zusätzliche Dispatch-Token wird nur
gebraucht, wenn der Button im Browser sofort einen neuen API-Abruf starten soll.
Ohne ihn lädt der Button den zuletzt veröffentlichten Datenstand. Ohne
Gemini-Key ist der KI-Coach nicht verfügbar; Garmin-/Strava-Export und Website
funktionieren weiterhin.

Projektbezogene alte `.garmin_tokens/`- oder `.garminconnect/`-Ordner und
`namen_sync.log` können entfernt werden, sofern sie ausschließlich für die alte
GarminTool-Anbindung genutzt wurden. Die aktuellen SDK-Schlüssel und
`.api-state/` bleiben erhalten. In dieser Repository-Version gibt es keinen
Passwort-/MFA-Login und keinen Rückfall auf die inoffizielle Garmin-API mehr.

## 1. Repo forken

Oben rechts **Fork** wählen. Die eigene Kopie liegt danach unter
`https://github.com/DEIN-NAME/GarminTool`.

## 2. Offiziellen Garmin-API-Schlüssel hinterlegen

Unter [Garmin Connect → Personal API Key](https://connect.garmin.com/app/settings/personalApiToken)
**Create Key** wählen, Bedingungen akzeptieren und Ablaufdatum festlegen. Der
Schlüssel wird nur einmal angezeigt. Direkt als Repository-Secret
`GARMIN_PERSONAL_API_KEY` speichern, nicht als `NEXT_PUBLIC_…`-Variable.

Garmins offizielles SDK tauscht den Schlüssel gegen einen Bearer-Token aus und
verwaltet dessen Erneuerung. Nach Ablauf oder Widerruf des **API-Schlüssels** muss
in Garmin Connect ein neuer erzeugt und das Secret ersetzt werden.

Für lokale Exporte ist Python 3.12+ erforderlich; [uv](https://docs.astral.sh/uv/)
installiert die Skriptabhängigkeiten automatisch. Optional den Schlüssel einmal
lokal eingeben und prüfen:

```bash
uv run scripts/setup_garmin_api.py
```

Das Skript fragt ausschließlich den API-Schlüssel verdeckt ab und speichert ihn
mit eingeschränkten Dateirechten im Standardpfad des offiziellen SDKs
`~/.config/garmin/connect-personal-api-key`. Alternativ unterstützt das SDK die
Umgebungsvariable `GARMIN_PERSONAL_API_KEY`. Der lokale Bearer-Cache liegt in
`.api-state/` und ist von Git ausgeschlossen.

```bash
uv run scripts/setup_garmin_api.py --check
uv run scripts/export_data.py
uv run scripts/export_details.py
```

Referenzen: [Garmin Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/),
[offizielles Python-SDK](https://github.com/garmin/connect-personal-api-python).

### Anzeigename

Die Personal API kann in `displayName` eine technische Konto-ID zurückgeben.
Der Export verwendet solche IDs nicht als Namen und behält einen zuvor
gespeicherten lesbaren Namen bei. Falls für eine neue Installation kein Name
verfügbar ist, bleibt die Begrüßung neutral.

Ein eigener Anzeigename lässt sich unter **Settings → Secrets and variables →
Actions → Variables** als `DASHBOARD_DISPLAY_NAME` setzen. Das ist eine normale
Variable, kein zusätzliches Secret und kein API-Key. Sie hat Vorrang vor den
Profilangaben und wird beim nächsten Refresh übernommen. Lokal unterstützt der
Export dieselbe Umgebungsvariable.

## 3. Strava-Namen im Dashboard (optional)

1. Unter [strava.com/settings/api](https://www.strava.com/settings/api) eine App
   anlegen. **Authorization Callback Domain:** `localhost`.
2. Im Repo ausführen:
   ```bash
   uv run scripts/sync_strava_names.py --setup
   ```
   Client ID und Client Secret eingeben und die Freigabe im Browser bestätigen.
   Das Skript benötigt `activity:read_all`, damit auch private Aktivitäten
   abgeglichen werden können. Der Rückruf läuft nur auf `127.0.0.1:8721` und wird
   mit OAuth-`state` geprüft.
3. Den Inhalt von `strava-sync-local/config.json` als Repository-Secret
   `STRAVA_CONFIG_JSON` hinterlegen. Die Datei ist von Git ausgeschlossen.
4. Lokal nach dem Garmin-Export ausführen:
   ```bash
   uv run scripts/sync_strava_names.py            # Anzahl gefundener Änderungen
   uv run scripts/sync_strava_names.py --execute  # Namen im Dashboard speichern
   ```

Die Zuordnung berücksichtigt Sportart und lokale Startzeit. Automatiknamen wie
„Morning Run“ werden standardmäßig übersprungen; `--alle-namen` übernimmt sie
bei Bedarf. Mit `--tage 60` lässt sich der Zeitraum erweitern.

Strava kann Refresh-Tokens rotieren. Der Workflow persistiert den jeweils
neuesten Token **verschlüsselt** in `.github/api-state/*.enc`. Der Schlüssel wird
aus den Zugangsdaten in `STRAVA_CONFIG_JSON` abgeleitet und nicht eingecheckt.
Dadurch übersteht der Tokenstatus auch Workflow-Pausen und Cache-Löschungen.
Lokale Aufrufe verwenden `.api-state/`. Der Refresh läuft auf der Standardbranch;
parallele Läufe werden serialisiert. Dieselbe Strava-Freigabe nicht gleichzeitig in
mehreren Instanzen verwenden; jede Instanz benötigt ihren eigenen Tokenstatus.

Auch wenn die anschließende Strava-Abfrage scheitert, wird ein bereits rotierter
Token verschlüsselt gesichert. Strava-Fehler blockieren den Garmin-Export nicht.
Die ursprüngliche Konfigurationsdatei bzw. das ursprüngliche Secret unverändert
aufbewahren: Sie werden weiterhin zum Entschlüsseln des Tokenstatus gebraucht.
Bei einer neuen Freigabe die neue Konfiguration als Secret hinterlegen.

Referenz: [Strava OAuth und Tokenrotation](https://developers.strava.com/docs/authentication/).

## Verfügbare Garmin-Daten

Der Export verwendet ausschließlich dokumentierte Personal-API-Endpunkte:

- Aktivitätsliste und Zusammenfassungen; vorhandene Trainingslastwerte fließen
  weiter in CTL/ATL/TSB ein.
- Schritte, Stress, Ruhepuls, Schlaf, HRV, Body Battery und Intensitätsminuten.
- Gewicht/Körperzusammensetzung, Fitnessalter und aktuelle Herzfrequenzzonen.
- Runden, Laufmetriken, Schwimmbahnen und Kraftsätze, soweit sie in der über die
  offizielle API heruntergeladenen FIT-Datei enthalten sind. Originaldateien
  werden nur im Arbeitsspeicher verarbeitet und nicht veröffentlicht.

VO₂max-Zeitreihen, Trainingsbereitschaft/-status, Wettkampfprognosen,
Endurance-/Hill-Score, Geräteprofil, Rekorde/Badges, Ausrüstung und
Kalender-Workouts haben derzeit keine entsprechenden Personal-API-Endpunkte.
Vorhandene Exporte bleiben erhalten; `manifest.json` kennzeichnet diese Bereiche
mit `status: unavailable` und `retained`. Neue Werte werden dafür nicht behauptet.
Die Seite zeigt bei gespeicherten VO₂max-, Trainingsstatus-, Prognose- oder
Rekorddaten einen entsprechenden Hinweis. Auch der KI-Coach erhält diese
Einschränkung, damit er historische Angaben nicht als neue Messungen behandelt.
Optionale Abfragefehler behalten ebenfalls den letzten verfügbaren Stand.
Fehler bei Authentifizierung oder Aktivitätsliste brechen den Export ab.

Bereits exportierte Aktivitätsdetails bleiben gecacht. Neue Details enthalten
nur die offiziell verfügbaren Felder; separate Wetter-/Leistungszonen-Abfragen
werden nicht mehr durchgeführt. Herzfrequenz-Zeiten stammen aus der
Aktivitätsliste, ihre Grenzen aus den aktuellen Profilzonen. Fehlende FIT-Dateien
werden bei späteren Läufen erneut versucht. Mit `--force` können Details neu
abgerufen werden; `--limit 10` beschränkt die Abfragen auf zehn Aktivitäten,
ohne den vollständigen Aktivitätsindex zu kürzen.

## 4. KI-Coach (optional)

Einen Google-Gemini-Key auf [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
erstellen und als Secret `NEXT_PUBLIC_GEMINI_KEY` hinterlegen.

Dieser bestehende Frontend-Key ist für Seitenbesucher im JavaScript sichtbar.
Garmin- und Strava-Zugangsdaten gehören ausschließlich in die oben genannten
Secrets und werden nicht in das Frontend eingebaut.

## 5. Sofort-Aktualisieren-Button (optional)

Ohne zusätzliche Einrichtung lädt der Button den zuletzt veröffentlichten Stand.
Die Daten erneuern sich alle zwei Stunden. Für einen Workflow-Start per Button
einen [Fine-grained PAT](https://github.com/settings/personal-access-tokens) mit
**Actions: Read and write** ausschließlich für dieses Repo erstellen und als
Secret `NEXT_PUBLIC_DISPATCH_TOKEN` hinterlegen.

Dieser bestehende Dispatch-Token landet im öffentlichen Bundle. Ihn deshalb auf
das eine Repo und die benötigte Actions-Berechtigung begrenzen.

## 6. GitHub Pages aktivieren und starten

1. **Settings → Pages → Build and deployment → Source: GitHub Actions** wählen.
2. Unter **Actions** die Workflows aktivieren.
3. **„Garmin-Daten aktualisieren“ → Run workflow** starten.

Nach dem Datenabruf startet der Seiten-Build automatisch. Die Standardadresse
ist `https://DEIN-NAME.github.io/GarminTool/`.

Für die eigene Domain `app/public/CNAME` anpassen und beim DNS-Anbieter einen
CNAME auf `DEIN-NAME.github.io` setzen. Unter **Settings → Pages → Custom domain**
eintragen. Für die Standardadresse die vorhandene `app/public/CNAME` entfernen;
der Build setzt dann automatisch den Repository-Unterpfad.

## Datenschutz

Bei einem öffentlichen Repo und öffentlichen GitHub Pages sind die exportierten
Trainings- und Gesundheitsdaten unter `/data/*.json` für jeden lesbar. GPS-Felder
werden standardmäßig ausgeschlossen, auch bei der FIT-Verarbeitung. Die Option
`export_details.py --include-gps` nur bei zugangsgeschütztem Hosting verwenden.
Für private Gesundheitsdaten einen privaten Fork und einen zugangsgeschützten
Host einsetzen.
