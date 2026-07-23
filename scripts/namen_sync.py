#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["garminconnect>=0.3.5"]
# ///
"""
namen_sync.py - Uebertraegt Aktivitaetsnamen von Strava nach Garmin Connect.

Laeuft sowohl lokal (config.json neben dem Skript) als auch in der Action:
dort kommen die Strava-Zugangsdaten aus der Umgebungsvariablen
STRAVA_CONFIG_JSON, und der Garmin-Login nutzt den Token-Store, den der
Workflow bereitstellt. Im Refresh-Workflow laeuft das Skript VOR dem Export,
damit umbenannte Aktivitaeten sofort mit dem neuen Namen exportiert werden.

Gedacht fuer den Fall: Uhr laedt automatisch zu Garmin und Strava hoch,
benannt wird nur auf Strava. Dieses Skript holt die Namen nach.

Einmalig einrichten:
    1. Auf https://www.strava.com/settings/api eine App anlegen.
       "Authorization Callback Domain" MUSS  localhost  lauten.
    2. Client ID und Client Secret in config.json eintragen.
    3. python namen_sync.py --setup    -> Browser oeffnet sich, einmal bestaetigen

Danach:
    python namen_sync.py              -> zeigt nur an, was sich aendern wuerde
    python namen_sync.py --execute    -> uebertraegt die Namen

Fuer den automatischen Betrieb siehe --hilfe-aufgabenplanung.

Voraussetzung:
    pip install garminconnect
"""

import argparse
import http.server
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timedelta, timezone


CONFIG = "config.json"
LOGFILE = "namen_sync.log"
TOKENSTORE = os.path.expanduser("~/.garminconnect")
PORT = 8721
PAUSE = 1.5

# Stravas Automatiknamen - die sind keine bewusste Benennung und
# ueberschreiben in Garmin oft den besseren Ortsnamen.
STANDARD = re.compile(
    r"^(Morning|Lunch|Afternoon|Evening|Night)\s+"
    r"(Run|Ride|Swim|Walk|Hike|Hiking|Workout|Weight Training|Elliptical|Yoga|"
    r"Velomobile|E-Bike Ride|Gravel Ride|Mountain Bike Ride|Virtual Ride|Virtual Run)$",
    re.IGNORECASE,
)


# Garmin-Namen enthalten gelegentlich unsichtbare Zeichen (z.B. U+200B in
# "Krafttrai<zwsp>ning"). Auf einer cp1252-Konsole bricht print() daran ab.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass


