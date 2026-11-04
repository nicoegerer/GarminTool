"""Garmin's own training metrics, using the current read-only client methods.

Keep account identifiers, personal information and locations out of new exports.
Empty device-specific responses remain empty; no synthetic Garmin scores.
"""

from datetime import timedelta


def safe_metrics(value, parent=""):
    if isinstance(value, list):
        return [safe_metrics(item, parent) for item in value]
    if isinstance(value, dict):
        return {
            (
                f"device_{index}"
                if parent
                in {
                    "latestTrainingStatusData",
                    "metricsTrainingLoadBalanceDTOMap",
                    "metricsTrainingStatusDTOMap",
                    "reportData",
                }
                else key
            ): safe_metrics(item, key)
            for index, (key, item) in enumerate(value.items())
            if not any(
                word in key.lower().replace("_", "").replace("-", "")
                for word in (
                    "userid",
                    "userprofile",
                    "profileid",
                    "displayname",
                    "email",
                    "birthdate",
                    "latitude",
                    "longitude",
                    "positionlat",
                    "positionlong",
                    "serialnumber",
                    "accesstoken",
                    "refreshtoken",
                    "ditoken",
                    "direfresh",
                    "deviceid",
                )
            )
        }
    return value


def profile_user(client):
    raw = client.get_user_profile() or {}
    user = raw.get("userData") or {}
    return {
        target: user[source]
        for source, target in {
            "gender": "gender",
            "weight": "weight_g",
            "height": "height_cm",
            "vo2MaxRunning": "vo2max_running",
            "vo2MaxCycling": "vo2max_cycling",
            "lactateThresholdSpeed": "lactate_threshold_speed",
            "lactateThresholdHeartRate": "lactate_threshold_hr",
        }.items()
        if user.get(source) is not None
    }


def profile_devices(client):
    return [
        {
            "name": row.get("productDisplayName") or row.get("displayName"),
            "primary": row.get("primaryActivityTrackerIndicator"),
        }
        for row in client.get_devices() or []
        if isinstance(row, dict)
    ]


def vo2_series(client, start, end, chunks):
    by_date = {}
    for first, last in chunks(start, end, 90):
        rows = (
            client.get_max_metrics_range(
                str(first), str(last), aggregation="daily", sport="running"
            )
            or []
        )
        if not isinstance(rows, list):
            raise TypeError("Unexpected VO2max response")
        for row in rows:
            metric = row.get("generic") or {}
            day = metric.get("calendarDate")
            value = metric.get("vo2MaxPreciseValue")
            if value is None:
                value = metric.get("vo2MaxValue")
            if day and isinstance(value, (int, float)) and value > 0:
                by_date[day] = {
                    "date": day,
                    "vo2max": value,
                    "fitness_age": metric.get("fitnessAge"),
                }
    return [by_date[day] for day in sorted(by_date)]


def readiness_series(client, start, end):
    rows = client.get_training_readiness_range(str(start), str(end)) or []
    if not isinstance(rows, list):
        raise TypeError("Unexpected readiness response")
    by_date = {}
    for row in sorted(
        rows,
        key=lambda item: str(item.get("timestampLocal") or item.get("timestamp") or ""),
    ):
        day = row.get("calendarDate")
        if day and isinstance(row.get("score"), (int, float)) and row["score"] >= 0:
            by_date[day] = {
                key: row[key]
                for key in (
                    "calendarDate",
                    "score",
                    "level",
                    "feedbackShort",
                    "recoveryTime",
                    "sleepScore",
                    "hrvWeeklyAverage",
                    "acuteLoad",
                    "timestampLocal",
                )
                if row.get(key) is not None
            }
    return [by_date[day] for day in sorted(by_date)]


