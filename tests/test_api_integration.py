# /// script
# requires-python = ">=3.12"
# dependencies = ["garminconnect==0.3.20", "garmin-fit-sdk==21.218.0", "cryptography>=46,<51"]
# ///
"""Contract/regression tests for Garmin Connect and Strava; no credentials/network."""

import io
import json
import sys
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlencode, urlsplit
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import connect_metrics
import export_data
import export_details
import fit_details
import garmin_api
import setup_garmin_token
import strava_api
import sync_strava_names
from garmin_fit_sdk import Encoder, Profile
from garminconnect import (
    Garmin,
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
    GarminConnectTooManyRequestsError,
)

DAY = date(2026, 11, 3)


def response(value):
    return value


class ConnectTransport:
    """Run the pinned library methods against a local Connect API test double."""

    def __init__(self):
        self.api = Garmin()
        self.api.display_name = "test-athlete"
        self.api.unit_system = "metric"
        self.api.get_full_name = lambda: self.display_name
        self.api.connectapi = Mock(side_effect=self.get)
        self.calls = []
        self.fail = None
        self.weight = 72.5
        self.display_name = "Test Athlete"

    def get(self, path, **kwargs):
        params = kwargs.get("params")
        self.calls.append((path, params))
        if self.fail and any(
            term in path
            for term in ((self.fail,) if isinstance(self.fail, str) else self.fail)
        ):
            raise GarminConnectConnectionError("private upstream content")
        if path == "/userprofile-service/userprofile/user-settings":
            return response(
                {
                    "userData": {
                        "weight": 72500,
                        "height": 180,
                        "birthDate": "2000-01-01",
                        "vo2MaxRunning": 51,
                    }
                }
            )
        if path == "/activitylist-service/activities/search/activities":
            assert params == {"start": "0", "limit": "100"}
            return response(
                [
                    {
                        "activityId": 101,
                        "activityName": "Run",
                        "startTimeLocal": "2026-11-03 09:00:00",
                        "activityType": {"typeKey": "running"},
                        "duration": 1800,
                        "distance": 5000,
                        "startLatitude": 52.1,
                        "startLongitude": 13.1,
                        "activityTrainingLoad": 75,
                    }
                ]
            )
        if path.startswith("/usersummary-service/stats/steps/daily/"):
            return response(
                [
                    {
                        "calendarDate": DAY.isoformat(),
                        "totalSteps": 8500,
                        "stepGoal": 10000,
                    }
                ]
            )
        if path.startswith("/usersummary-service/stats/stress/daily/"):
            return response(
                [
                    {
                        "calendarDate": DAY.isoformat(),
                        "values": {"overallStressLevel": 24},
                    }
                ]
            )
        if path == "/usersummary-service/v2/dailysummaries":
            return response(
                {
                    "data": [
                        {
                            "calendarDate": "2026-11-02",
                            "heartRate": {"restingValue": 49},
                            "intensityMinutes": {
                                "goal": 150,
                                "moderate": 10,
                                "vigorous": 20,
                            },
                        },
                        {
                            "calendarDate": "2026-11-03",
                            "heartRate": {"restingValue": 48},
                            "intensityMinutes": {
                                "goal": 150,
                                "moderate": 25,
                                "vigorous": 0,
                            },
                        },
                    ]
                }
            )
        if path == "/sleep-service/sleep/dailySleepSummariesByDate":
            return response(
                [
                    {
                        "calendarDate": DAY.isoformat(),
                        "sleepTimeSeconds": 27000,
                        "deepSleepSeconds": 4500,
                        "sleepScores": {"overall": {"value": 88}},
                    }
                ]
            )
        if path.startswith("/hrv-service/hrv/daily/"):
            return response(
                {
                    "hrvSummaries": [
                        {
                            "calendarDate": DAY.isoformat(),
                            "lastNightAvg": 65,
                            "status": "BALANCED",
                        }
                    ]
                }
            )
        if path == "/wellness-service/wellness/bodyBattery/reports/daily":
            return response(
                [
                    {
                        "date": DAY.isoformat(),
                        "charged": 60,
                        "drained": 20,
                        "bodyBatteryValueDescriptorDTOList": [
                            {
                                "bodyBatteryValueDescriptorIndex": 2,
                                "bodyBatteryValueDescriptorKey": "bodyBatteryLevel",
                            }
                        ],
                        "bodyBatteryValuesArray": [
                            [0, "MEASURED", 30],
                            [1, "MEASURED", 90],
                            [2, "MEASURED", -1],
                        ],
                    }
                ]
            )
        if path.startswith("/weight-service/weight/range/"):
            first, last = path.split("/")[-2:]
            assert params == {"includeAll": "true"}
            rows = (
                [
                    {
                        "summaryDate": DAY.isoformat(),
                        "allWeightMetrics": [
                            {
                                "calendarDate": DAY.isoformat(),
                                "weight": self.weight,
                                "bodyFat": 15,
                            }
                        ],
                    }
                ]
                if first <= DAY.isoformat() <= last
                else []
            )
            return response({"dailyWeightSummaries": rows})
        if path.startswith("/fitnessage-service/fitnessage/v2/"):
            return response({"fitnessAge": 30})
        if path == "/biometric-service/heartRateZones/v2":
            return response(
                [
                    {
                        "sport": "RUNNING",
                        **{f"zone{n}Floor": 90 + n * 15 for n in range(1, 6)},
                    }
                ]
            )
        if path.startswith("/metrics-service/metrics/maxmet/daily/"):
            return [
                {
                    "generic": {
                        "calendarDate": str(DAY),
                        "vo2MaxPreciseValue": 51.3,
                        "vo2MaxValue": 51,
                    },
                    "cycling": {"calendarDate": str(DAY), "vo2MaxValue": 60},
                }
            ]
        if path.startswith("/metrics-service/metrics/maxmet/latest/"):
            return {
                "generic": {"calendarDate": str(DAY), "vo2MaxPreciseValue": 51.3},
                "userId": "private-account-id",
            }
        if path.startswith("/metrics-service/metrics/trainingreadiness/"):
            return [
                {
                    "calendarDate": str(DAY),
                    "score": 75,
                    "timestampLocal": f"{DAY}T08:00:00",
                    "userProfilePK": "private-account-id",
                }
            ]
        if "/personalrecord/prs/" in path:
            assert params == {"includeHistory": "false"}
            return [
                {
                    "typeId": 3,
                    "value": 1200,
                    "activityId": 101,
                    "activityName": "Run",
                    "prStartTimeGmtFormatted": f"{DAY}T09:00:00",
                }
            ]
        if path == "/device-service/deviceregistration/devices":
            return [
                {"productDisplayName": "Test Watch", "serialNumber": "private-serial"}
            ]
        if path.startswith(
            ("/metrics-service/", "/biometric-service/", "/fitnessstats-service/")
        ):
            return {}
        if path.startswith("/calendar-service/"):
            return [] if path.endswith("/events") else {}
        if path.startswith(("/badge-service/", "/gear-service/", "/goal-service/")):
            return []
        raise AssertionError(f"Unexpected Connect endpoint: {path}")


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.out = Path(self.temp.name)
        self.clock = patch.object(export_data, "TODAY", DAY)
        self.clock.start()
        self.transport = ConnectTransport()
        self.client = garmin_api.GarminClient(self.transport.api)

    def tearDown(self):
        self.client.close()
        self.clock.stop()
        self.temp.cleanup()

    def read(self, name):
        return json.loads((self.out / f"{name}.json").read_text())

    def test_connect_export_maps_health_weight_and_native_metrics_without_gps(self):
        manifest = export_data.export(self.client, self.out, 2)
        daily = self.read("daily")
        self.assertEqual(daily["rhr"][-1]["values"]["restingHR"], 48)
        self.assertEqual(daily["sleep_scores"][0]["score"], 88)
        self.assertEqual(daily["body_battery"][0]["highest"], 90)
        self.assertEqual(daily["body_battery"][0]["lowest"], 30)
        self.assertEqual(daily["hrv"][0]["avg"], 65)
        self.assertEqual(daily["intensity_minutes_weekly"][0]["moderateValue"], 35)
        self.assertEqual(daily["intensity_minutes_weekly"][0]["vigorousValue"], 20)
        self.assertEqual(self.read("body")["weigh_ins"][0]["weight_g"], 72500)
        self.assertEqual(self.read("profile")["unit_system"], "metric")
        self.assertEqual(manifest["source"], "python_garminconnect")
        self.assertEqual(daily["vo2max"][-1]["vo2max"], 51.3)
        self.assertEqual(daily["readiness"][-1]["score"], 75)
        self.assertEqual(self.read("records")["personal_records"][0]["value"], 1200)
        self.assertNotIn("birthDate", (self.out / "profile.json").read_text())
        self.assertNotIn("private-account-id", (self.out / "fitness.json").read_text())
        self.assertNotIn("private-serial", (self.out / "profile.json").read_text())
        self.assertEqual(self.read("load_trend")[-1]["load"], 75)
        self.assertNotIn("startLatitude", self.read("activities")[0])
        unexpected = [
            key
            for key, entry in manifest["sections"].items()
            if not entry["ok"] and entry.get("status") != "unavailable"
        ]
        self.assertEqual(unexpected, [])

    def test_unsupported_and_failed_sections_retain_history(self):
        export_data.write_json(
            self.out,
            "daily",
            {
                "vo2max": [{"date": "2026-10-01", "vo2max": 51}],
                "stress": [
                    {"calendarDate": "2026-11-01", "values": {"overallStressLevel": 20}}
                ],
            },
        )
        export_data.write_json(
            self.out, "fitness", {"training_status": {"historical": True}}
        )
        self.transport.fail = ("stats/stress", "/maxmet/daily/", "/trainingstatus/")
        manifest = export_data.export(self.client, self.out, 2)
        self.assertEqual(self.read("daily")["vo2max"][0]["vo2max"], 51)
        self.assertEqual(self.read("daily")["stress"][0]["calendarDate"], "2026-11-01")
        self.assertTrue(self.read("fitness")["training_status"]["historical"])
        self.assertTrue(manifest["sections"]["daily.vo2max"]["retained"])
        self.assertTrue(manifest["sections"]["daily.stress"]["retained"])
        self.assertNotIn("private upstream content", json.dumps(manifest))

    def test_live_gram_weights_are_not_scaled_twice(self):
        self.transport.weight = 72500
        export_data.export(self.client, self.out, 2)
        self.assertEqual(self.read("body")["weigh_ins"][0]["weight_g"], 72500)

    def test_account_ids_and_empty_names_do_not_replace_the_saved_name(self):
        with patch.dict("os.environ", {"DASHBOARD_DISPLAY_NAME": ""}):
            for value in ("11111111-2222-4333-8444-555555555555", "", "  ", None):
                with self.subTest(display_name=value):
                    self.transport.display_name = value
                    export_data.write_json(self.out, "profile", {"full_name": "Nico"})
                    manifest = export_data.export(self.client, self.out, 2)
                    self.assertEqual(self.read("profile")["full_name"], "Nico")
                    self.assertEqual(
                        manifest["sections"]["profile.full_name"]["source"], "retained"
                    )

    def test_configured_display_name_overrides_api_and_saved_names(self):
        export_data.write_json(self.out, "profile", {"full_name": "Nico"})
        with patch.dict("os.environ", {"DASHBOARD_DISPLAY_NAME": "  Ada  "}):
            export_data.export(self.client, self.out, 2)
        self.assertEqual(self.read("profile")["full_name"], "Ada")

    def test_fresh_export_does_not_publish_account_id_as_name(self):
        self.transport.display_name = "11111111-2222-4333-8444-555555555555"
        with patch.dict("os.environ", {"DASHBOARD_DISPLAY_NAME": ""}):
            manifest = export_data.export(self.client, self.out, 2)
        self.assertIsNone(self.read("profile")["full_name"])
        self.assertEqual(
            manifest["sections"]["profile.full_name"]["status"], "unavailable"
        )

    def test_required_failure_does_not_publish_partial_export(self):
        export_data.write_json(self.out, "activities", [{"activityId": 55}])
        before = (self.out / "activities.json").read_bytes()
        self.transport.fail = "activitylist-service"
        with self.assertRaises(GarminConnectConnectionError):
            export_data.export(self.client, self.out, 2)
        self.assertEqual((self.out / "activities.json").read_bytes(), before)
        self.assertFalse((self.out / "manifest.json").exists())

    def test_pagination_preserves_legacy_metrics_and_honors_deletion(self):
        client = Mock()
        batch = [
            {
                "activityId": n,
                "activityName": f"Activity {n}",
                "activityType": {"typeKey": "running"},
            }
            for n in range(1, 101)
        ]
        client.search_activities.side_effect = [batch, [{"activityId": 101}]]
        result = export_data.fetch_activities(
            client,
            [
                {"activityId": 1, "vO2MaxValue": 51, "activityName": "Old"},
                {"activityId": 999},
            ],
        )
        self.assertEqual(len(result), 101)
        self.assertEqual(result[0]["vO2MaxValue"], 51)
        self.assertEqual(result[0]["activityName"], "Activity 1")
        self.assertNotIn(999, [row["activityId"] for row in result])
        self.assertEqual(
            client.search_activities.call_args_list[1].kwargs["start"], 100
        )

    def test_authentication_error_in_optional_section_aborts(self):
        exporter = export_data.Exporter(self.out)
        error = GarminConnectAuthenticationError("private upstream content")
        with self.assertRaises(GarminConnectAuthenticationError):
            exporter.section("daily.hrv", Mock(side_effect=error))

    def test_range_limits_are_inclusive_and_complete(self):
        ranges = list(export_data.chunked_dates(date(2026, 1, 1), DAY, 28))
        covered = [
            first.toordinal() + n
            for first, last in ranges
            for n in range((last - first).days + 1)
        ]
        self.assertEqual(
            covered, list(range(date(2026, 1, 1).toordinal(), DAY.toordinal() + 1))
        )
        self.assertTrue(all((last - first).days < 28 for first, last in ranges))

    def test_device_without_readiness_keeps_an_empty_successful_response(self):
        self.transport.api.get_training_readiness_range = Mock(return_value=[])
        manifest = export_data.export(self.client, self.out, 2)
        self.assertEqual(self.read("daily")["readiness"], [])
        self.assertTrue(manifest["sections"]["daily.readiness"]["ok"])
        self.assertEqual(manifest["sections"]["daily.readiness"]["count"], 0)

    def test_latest_readiness_recalculation_wins_and_zero_is_valid(self):
        self.transport.api.get_training_readiness_range = Mock(
            return_value=[
                {
                    "calendarDate": str(DAY),
                    "timestampLocal": f"{DAY}T10:00:00",
                    "score": 0,
                },
                {
                    "calendarDate": str(DAY),
                    "timestampLocal": f"{DAY}T08:00:00",
                    "score": 50,
                },
            ]
        )
        rows = connect_metrics.readiness_series(self.client, DAY, DAY)
        self.assertEqual(rows[0]["score"], 0)

    def test_nested_and_flat_daily_summaries_map_to_the_same_measurements(self):
        nested = [
            {
                "calendarDate": str(DAY),
                "heartRate": {"restingValue": 48},
                "intensityMinutes": {"goal": 150, "moderate": 20, "vigorous": 10},
            }
        ]
        flat = [
            {
                "calendarDate": str(DAY),
                "restingHeartRate": 48,
                "intensityMinutesGoal": 150,
                "moderateIntensityMinutes": 20,
                "vigorousIntensityMinutes": 10,
            }
        ]
        self.assertEqual(
            export_data.resting_heart_rate(flat), export_data.resting_heart_rate(nested)
        )
        self.assertEqual(
            export_data.weekly_intensity(flat), export_data.weekly_intensity(nested)
        )

    def test_body_battery_without_descriptors_handles_status_columns(self):
        result = export_data.body_battery(
            [
                {
                    "date": str(DAY),
                    "bodyBatteryValuesArray": [
                        [0, "MEASURED", 20],
                        [1, "MEASURED", 80],
                    ],
                }
            ]
        )
        self.assertEqual(result[0]["highest"], 80)
        self.assertEqual(result[0]["lowest"], 20)

    def test_rate_limits_abort_without_publishing_partial_data(self):
        self.transport.api.get_weekly_training_status = Mock(
            side_effect=GarminConnectTooManyRequestsError("private upstream content")
        )
        with self.assertRaises(GarminConnectTooManyRequestsError):
            export_data.export(self.client, self.out, 2)
        self.assertFalse((self.out / "manifest.json").exists())

    def test_new_library_methods_and_non_mutating_zone_lookup_are_used(self):
        export_data.export(self.client, self.out, 2)
        paths = [path for path, _ in self.transport.calls]
        self.assertTrue(any("trainingstatus/weekly/" in path for path in paths))
        self.assertTrue(any("cycling-ability/latest" in path for path in paths))
        self.assertTrue(any("runningeconomy/latest" in path for path in paths))
        self.assertTrue(any("criticalSwimSpeed/latest" in path for path in paths))
        self.assertTrue(
            any("fitnessstats-service/powerCurve" in path for path in paths)
        )
        zones = next(
            params
            for path, params in self.transport.calls
            if path == "/biometric-service/heartRateZones/v2"
        )
        self.assertEqual(zones, {"generateDefaults": "false"})


