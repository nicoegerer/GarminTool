# GarminTool

Ein privates Trainings-Dashboard aus deinen Garmin-Connect-Daten: Aktivitäten
mit allen Details, Trainingslast & Form (CTL/ATL/TSB), VO₂max- und
Pace-Entwicklung, Gesundheitswerte, Rekorde und ein KI-Coach. Optional werden
Aktivitätsnamen von Strava übernommen.

Läuft komplett kostenlos auf **GitHub Actions** (holt die Daten alle 2 Stunden)
und **GitHub Pages** (statische Next.js-Seite). Kein Server, keine laufenden
Kosten.

## Eigene Instanz

Das Tool ist selbst-gehostet — jeder betreibt seine **eigene Kopie** unter dem
eigenen GitHub-Account, mit den eigenen Zugangsdaten in den eigenen Secrets.

👉 **Anleitung: [SETUP.md](SETUP.md)** (Fork, Garmin-Token, optional Strava &
KI-Coach, GitHub Pages — ca. 15 Minuten).

Kurzfassung, warum es keine zentrale „Login mit Garmin"-Seite gibt: Garmin hat
kein Self-Service-API-Portal. Volle Garmin-Daten gibt es nur über den Login mit
E-Mail + Passwort — das gehört auf den eigenen Rechner, nicht in eine fremde
Website. Die eigene Kopie löst das sauber: Dein Passwort bleibt lokal, es
entsteht nur ein Token in deinen eigenen Secrets.

## Aufbau

- `app/` — Next.js-Frontend (statischer Export), liest `docs/data/*.json`.
- `scripts/` — Daten-Export aus Garmin (`export_data.py`, `export_details.py`),
  Garmin-Token-Setup (`setup_garmin_token.py`), Strava-Namensabgleich
  (`namen_sync.py`).
- `.github/workflows/` — `refresh-data.yml` (alle 2 h Daten holen),
  `deploy.yml` (Seite bauen & veröffentlichen).

## Technik

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Chart.js ·
Google Gemini (KI-Coach) · `garminconnect` (Python) für den Datenexport.
