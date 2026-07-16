# Garmin Manager

Persönliche Web-App, die deine Garmin-Connect-Daten synchronisiert, in einer lokalen
SQLite-DB verwaltet und darauf basierend tägliche Workout-Empfehlungen gibt (regelbasiert,
mit nachvollziehbarer Begründung statt Blackbox).

## Architektur

- **Backend**: FastAPI (Python), SQLite via SQLAlchemy, APScheduler für periodischen
  Hintergrund-Sync, `garminconnect` für den direkten Garmin-Connect-Zugriff.
- **Frontend**: React + TypeScript (Vite), TanStack Query, Recharts.
- **Deployment**: ein Docker-Image (Multi-Stage: Frontend-Build → FastAPI liefert die
  gebauten Static-Files mit aus), ein Port, eine SQLite-Datei.

Seiten: Heute (Empfehlung inkl. Begründung), Aktivitäten, Trends (VO2max, Ruhepuls, HRV,
Gewicht, Schlaf, Trainingslast, Body Battery, Wettkampf-Prognosen), Gear, Trainingspläne,
Einstellungen (Sync-Status, manueller Sync).

## Wichtig: Garmin-Zugangsdaten

Die App synchronisiert direkt mit Garmin Connect. Dein Passwort wird **nirgends
gespeichert** und landet nie in einer Konfigurationsdatei: Der einmalige Login läuft über
ein Skript, das dich interaktiv nach E-Mail/Passwort fragt (Passwort-Eingabe versteckt via
`getpass`) und danach nur einen Session-Token-Cache auf der Platte ablegt. Diesen Cache
verwendet das Backend danach automatisch weiter.

## Setup (lokal, ohne Docker)

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows
pip install -r requirements.txt

cp ../.env.example ../.env     # bei Bedarf anpassen

# Einmaliger Garmin-Login (im eigenen Terminal, Passwort wird nicht angezeigt/gespeichert):
python scripts/login.py

# Backend starten:
uvicorn app.main:app --reload --port 8000
```

Frontend (separates Terminal):

```bash
cd frontend
npm install
npm run dev
```

Der Vite-Dev-Server proxied `/api/*` automatisch an `http://127.0.0.1:8000` (siehe
`frontend/vite.config.ts`).

### Ohne eigenen Garmin-Login testen

Zum Ausprobieren/Verifizieren der App ohne Garmin-Login gibt es ein Seed-Skript mit
echten (bereits abgerufenen) Beispieldaten:

```bash
python backend/scripts/seed_sample_data.py
```

## Setup (Docker / Deployment)

```bash
docker compose build

# Einmaliger interaktiver Garmin-Login (Token landet im "garmin_data"-Volume):
docker compose run --rm garmin-app python scripts/login.py

# App starten:
docker compose up -d
```

Danach ist die App unter `http://<server>:8000` erreichbar (Frontend + API in einem
Container). Der Sync läuft automatisch alle `SYNC_INTERVAL_MINUTES` (Default 120) im
Hintergrund; ein manueller Sync ist über die Einstellungen-Seite oder
`POST /api/settings/sync` möglich.

## Tests

```bash
cd backend
pytest
```

Die Recommendation-Engine (`app/recommendations.py`) ist bewusst als reine, testbare
Funktion gebaut - keine versteckte Logik, jede Empfehlung kommt mit einer Liste der
konkreten Zahlen, die zur Entscheidung geführt haben.
