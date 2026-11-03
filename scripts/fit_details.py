"""Convert official FIT downloads into the existing dashboard detail schema.

Raw FIT messages can contain routes and identifiers. Only these explicit fields
are exported; ZIP members are decoded in memory and are never extracted.
"""

from io import BytesIO
from zipfile import ZipFile

from garmin_fit_sdk import Decoder, Stream

FIELDS = {
    "total_timer_time": "duration",
    "total_elapsed_time": "elapsedDuration",
    "total_moving_time": "movingDuration",
    "total_distance": "distance",
    "total_calories": "calories",
    "avg_heart_rate": "averageHR",
    "max_heart_rate": "maxHR",
    "min_heart_rate": "minHR",
    "avg_speed": "averageSpeed",
    "max_speed": "maxSpeed",
    "enhanced_avg_speed": "averageSpeed",
    "enhanced_max_speed": "maxSpeed",
    "total_ascent": "elevationGain",
    "total_descent": "elevationLoss",
    "avg_power": "averagePower",
    "max_power": "maxPower",
    "normalized_power": "normalizedPower",
    "training_stress_score": "trainingStressScore",
    "intensity_factor": "intensityFactor",
    "total_training_effect": "trainingEffect",
    "total_anaerobic_training_effect": "anaerobicTrainingEffect",
    "avg_stance_time": "groundContactTime",
    "avg_stance_time_balance": "groundContactBalanceLeft",
    "avg_vertical_ratio": "verticalRatio",
    "pool_length": "poolLength",
    "num_active_lengths": "numberOfActiveLengths",
    "avg_swolf": "averageSWOLF",
    "avg_strokes_per_length": "averageStrokes",
    "avg_stroke_distance": "averageStrokeDistance",
    "swim_stroke": "swimStroke",
    "total_work": "totalWork",
}


def map_fields(message: dict, type_key: str) -> dict:
    result = {
        target: message[source]
        for source, target in FIELDS.items()
        if message.get(source) is not None
    }
    # FIT uses millimetres; the existing Garmin summary schema uses centimetres.
    for source, target in (
        ("avg_step_length", "strideLength"),
        ("avg_vertical_oscillation", "verticalOscillation"),
    ):
        if message.get(source) is not None:
            result[target] = message[source] / 10
    if message.get("avg_cadence") is not None:
        if "running" in type_key:
            result["averageRunCadence"] = (
                message["avg_cadence"] + (message.get("avg_fractional_cadence") or 0)
            ) * 2
        elif "swimming" in type_key:
            result["averageSwimCadence"] = message["avg_cadence"]
        else:
            result["averageBikeCadence"] = message["avg_cadence"]
    return result


def decode_download(content: bytes) -> dict:
    with ZipFile(BytesIO(content)) as archive:
        members = [
            item
            for item in archive.infolist()
            if item.filename.lower().endswith(".fit")
        ]
        if len(members) != 1 or members[0].file_size > 128 * 1024 * 1024:
            raise ValueError("Expected one FIT file of at most 128 MiB")
        data = archive.read(members[0])
    messages, errors = Decoder(Stream.from_byte_array(bytearray(data))).read()
    if errors:
        raise ValueError("Invalid FIT download")
    return messages


def fit_detail(messages: dict, type_key: str, include_gps: bool = False) -> dict:
    sessions = messages.get("session_mesgs") or []
    # A multisport parent has several sessions; its summary comes from JSON.
    summary = map_fields(sessions[0], type_key) if len(sessions) == 1 else {}
    laps = []
    for index, message in enumerate(messages.get("lap_mesgs") or [], 1):
        lap = {"lapIndex": index, **map_fields(message, type_key)}
        if include_gps:
            for field, target in (
                ("start_position_lat", "startLatitude"),
                ("start_position_long", "startLongitude"),
            ):
                if message.get(field) is not None:
                    lap[target] = message[field] * 180 / 2**31
        laps.append(lap)
    lengths = []
    for message in messages.get("length_mesgs") or []:
        if message.get("length_type") == "idle":
            continue
        length = {
            target: message[source]
            for source, target in {
                "total_timer_time": "duration",
                "total_strokes": "totalNumberOfStrokes",
                "avg_swimming_cadence": "averageSwimCadence",
                "swim_stroke": "swimStroke",
                "message_index": "messageIndex",
            }.items()
            if message.get(source) is not None
        }
        if (
            length.get("duration") is not None
            and length.get("totalNumberOfStrokes") is not None
        ):
            length["averageSWOLF"] = length["duration"] + length["totalNumberOfStrokes"]
        lengths.append(length)
    sets = []
    for message in messages.get("set_mesgs") or []:
        if message.get("set_type") != "active":
            continue
        category = message.get("category")
        if isinstance(category, list):
            category = next((item for item in category if item != "invalid"), None)
        sets.append(
            {
                "exercise": str(category) if category is not None else None,
                "reps": message.get("repetitions"),
                "duration_s": message.get("duration"),
                "weight_g": message["weight"] * 1000
                if message.get("weight") is not None
                else None,
            }
        )
    return {"summary": summary, "laps": laps, "lengths": lengths, "sets": sets}
