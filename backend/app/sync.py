"""Pulls data from Garmin Connect (via the garminconnect library) into the
local SQLite database. Every sub-sync is wrapped so that one failing/renamed
upstream endpoint cannot take down the rest of the sync - Garmin's private
API is undocumented and field names have been observed to shift between
account/device types, so we extract defensively and always keep the raw
JSON payload as a fallback for anything the typed columns don't capture.
"""

import json
import logging
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.db import models

logger = logging.getLogger("sync")


def _get(d: Any, *path: str, default: Any = None) -> Any:
    cur = d
    for key in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
        if cur is None:
            return default
    return cur


def _first(d: Any) -> Any:
    if isinstance(d, list):
        return d[0] if d else None
    return d


def _call(client: Any, names: list[str], *args: Any, **kwargs: Any) -> Any:
    """Try a list of candidate method names on the client; return the first
    successful result. Returns None (and logs) if none of them exist/succeed.
    """
    for name in names:
        method = getattr(client, name, None)
        if method is None:
            continue
        return method(*args, **kwargs)
    logger.warning("None of the candidate methods exist on client: %s", names)
    return None


def sync_all(client: Any, db: Session, activity_limit: int = 100, history_days: int = 21) -> str:
    log_lines: list[str] = []

    def section(name: str, fn: Any) -> None:
        try:
            count = fn()
            log_lines.append(f"OK  {name}: {count}")
        except Exception as exc:  # noqa: BLE001 - defensive by design, see module docstring
            logger.exception("Sync section failed: %s", name)
            log_lines.append(f"FAIL {name}: {exc}")

    section("activities", lambda: sync_activities(client, db, limit=activity_limit))
    section("daily_summaries", lambda: sync_daily_summaries(client, db, days=history_days))
    section("sleep", lambda: sync_sleep(client, db, days=history_days))
    section("hrv", lambda: sync_hrv(client, db, days=history_days))
    section("body_battery", lambda: sync_body_battery(client, db, days=history_days))
    section("training_readiness", lambda: sync_training_readiness(client, db, days=history_days))
    section("training_status", lambda: sync_training_status(client, db))
    section("vo2max", lambda: sync_vo2max(client, db, days=history_days))
    section("race_predictions", lambda: sync_race_predictions(client, db))
    section("weigh_ins", lambda: sync_weigh_ins(client, db, days=history_days * 4))
    section("gear", lambda: sync_gear(client, db))

    db.commit()
    detail = "\n".join(log_lines)
    db.add(models.SyncLog(ran_at=datetime.utcnow(), success="FAIL" not in detail, detail=detail))
    db.commit()
    return detail


def _daterange(days: int) -> list[date]:
    today = date.today()
    return [today - timedelta(days=i) for i in range(days)]


