# /// script
# requires-python = ">=3.12"
# dependencies = ["garmin-connect-personal-api-python==1.0.0", "garmin-fit-sdk==21.218.0"]
# ///
"""Exports per-activity detail files consumed by the activity detail pages.

Uses the official Personal API activity summary and FIT download. Writes one
file per activity to <out>/activity/<id>.json, keeping the dashboard schema.

Usage:
    uv run scripts/export_details.py [--out docs/data] [--limit 0] [--include-gps]

Existing detail files are cached. Missing FIT files are retried on later runs.

--include-gps adds route coordinates and per-split positions. Only enable this
once the site is access-controlled.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from export_data import compute_load_trend, read_json, write_json
from fit_details import decode_download, fit_detail
from garmin_api import authentication_failed, create_client, error_message

# Fields worth keeping from summaryDTO, grouped so the frontend can render
# per sport without guessing. Verified against this account's FR945 + HRM 600.
COMMON_FIELDS = [
    "duration",
    "movingDuration",
    "elapsedDuration",
    "distance",
    "calories",
    "bmrCalories",
    "averageHR",
    "maxHR",
    "minHR",
    "averageSpeed",
    "maxSpeed",
    "averageMovingSpeed",
    "elevationGain",
    "elevationLoss",
    "maxElevation",
    "minElevation",
    "avgElevation",
    "trainingEffect",
    "anaerobicTrainingEffect",
    "trainingEffectLabel",
    "aerobicTrainingEffectMessage",
    "anaerobicTrainingEffectMessage",
    "activityTrainingLoad",
    "moderateIntensityMinutes",
    "vigorousIntensityMinutes",
    "waterEstimated",
    "averageTemperature",
    "maxTemperature",
    "minTemperature",
    "avgRespirationRate",
    "maxRespirationRate",
    "minRespirationRate",
]

RUNNING_FIELDS = [
    "averageRunCadence",
    "maxRunCadence",
    "strideLength",
    "steps",
    "groundContactTime",
    "groundContactBalanceLeft",
    "verticalOscillation",
    "verticalRatio",
    "lactateThresholdHeartRate",
    "lactateThresholdSpeed",
    "maxVerticalSpeed",
]

CYCLING_FIELDS = [
    "averagePower",
    "maxPower",
    "normalizedPower",
    "trainingStressScore",
    "intensityFactor",
    "averageBikeCadence",
    "maxBikeCadence",
    "totalWork",
    "leftRightBalance",
    "beginPotentialStamina",
    "endPotentialStamina",
    "minAvailableStamina",
]

SWIMMING_FIELDS = [
    "averageSWOLF",
    "averageStrokes",
    "totalNumberOfStrokes",
    "averageSwimCadence",
    "poolLength",
    "numberOfActiveLengths",
    "activeLengths",
]

GPS_FIELDS = ["startLatitude", "startLongitude", "endLatitude", "endLongitude"]

LAP_FIELDS = [
    "lapIndex",
    "distance",
    "duration",
    "movingDuration",
    "elapsedDuration",
    "averageSpeed",
    "maxSpeed",
    "averageHR",
    "maxHR",
    "calories",
    "elevationGain",
    "elevationLoss",
    "averageRunCadence",
    "strideLength",
    "groundContactTime",
    "verticalOscillation",
    "verticalRatio",
    "averagePower",
    "maxPower",
    "normalizedPower",
    "averageBikeCadence",
    "averageSWOLF",
    "averageStrokes",
    "averageSwimCadence",
    "swimStroke",
    "numberOfActiveLengths",
    "averageStrokeDistance",
]

RUN_TYPES = {"running", "treadmill_running", "trail_running", "track_running"}
RIDE_TYPES = {
    "cycling",
    "road_biking",
    "indoor_cycling",
    "cyclocross",
    "gravel_cycling",
    "mountain_biking",
    "virtual_ride",
}
SWIM_TYPES = {"lap_swimming", "open_water_swimming"}


def log(msg: str) -> None:
    print(msg, flush=True)


def pick(src: dict, fields: list[str]) -> dict:
    """Copy the named fields that carry a real value."""
    return {k: src[k] for k in fields if src.get(k) is not None}


def build_detail(
    client, activity: dict, include_gps: bool, zones: list[dict] | None = None
) -> dict:
    aid = activity["activityId"]
    type_key = activity.get("typeKey") or ""
    raw = client.get_activity(aid) or {}
    if not isinstance(raw, dict) or not raw.get("summaryDTO"):
        raise ValueError("Activity summary missing")
    summary = raw["summaryDTO"]
    fit = {}
    fit_status = "ok"
    try:
        fit = fit_detail(
            decode_download(client.download_activity(aid)), type_key, include_gps
        )
    except Exception as exc:
        if authentication_failed(exc):
            raise
        fit_status = "pending"
        log(
            f"FIT {aid}: {error_message(exc)}; wird beim nächsten Lauf erneut versucht."
        )
    summary = {
        **fit.get("summary", {}),
        **{k: v for k, v in summary.items() if v is not None},
    }

    detail: dict[str, Any] = {
        "activityId": aid,
        "typeKey": type_key,
        "name": activity.get("activityName"),
        "startTimeLocal": activity.get("startTimeLocal"),
        "summary": pick(summary, COMMON_FIELDS),
        "source": "garmin_personal_api",
        "fit_status": fit_status,
    }

    if type_key in RUN_TYPES:
        detail["running"] = pick(summary, RUNNING_FIELDS)
    if type_key in RIDE_TYPES:
        detail["cycling"] = pick(summary, CYCLING_FIELDS)
    if type_key in SWIM_TYPES:
        detail["swimming"] = pick(summary, SWIMMING_FIELDS)
    if include_gps:
        detail["gps"] = pick(summary, GPS_FIELDS)

    # Per-lap splits from the officially downloaded FIT file.
    laps = fit.get("laps") or []
    if laps:
        detail["laps"] = [
            pick(lap, LAP_FIELDS)
            | (
                {
                    "startLatitude": lap.get("startLatitude"),
                    "startLongitude": lap.get("startLongitude"),
                }
                if include_gps
                else {}
            )
            for lap in laps
        ]

    if type_key == "lap_swimming" and fit.get("lengths"):
        detail["lengths"] = fit["lengths"]
    if fit.get("sets"):
        detail["sets"] = fit["sets"]

    sport = (
        "RUNNING"
        if type_key in RUN_TYPES
        else "CYCLING"
        if type_key in RIDE_TYPES
        else "SWIMMING"
        if type_key in SWIM_TYPES
        else "DEFAULT"
    )
    config = next((z for z in zones or [] if z.get("sport") == sport), None)
    if config is None:
        config = next((z for z in zones or [] if z.get("sport") == "DEFAULT"), {})
    buckets = [
        {
            "zone": n,
            "secs": activity[f"hrTimeInZone_{n}"],
            "floor": config[f"zone{n}Floor"],
        }
        for n in range(1, 6)
        if activity.get(f"hrTimeInZone_{n}") is not None
        and config.get(f"zone{n}Floor") is not None
    ]
    if buckets:
        detail["hrZones"] = buckets
        detail["hrZoneBoundariesSource"] = "current_profile"

    return detail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="docs/data")
    parser.add_argument(
        "--limit", type=int, default=0, help="Only the N newest activities (0 = all)"
    )
    parser.add_argument(
        "--include-gps",
        action="store_true",
        help="Include route coordinates. Only for an access-controlled site.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Refetch activities that already have a file",
    )
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("--limit darf nicht negativ sein")

    out_dir = Path(args.out)
    detail_dir = out_dir / "activity"
    detail_dir.mkdir(parents=True, exist_ok=True)

    index_path = out_dir / "activities.json"
    if not index_path.exists():
        log(
            f"FEHLER: {index_path} fehlt. Erst 'uv run scripts/export_data.py' ausfuehren."
        )
        return 1
    activities = json.loads(index_path.read_text(encoding="utf-8"))
    selected = activities[: args.limit] if args.limit else activities
    zones = (read_json(out_dir / "fitness.json", {}) or {}).get("hr_zones") or []
    try:
        client = create_client()
    except Exception as exc:  # noqa: BLE001 - sanitize provider errors at the CLI boundary
        log(error_message(exc))
        return 1
    log(
        f"Personal API · {len(selected)} Aktivitaeten · GPS: {'AN' if args.include_gps else 'AUS'}"
    )

    written = skipped = failed = 0
    for i, act in enumerate(selected, 1):
        path = detail_dir / f"{act['activityId']}.json"
        cached = read_json(path, {})
        if cached and not args.include_gps:
            cached.pop("gps", None)
            for lap in cached.get("laps") or []:
                for field in GPS_FIELDS:
                    lap.pop(field, None)
            write_json(detail_dir, str(act["activityId"]), cached)
        if cached and not args.force and cached.get("fit_status") != "pending":
            # Names can change even when the measurements are cached.
            if cached.get("name") != act.get("activityName"):
                cached["name"] = act.get("activityName")
                write_json(detail_dir, str(act["activityId"]), cached)
            skipped += 1
            continue
        try:
            detail = build_detail(client, act, args.include_gps, zones)
            if detail.get("fit_status") == "pending" and cached:
                detail = {
                    **cached,
                    **detail,
                    "summary": {**cached.get("summary", {}), **detail["summary"]},
                }
            write_json(detail_dir, str(act["activityId"]), detail)
            written += 1
            if written % 10 == 0:
                log(f"  {i}/{len(selected)} · {written} geschrieben")
        except Exception as exc:  # noqa: BLE001
            if authentication_failed(exc):
                client.close()
                log(error_message(exc))
                return 1
            log(f"FAIL {act['activityId']}: {error_message(exc)}")
            failed += 1
    client.close()

    log(f"\nFertig. {written} neu, {skipped} aus Cache, {failed} fehlgeschlagen.")

    # Garmins eigenes Bewegungs-Tempo steht nur im Detail-Summary, nicht in der
    # Aktivitaetsliste. Die Statistik-Charts haben aber nur die Liste — also
    # hier zurueckschreiben, damit dort Garmins Wert benutzt wird, statt die
    # Pace selbst aus Zeit und Distanz zu rechnen.
    enriched = 0
    for act in activities:
        path = detail_dir / f"{act['activityId']}.json"
        if not path.exists():
            continue
        try:
            summary = json.loads(path.read_text(encoding="utf-8")).get("summary") or {}
        except (OSError, ValueError, TypeError):
            log(f"Detail-Cache für Aktivität {act['activityId']} nicht lesbar.")
            continue
        for field, source in (
            ("averageMovingSpeed", "averageMovingSpeed"),
            ("minHR", "minHR"),
            ("waterEstimated", "waterEstimated"),
            ("activityTrainingLoad", "activityTrainingLoad"),
            ("aerobicTrainingEffect", "trainingEffect"),
            ("anaerobicTrainingEffect", "anaerobicTrainingEffect"),
        ):
            value = summary.get(source)
            if value is not None and act.get(field) is None:
                act[field] = value
                if field == "averageMovingSpeed":
                    enriched += 1
    write_json(out_dir, "activities", activities)
    write_json(out_dir, "load_trend", compute_load_trend(activities, 400))
    strength = {
        str(row["activity_id"]): row for row in read_json(out_dir / "strength.json", [])
    }
    for act in activities:
        detail = read_json(detail_dir / f"{act['activityId']}.json", {})
        if detail.get("sets"):
            strength[str(act["activityId"])] = {
                "activity_id": act["activityId"],
                "date": (act.get("startTimeLocal") or "")[:10],
                "sets": detail["sets"],
            }
    live_ids = {str(act["activityId"]) for act in activities}
    write_json(
        out_dir, "strength", [row for aid, row in strength.items() if aid in live_ids]
    )
    log(f"Aktivitaetsliste ergaenzt: {enriched} mit Garmins Bewegungs-Tempo.")

    (out_dir / "details_manifest.json").write_text(
        json.dumps(
            {
                "count": len(list(detail_dir.glob("*.json"))),
                "gps": args.include_gps,
                "source": "garmin_personal_api",
                "failed": failed,
            }
        ),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
