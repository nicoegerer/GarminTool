"""Seeds the local DB with real payloads captured once from Nico's Garmin
account (via the connected Garmin MCP during development) so the sync
pipeline and the whole frontend can be verified end-to-end without needing
a live Garmin login. Run:

    python backend/scripts/seed_sample_data.py

This is a dev/verification convenience only - the real app talks to Garmin
Connect directly via garmin_client.py + sync.py once logged in.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db.session import SessionLocal, init_db  # noqa: E402
from app.sync import sync_all  # noqa: E402

SAMPLE_ACTIVITIES = [
    {
        "activityId": 23585163158,
        "activityName": "Pool Swim",
        "startTimeLocal": "2026-07-13 19:08:45",
        "activityType": {"typeKey": "lap_swimming"},
        "duration": 2954.18701171875,
        "distance": 1500,
        "calories": 313,
        "averageHR": 148,
        "maxHR": 176,
        "aerobicTrainingEffect": 3.1,
        "anaerobicTrainingEffect": 0,
        "trainingEffectLabel": "AEROBIC_BASE",
        "activityTrainingLoad": 72.12371826171875,
        "moderateIntensityMinutes": 9,
        "vigorousIntensityMinutes": 45,
        "hrTimeInZone_1": 102.352,
        "hrTimeInZone_2": 745.963,
        "hrTimeInZone_3": 1710.954,
        "hrTimeInZone_4": 393.997,
        "hrTimeInZone_5": 0,
    },
    {
        "activityId": 23574175686,
        "activityName": "Wolfratshausen Running",
        "startTimeLocal": "2026-07-12 19:26:29",
        "activityType": {"typeKey": "running"},
        "duration": 3592.594970703125,
        "distance": 10154.2802734375,
        "calories": 848,
        "averageHR": 176,
        "maxHR": 192,
        "elevationGain": 366.49000000953674,
        "aerobicTrainingEffect": 4.5,
        "anaerobicTrainingEffect": 0.5,
        "trainingEffectLabel": "VO2MAX",
        "activityTrainingLoad": 181.31533813476562,
        "vO2MaxValue": 52,
        "moderateIntensityMinutes": 1,
        "vigorousIntensityMinutes": 60,
        "hrTimeInZone_1": 12.432,
        "hrTimeInZone_2": 37,
        "hrTimeInZone_3": 172,
        "hrTimeInZone_4": 1263.98,
        "hrTimeInZone_5": 2222.406,
    },
    {
        "activityId": 23444501910,
        "activityName": "Pool Swim",
        "startTimeLocal": "2026-07-01 17:57:40",
        "activityType": {"typeKey": "lap_swimming"},
        "duration": 1988.14599609375,
        "distance": 750,
        "calories": 152,
        "averageHR": 124,
        "maxHR": 157,
        "aerobicTrainingEffect": 1.9,
        "anaerobicTrainingEffect": 0,
        "trainingEffectLabel": "RECOVERY",
        "activityTrainingLoad": 20.681427001953125,
        "moderateIntensityMinutes": 20,
        "vigorousIntensityMinutes": 13,
        "hrTimeInZone_1": 564.941,
        "hrTimeInZone_2": 899.789,
        "hrTimeInZone_3": 295.995,
        "hrTimeInZone_4": 0,
        "hrTimeInZone_5": 0,
    },
    {
        "activityId": 23421742490,
        "activityName": "Krafttraining",
        "startTimeLocal": "2026-06-29 19:28:49",
        "activityType": {"typeKey": "strength_training"},
        "duration": 5209.703125,
        "distance": 0,
        "calories": 486,
        "averageHR": 109,
        "maxHR": 137,
        "aerobicTrainingEffect": 1.2,
        "anaerobicTrainingEffect": 0,
        "trainingEffectLabel": "AEROBIC_BASE",
        "activityTrainingLoad": 13.552444458007812,
        "moderateIntensityMinutes": 56,
        "vigorousIntensityMinutes": 0,
        "hrTimeInZone_1": 2775.727,
        "hrTimeInZone_2": 978.017,
        "hrTimeInZone_3": 0,
        "hrTimeInZone_4": 0,
        "hrTimeInZone_5": 0,
    },
    {
        "activityId": 23410784987,
        "activityName": "Wolfratshausen Running",
        "startTimeLocal": "2026-06-28 19:29:04",
        "activityType": {"typeKey": "running"},
        "duration": 3687.4130859375,
        "distance": 10252.0498046875,
        "calories": 871,
        "averageHR": 178,
        "maxHR": 189,
        "elevationGain": 202.40000000596046,
        "aerobicTrainingEffect": 4.2,
        "anaerobicTrainingEffect": 0,
        "trainingEffectLabel": "VO2MAX",
        "activityTrainingLoad": 157.1819610595703,
        "vO2MaxValue": 53,
        "moderateIntensityMinutes": 1,
        "vigorousIntensityMinutes": 63,
        "hrTimeInZone_1": 7.006,
        "hrTimeInZone_2": 30.998,
        "hrTimeInZone_3": 163.002,
        "hrTimeInZone_4": 1263.98,
        "hrTimeInZone_5": 2222.406,
    },
]

SAMPLE_TRAINING_STATUS = {
    "mostRecentTrainingLoadBalance": {
        "metricsTrainingLoadBalanceDTOMap": {
            "3995160273": {
                "monthlyLoadAerobicLow": 276.35425,
                "monthlyLoadAerobicHigh": 333.53543,
                "monthlyLoadAnaerobic": 50.07515,
                "monthlyLoadAerobicLowTargetMin": 219,
                "monthlyLoadAerobicLowTargetMax": 481,
                "monthlyLoadAerobicHighTargetMin": 262,
                "monthlyLoadAerobicHighTargetMax": 525,
                "monthlyLoadAnaerobicTargetMin": 0,
                "monthlyLoadAnaerobicTargetMax": 262,
                "trainingBalanceFeedbackPhrase": "BALANCED",
            }
        }
    },
    "mostRecentTrainingStatus": {
        "latestTrainingStatusData": {
            "3995160273": {
                "weeklyTrainingLoad": 254,
                "trainingStatusFeedbackPhrase": "NO_STATUS_BALANCED",
            }
        }
    },
}

SAMPLE_BODY_BATTERY = [
    {
        "date": "2026-07-14",
        "charged": 67,
        "drained": 49,
        "bodyBatteryValuesArray": [
            [1783980000000, 26],
            [1784005740000, 89],
            [1784008800000, 89],
            [1784036880000, 46],
            [1784037600000, 45],
            [1784057940000, 26],
        ],
    }
]

SAMPLE_RACE_PREDICTIONS = {
    "calendarDate": "2026-07-15",
    "time5K": 1357,
    "time10K": 2915,
    "timeHalfMarathon": 6901,
    "timeMarathon": 16000,
}


class FakeGarminClient:
    """Mimics the subset of the garminconnect.Garmin API that sync.py
    calls, backed by real sample payloads captured earlier."""

    display_name = "seed-user"

    def get_activities(self, start, limit):
        return SAMPLE_ACTIVITIES

    def get_stats(self, cdate):
        return None

    def get_sleep_data(self, cdate):
        return None

    def get_hrv_data(self, cdate):
        return None

    def get_body_battery(self, start, end):
        return SAMPLE_BODY_BATTERY

    def get_training_readiness(self, cdate):
        return []

    def get_training_status(self, cdate):
        return SAMPLE_TRAINING_STATUS

    def get_max_metrics(self, cdate):
        return None

    def get_race_predictions(self):
        return SAMPLE_RACE_PREDICTIONS

    def get_weigh_ins(self, start, end):
        return {}

    def get_gear(self, profile_number):
        return []


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        detail = sync_all(FakeGarminClient(), db, activity_limit=100, history_days=21)
        print(detail)
    finally:
        db.close()


if __name__ == "__main__":
    main()