def sync_activities(client: Any, db: Session, limit: int) -> int:
    raw = client.get_activities(0, limit)
    activities = raw if isinstance(raw, list) else raw.get("activities", []) if isinstance(raw, dict) else []
    count = 0
    for a in activities:
        activity_id = a.get("activityId")
        if activity_id is None:
            continue
        start_local = a.get("startTimeLocal")
        try:
            start_dt = datetime.strptime(start_local, "%Y-%m-%d %H:%M:%S") if start_local else datetime.utcnow()
        except ValueError:
            start_dt = datetime.utcnow()

        row = db.get(models.Activity, activity_id) or models.Activity(activity_id=activity_id)
        row.name = a.get("activityName", "")
        row.type_key = _get(a, "activityType", "typeKey", default="")
        row.start_time_local = start_dt
        row.duration_s = a.get("duration") or 0
        row.distance_m = a.get("distance") or 0
        row.calories = a.get("calories") or 0
        row.average_hr = a.get("averageHR")
        row.max_hr = a.get("maxHR")
        row.elevation_gain = a.get("elevationGain")
        row.aerobic_training_effect = a.get("aerobicTrainingEffect")
        row.anaerobic_training_effect = a.get("anaerobicTrainingEffect")
        row.training_effect_label = a.get("trainingEffectLabel")
        row.activity_training_load = a.get("activityTrainingLoad")
        row.vo2max_value = a.get("vO2MaxValue")
        row.moderate_intensity_minutes = a.get("moderateIntensityMinutes")
        row.vigorous_intensity_minutes = a.get("vigorousIntensityMinutes")
        row.hr_zone_1 = a.get("hrTimeInZone_1")
        row.hr_zone_2 = a.get("hrTimeInZone_2")
        row.hr_zone_3 = a.get("hrTimeInZone_3")
        row.hr_zone_4 = a.get("hrTimeInZone_4")
        row.hr_zone_5 = a.get("hrTimeInZone_5")
        row.raw_json = json.dumps(a, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_daily_summaries(client: Any, db: Session, days: int) -> int:
    count = 0
    for d in _daterange(days):
        cdate = d.isoformat()
        stats = _call(client, ["get_stats", "get_user_summary"], cdate)
        if not stats:
            continue
        row = db.get(models.DailySummary, d) or models.DailySummary(date=d)
        row.total_steps = stats.get("totalSteps")
        row.resting_heart_rate = stats.get("restingHeartRate")
        row.total_kilocalories = stats.get("totalKilocalories")
        row.floors_ascended = stats.get("floorsAscended")
        row.moderate_intensity_minutes = stats.get("moderateIntensityMinutes")
        row.vigorous_intensity_minutes = stats.get("vigorousIntensityMinutes")
        row.avg_stress_level = stats.get("averageStressLevel")
        row.raw_json = json.dumps(stats, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_sleep(client: Any, db: Session, days: int) -> int:
    count = 0
    for d in _daterange(days):
        cdate = d.isoformat()
        sleep = client.get_sleep_data(cdate)
        if not sleep:
            continue
        daily = _get(sleep, "dailySleepDTO", default={}) or sleep
        row = db.get(models.SleepData, d) or models.SleepData(date=d)
        row.sleep_score = _get(sleep, "sleepScores", "overall", "value") or _get(daily, "sleepScores", "overall", "value")
        row.total_sleep_seconds = daily.get("sleepTimeSeconds")
        row.deep_sleep_seconds = daily.get("deepSleepSeconds")
        row.light_sleep_seconds = daily.get("lightSleepSeconds")
        row.rem_sleep_seconds = daily.get("remSleepSeconds")
        row.awake_seconds = daily.get("awakeSleepSeconds")
        row.raw_json = json.dumps(sleep, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_hrv(client: Any, db: Session, days: int) -> int:
    count = 0
    for d in _daterange(days):
        cdate = d.isoformat()
        hrv = client.get_hrv_data(cdate)
        if not hrv:
            continue
        summary = _get(hrv, "hrvSummary", default={}) or hrv
        row = db.get(models.Hrv, d) or models.Hrv(date=d)
        row.last_night_avg = summary.get("lastNightAvg")
        row.status = summary.get("status")
        row.weekly_avg = summary.get("weeklyAvg")
        row.baseline_low = _get(summary, "baseline", "balancedLow")
        row.baseline_high = _get(summary, "baseline", "balancedUpper")
        row.raw_json = json.dumps(hrv, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_body_battery(client: Any, db: Session, days: int) -> int:
    start = (date.today() - timedelta(days=days)).isoformat()
    end = date.today().isoformat()
    entries = client.get_body_battery(start, end) or []
    count = 0
    for entry in entries:
        d_str = entry.get("date")
        if not d_str:
            continue
        d = datetime.strptime(d_str, "%Y-%m-%d").date()
        values = [v[1] for v in entry.get("bodyBatteryValuesArray", []) if isinstance(v, list) and len(v) > 1 and v[1] is not None]
        row = db.get(models.BodyBattery, d) or models.BodyBattery(date=d)
        row.charged = entry.get("charged")
        row.drained = entry.get("drained")
        row.highest = max(values) if values else None
        row.lowest = min(values) if values else None
        row.raw_json = json.dumps(entry, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_training_readiness(client: Any, db: Session, days: int) -> int:
    count = 0
    for d in _daterange(days):
        cdate = d.isoformat()
        result = _first(client.get_training_readiness(cdate))
        if not result:
            continue
        row = db.get(models.TrainingReadiness, d) or models.TrainingReadiness(date=d)
        row.score = result.get("score")
        row.level = result.get("level")
        row.raw_json = json.dumps(result, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_training_status(client: Any, db: Session) -> int:
    cdate = date.today().isoformat()
    status = client.get_training_status(cdate)
    if not status:
        return 0
    load_map = _get(status, "mostRecentTrainingLoadBalance", "metricsTrainingLoadBalanceDTOMap", default={}) or {}
    load = next(iter(load_map.values()), {}) if load_map else {}
    training_status_data = _get(status, "mostRecentTrainingStatus", "latestTrainingStatusData", default={}) or {}
    ts = next(iter(training_status_data.values()), {}) if training_status_data else {}

    d = date.today()
    row = db.get(models.TrainingStatus, d) or models.TrainingStatus(date=d)
    row.weekly_training_load = ts.get("weeklyTrainingLoad")
    row.training_status_phrase = ts.get("trainingStatusFeedbackPhrase")
    row.monthly_load_aerobic_low = load.get("monthlyLoadAerobicLow")
    row.monthly_load_aerobic_high = load.get("monthlyLoadAerobicHigh")
    row.monthly_load_anaerobic = load.get("monthlyLoadAnaerobic")
    row.aerobic_low_target_min = load.get("monthlyLoadAerobicLowTargetMin")
    row.aerobic_low_target_max = load.get("monthlyLoadAerobicLowTargetMax")
    row.aerobic_high_target_min = load.get("monthlyLoadAerobicHighTargetMin")
    row.aerobic_high_target_max = load.get("monthlyLoadAerobicHighTargetMax")
    row.anaerobic_target_min = load.get("monthlyLoadAnaerobicTargetMin")
    row.anaerobic_target_max = load.get("monthlyLoadAnaerobicTargetMax")
    row.raw_json = json.dumps(status, default=str)
    db.merge(row)
    db.commit()
    return 1


def sync_vo2max(client: Any, db: Session, days: int) -> int:
    count = 0
    for d in _daterange(days):
        cdate = d.isoformat()
        metrics = client.get_max_metrics(cdate)
        if not metrics:
            continue
        generic = _get(metrics, "generic", default=None) or _get(_first(metrics), "generic", default={})
        if not generic:
            continue
        row = db.get(models.Vo2Max, d) or models.Vo2Max(date=d)
        row.vo2max_value = generic.get("vo2MaxValue")
        row.vo2max_precise = generic.get("vo2MaxPreciseValue")
        row.raw_json = json.dumps(metrics, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_race_predictions(client: Any, db: Session) -> int:
    pred = client.get_race_predictions()
    if not pred:
        return 0
    d_str = pred.get("calendarDate") or date.today().isoformat()
    d = datetime.strptime(d_str, "%Y-%m-%d").date()
    row = db.get(models.RacePrediction, d) or models.RacePrediction(date=d)
    row.time_5k_s = pred.get("time5K")
    row.time_10k_s = pred.get("time10K")
    row.time_half_marathon_s = pred.get("timeHalfMarathon")
    row.time_marathon_s = pred.get("timeMarathon")
    db.merge(row)
    db.commit()
    return 1


def sync_weigh_ins(client: Any, db: Session, days: int) -> int:
    start = (date.today() - timedelta(days=days)).isoformat()
    end = date.today().isoformat()
    result = _call(client, ["get_weigh_ins"], start, end) or {}
    summaries = result.get("dailyWeightSummaries", []) if isinstance(result, dict) else []
    count = 0
    for summary in summaries:
        d_str = summary.get("summaryDate")
        metrics = summary.get("allWeightMetrics") or []
        if not d_str or not metrics:
            continue
        d = datetime.strptime(d_str, "%Y-%m-%d").date()
        weight_grams = metrics[0].get("weight")
        if weight_grams is None:
            continue
        row = db.get(models.WeighIn, d) or models.WeighIn(date=d)
        row.weight_kg = weight_grams / 1000.0
        row.raw_json = json.dumps(summary, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count


def sync_gear(client: Any, db: Session) -> int:
    profile_number = getattr(client, "display_name", None) or getattr(client, "full_name", None)
    gear_list = _call(client, ["get_gear"], profile_number) or []
    if isinstance(gear_list, dict):
        gear_list = gear_list.get("gear", [])
    count = 0
    for g in gear_list:
        uuid = g.get("uuid") or g.get("gearUuid") or g.get("gearPk")
        if not uuid:
            continue
        row = db.get(models.Gear, str(uuid)) or models.Gear(gear_uuid=str(uuid))
        row.name = g.get("displayName") or g.get("customMakeModel") or g.get("gearMakeName", "")
        row.gear_type_name = g.get("gearTypeName", "")
        row.total_distance_m = g.get("totalDistance")
        row.status = g.get("gearStatusName")
        row.raw_json = json.dumps(g, default=str)
        db.merge(row)
        count += 1
    db.commit()
    return count
