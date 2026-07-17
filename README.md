# GarminTool 🏊🚴🏃

Persönliches Trainings-Dashboard, gespeist aus **allen verfügbaren Garmin-Connect-Daten** —
als rein statische Seite, gehostet auf **GitHub Pages**.

**Features**

- 🤖 **ATLAS** — KI-Trainingsassistent (Jarvis-Stil) im Chat-Panel unten rechts. Kennt alle
  Dashboard-Daten und beantwortet Fragen zu Training, Form und Erholung. Läuft über die
  Claude-API mit deinem eigenen API-Key (nur im Browser-localStorage).
- 🔄 **Daten aktualisieren** — Button im Header startet den GitHub-Workflow, der frische
  Garmin-Daten zieht, und lädt die Seite neu, sobald sie live sind. Braucht einen
  GitHub-Token (siehe unten).
- 🎯 **Trainingsvorschlag für heute** — regelbasiert und erklärbar (Belastungsquote ACWR,
  Form/TSB, Schlaf, Body Battery, Ruhepuls-Abweichung, Garmin-Load-Balance, Reiz-Rotation,
  Sport-Rotation Laufen/Rad/Schwimmen). Jede Empfehlung nennt die Zahlen dahinter.
- 🔥 **Streaks & Konsistenz** — Wochen-Serien, aktive Tage, GitHub-Style-Aktivitätskalender.
- 📋 **Letzte Einheiten** mit sportart-spezifischen Kennzahlen (Pace, Watt, /100m, Sätze).
- 📈 **Fortschritts-Charts**: Trainingslast CTL/ATL/TSB, Wochenvolumen je Sportart, VO₂max,
  Trainingslast-Fokus vs. Garmin-Zielbereiche, Wettkampf-Prognosen (5 km – Marathon) im Verlauf,
  Lauf-Pace-, Rad-Tempo-, Rad-Leistungs- und Schwimm-Pace-Trends.
- ❤️ **Gesundheit**: Ruhepuls, Schlaf-Score, Schlafphasen, Body Battery, Stress, Schritte,
  Intensitätsminuten.
- 🏋️ **Krafttraining**, 🏅 **Persönliche Rekorde**, 🎖 **Abzeichen**.
- Burger-Menü zur Navigation, globaler Zeitraum-Filter (90 T / 180 T / 1 J / Alles),
  Tabellenansicht zu jedem Chart, responsive, dunkles Design im Stil von nicoegerer.de.

Sektionen ohne Daten (z. B. HRV-Status/Training Readiness, die der Forerunner 945 nicht liefert)
werden automatisch ausgeblendet.

## Architektur

```
scripts/export_data.py   zieht alle Garmin-Daten → docs/data/*.json   (Python, uv)
docs/                    statisches Dashboard (HTML/CSS/JS + Chart.js) ← GitHub Pages
```

Kein Build-Schritt, kein Server: Das Dashboard liest die exportierten JSON-Dateien direkt.

## Daten aktualisieren

Voraussetzung: einmalige Garmin-Anmeldung, deren Token-Cache unter `~/.garminconnect` liegt
(wird z. B. vom Garmin-MCP angelegt).

```powershell
uv run scripts/export_data.py          # zieht alles neu nach docs/data/
git add docs/data && git commit -m "data refresh" && git push
```

Optionen: `--days 400` (Fenster der Tages-Zeitreihen), `--out docs/data`.

**Privatsphäre:** Das Export-Script lässt GPS-Startkoordinaten und Geburtsdatum bewusst weg —
die JSON-Dateien werden öffentlich gehostet. Bedenke, dass Aktivitätsnamen (z. B. Ortsnamen)
und alle Gesundheitswerte öffentlich sichtbar sind, sobald das Repo/Pages öffentlich ist.

## GitHub Pages einrichten

1. Repo zu GitHub pushen.
2. **Settings → Pages → Source: „Deploy from a branch“**, Branch `main`, Ordner **`/docs`**.
3. Danach ist die Seite unter `https://<user>.github.io/GarminTool/` erreichbar.

### Eigene Domain

- **`garmintool.nicoegerer.de` (empfohlen):** In Settings → Pages die Custom Domain eintragen
  (GitHub legt dann eine `docs/CNAME`-Datei an). Beim DNS-Anbieter einen **CNAME-Record**
  `garmintool → <user>.github.io` setzen. „Enforce HTTPS“ aktivieren.
- **`nicoegerer.de/GarminTool`:** funktioniert nur, wenn `nicoegerer.de` selbst schon die
  GitHub-Pages-User-Site desselben Accounts ist (Repo `<user>.github.io`) — dann sind
  Projekt-Repos automatisch unter dem Pfad erreichbar. Liegt die Domain woanders, nimm die
  Subdomain-Variante.

Alle Pfade im Dashboard sind relativ — beide Varianten funktionieren ohne Anpassung.

## Automatischer Daten-Refresh (optional)

Der Workflow `.github/workflows/refresh-data.yml` aktualisiert die Daten alle 2 Stunden.
Dafür ein Repo-Secret **`GARMIN_TOKENS_JSON`** anlegen mit dem Inhalt der Datei
`~/.garminconnect/garmin_tokens.json`.

⚠️ Hinweise:
- Das Secret ist ein Login-Token für dein Garmin-Konto — sorgsam behandeln.
- Tokens laufen irgendwann ab; dann das Secret mit der aktuellen lokalen Datei erneuern.
- Ohne Secret überspringt der Workflow den Export einfach.

## Die zwei Buttons (Tokens einrichten)

Beide Tokens werden **nur im localStorage deines Browsers** gespeichert und ausschließlich an
den jeweiligen Anbieter geschickt — sie landen nie im Repo.

| Button | Token | Wo erstellen |
|---|---|---|
| 🔄 Daten aktualisieren | GitHub Fine-grained PAT, nur Repo `GarminTool`, Berechtigung **Actions: Read and write** | [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) |
| 🤖 ATLAS | Anthropic API-Key (`sk-ant-…`) | [platform.claude.com/settings/keys](https://platform.claude.com/settings/keys) |

Beim ersten Klick fragt die Seite nach dem jeweiligen Token. Voraussetzung für den
Refresh-Button ist zusätzlich das Repo-Secret `GARMIN_TOKENS_JSON` (siehe oben) — sonst
überspringt der Workflow den Export.

⚠️ ATLAS ruft die Claude-API direkt aus dem Browser auf (`anthropic-dangerous-direct-browser-access`).
Das ist für ein Single-User-Dashboard mit deinem eigenen Key in Ordnung; teile die Seite nicht
mit hinterlegtem Key auf einem fremden Gerät.

## Lokale Vorschau

```powershell
python -m http.server 8123 --directory docs
# → http://localhost:8123
```

(Direktes Öffnen per file:// funktioniert nicht, weil `fetch` die JSON-Dateien laden muss.)
