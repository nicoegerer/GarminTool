# Eigene Instanz aufsetzen

Dieses Tool ist **selbst-gehostet**: Jeder betreibt seine **eigene Kopie**
unter seinem eigenen GitHub-Account. Deine Daten bleiben in deinem Repo, deine
Zugangsdaten in deinen eigenen GitHub-Secrets — niemand sonst sieht sie. Alles
läuft kostenlos auf GitHub Actions + GitHub Pages.

> **Warum keine zentrale Login-Seite?** Für Strava gäbe es dafür eine saubere
> OAuth-Anmeldung — für **Garmin nicht**. Garmin hat kein Self-Service-API-Portal;
> volle Garmin-Daten (HRV, Schlaf, Body Battery, Trainingslast) bekommt man nur
> über den inoffiziellen Login mit E-Mail + Passwort. Fremde Passwörter in eine
> zentrale Website eingeben zu lassen wäre unsicher, gegen Garmins Regeln und
> würde dich rechtlich für fremde Gesundheitsdaten verantwortlich machen.
> Die eigene Kopie umgeht das komplett: Dein Passwort verlässt nie deinen
> Rechner, es entsteht nur ein Token, und der liegt in **deinen** Secrets.

Zeitaufwand: ~15 Minuten. Du brauchst einen GitHub-Account und Python (oder
[uv](https://docs.astral.sh/uv/), empfohlen).

---

## 1. Repo forken

Oben rechts auf **Fork**. Du bekommst eine eigene Kopie
`https://github.com/DEIN-NAME/GarminTool`.

## 2. Garmin-Token erzeugen (Pflicht)

Das holt einen Token aus deinem Garmin-Konto. **Dein Passwort bleibt auf deinem
Rechner** — ausgegeben wird nur der Token.

```bash
# im geklonten Fork:
uv run scripts/setup_garmin_token.py
# ohne uv:  pip install "garminconnect>=0.3.5" && python scripts/setup_garmin_token.py
```

Das Skript fragt E-Mail + Passwort (und bei aktivem Zwei-Faktor einen Code) und
gibt am Ende einen JSON-Block aus. Den kompletten Block kopieren.

→ In deinem Fork: **Settings → Secrets and variables → Actions → New repository
secret**, Name `GARMIN_TOKENS_JSON`, den JSON-Block einfügen.

## 3. Strava-Namen (optional)

Nur nötig, wenn Aktivitätsnamen von Strava nach Garmin übernommen werden sollen.

1. [strava.com/settings/api](https://www.strava.com/settings/api) → App anlegen,
   **Authorization Callback Domain:** `localhost`.
2. Client ID + Client Secret notieren.
3. Refresh-Token holen:
   ```bash
   cd strava-sync-local   # Ordner ggf. anlegen
   # config.json mit client_id/secret anlegen (Vorlage: scripts/namen_sync.py --setup)
   python ../scripts/namen_sync.py --setup
   ```
4. Den Inhalt der entstandenen `config.json` als Secret `STRAVA_CONFIG_JSON`
   hinterlegen.

## 4. KI-Coach (optional)

1. Kostenlosen Google-Gemini-Key auf
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) erstellen.
2. Als Secret `NEXT_PUBLIC_GEMINI_KEY` hinterlegen.

> Hinweis: Dieser Key wird ins öffentliche JS-Bundle gebacken (damit der Coach
> ohne Setup läuft). Er ist damit für Besucher sichtbar. Beim kostenlosen
> Gemini-Kontingent entstehen keine Kosten — aktiviere für dieses Projekt kein
> Billing.

## 5. Sofort-Aktualisieren-Button (optional)

Ohne das lädt der „Aktualisieren"-Button nur den neuesten bereits
veröffentlichten Stand (die Daten erneuern sich ohnehin alle 2 Stunden von
selbst). Für einen echten Sofort-Abruf per Knopfdruck:

1. Fine-grained PAT erstellen ([github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens)),
   **nur dein GarminTool-Repo**, Permission **Actions: Read and write**, sonst nichts.
2. Als Secret `NEXT_PUBLIC_DISPATCH_TOKEN` hinterlegen.

> Dieser Token landet ebenfalls im öffentlichen Bundle. Deshalb so eng wie
> möglich scopen — im schlimmsten Fall kann jemand nur einen Refresh-Lauf
> deines Repos starten, mehr nicht.

## 6. GitHub Pages aktivieren

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

## 7. Actions freischalten und starten

1. Tab **Actions** öffnen, Workflows aktivieren (Forks starten sie nicht von selbst).
2. Workflow **„Garmin-Daten aktualisieren"** → **Run workflow**. Er holt deine
   Daten und stößt automatisch den Seiten-Build an.

Fertig. Deine Seite liegt unter `https://DEIN-NAME.github.io/GarminTool/`.

---

## Eigene Domain (optional)

Standardmäßig läuft die Seite unter `DEIN-NAME.github.io/GarminTool/` — der
Build setzt den Pfad automatisch passend. Willst du eine eigene Domain:

1. Datei `app/public/CNAME` mit deiner Domain anlegen (eine Zeile, z. B.
   `sport.meinedomain.de`).
2. Bei deinem DNS-Anbieter einen CNAME-Eintrag auf `DEIN-NAME.github.io` setzen.
3. **Settings → Pages → Custom domain** eintragen.

Sobald `app/public/CNAME` existiert, baut der Workflow automatisch ohne
Unterpfad — sonst mit `/<repo-name>`.

## Was ohne Garmin nur eingeschränkt geht

Der KI-Coach, HRV, Schlaf, Body Battery, Trainingslast und die Erholungs-Kacheln
stammen aus Garmin-Daten. Ohne Garmin-Token bleiben sie leer; Strava allein
liefert nur Aktivitäten (Läufe, Radtouren, Schwimmen mit Pace/Distanz).

## Datenschutz

Solange dein Repo **öffentlich** ist, sind deine exportierten Daten unter
`/data/*.json` für jeden lesbar (GPS-Koordinaten sind im Export bewusst
ausgeschlossen). Wenn du das nicht willst: Repo auf **privat** stellen und die
Seite über einen zugangsgeschützten Host (z. B. Cloudflare Pages + Access)
ausliefern statt über das öffentliche GitHub Pages.