class FitTests(unittest.TestCase):
    def fit_zip(self):
        encoder = Encoder()
        encoder.on_mesg(
            Profile["mesg_num"]["FILE_ID"],
            {
                "manufacturer": "development",
                "product": 1,
                "type": "activity",
                "time_created": datetime(2026, 11, 3, tzinfo=UTC),
            },
        )
        encoder.on_mesg(
            Profile["mesg_num"]["SESSION"],
            {
                "sport": "running",
                "total_timer_time": 1800,
                "total_distance": 5000,
                "avg_cadence": 86,
                "avg_step_length": 1120,
                "avg_vertical_oscillation": 80,
            },
        )
        encoder.on_mesg(
            Profile["mesg_num"]["LAP"],
            {
                "total_timer_time": 360,
                "total_distance": 1000,
                "start_position_lat": 2**30,
                "start_position_long": 2**29,
            },
        )
        encoder.on_mesg(
            Profile["mesg_num"]["SET"],
            {"set_type": "active", "repetitions": 10, "weight": 25},
        )
        encoder.on_mesg(
            Profile["mesg_num"]["LENGTH"],
            {"length_type": "active", "total_timer_time": 25, "total_strokes": 15},
        )
        stream = io.BytesIO()
        with ZipFile(stream, "w") as archive:
            archive.writestr("activity.fit", encoder.close())
        return stream.getvalue()

    def test_real_fit_sdk_decode_units_and_privacy(self):
        messages = fit_details.decode_download(self.fit_zip())
        data = fit_details.fit_detail(messages, "running")
        self.assertEqual(data["summary"]["averageRunCadence"], 172)
        self.assertEqual(data["summary"]["strideLength"], 112)
        self.assertEqual(data["summary"]["verticalOscillation"], 8)
        self.assertEqual(data["sets"][0]["weight_g"], 25000)
        self.assertEqual(data["lengths"][0]["averageSWOLF"], 40)
        self.assertNotIn("startLatitude", data["laps"][0])
        gps = fit_details.fit_detail(messages, "running", True)
        self.assertEqual(gps["laps"][0]["startLatitude"], 90)

    def test_detail_uses_official_json_and_fit_only(self):
        client = Mock()
        client.get_activity.return_value = {
            "summaryDTO": {"duration": 1850, "distance": 5100, "startLatitude": 52}
        }
        client.download_activity.return_value = self.fit_zip()
        activity = {"activityId": 101, "typeKey": "running", "hrTimeInZone_1": 120}
        detail = export_details.build_detail(
            client, activity, False, [{"sport": "RUNNING", "zone1Floor": 105}]
        )
        self.assertEqual(detail["summary"]["duration"], 1850)
        self.assertEqual(detail["running"]["strideLength"], 112)
        self.assertEqual(detail["hrZones"][0]["secs"], 120)
        self.assertNotIn("gps", detail)
        self.assertNotIn("startLatitude", json.dumps(detail))
        self.assertEqual(detail["fit_status"], "ok")
        self.assertEqual(
            [call[0] for call in client.method_calls],
            ["get_activity", "download_activity"],
        )

    def test_missing_fit_remains_retryable(self):
        client = Mock()
        client.get_activity.return_value = {"summaryDTO": {"duration": 10}}
        client.download_activity.side_effect = ValueError("missing")
        detail = export_details.build_detail(
            client, {"activityId": 1, "typeKey": "running"}, False
        )
        self.assertEqual(detail["fit_status"], "pending")
        self.assertEqual(detail["summary"]["duration"], 10)

    def test_limit_does_not_truncate_index_and_cached_gps_is_removed(self):
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            (out / "activity").mkdir()
            export_data.write_json(
                out,
                "activities",
                [{"activityId": n, "activityName": "Run"} for n in (1, 2)],
            )
            export_data.write_json(
                out / "activity",
                "1",
                {
                    "name": "Old",
                    "summary": {},
                    "gps": {"startLatitude": 50},
                    "laps": [{"startLatitude": 50, "startLongitude": 10}],
                },
            )
            with (
                patch.object(
                    sys, "argv", ["export_details.py", "--out", temp, "--limit", "1"]
                ),
                patch.object(export_details, "create_client", return_value=Mock()),
            ):
                self.assertEqual(export_details.main(), 0)
            self.assertEqual(len(json.loads((out / "activities.json").read_text())), 2)
            detail = json.loads((out / "activity/1.json").read_text())
            self.assertEqual(detail["name"], "Run")
            self.assertNotIn("gps", detail)
            self.assertNotIn("startLatitude", json.dumps(detail))


class GarminAuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.tokens = {
            "di_token": "test-access",
            "di_refresh_token": "initial-refresh",
            "di_client_id": "test-client",
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_rotated_tokens_are_encrypted_and_reused_across_runs(self):
        state = garmin_api.TokenState(self.tokens, self.directory)
        rotated = {**self.tokens, "di_refresh_token": "rotated-refresh"}
        state.save(rotated)
        self.assertNotIn(b"rotated-refresh", state.path.read_bytes())
        self.assertNotIn(b"test-access", state.path.read_bytes())
        self.assertEqual(state.path.stat().st_mode & 0o777, 0o600)
        resumed = garmin_api.TokenState(self.tokens, self.directory)
        self.assertEqual(resumed.tokens, rotated)
        replaced = garmin_api.TokenState(
            {**self.tokens, "di_refresh_token": "new-login"}, self.directory
        )
        self.assertNotEqual(replaced.path, state.path)

    def test_login_uses_latest_encrypted_state_and_saves_on_later_failure(self):
        # The failure is intentionally inside an already-open authenticated client.
        rotated = {**self.tokens, "di_refresh_token": "rotated-refresh"}
        garmin_api.TokenState(self.tokens, self.directory).save(rotated)
        api = Mock()
        api.client.is_authenticated = True
        api.client.dumps.return_value = json.dumps(rotated)
        api.get_race_predictions.side_effect = GarminConnectConnectionError(
            "private upstream content"
        )
        with (  # noqa: SIM117
            patch.dict(
                "os.environ",
                {
                    "GARMIN_TOKENS_JSON": json.dumps(self.tokens),
                    "GARMIN_STATE_DIR": str(self.directory),
                },
            ),
            patch.object(garmin_api, "Garmin", return_value=api),
        ):
            with garmin_api.create_client() as client:
                self.assertEqual(json.loads(api.login.call_args.args[0]), rotated)
                next_tokens = {**rotated, "di_refresh_token": "next-refresh"}
                api.client.dumps.return_value = json.dumps(next_tokens)
                with self.assertRaises(GarminConnectConnectionError):
                    client.get_race_predictions()
        self.assertEqual(
            garmin_api.TokenState(self.tokens, self.directory).tokens, next_tokens
        )