def export_fitness(exporter, client, start, today, chunks):
    def section(key, fetch, default=None):
        return exporter.section(
            f"fitness.{key}", lambda: safe_metrics(fetch()), default=default
        )

    def race_history():
        rows = []
        for first, last in chunks(start, today, 180):
            raw = (
                client.get_race_predictions(str(first), str(last), _type="daily") or []
            )
            if not isinstance(raw, list):
                raise TypeError("Unexpected race history")
            rows.extend(raw)
        return sorted(rows, key=lambda row: row.get("calendarDate") or "")

    return {
        "training_status": section(
            "training_status", lambda: client.get_training_status(str(today))
        ),
        "training_status_history": section(
            "training_status_history",
            lambda: client.get_weekly_training_status(str(start), str(today)),
        ),
        "race_predictions": section("race_predictions", client.get_race_predictions),
        "race_predictions_history": section(
            "race_predictions_history", race_history, []
        ),
        "endurance_score": section(
            "endurance_score",
            lambda: client.get_endurance_score(
                str(start), str(today), aggregation="daily"
            ),
        ),
        "hill_score": section(
            "hill_score", lambda: client.get_hill_score(str(start), str(today))
        ),
        "max_metrics_latest": section(
            "max_metrics_latest", lambda: client.get_max_metrics_latest(str(today))
        ),
        "heat_altitude_acclimation": section(
            "heat_altitude_acclimation",
            lambda: client.get_heat_altitude_acclimation(str(today)),
        ),
        "cycling_ability": section(
            "cycling_ability", lambda: client.get_cycling_ability(str(today))
        ),
        "running_economy": section(
            "running_economy", lambda: client.get_running_economy(str(today))
        ),
        "critical_swim_speed": section(
            "critical_swim_speed", lambda: client.get_critical_swim_speed(str(today))
        ),
        "lactate_threshold": section("lactate_threshold", client.get_lactate_threshold),
        "cycling_ftp": section("cycling_ftp", client.get_cycling_ftp),
        "power_curve": section(
            "power_curve",
            lambda: client.get_power_curve(
                str(max(start, today - timedelta(days=89))), str(today), sport="cycling"
            ),
        ),
        "power_zones": section("power_zones", client.get_power_zones, []),
    }


def export_records(exporter, client):
    def records():
        rows = client.get_personal_record(include_history=False) or []
        if not isinstance(rows, list):
            raise TypeError("Unexpected personal records")
        return [
            {
                "type_id": row.get("typeId"),
                "activity_type": row.get("activityType"),
                "value": row.get("value"),
                "date": row.get("prStartTimeGmtFormatted"),
                "activity_id": row.get("activityId"),
                "activity_name": row.get("activityName"),
            }
            for row in rows
            if isinstance(row, dict)
        ]

    result = {
        "personal_records": exporter.section(
            "records.personal_records", records, default=[]
        ),
        "badges": exporter.section(
            "records.badges",
            lambda: [
                {
                    "name": row.get("badgeName"),
                    "date": row.get("badgeEarnedDate"),
                    "points": row.get("badgePoints"),
                    "category": row.get("badgeCategoryId"),
                }
                for row in client.get_earned_badges() or []
            ],
            default=[],
        ),
    }
    # Preserve the aggregate status used by older frontends.
    exporter.manifest["sections"]["records"] = {
        **exporter.manifest["sections"]["records.personal_records"],
        "count": len(result["personal_records"]),
    }
    return result


def export_optional_domains(exporter, client, today):
    def gear():
        result, offset = [], 0
        while True:
            rows = client.get_gear_list(start=offset, limit=100) or []
            if not isinstance(rows, list):
                raise TypeError("Unexpected gear list")
            result.extend(
                {
                    key: row[key]
                    for key in (
                        "displayName",
                        "customMakeModel",
                        "gearTypeName",
                        "gearStatusName",
                        "maximumMeters",
                    )
                    if key in row
                }
                for row in rows
            )
            if len(rows) < 100:
                return result
            offset += len(rows)
            if offset >= 10000:
                raise ValueError("Gear pagination limit")

    def calendar():
        result = []
        seen = set()
        for ref in (today, today + timedelta(days=14)):
            key = (ref.year, ref.month)
            if key in seen:
                continue
            seen.add(key)
            raw = (
                client.connectapi(
                    f"/calendar-service/year/{ref.year}/month/{ref.month - 1}"
                )
                or {}
            )
            result.extend(
                {
                    "date": item.get("date"),
                    "title": item.get("title"),
                    "workout_id": item.get("workoutId"),
                    "sport": item.get("sportTypeKey"),
                }
                for item in raw.get("calendarItems") or []
                if item.get("itemType") == "workout"
                and str(today)
                <= (item.get("date") or "")
                <= str(today + timedelta(days=14))
            )
        return sorted(result, key=lambda item: item["date"])

    def events():
        return [
            {
                key: row[key]
                for key in (
                    "eventName",
                    "eventDate",
                    "date",
                    "sport",
                    "sportType",
                    "distance",
                    "priority",
                )
                if key in row
            }
            for row in client.get_calendar_events(
                str(today), str(today + timedelta(days=365))
            )
            or []
        ]

    return {
        "gear": exporter.section("gear", gear, default=[]),
        "goals": exporter.section(
            "goals", lambda: safe_metrics(client.get_goals("active")), default=[]
        ),
        "calendar": exporter.section("calendar", calendar, default=[]),
        "events": exporter.section("events", events, default=[]),
    }
