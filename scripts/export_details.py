# /// script
# requires-python = ">=3.11"
# dependencies = ["garminconnect>=0.3.5"]
# ///
"""Exports per-activity detail files consumed by the activity detail pages.

Writes one file per activity to <out>/activity/<id>.json containing everything
the watch recorded: sport-specific summary fields, per-lap splits, HR/power
zones, weather, and (for swims) per-length data.

Usage:
    uv run scripts/export_details.py [--out docs/data] [--limit 0] [--include-gps]

Cached by design: an activity's detail file is written once and skipped on
later runs (a finished activity never changes). Delete a file to refetch it.
This keeps the scheduled refresh at a handful of calls instead of ~900.

--include-gps adds route coordinates and per-split positions. Only enable this
once the site is access-controlled: the routes start at Nico's front door.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from garminconnect import Garmin

# Fields worth keeping from summaryDTO, grouped so the frontend can render
# per sport without guessing. Verified against this account's FR945 + HRM 600.
COMMON_FIELDS = [
    "duration", "movingDuration", "elapsedDuration", "distance", "calories", "bmrCalories",
    "averageHR", "maxHR", "minHR", "averageSpeed", "maxSpeed", "averageMovingSpeed",
    "elevationGain", "elevationLoss", "maxElevation", "minElevation", "avgElevation",
    "trainingEffect", "anaerobicTrainingEffect", "trainingEffectLabel",
    "aerobicTrainingEffectMessage", "anaerobicTrainingEffectMessage", "activityTrainingLoad",
    "moderateIntensityMinutes", "vigorousIntensityMinutes", "waterEstimated",
    "averageTemperature", "maxTemperature", "minTemperature",
    "avgRespirationRate", "maxRespirationRate", "minRespirationRate",
]

RUNNING_FIELDS = [
    "averageRunCadence", "maxRunCadence", "strideLength", "steps",
    "groundContactTime", "groundContactBalanceLeft", "verticalOscillation", "verticalRatio",
    "lactateThresholdHeartRate", "lactateThresholdSpeed", "maxVerticalSpeed",
]

CYCLING_FIELDS = [
    "averagePower", "maxPower", "normalizedPower", "trainingStressScore", "intensityFactor",
    "averageBikeCadence", "maxBikeCadence", "totalWork", "leftRightBalance",
    "beginPotentialStamina", "endPotentialStamina", "minAvailableStamina",
]

SWIMMING_FIELDS = [
    "averageSWOLF", "averageStrokes", "totalNumberOfStrokes", "averageSwimCadence",
    "poolLength", "numberOfActiveLengths", "activeLengths",
]

GPS_FIELDS = ["startLatitude", "startLongitude", "endLatitude", "endLongitude"]

LAP_FIELDS = [
    "lapIndex", "distance", "duration", "movingDuration", "elapsedDuration",
    "averageSpeed", "maxSpeed", "averageHR", "maxHR", "calories",
    "elevationGain", "elevationLoss", "averageRunCadence", "strideLength",
    "groundContactTime", "verticalOscillation", "verticalRatio",
    "averagePower", "maxPower", "normalizedPower", "averageBikeCadence",
    "averageSWOLF", "averageStrokes", "averageSwimCadence", "swimStroke",
    "numberOfActiveLengths", "averageStrokeDistance",
]

RUN_TYPES = {"running", "treadmill_running", "trail_running", "track_running"}
RIDE_TYPES = {"cycling", "road_biking", "indoor_cycling", "cyclocross", "gravel_cycling", "mountain_biking", "virtual_ride"}
SWIM_TYPES = {"lap_swimming", "open_water_swimming"}


def log(msg: str) -> None:
    print(msg, flush=True)


def pick(src: dict, fields: list[str]) -> dict:
    """Copy the named fields that carry a real value."""
    return {k: src[k] for k in fields if src.get(k) is not None}


def try_call(fn, default=None):
    try:
        return fn()
    except Exception:  # noqa: BLE001 - a missing sub-resource must not drop the activity
        return default


def build_detail(client: Garmin, activity: dict, include_gps: bool) -> dict:
    aid = activity["activityId"]
    type_key = activity.get("typeKey") or ""
    raw = client.get_activity(aid) or {}
    summary = raw.get("summaryDTO") or {}

    detail: dict[str, Any] = {
        "activityId": aid,
        "typeKey": type_key,
        "name": activity.get("activityName"),
        "startTimeLocal": activity.get("startTimeLocal"),
        "summary": pick(summary, COMMON_FIELDS),
    }

    if type_key in RUN_TYPES:
        detail["running"] = pick(summary, RUNNING_FIELDS)
    if type_key in RIDE_TYPES:
        detail["cycling"] = pick(summary, CYCLING_FIELDS)
    if type_key in SWIM_TYPES:
        detail["swimming"] = pick(summary, SWIMMING_FIELDS)
    if include_gps:
        detail["gps"] = pick(summary, GPS_FIELDS)

    # Per-lap splits
    laps = (try_call(lambda: client.get_activity_splits(aid), {}) or {}).get("lapDTOs") or []
    if laps:
        detail["laps"] = [pick(lap, LAP_FIELDS) | ({"startLatitude": lap.get("startLatitude"),
                                                    "startLongitude": lap.get("startLongitude")}
                                                   if include_gps else {})
                          for lap in laps]

    # Swim lengths (one entry per pool length)
    if type_key == "lap_swimming":
        lengths = []
        for lap in laps:
            for l in lap.get("lengthDTOs") or []:
                lengths.append(pick(l, ["duration", "averageSWOLF", "totalNumberOfStrokes",
                                        "averageSwimCadence", "swimStroke", "messageIndex"]))
        if lengths:
            detail["lengths"] = lengths

    # HR zones
    zones = try_call(lambda: client.get_activity_hr_in_timezones(aid), []) or []
    if zones:
        detail["hrZones"] = [{"zone": z.get("zoneNumber"), "secs": z.get("secsInZone"),
                              "floor": z.get("zoneLowBoundary")} for z in zones]

    # Power zones (cycling with a power meter)
    if type_key in RIDE_TYPES:
        pz = try_call(lambda: client.get_activity_power_in_timezones(aid), []) or []
        if pz:
            detail["powerZones"] = [{"zone": z.get("zoneNumber"), "secs": z.get("secsInZone"),
                                     "floor": z.get("zoneLowBoundary")} for z in pz]

    # Weather at the time of the activity
    w = try_call(lambda: client.get_activity_weather(aid), {}) or {}
    if w.get("temp") is not None:
        detail["weather"] = {
            "tempF": w.get("temp"),
            "apparentTempF": w.get("apparentTemp"),
            "dewPointF": w.get("dewPoint"),
            "humidity": w.get("relativeHumidity"),
            "windSpeed": w.get("windSpeed"),
            "windGust": w.get("windGust"),
            "windDirection": w.get("windDirectionCompassPoint"),
            "desc": (w.get("weatherTypeDTO") or {}).get("desc"),
        }

    return detail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="docs/data")
    parser.add_argument("--limit", type=int, default=0, help="Only the N newest activities (0 = all)")
    parser.add_argument("--include-gps", action="store_true",
                        help="Include route coordinates. Only for an access-controlled site.")
    parser.add_argument("--force", action="store_true", help="Refetch activities that already have a file")
    args = parser.parse_args()

    out_dir = Path(args.out)
    detail_dir = out_dir / "activity"
    detail_dir.mkdir(parents=True, exist_ok=True)

    index_path = out_dir / "activities.json"
    if not index_path.exists():
        log(f"FEHLER: {index_path} fehlt. Erst 'uv run scripts/export_data.py' ausfuehren.")
        return 1
    activities = json.loads(index_path.read_text(encoding="utf-8"))
    if args.limit:
        activities = activities[: args.limit]

    client = Garmin()
    client.login(__import__("os").environ.get("GARMINTOKENS", str(Path.home() / ".garminconnect")))
    log(f"Login OK · {len(activities)} Aktivitaeten · GPS: {'AN' if args.include_gps else 'AUS'}")

    written = skipped = failed = 0
    for i, act in enumerate(activities, 1):
        path = detail_dir / f"{act['activityId']}.json"
        if path.exists() and not args.force:
            skipped += 1
            continue
        try:
            detail = build_detail(client, act, args.include_gps)
            path.write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":"), default=str),
                            encoding="utf-8")
            written += 1
            if written % 10 == 0:
                log(f"  {i}/{len(activities)} · {written} geschrieben")
        except Exception as exc:  # noqa: BLE001
            log(f"FAIL {act['activityId']} ({act.get('typeKey')}): {type(exc).__name__}: {exc}")
            failed += 1

    log(f"\nFertig. {written} neu, {skipped} aus Cache, {failed} fehlgeschlagen.")
    (out_dir / "details_manifest.json").write_text(
        json.dumps({"count": len(list(detail_dir.glob('*.json'))), "gps": args.include_gps}),
        encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