    def test_tokens_refreshed_during_a_failed_login_are_preserved(self):
        api = Mock()
        api.client.is_authenticated = True
        rotated = {**self.tokens, "di_refresh_token": "refreshed-at-login"}
        api.client.dumps.return_value = json.dumps(rotated)
        api.login.side_effect = GarminConnectConnectionError("profile request failed")
        with (
            patch.dict(
                "os.environ",
                {
                    "GARMIN_TOKENS_JSON": json.dumps(self.tokens),
                    "GARMIN_STATE_DIR": str(self.directory),
                },
            ),
            patch.object(garmin_api, "Garmin", return_value=api),
            self.assertRaises(GarminConnectConnectionError),
        ):
            garmin_api.create_client()
        self.assertEqual(
            garmin_api.TokenState(self.tokens, self.directory).tokens, rotated
        )

    def test_old_garth_tokens_fail_before_any_login_request(self):
        with (
            patch.dict(
                "os.environ",
                {"GARMIN_TOKENS_JSON": '{"oauth1_token":"old-private-token"}'},
            ),
            patch.object(garmin_api, "Garmin") as factory,
            self.assertRaises(garmin_api.GarminConfigurationError) as caught,
        ):
            garmin_api.create_client()
        factory.return_value.login.assert_not_called()
        self.assertIn("setup_garmin_token.py", str(caught.exception))
        self.assertNotIn("old-private-token", str(caught.exception))

