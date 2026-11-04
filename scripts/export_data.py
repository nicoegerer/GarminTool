# /// script
# requires-python = ">=3.12"
# dependencies = ["garminconnect==0.3.20", "cryptography>=46,<51"]
# ///
"""Export Garmin Connect to the dashboard through python-garminconnect.

    uv run scripts/export_data.py [--days 400] [--out docs/data]

Uses new DI tokens from GARMIN_TOKENS_JSON or .garmin_tokens. Only read requests
are made; optional failures retain earlier data and are recorded in manifest.json.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections.abc import Callable
from datetime import date, datetime, timedelta
from functools import cache
from pathlib import Path
from typing import Any
from uuid import UUID

from connect_metrics import (
    export_fitness,
    export_optional_domains,
    export_records,
    profile_devices,
    profile_user,
    readiness_series,
    safe_metrics,
    vo2_series,
)
from garmin_api import authentication_failed, create_client, error_message

TODAY = date.today()


def log(message: str) -> None:
    print(message, flush=True)


def read_json(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(out: Path, name: str, value: Any) -> None:
    if value is None:
        return
    path = out / f"{name}.json"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temporary.replace(path)


class Exporter:
    def __init__(self, out: Path):
        self.out = out
        self._previous: dict[str, Any] = {}
        self.manifest = {
            "generated_at": datetime.now().astimezone().isoformat(),
            "source": "python_garminconnect",
            "client_version": "0.3.20",
            "sections": {},
        }

    def previous_file(self, name: str):
        if name not in self._previous:
            self._previous[name] = read_json(self.out / f"{name}.json")
        return self._previous[name]

    def previous(self, name: str):
        file, _, key = name.partition(".")
        value = self.previous_file(file)
        if not key:
            return value
        return value.get(key) if isinstance(value, dict) else None

    def section(self, name: str, fetch: Callable, *, default=None, required=False):
        try:
            result = fetch()
        except Exception as exc:
            if required or authentication_failed(exc):
                raise
            previous = self.previous(name)
            self.manifest["sections"][name] = {
                "ok": False,
                "error": error_message(exc),
                "retained": previous is not None,
            }
            log(f"FAIL {name}: {error_message(exc)}")
            return previous if previous is not None else default
        self.manifest["sections"][name] = {
            "ok": True,
            "source": "python_garminconnect",
            "count": len(result)
            if isinstance(result, (list, dict))
            else int(result is not None),
        }
        return result


def chunked_dates(start: date, end: date, days: int):
    while start <= end:
        last = min(start + timedelta(days=days - 1), end)
        yield start, last
        start = last + timedelta(days=1)


def range_rows(
    fetch: Callable, start: date, end: date, days: int, key: str | None = None
):
    result = []
    for first, last in chunked_dates(start, end, days):
        rows = fetch(first, last)
        if key and isinstance(rows, dict):
            rows = rows.get(key, [])
        if rows is None:
            continue
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            raise ValueError("Unexpected API response shape")
        result.extend(rows)
    return result


ACTIVITY_FIELDS = [
    "activityId",
    "activityName",
    "startTimeLocal",
    "duration",
    "movingDuration",
    "distance",
    "elevationGain",
    "elevationLoss",
    "averageSpeed",
    "averageMovingSpeed",
    "maxSpeed",
    "calories",
    "bmrCalories",
    "averageHR",
    "maxHR",
    "steps",
    "avgStrideLength",
    "averageRunningCadenceInStepsPerMinute",
    "aerobicTrainingEffect",
    "anaerobicTrainingEffect",
    "trainingEffectLabel",
    "activityTrainingLoad",
    "vO2MaxValue",
    "avgPower",
    "maxPower",
    "normPower",
    "trainingStressScore",
    "intensityFactor",
    "moderateIntensityMinutes",
    "vigorousIntensityMinutes",
    "differenceBodyBattery",
    "hrTimeInZone_1",
    "hrTimeInZone_2",
    "hrTimeInZone_3",
    "hrTimeInZone_4",
    "hrTimeInZone_5",
    "totalSets",
    "totalReps",
    "activeSets",
    "eventTypeDTO",
    "averageSwimCadenceInStrokesPerMinute",
    "poolLength",
    "strokes",
    "avgStress",
    "locationName",
    "lapCount",
    "waterEstimated",
    "minTemperature",
    "maxTemperature",
]
# NOTE: startLatitude/startLongitude deliberately excluded — the exported JSON
# is published on a public GitHub Pages site.


def fetch_activities(client, previous: list[dict]) -> list[dict]:
    known = {str(a["activityId"]): a for a in previous}
    activities, seen = [], set()
    offset, size = 0, 100
    while True:
        batch = client.search_activities(start=offset, limit=size)
        if not isinstance(batch, list):
            raise TypeError("Unexpected activity response")
        new = 0
        for raw in batch:
            aid = raw.get("activityId")
            if not isinstance(aid, int) or aid <= 0:
                raise ValueError("Invalid activity ID")
            if aid in seen:
                continue
            seen.add(aid)
            new += 1
            # Preserve historical metrics absent from the new API, but use the
            # current list as authority for names, new values and deletions.
            prior = known.get(str(aid), {})
            slim = {k: prior[k] for k in ACTIVITY_FIELDS if k in prior}
            slim.update({k: raw[k] for k in ACTIVITY_FIELDS if raw.get(k) is not None})
            slim["typeKey"] = (raw.get("activityType") or {}).get("typeKey")
            slim["eventType"] = (
                raw.get("eventType") or raw.get("eventTypeDTO") or {}
            ).get("typeKey")
            activities.append(slim)
        if len(batch) < size:
            break
        if not new:
            raise ValueError("Activity pagination made no progress")
        offset += len(batch)
    return sorted(activities, key=lambda a: a.get("startTimeLocal") or "", reverse=True)


def sleep_entry(dto: dict) -> dict:
    score = (dto.get("sleepScores") or {}).get("overall") or {}
    entry = {
        "date": dto.get("calendarDate"),
        "score": score.get("value"),
        "quality": score.get("qualifierKey"),
    }
    for target, source in {
        "total_s": "sleepTimeSeconds",
        "deep_s": "deepSleepSeconds",
        "light_s": "lightSleepSeconds",
        "rem_s": "remSleepSeconds",
        "awake_s": "awakeSleepSeconds",
        "start": "sleepStartTimestampLocal",
        "end": "sleepEndTimestampLocal",
        "avg_spo2": "averageSpO2Value",
        "avg_respiration": "averageRespirationValue",
    }.items():
        entry[target] = dto.get(source)
    return entry


def weekly_intensity(rows: list[dict]) -> list[dict]:
    weeks = {}
    for row in rows:
        minutes = row.get("intensityMinutes")
        if not minutes and any(
            row.get(key) is not None
            for key in ("moderateIntensityMinutes", "vigorousIntensityMinutes")
        ):
            minutes = {
                "goal": row.get("intensityMinutesGoal")
                or row.get("moderateIntensityMinutesGoal"),
                "moderate": row.get("moderateIntensityMinutes"),
                "vigorous": row.get("vigorousIntensityMinutes"),
            }
        if not minutes or not row.get("calendarDate"):
            continue
        day = date.fromisoformat(row["calendarDate"])
        week = (day - timedelta(days=day.weekday())).isoformat()
        entry = weeks.setdefault(
            week,
            {
                "calendarDate": week,
                "weeklyGoal": None,
                "moderateValue": 0,
                "vigorousValue": 0,
            },
        )
        entry["weeklyGoal"] = minutes.get("goal")
        entry["moderateValue"] += minutes.get("moderate") or 0
        entry["vigorousValue"] += minutes.get("vigorous") or 0
    return [weeks[key] for key in sorted(weeks)]


def resting_heart_rate(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        value = (row.get("heartRate") or {}).get("restingValue")
        if value is None:
            value = row.get("restingHeartRate")
        if row.get("calendarDate") and value is not None:
            result.append(
                {"calendarDate": row["calendarDate"], "values": {"restingHR": value}}
            )
    return result


def body_battery(rows: list[dict]) -> list[dict]:
    result = []
    for row in rows:
        descriptors = row.get("bodyBatteryValueDescriptorDTOList") or []
        samples = row.get("bodyBatteryValuesArray") or []
        fallback_index = (
            2
            if samples and len(samples[0]) > 2 and isinstance(samples[0][1], str)
            else 1
        )
        index = next(
            (
                d["bodyBatteryValueDescriptorIndex"]
                for d in descriptors
                if d.get("bodyBatteryValueDescriptorKey") == "bodyBatteryLevel"
            ),
            fallback_index,
        )
        values = [
            v[index]
            for v in row.get("bodyBatteryValuesArray") or []
            if len(v) > index
            and isinstance(v[index], (int, float))
            and 0 <= v[index] <= 100
        ]
        result.append(
            {
                "date": row.get("date"),
                "charged": row.get("charged"),
                "drained": row.get("drained"),
                "highest": max(values) if values else None,
                "lowest": min(values) if values else None,
            }
        )
    return result


def weight_entries(client, start: date) -> list[dict]:
    result = []
    for first, last in chunked_dates(start, TODAY, 90):
        raw = client.get_weight_measurements(first, last) or {}
        for day in raw.get("dailyWeightSummaries") or []:
            entries = day.get("allWeightMetrics") or [day.get("latestWeight")]
            for entry in entries:
                if not entry:
                    continue
                # Live Personal API responses still contain legacy gram values,
                # although the published schema describes kilograms. Accept
                # both body-weight scales; the dashboard always consumes grams.
                weight = entry.get("weight")
                weight_g = weight
                if weight is not None and weight < 1000:
                    weight_g = weight * 1000
                result.append(
                    {
                        "date": entry.get("calendarDate") or day.get("summaryDate"),
                        "weight_g": weight_g,
                        "bmi": entry.get("bmi"),
                        "body_fat_pct": entry.get("bodyFat"),
                        "body_water_pct": entry.get("bodyWater"),
                        "muscle_mass_g": entry.get("muscleMass"),
                        "bone_mass_g": entry.get("boneMass"),
                    }
                )
    return sorted(result, key=lambda row: row.get("date") or "")


def compute_load_trend(activities: list[dict], days: int) -> list[dict]:
    """CTL/ATL/TSB from per-activity training load (EWMA 42d / 7d)."""
    loads: dict[str, float] = {}
    for a in activities:
        d = (a.get("startTimeLocal") or "")[:10]
        load = a.get("activityTrainingLoad")
        if d and load:
            loads[d] = loads.get(d, 0.0) + float(load)

    if not loads:
        return []

    first = min(min(loads), (TODAY - timedelta(days=days)).isoformat())
    start_d = date.fromisoformat(first)
    k_ctl = 1 - math.exp(-1 / 42)
    k_atl = 1 - math.exp(-1 / 7)
    ctl = atl = 0.0
    out = []
    d = start_d
    cutoff = (TODAY - timedelta(days=days)).isoformat()
    while d <= TODAY:
        iso = d.isoformat()
        load = loads.get(iso, 0.0)
        ctl += (load - ctl) * k_ctl
        atl += (load - atl) * k_atl
        if iso >= cutoff:
            out.append(
                {
                    "date": iso,
                    "load": round(load, 1),
                    "ctl": round(ctl, 1),
                    "atl": round(atl, 1),
                    "tsb": round(ctl - atl, 1),
                    "acwr": round(atl / ctl, 2) if ctl > 0 else None,
                }
            )
        d += timedelta(days=1)
    return out


def readable_name(value: Any) -> str | None:
    """Garmin's displayName may be an account UUID rather than a person's name."""
    if not isinstance(value, str) or not value.strip():
        return None
    name = value.strip()
    try:
        UUID(name)
    except ValueError:
        return name
    return None


def profile_name(settings: dict, previous: dict) -> tuple[str | None, str]:
    for value, source in (
        (os.environ.get("DASHBOARD_DISPLAY_NAME"), "configured"),
        (settings.get("displayName"), "api"),
        (previous.get("full_name"), "retained"),
    ):
        name = readable_name(value)
        if name:
            return name, source
    return None, "unavailable"


def export(client, out: Path, days: int) -> dict:
    exporter = Exporter(out)
    start = TODAY - timedelta(days=days)
    # Check authorization and the required activity feed before writing files.
    settings = (
        exporter.section(
            "profile.settings", client.get_user_profile_settings, required=True
        )
        or {}
    )
    activities = exporter.section(
        "activities",
        lambda: fetch_activities(client, exporter.previous("activities") or []),
        required=True,
    )
    name, name_source = profile_name(settings, exporter.previous("profile") or {})
    exporter.manifest["sections"]["profile.full_name"] = {
        "ok": name is not None,
        "count": int(name is not None),
        "source": name_source,
        **(
            {"status": "unavailable", "error": "Kein lesbarer Profilname verfügbar."}
            if name is None
            else {}
        ),
    }
    profile = {
        "full_name": name,
        "unit_system": settings.get("measurementSystem"),
        "user": exporter.section(
            "profile.user", lambda: profile_user(client), default={}
        ),
        "devices": exporter.section(
            "profile.devices", lambda: profile_devices(client), default=[]
        ),
    }

    @cache
    def summaries():
        return range_rows(client.get_daily_summaries, start, TODAY, 90, "data")

    @cache
    def sleep():
        rows = range_rows(
            client.get_daily_sleep_summaries,
            max(start, TODAY - timedelta(days=149)),
            TODAY,
            31,
        )
        return [sleep_entry(row) for row in rows if row.get("sleepTimeSeconds")]

    daily = {
        "steps": exporter.section(
            "daily.steps",
            lambda: range_rows(client.get_daily_steps, start, TODAY, 28),
            default=[],
        ),
        "stress": exporter.section(
            "daily.stress",
            lambda: range_rows(client.get_daily_stress, start, TODAY, 28),
            default=[],
        ),
        "rhr": exporter.section(
            "daily.rhr",
            lambda: resting_heart_rate(summaries()),
            default=[],
        ),
        "sleep_scores": exporter.section("daily.sleep_scores", sleep, default=[]),
        "hrv": exporter.section(
            "daily.hrv",
            lambda: [
                {
                    "date": row.get("calendarDate"),
                    "avg": row.get("lastNightAvg"),
                    "status": row.get("status"),
                    "weekly_avg": row.get("weeklyAvg"),
                    "baseline": row.get("baseline"),
                }
                for row in range_rows(
                    client.get_daily_hrv_summaries, start, TODAY, 90, "hrvSummaries"
                )
            ],
            default=[],
        ),
        "body_battery": exporter.section(
            "daily.body_battery",
            lambda: body_battery(
                range_rows(client.get_daily_body_battery, start, TODAY, 31)
            ),
            default=[],
        ),
        "intensity_minutes_weekly": exporter.section(
            "daily.intensity_minutes_weekly",
            lambda: weekly_intensity(summaries()),
            default=[],
        ),
        "vo2max": exporter.section(
            "daily.vo2max",
            lambda: vo2_series(client, start, TODAY, chunked_dates),
            default=[],
        ),
        "readiness": exporter.section(
            "daily.readiness",
            lambda: readiness_series(
                client, max(start, TODAY - timedelta(days=59)), TODAY
            ),
            default=[],
        ),
    }
    fitness = export_fitness(exporter, client, start, TODAY, chunked_dates)
    fitness["fitness_age"] = exporter.section(
        "fitness.fitness_age", lambda: safe_metrics(client.get_fitness_age(TODAY))
    )
    fitness["hr_zones"] = exporter.section(
        "fitness.hr_zones", client.get_heart_rate_zones, default=[]
    )
    body = {
        "weigh_ins": exporter.section(
            "body.weigh_ins",
            lambda: weight_entries(client, TODAY - timedelta(days=730)),
            default=[],
        )
    }
    optional = export_optional_domains(exporter, client, TODAY)
    files = {
        "profile": profile,
        "activities": activities,
        "daily": daily,
        "fitness": fitness,
        "body": body,
        "sleep_detail": exporter.section(
            "sleep_detail",
            lambda: [
                row
                for row in sleep()
                if (row.get("date") or "") >= (TODAY - timedelta(days=13)).isoformat()
            ],
            default=[],
        ),
        "records": export_records(exporter, client),
        **optional,
        # Strength sets are populated by the official FIT detail exporter.
        "load_trend": exporter.section(
            "load_trend", lambda: compute_load_trend(activities, days)
        ),
    }
    out.mkdir(parents=True, exist_ok=True)
    for name, value in files.items():
        write_json(out, name, value)
    write_json(out, "manifest", exporter.manifest)
    return exporter.manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=400)
    parser.add_argument("--out", default="docs/data")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days muss positiv sein")
    try:
        with create_client() as client:
            manifest = export(client, Path(args.out), args.days)
    except Exception as exc:  # noqa: BLE001 - sanitize provider errors at the CLI boundary
        log(f"Export fehlgeschlagen: {error_message(exc)}")
        return 1
    failed = sum(
        not item["ok"] and item.get("status") != "unavailable"
        for item in manifest["sections"].values()
    )
    log(
        f"Export über python-garminconnect abgeschlossen. {failed} optionale Bereiche fehlgeschlagen."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
