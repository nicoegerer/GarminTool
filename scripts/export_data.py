# /// script
# requires-python = ">=3.11"
# dependencies = ["garminconnect>=0.3.5"]
# ///
"""Exports ALL available Garmin Connect data domains into static JSON files
consumed by the GitHub-Pages dashboard in docs/.

Usage:
    uv run scripts/export_data.py [--days 400] [--out docs/data]

Auth: reuses the token store of the Garmin MCP / garminconnect
(GARMINTOKENS env var, default ~/.garminconnect). No credentials are
stored or printed by this script.

Every domain is fetched defensively: a failing endpoint is recorded in
manifest.json but never aborts the export (Garmin's private API is
undocumented and shifts between device/account types).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

from garminconnect import Garmin

TODAY = date.today()

manifest: dict[str, Any] = {"generated_at": datetime.now().astimezone().isoformat(), "sections": {}}


def log(msg: str) -> None:
    print(msg, flush=True)


def section(name: str, fn: Callable[[], Any]) -> Any:
    try:
        result = fn()
        count = len(result) if isinstance(result, (list, dict)) else (1 if result is not None else 0)
        manifest["sections"][name] = {"ok": True, "count": count}
        log(f"OK   {name}: {count}")
        return result
    except Exception as exc:  # noqa: BLE001 - defensive by design
        manifest["sections"][name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        log(f"FAIL {name}: {type(exc).__name__}: {exc}")
        return None


def write_json(out_dir: Path, name: str, data: Any) -> None:
    if data is None:
        return
    if isinstance(data, (list, dict)) and not data:
        return
    path = out_dir / f"{name}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str), encoding="utf-8")
    log(f"WROTE {path.name} ({path.stat().st_size // 1024} KB)")


def chunked_dates(start: date, end: date, chunk_days: int) -> list[tuple[date, date]]:
    chunks = []
    cur = start
    while cur <= end:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end)
        chunks.append((cur, chunk_end))
        cur = chunk_end + timedelta(days=1)
    return chunks


def connect_range(client: Garmin, path_tpl: str, start: date, end: date, chunk_days: int = 28, list_key: str | None = None) -> list[dict]:
    """Fetch a daily-stats range endpoint in chunks, concatenating results."""
    items: list[dict] = []
    for c_start, c_end in chunked_dates(start, end, chunk_days):
        raw = client.connectapi(path_tpl.format(start=c_start.isoformat(), end=c_end.isoformat()))
        if raw is None:
            continue
        if isinstance(raw, dict):
            raw = raw.get(list_key) if list_key else raw.get("values") or raw.get("entries") or list(raw.values())[0] if raw else []
        if isinstance(raw, list):
            items.extend(x for x in raw if isinstance(x, dict))
    return items


# ---------------------------------------------------------------------------
# Domain exporters
# ---------------------------------------------------------------------------

def export_profile(client: Garmin) -> dict:
    profile: dict[str, Any] = {}
    profile["full_name"] = section("profile.full_name", client.get_full_name)
    profile["unit_system"] = section("profile.unit_system", client.get_unit_system)
    up = section("profile.user_profile", client.get_user_profile) or {}
    # keep only non-sensitive, dashboard-relevant bits
    user_data = up.get("userData") or {}
    profile["user"] = {
        # birthDate deliberately not exported (public site)
        "gender": user_data.get("gender"),
        "weight_g": user_data.get("weight"),
        "height_cm": user_data.get("height"),
        "vo2max_running": user_data.get("vo2MaxRunning"),
        "vo2max_cycling": user_data.get("vo2MaxCycling"),
        "lactate_threshold_speed": user_data.get("lactateThresholdSpeed"),
        "lactate_threshold_hr": user_data.get("lactateThresholdHeartRate"),
        "activity_level": user_data.get("activityLevel"),
        "intensity_minutes_weekly_goal": (up.get("userDailySummary") or {}).get("moderateIntensityMinutesGoal"),
    }
    devices = section("profile.devices", client.get_devices) or []
    profile["devices"] = [
        {
            "name": d.get("productDisplayName") or d.get("displayName"),
            "last_sync": d.get("lastUploadTimestamp") or d.get("uploadDate"),
            "primary": d.get("primaryActivityTrackerIndicator"),
        }
        for d in devices
        if isinstance(d, dict)
    ]
    return profile


ACTIVITY_FIELDS = [
    "activityId", "activityName", "startTimeLocal", "duration", "movingDuration", "distance",
    "elevationGain", "elevationLoss", "averageSpeed", "maxSpeed", "calories", "bmrCalories",
    "averageHR", "maxHR", "steps", "avgStrideLength", "averageRunningCadenceInStepsPerMinute",
    "aerobicTrainingEffect", "anaerobicTrainingEffect", "trainingEffectLabel", "activityTrainingLoad",
    "vO2MaxValue", "avgPower", "maxPower", "normPower", "trainingStressScore", "intensityFactor",
    "moderateIntensityMinutes", "vigorousIntensityMinutes", "differenceBodyBattery",
    "hrTimeInZone_1", "hrTimeInZone_2", "hrTimeInZone_3", "hrTimeInZone_4", "hrTimeInZone_5",
    "totalSets", "totalReps", "activeSets", "eventTypeDTO", "averageSwimCadenceInStrokesPerMinute",
    "poolLength", "strokes", "avgStress", "locationName",
    "lapCount", "waterEstimated", "minTemperature", "maxTemperature",
]
# NOTE: startLatitude/startLongitude deliberately excluded — the exported JSON
# is published on a public GitHub Pages site.


def export_activities(client: Garmin) -> list[dict]:
    def fetch() -> list[dict]:
        raw = client.get_activities_by_date("2010-01-01", TODAY.isoformat())
        acts = []
        for a in raw or []:
            if not isinstance(a, dict):
                continue
            slim = {k: a.get(k) for k in ACTIVITY_FIELDS if a.get(k) is not None}
            atype = a.get("activityType") or {}
            slim["typeKey"] = atype.get("typeKey")
            parent = atype.get("parentTypeId")
            if parent is not None:
                slim["parentTypeId"] = parent
            slim["eventType"] = (a.get("eventType") or {}).get("typeKey")
            acts.append(slim)
        acts.sort(key=lambda x: x.get("startTimeLocal") or "", reverse=True)
        return acts

    return section("activities", fetch) or []


def export_daily(client: Garmin, start: date) -> dict:
    daily: dict[str, Any] = {}

    daily["steps"] = section("daily.steps", lambda: connect_range(
        client, "/usersummary-service/stats/steps/daily/{start}/{end}", start, TODAY))

    daily["stress"] = section("daily.stress", lambda: connect_range(
        client, "/usersummary-service/stats/stress/daily/{start}/{end}", start, TODAY))

    daily["rhr"] = section("daily.rhr", lambda: connect_range(
        client, "/usersummary-service/stats/heartRate/daily/{start}/{end}", start, TODAY))

    def sleep_scores() -> list[dict]:
        """No working range endpoint on this account type -> per-day loop.
        Bounded to 150 days to keep the export fast; the watch is not worn
        every night, so gaps are expected."""
        out = []
        for i in range(150):
            d = (TODAY - timedelta(days=i)).isoformat()
            try:
                raw = client.get_sleep_data(d)
            except Exception:  # noqa: BLE001
                continue
            dto = (raw or {}).get("dailySleepDTO") or {}
            if not dto.get("sleepTimeSeconds"):
                continue
            out.append({
                "date": dto.get("calendarDate") or d,
                "score": ((dto.get("sleepScores") or {}).get("overall") or {}).get("value"),
                "total_s": dto.get("sleepTimeSeconds"),
                "deep_s": dto.get("deepSleepSeconds"),
                "light_s": dto.get("lightSleepSeconds"),
                "rem_s": dto.get("remSleepSeconds"),
                "awake_s": dto.get("awakeSleepSeconds"),
            })
        return out

    daily["sleep_scores"] = section("daily.sleep_scores", sleep_scores)

    def hrv() -> list[dict]:
        out = []
        for c_start, c_end in chunked_dates(start, TODAY, 180):
            raw = client.connectapi(
                f"/hrv-service/hrv/daily/{c_start.isoformat()}/{c_end.isoformat()}") or {}
            for s in raw.get("hrvSummaries") or []:
                out.append({
                    "date": s.get("calendarDate"),
                    "avg": s.get("lastNightAvg"),
                    "status": s.get("status"),
                    "weekly_avg": s.get("weeklyAvg"),
                    "baseline": s.get("baseline"),
                })
        return out

    daily["hrv"] = section("daily.hrv", hrv)

    def body_battery() -> list[dict]:
        entries = []
        for c_start, c_end in chunked_dates(start, TODAY, 28):
            raw = client.get_body_battery(c_start.isoformat(), c_end.isoformat()) or []
            for e in raw:
                if not isinstance(e, dict):
                    continue
                values = [v[1] for v in e.get("bodyBatteryValuesArray") or [] if isinstance(v, list) and len(v) > 1 and v[1] is not None]
                entries.append({
                    "date": e.get("date"),
                    "charged": e.get("charged"),
                    "drained": e.get("drained"),
                    "highest": max(values) if values else None,
                    "lowest": min(values) if values else None,
                })
        return entries

    daily["body_battery"] = section("daily.body_battery", body_battery)

    daily["vo2max"] = section("daily.vo2max", lambda: [
        {
            "date": (g.get("generic") or {}).get("calendarDate"),
            "vo2max": (g.get("generic") or {}).get("vo2MaxPreciseValue") or (g.get("generic") or {}).get("vo2MaxValue"),
            "fitness_age": (g.get("generic") or {}).get("fitnessAge"),
        }
        for g in connect_range(client, "/metrics-service/metrics/maxmet/daily/{start}/{end}", start, TODAY, chunk_days=90)
        if isinstance(g.get("generic"), dict)
    ])

    def readiness() -> list[dict]:
        items = []
        empty_streak = 0
        for i in range(60):
            if empty_streak >= 10:
                break  # device does not provide training readiness
            d = TODAY - timedelta(days=i)
            raw = client.get_training_readiness(d.isoformat())
            entry = raw[0] if isinstance(raw, list) and raw else raw if isinstance(raw, dict) else None
            if not entry or entry.get("score") is None:
                empty_streak += 1
                continue
            empty_streak = 0
            items.append({
                "date": entry.get("calendarDate") or d.isoformat(),
                "score": entry.get("score"),
                "level": entry.get("level"),
                "sleep_score": entry.get("sleepScore"),
                "hrv_factor": entry.get("hrvFactorPercent"),
                "recovery_time_factor": entry.get("recoveryTimeFactorPercent"),
                "acute_load": entry.get("acuteLoad"),
                "stress_history_factor": entry.get("stressHistoryFactorPercent"),
                "sleep_history_factor": entry.get("sleepHistoryFactorPercent"),
            })
        return items

    daily["readiness"] = section("daily.readiness", readiness)

    daily["intensity_minutes_weekly"] = section("daily.intensity_minutes_weekly", lambda: connect_range(
        client, "/usersummary-service/stats/im/weekly/{start}/{end}", start, TODAY, chunk_days=364))

    return daily


def export_sleep_detail(client: Garmin, nights: int = 14) -> list[dict]:
    def fetch() -> list[dict]:
        out = []
        for i in range(nights):
            d = TODAY - timedelta(days=i)
            raw = client.get_sleep_data(d.isoformat())
            dto = (raw or {}).get("dailySleepDTO") or {}
            if not dto.get("sleepTimeSeconds"):
                continue
            out.append({
                "date": dto.get("calendarDate") or d.isoformat(),
                "score": ((dto.get("sleepScores") or {}).get("overall") or {}).get("value"),
                "quality": ((dto.get("sleepScores") or {}).get("overall") or {}).get("qualifierKey"),
                "total_s": dto.get("sleepTimeSeconds"),
                "deep_s": dto.get("deepSleepSeconds"),
                "light_s": dto.get("lightSleepSeconds"),
                "rem_s": dto.get("remSleepSeconds"),
                "awake_s": dto.get("awakeSleepSeconds"),
                "start": dto.get("sleepStartTimestampLocal"),
                "end": dto.get("sleepEndTimestampLocal"),
                "avg_spo2": dto.get("averageSpO2Value"),
                "avg_respiration": dto.get("averageRespirationValue"),
                "resting_hr": (raw or {}).get("restingHeartRate"),
                "body_battery_change": (raw or {}).get("bodyBatteryChange"),
                "avg_overnight_hrv": (raw or {}).get("avgOvernightHrv"),
            })
        return out

    return section("sleep_detail", fetch) or []


def export_fitness(client: Garmin, start: date) -> dict:
    fitness: dict[str, Any] = {}

    fitness["training_status"] = section("fitness.training_status", lambda: client.get_training_status(TODAY.isoformat()))

    fitness["race_predictions"] = section("fitness.race_predictions", client.get_race_predictions)

    def race_history() -> list[dict]:
        out = []
        for c_start, c_end in chunked_dates(start, TODAY, 180):
            raw = client.get_race_predictions(c_start.isoformat(), c_end.isoformat(), _type="daily")
            if isinstance(raw, list):
                out.extend(x for x in raw if isinstance(x, dict))
            elif isinstance(raw, dict) and raw:
                out.append(raw)
        return out

    fitness["race_predictions_history"] = section("fitness.race_predictions_history", race_history)

    fitness["endurance_score"] = section("fitness.endurance_score", lambda: client.get_endurance_score(
        start.isoformat(), TODAY.isoformat()))

    fitness["hill_score"] = section("fitness.hill_score", lambda: client.get_hill_score(
        start.isoformat(), TODAY.isoformat()))

    fitness["fitness_age"] = section("fitness.fitness_age", lambda: client.get_fitnessage_data(TODAY.isoformat()))

    fitness["hr_zones"] = section("fitness.hr_zones", lambda: client.connectapi("/biometric-service/heartRateZones"))

    return fitness


def export_body(client: Garmin) -> dict:
    body: dict[str, Any] = {}
    two_years = TODAY - timedelta(days=730)

    def weigh_ins() -> list[dict]:
        raw = client.get_body_composition(two_years.isoformat(), TODAY.isoformat()) or {}
        out = []
        for e in raw.get("dateWeightList") or []:
            if not isinstance(e, dict):
                continue
            out.append({
                "date": e.get("calendarDate"),
                "weight_g": e.get("weight"),
                "bmi": e.get("bmi"),
                "body_fat_pct": e.get("bodyFat"),
                "body_water_pct": e.get("bodyWater"),
                "muscle_mass_g": e.get("muscleMass"),
                "bone_mass_g": e.get("boneMass"),
            })
        out.sort(key=lambda x: x.get("date") or "")
        return out

    body["weigh_ins"] = section("body.weigh_ins", weigh_ins)
    return body


def export_records(client: Garmin) -> dict:
    records: dict[str, Any] = {}

    def prs() -> list[dict]:
        raw = client.get_personal_record() or []
        return [
            {
                "type_id": r.get("typeId"),
                "activity_type": r.get("activityType"),
                "value": r.get("value"),
                "date": r.get("prStartTimeGmtFormatted") or r.get("prTypeLabelKey"),
                "activity_id": r.get("activityId"),
                "activity_name": r.get("activityName"),
            }
            for r in raw
            if isinstance(r, dict)
        ]

    records["personal_records"] = section("records.personal_records", prs)

    def badges() -> list[dict]:
        raw = client.get_earned_badges() or []
        return [
            {
                "name": b.get("badgeName"),
                "date": b.get("badgeEarnedDate"),
                "points": b.get("badgePoints"),
                "category": b.get("badgeCategoryId"),
            }
            for b in raw
            if isinstance(b, dict)
        ]

    records["badges"] = section("records.badges", badges)
    return records


def export_gear(client: Garmin) -> list[dict]:
    def fetch() -> list[dict]:
        profile = client.get_user_profile() or {}
        profile_id = profile.get("profileId") or (profile.get("userData") or {}).get("profileId")
        if profile_id is None:
            settings = client.connectapi("/userprofile-service/userprofile/user-settings") or {}
            profile_id = settings.get("id")
        raw = client.get_gear(profile_id) or []
        out = []
        for g in raw:
            if not isinstance(g, dict):
                continue
            uuid = g.get("uuid")
            stats = {}
            if uuid:
                try:
                    stats = client.connectapi(f"/gear-service/gear/stats/{uuid}") or {}
                except Exception:  # noqa: BLE001
                    stats = {}
            out.append({
                "name": g.get("displayName") or g.get("customMakeModel"),
                "type": g.get("gearTypeName"),
                "status": g.get("gearStatusName"),
                "distance_m": stats.get("totalDistance"),
                "activities": stats.get("totalActivities"),
                "max_distance_m": g.get("maximumMeters"),
            })
        return out

    return section("gear", fetch) or []


def export_goals(client: Garmin) -> list[dict]:
    def fetch() -> list[dict]:
        out = []
        for status in ("active", "future"):
            raw = client.get_goals(status) or []
            for g in raw:
                if isinstance(g, dict):
                    g["_status"] = status
                    out.append(g)
        return out

    return section("goals", fetch) or []


def export_strength(client: Garmin, activities: list[dict]) -> list[dict]:
    def fetch() -> list[dict]:
        cutoff = (TODAY - timedelta(days=180)).isoformat()
        strength_acts = [
            a for a in activities
            if a.get("typeKey") == "strength_training" and (a.get("startTimeLocal") or "") >= cutoff
        ][:40]
        out = []
        for a in strength_acts:
            aid = a.get("activityId")
            try:
                raw = client.get_activity_exercise_sets(aid) or {}
            except Exception:  # noqa: BLE001
                continue
            sets = []
            for s in raw.get("exerciseSets") or []:
                if not isinstance(s, dict) or s.get("setType") != "ACTIVE":
                    continue
                exercises = s.get("exercises") or []
                name = None
                if exercises and isinstance(exercises[0], dict):
                    name = exercises[0].get("name") or exercises[0].get("category")
                sets.append({
                    "exercise": name,
                    "reps": s.get("repetitionCount"),
                    "weight_g": s.get("weight"),
                    "duration_s": s.get("duration"),
                })
            if sets:
                out.append({"activity_id": aid, "date": (a.get("startTimeLocal") or "")[:10], "sets": sets})
        return out

    return section("strength", fetch) or []


def export_calendar(client: Garmin) -> list[dict]:
    """Scheduled workouts / calendar items for this week (for today's recommendation)."""

    def fetch() -> list[dict]:
        items = []
        for delta in (0, 1):
            ref = TODAY + timedelta(days=7 * delta)
            raw = client.connectapi(f"/calendar-service/year/{ref.year}/month/{ref.month - 1}") or {}
            for item in raw.get("calendarItems") or []:
                if not isinstance(item, dict):
                    continue
                if item.get("itemType") == "workout" and (item.get("date") or "") >= TODAY.isoformat():
                    items.append({
                        "date": item.get("date"),
                        "title": item.get("title"),
                        "workout_id": item.get("workoutId"),
                        "sport": item.get("sportTypeKey"),
                    })
        seen = set()
        unique = []
        for i in items:
            key = (i["date"], i.get("workout_id"))
            if key not in seen:
                seen.add(key)
                unique.append(i)
        return sorted(unique, key=lambda x: x["date"])

    return section("calendar", fetch) or []


# ---------------------------------------------------------------------------
# Derived metrics (training load model)
# ---------------------------------------------------------------------------

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
            out.append({
                "date": iso,
                "load": round(load, 1),
                "ctl": round(ctl, 1),
                "atl": round(atl, 1),
                "tsb": round(ctl - atl, 1),
                "acwr": round(atl / ctl, 2) if ctl > 0 else None,
            })
        d += timedelta(days=1)
    return out


# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=400, help="History window for daily series")
    parser.add_argument("--out", default="docs/data", help="Output directory")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    start = TODAY - timedelta(days=args.days)

    token_dir = os.environ.get("GARMINTOKENS", str(Path.home() / ".garminconnect"))
    log(f"Logging in with token store {token_dir} ...")
    client = Garmin()
    client.login(token_dir)
    log("Login OK")

    profile = export_profile(client)
    activities = export_activities(client)
    daily = export_daily(client, start)
    sleep_detail = export_sleep_detail(client)
    fitness = export_fitness(client, start)
    body = export_body(client)
    records = export_records(client)
    gear = export_gear(client)
    goals = export_goals(client)
    strength = export_strength(client, activities)
    calendar = export_calendar(client)
    load_trend = section("load_trend", lambda: compute_load_trend(activities, args.days))

    write_json(out_dir, "profile", profile)
    write_json(out_dir, "activities", activities)
    write_json(out_dir, "daily", daily)
    write_json(out_dir, "sleep_detail", sleep_detail)
    write_json(out_dir, "fitness", fitness)
    write_json(out_dir, "body", body)
    write_json(out_dir, "records", records)
    write_json(out_dir, "gear", gear)
    write_json(out_dir, "goals", goals)
    write_json(out_dir, "strength", strength)
    write_json(out_dir, "calendar", calendar)
    write_json(out_dir, "load_trend", load_trend)
    write_json(out_dir, "manifest", manifest)

    failed = [k for k, v in manifest["sections"].items() if not v.get("ok")]
    log(f"\nDone. {len(manifest['sections']) - len(failed)} sections OK, {len(failed)} failed.")
    if failed:
        log("Failed sections (non-fatal): " + ", ".join(failed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