    def test_corrupt_encrypted_state_is_not_silently_reset(self):
        state = garmin_api.TokenState(self.tokens, self.directory)
        state.save(self.tokens)
        state.path.write_bytes(b"corrupt")
        with self.assertRaises(garmin_api.GarminConfigurationError):
            garmin_api.TokenState(self.tokens, self.directory)

    def test_setup_resumes_mfa_without_saving_password_or_printing_tokens(self):
        first, resumed = Mock(), Mock()
        first.login.return_value = ("needs_mfa", {"session": "private-cookie"})
        resumed.client.dumps.return_value = json.dumps(self.tokens)
        output = io.StringIO()
        with (
            patch.object(
                sys,
                "argv",
                ["setup_garmin_token.py", "--token-dir", str(self.directory)],
            ),
            patch.object(setup_garmin_token, "Garmin", side_effect=[first, resumed]),
            patch("builtins.input", return_value="athlete@example.invalid"),
            patch.object(
                setup_garmin_token.getpass,
                "getpass",
                side_effect=["private-password", "123456"],
            ),
            redirect_stdout(output),
        ):
            self.assertEqual(setup_garmin_token.main(), 0)
        resumed.resume_login.assert_called_once_with(
            {"session": "private-cookie"}, "123456"
        )
        resumed.client.dump.assert_called_once_with(str(self.directory))
        self.assertIn("GARMIN_TOKENS_JSON", output.getvalue())
        self.assertNotIn("private-password", output.getvalue())
        self.assertNotIn("private-cookie", output.getvalue())


class StravaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.state = Path(self.temp.name)
        self.config = {
            "strava_client_id": "123",
            "strava_client_secret": "test-client-secret",
            "strava_refresh_token": "initial-refresh",
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_rotation_is_encrypted_and_survives_subsequent_api_failure(self):
        first = strava_api.StravaClient(self.config, self.state)
        rotated = {
            "access_token": "first-access",
            "refresh_token": "rotated-refresh",
            "expires_at": int(time.time()) - 1,
        }
        with (
            patch.object(strava_api, "post_token", return_value=rotated),
            patch.object(
                strava_api,
                "request_json",
                side_effect=strava_api.StravaError("HTTP 503"),
            ),
            self.assertRaises(strava_api.StravaError),
        ):
            first.activities(0)
        contents = first.state_path.read_bytes()
        self.assertNotIn(b"rotated-refresh", contents)
        self.assertNotIn(b"first-access", contents)
        self.assertEqual(first.state_path.stat().st_mode & 0o777, 0o600)
        second = strava_api.StravaClient(self.config, self.state)
        next_token = {
            "access_token": "second-access",
            "refresh_token": "next-refresh",
            "expires_at": int(time.time()) + 7200,
        }
        with patch.object(strava_api, "post_token", return_value=next_token) as post:
            self.assertEqual(second.access_token(), "second-access")
            self.assertEqual(post.call_args.kwargs["refresh_token"], "rotated-refresh")
        third = strava_api.StravaClient(self.config, self.state)
        with patch.object(strava_api, "post_token") as post:
            self.assertEqual(third.access_token(), "second-access")
            post.assert_not_called()

    def test_new_configuration_has_separate_token_state(self):
        one = strava_api.StravaClient(self.config, self.state)
        two = strava_api.StravaClient(
            {**self.config, "strava_refresh_token": "new-grant"}, self.state
        )
        self.assertNotEqual(one.state_path, two.state_path)

    def test_pagination_uses_official_endpoint_and_bearer(self):
        client = strava_api.StravaClient(self.config, self.state)
        client.state = {"access_token": "access", "expires_at": int(time.time()) + 7200}
        with patch.object(
            strava_api,
            "request_json",
            side_effect=[[{"id": n} for n in range(100)], [{"id": 100}]],
        ) as request:
            self.assertEqual(len(client.activities(1234)), 101)
            self.assertIn(
                "https://www.strava.com/api/v3/athlete/activities?",
                request.call_args.args[0],
            )
            self.assertIn("page=2", request.call_args.args[0])
            self.assertEqual(request.call_args.kwargs["token"], "access")

    def test_match_respects_sport_local_time_and_automatic_names(self):
        activities = [
            {
                "activityId": 1,
                "activityName": "Run",
                "typeKey": "running",
                "startTimeLocal": "2026-11-03 09:00:00",
            },
            {
                "activityId": 2,
                "activityName": "Ride",
                "typeKey": "cycling",
                "startTimeLocal": "2026-11-03 09:00:00",
            },
        ]
        source = [
            {
                "id": 10,
                "name": "Intervals",
                "sport_type": "Run",
                "start_date_local": "2026-11-03T09:00:00Z",
            },
            {
                "id": 11,
                "name": "Morning Ride",
                "sport_type": "Ride",
                "start_date_local": "2026-11-03T09:00:00Z",
            },
        ]
        changes = sync_strava_names.apply_names(
            activities, source, datetime(2026, 11, 2), 600
        )
        self.assertEqual(changes, {1: "Intervals"})
        self.assertEqual(
            activities[0]["activityName"], "Run"
        )  # Preview does not mutate.
        all_names = sync_strava_names.apply_names(
            activities, source, datetime(2026, 11, 2), 600, True
        )
        self.assertEqual(all_names[2], "Morning Ride")

    def test_execute_updates_index_and_cached_detail(self):
        out = self.state / "data"
        out.mkdir()
        (out / "activity").mkdir()
        activities = [
            {
                "activityId": 1,
                "activityName": "Run",
                "typeKey": "running",
                "startTimeLocal": datetime.now().isoformat(),
            }
        ]
        export_data.write_json(out, "activities", activities)
        export_data.write_json(
            out / "activity", "1", {"name": "Run", "summary": {"duration": 120}}
        )
        source = [
            {
                "id": 2,
                "name": "Intervals",
                "type": "Run",
                "start_date_local": activities[0]["startTimeLocal"],
            }
        ]
        with (
            patch.object(
                sys, "argv", ["sync_strava_names.py", "--out", str(out), "--execute"]
            ),
            patch.object(sync_strava_names, "load_config", return_value=self.config),
            patch.object(
                sync_strava_names.StravaClient, "activities", return_value=source
            ),
        ):
            self.assertEqual(sync_strava_names.main(), 0)
        self.assertEqual(
            json.loads((out / "activities.json").read_text())[0]["activityName"],
            "Intervals",
        )
        self.assertEqual(
            json.loads((out / "activity/1.json").read_text())["name"], "Intervals"
        )

    def test_http_error_does_not_expose_response_body(self):
        import urllib.error

        error = urllib.error.HTTPError(
            "https://www.strava.com/oauth/token",
            401,
            "bad",
            {},
            io.BytesIO(b"private-secret"),
        )
        with (
            patch("urllib.request.urlopen", side_effect=error),
            self.assertRaisesRegex(strava_api.StravaError, "HTTP 401") as caught,
        ):
            strava_api.post_token(
                self.config, grant_type="refresh_token", refresh_token="secret"
            )
        self.assertNotIn("private-secret", str(caught.exception))

    def oauth_setup(self, scope):
        """Exercise the real callback handler without opening a listening port."""
        opened = []
        rejected = []
        config_path = self.state / "config.json"
        config_path.write_text(json.dumps(self.config))

        class Server:
            def __init__(server, address, handler):
                self.assertEqual(address, ("127.0.0.1", sync_strava_names.PORT))
                server.handler = handler
                server.count = 0

            def __enter__(server):
                return server

            def __exit__(server, *args):
                pass

            def handle_request(server):
                server.count += 1
                query = parse_qs(urlsplit(opened[0]).query)
                self.assertEqual(query["scope"], ["activity:read_all"])
                request = object.__new__(server.handler)
                request.path = "/callback?" + urlencode(
                    {
                        "state": "incorrect-state"
                        if server.count == 1
                        else query["state"][0],
                        "code": "test-authorization-code",
                        "scope": scope,
                    }
                )
                request.send_error = lambda code, message: rejected.append(code)
                request.send_response = Mock()
                request.send_header = Mock()
                request.end_headers = Mock()
                request.wfile = io.BytesIO()
                request.do_GET()

        token = {
            "access_token": "setup-access",
            "refresh_token": "setup-refresh",
            "expires_at": int(time.time()) + 7200,
        }
        with (
            patch.dict("os.environ", {"STRAVA_STATE_DIR": str(self.state / "tokens")}),
            patch.object(sync_strava_names.http.server, "HTTPServer", Server),
            patch.object(
                sync_strava_names.webbrowser, "open", side_effect=opened.append
            ),
            patch.object(sync_strava_names, "post_token", return_value=token) as post,
            redirect_stdout(io.StringIO()),
        ):
            sync_strava_names.setup(config_path)
        return config_path, rejected, post

    def test_oauth_rejects_wrong_state_and_persists_valid_grant_privately(self):
        path, rejected, post = self.oauth_setup("read,activity:read_all")
        self.assertEqual(rejected, [400])
        self.assertEqual(post.call_args.kwargs["code"], "test-authorization-code")
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        config = json.loads(path.read_text())
        self.assertEqual(config["strava_refresh_token"], "setup-refresh")
        restored = strava_api.StravaClient(config, self.state / "tokens")
        self.assertEqual(restored.state["access_token"], "setup-access")

    def test_oauth_missing_required_scope_does_not_exchange_code(self):
        with self.assertRaisesRegex(strava_api.StravaError, "activity:read_all"):
            self.oauth_setup("read")


if __name__ == "__main__":
    unittest.main(verbosity=2)