def log(text):
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  {text}"
    print(text)
    try:
        with open(LOGFILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- Konfiguration

VORLAGE = {
    "strava_client_id": "",
    "strava_client_secret": "",
    "strava_refresh_token": "",
    "tage_zurueck": 30,
    "standardnamen_uebernehmen": False,
}


def load_config():
    # In der Action gibt es keine config.json - die Zugangsdaten kommen als
    # JSON in STRAVA_CONFIG_JSON (analog zu GARMIN_TOKENS_JSON).
    raw = os.environ.get("STRAVA_CONFIG_JSON", "").strip()
    if raw:
        cfg = json.loads(raw)
        for key, val in VORLAGE.items():
            cfg.setdefault(key, val)
        if not cfg["strava_client_id"] or not cfg["strava_client_secret"]:
            sys.exit("STRAVA_CONFIG_JSON: Client ID / Secret fehlen.")
        return cfg

    if not os.path.exists(CONFIG):
        with open(CONFIG, "w", encoding="utf-8") as fh:
            json.dump(VORLAGE, fh, indent=2, ensure_ascii=False)
        print(f"{CONFIG} wurde angelegt.\n")
        print("Jetzt auf https://www.strava.com/settings/api eine App anlegen")
        print('(Authorization Callback Domain:  localhost ), dann Client ID und')
        print(f"Client Secret in {os.path.abspath(CONFIG)} eintragen.")
        print("\nDanach:  python namen_sync.py --setup")
        sys.exit(1)

    with open(CONFIG, encoding="utf-8") as fh:
        cfg = json.load(fh)
    for key, val in VORLAGE.items():
        cfg.setdefault(key, val)
    if not cfg["strava_client_id"] or not cfg["strava_client_secret"]:
        sys.exit(f"Client ID / Secret fehlen in {os.path.abspath(CONFIG)}")
    return cfg


def save_config(cfg):
    # In der Action ist die Datei fluechtig: rotiert Strava das Refresh-Token,
    # muss das Secret von Hand nachgezogen werden - deshalb laut hinweisen.
    if os.environ.get("STRAVA_CONFIG_JSON", "").strip():
        log("ACHTUNG: Strava hat das Refresh-Token gewechselt. Neues Token:")
        log(f"  {cfg['strava_refresh_token']}")
        log("  Bitte im Secret STRAVA_CONFIG_JSON eintragen, sonst schlaegt der")
        log("  naechste Lauf fehl.")
        return
    with open(CONFIG, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------- Strava

def post_token(cfg, payload):
    payload.update({"client_id": cfg["strava_client_id"],
                    "client_secret": cfg["strava_client_secret"]})
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request("https://www.strava.com/oauth/token", data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        sys.exit(f"Strava lehnt ab ({exc.code}): {exc.read().decode()[:200]}")


def setup(cfg):
    """Einmalige Freigabe ueber den Browser."""
    code_box = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            code_box["code"] = params.get("code", [None])[0]
            code_box["error"] = params.get("error", [None])[0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            ok = code_box["code"] is not None
            text = ("Fertig. Du kannst dieses Fenster schliessen."
                    if ok else "Es hat nicht geklappt - zurueck ins Terminal.")
            self.wfile.write(f"<html><body><h2>{text}</h2></body></html>"
                             .encode("utf-8"))

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.handle_request, daemon=True).start()

    url = "https://www.strava.com/oauth/authorize?" + urllib.parse.urlencode({
        "client_id": cfg["strava_client_id"],
        "redirect_uri": f"http://localhost:{PORT}/",
        "response_type": "code",
        "approval_prompt": "force",
        "scope": "activity:read_all",
    })
    print("Browser oeffnet sich. Falls nicht, diese Adresse aufrufen:\n")
    print(url + "\n")
    webbrowser.open(url)

    for _ in range(180):
        if code_box:
            break
        time.sleep(1)
    server.server_close()

    if not code_box.get("code"):
        sys.exit(f"Keine Freigabe erhalten ({code_box.get('error') or 'Zeit abgelaufen'}).")

    token = post_token(cfg, {"code": code_box["code"],
                             "grant_type": "authorization_code"})
    cfg["strava_refresh_token"] = token["refresh_token"]
    save_config(cfg)
    print(f"\nGeschafft. Refresh-Token in {CONFIG} gespeichert.")
    print("Ab jetzt laeuft das Skript ohne Browser.")


def strava_activities(cfg, since):
    if not cfg.get("strava_refresh_token"):
        sys.exit("Kein Refresh-Token - bitte einmal 'python namen_sync.py --setup' laufen lassen.")

    token = post_token(cfg, {"refresh_token": cfg["strava_refresh_token"],
                             "grant_type": "refresh_token"})
    if token.get("refresh_token") != cfg["strava_refresh_token"]:
        cfg["strava_refresh_token"] = token["refresh_token"]
        save_config(cfg)          # Strava rotiert das Token gelegentlich

    after = int(since.replace(tzinfo=timezone.utc).timestamp())
    out, page = [], 1
    while True:
        url = ("https://www.strava.com/api/v3/athlete/activities?"
               + urllib.parse.urlencode({"after": after, "per_page": 100, "page": page}))
        req = urllib.request.Request(
            url, headers={"Authorization": f"Bearer {token['access_token']}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                batch = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            sys.exit(f"Strava-Abfrage fehlgeschlagen ({exc.code}): {exc.read().decode()[:200]}")
        if not batch:
            break
        out.extend(batch)
        if len(batch) < 100:
            break
        page += 1

    result = []
    for act in out:
        raw = act.get("start_date_local")          # bereits Ortszeit
        if not raw:
            continue
        try:
            dt = datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
        result.append({"start": dt, "name": (act.get("name") or "").strip(),
                       "typ": act.get("type", "")})
    return result


# ---------------------------------------------------------------- Garmin

def garmin_login():
    from garminconnect import Garmin
    try:
        api = Garmin()
        api.login(TOKENSTORE)
        return api
    except Exception as exc:
        # Ohne TTY (Action) darf hier nichts nach Eingaben fragen.
        if not sys.stdin.isatty():
            sys.exit(f"Garmin-Login ueber Token-Store {TOKENSTORE} fehlgeschlagen: {exc}")
        import getpass
        print("Kein gueltiger Token-Cache - bitte einmal anmelden.")
        api = Garmin(input("Garmin E-Mail: ").strip(), getpass.getpass("Passwort: "))
        api.login()
        try:
            api.garth.dump(TOKENSTORE)
        except Exception:
            pass
        return api


def garmin_activities(api, since):
    start = (since - timedelta(days=1)).strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    out = []
    for act in api.get_activities_by_date(start, end):
        raw = act.get("startTimeLocal")
        dt = None
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                dt = datetime.strptime(raw, fmt)
                break
            except (ValueError, TypeError):
                continue
        if dt is None:
            continue
        typ = (act.get("activityType") or {}).get("typeKey", "")
        out.append({"id": act.get("activityId"), "start": dt,
                    "name": (act.get("activityName") or "").strip(), "typ": typ})
    return out


# ---------------------------------------------------------------- Abgleich

def pair_up(strava, garmin, tol):
    """Jede Garmin-Aktivitaet bekommt hoechstens eine Strava-Aktivitaet."""
    treffer, belegt = [], set()
    kandidaten = []
    for s in strava:
        for g in garmin:
            d = abs((g["start"] - s["start"]).total_seconds())
            if d <= tol:
                kandidaten.append((d, s, g))
    kandidaten.sort(key=lambda x: x[0])          # beste Paare zuerst

    genutzt_s, genutzt_g = set(), set()
    for d, s, g in kandidaten:
        if id(s) in genutzt_s or g["id"] in genutzt_g:
            continue                              # Mehrdeutigkeit -> ueberspringen
        genutzt_s.add(id(s))
        genutzt_g.add(g["id"])
        treffer.append((s, g))
    return treffer


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--setup", action="store_true", help="einmalige Strava-Freigabe")
    p.add_argument("--execute", action="store_true", help="Namen wirklich uebertragen")
    p.add_argument("--tage", type=int, help="wie weit zurueck (Standard aus config.json)")
    p.add_argument("--tolerance", type=int, default=600, help="Sekunden Startzeit-Toleranz")
    p.add_argument("--alle-namen", action="store_true",
                   help="auch Stravas Automatiknamen uebernehmen")
    p.add_argument("--hilfe-aufgabenplanung", action="store_true")
    args = p.parse_args()

    if args.hilfe_aufgabenplanung:
        print(AUFGABENPLANUNG)
        return

    cfg = load_config()
    if args.setup:
        setup(cfg)
        return

    tage = args.tage or cfg["tage_zurueck"]
    auch_standard = args.alle_namen or cfg["standardnamen_uebernehmen"]
    since = datetime.now() - timedelta(days=tage)

    log(f"--- Lauf gestartet, {tage} Tage zurueck ---")
    strava = strava_activities(cfg, since)
    log(f"Strava: {len(strava)} Aktivitaeten")

    api = garmin_login()
    garmin = garmin_activities(api, since)
    log(f"Garmin: {len(garmin)} Aktivitaeten")

    aenderungen, uebersprungen = [], 0
    for s, g in pair_up(strava, garmin, args.tolerance):
        if not s["name"] or s["name"] == g["name"]:
            continue
        if not auch_standard and STANDARD.match(s["name"]):
            uebersprungen += 1
            continue
        aenderungen.append((s, g))

    aenderungen.sort(key=lambda x: x[1]["start"])

    if uebersprungen:
        log(f"{uebersprungen} Automatiknamen uebersprungen "
            f"(mit --alle-namen trotzdem uebernehmen)")

    if not aenderungen:
        log("Nichts zu tun - alle Namen stimmen ueberein.")
        return

    log(f"\n{len(aenderungen)} Namen weichen ab:\n")
    for s, g in aenderungen:
        log(f"  {g['start']:%d.%m.%Y %H:%M}  {g['name'][:34]:36s} -> {s['name']}")

    if not args.execute:
        log("\nNur Vorschau - mit --execute uebertragen.")
        return

    ok, fehler = 0, 0
    print()
    for s, g in aenderungen:
        try:
            api.set_activity_name(g["id"], s["name"])
            ok += 1
            log(f"  gesetzt: {g['start']:%d.%m.%Y}  {s['name']}")
        except Exception as exc:
            fehler += 1
            log(f"  FEHLER {g['id']}: {str(exc)[:80]}")
        time.sleep(PAUSE)

    log(f"\nFertig: {ok} uebertragen, {fehler} fehlgeschlagen.")


AUFGABENPLANUNG = """
Automatisch laufen lassen (Windows)
===================================

1. Startmenue -> "Aufgabenplanung" oeffnen
2. Rechts auf "Einfache Aufgabe erstellen..."
3. Name:      Strava-Namen nach Garmin
4. Trigger:   Taeglich, z.B. 23:30 Uhr
5. Aktion:    Programm starten
   Programm/Skript:  py
   Argumente:        namen_sync.py --execute
   Starten in:       der Ordner, in dem dieses Skript liegt
                     (vollstaendiger Pfad, ohne Anfuehrungszeichen)
6. Fertigstellen. Danach in den Eigenschaften der Aufgabe:
   "Unabhaengig von der Benutzeranmeldung ausfuehren" waehlen,
   damit kein Fenster aufpoppt.

Was passiert:
   Jede Nacht werden die letzten 30 Tage abgeglichen. Benennst du
   einen Lauf auf Strava um, steht der neue Name spaetestens am
   naechsten Morgen auch in Garmin.

Kontrolle:
   namen_sync.log im selben Ordner protokolliert jeden Lauf.
"""


if __name__ == "__main__":
    main()
