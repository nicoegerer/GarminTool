from datetime import date as date_, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Activity(Base):
    __tablename__ = "activities"

    activity_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    type_key: Mapped[str] = mapped_column(String, default="")
    start_time_local: Mapped[datetime] = mapped_column(DateTime)
    duration_s: Mapped[float] = mapped_column(Float, default=0)
    distance_m: Mapped[float] = mapped_column(Float, default=0)
    calories: Mapped[float] = mapped_column(Float, default=0)
    average_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_gain: Mapped[float | None] = mapped_column(Float, nullable=True)
    aerobic_training_effect: Mapped[float | None] = mapped_column(Float, nullable=True)
    anaerobic_training_effect: Mapped[float | None] = mapped_column(Float, nullable=True)
    training_effect_label: Mapped[str | None] = mapped_column(String, nullable=True)
    activity_training_load: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    moderate_intensity_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    vigorous_intensity_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_zone_1: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_zone_2: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_zone_3: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_zone_4: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_zone_5: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")

    gear_links: Mapped[list["GearActivity"]] = relationship(back_populates="activity")


class DailySummary(Base):
    __tablename__ = "daily_summaries"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    total_steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resting_heart_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_kilocalories: Mapped[float | None] = mapped_column(Float, nullable=True)
    floors_ascended: Mapped[float | None] = mapped_column(Float, nullable=True)
    moderate_intensity_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vigorous_intensity_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_stress_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class SleepData(Base):
    __tablename__ = "sleep_data"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    sleep_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_sleep_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deep_sleep_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    light_sleep_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rem_sleep_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    awake_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class Hrv(Base):
    __tablename__ = "hrv"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    last_night_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    weekly_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class BodyBattery(Base):
    __tablename__ = "body_battery"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    charged: Mapped[float | None] = mapped_column(Float, nullable=True)
    drained: Mapped[float | None] = mapped_column(Float, nullable=True)
    highest: Mapped[float | None] = mapped_column(Float, nullable=True)
    lowest: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class TrainingReadiness(Base):
    __tablename__ = "training_readiness"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    level: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class TrainingStatus(Base):
    __tablename__ = "training_status"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    weekly_training_load: Mapped[float | None] = mapped_column(Float, nullable=True)
    training_status_phrase: Mapped[str | None] = mapped_column(String, nullable=True)
    monthly_load_aerobic_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_load_aerobic_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    monthly_load_anaerobic: Mapped[float | None] = mapped_column(Float, nullable=True)
    aerobic_low_target_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    aerobic_low_target_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    aerobic_high_target_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    aerobic_high_target_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    anaerobic_target_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    anaerobic_target_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class Vo2Max(Base):
    __tablename__ = "vo2max"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    vo2max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2max_precise: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class RacePrediction(Base):
    __tablename__ = "race_predictions"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    time_5k_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_10k_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_half_marathon_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_marathon_s: Mapped[int | None] = mapped_column(Integer, nullable=True)


class WeighIn(Base):
    __tablename__ = "weigh_ins"

    date: Mapped[date_] = mapped_column(Date, primary_key=True)
    weight_kg: Mapped[float] = mapped_column(Float)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")


class Gear(Base):
    __tablename__ = "gear"

    gear_uuid: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    gear_type_name: Mapped[str] = mapped_column(String, default="")
    total_distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str | None] = mapped_column(String, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")

    activity_links: Mapped[list["GearActivity"]] = relationship(back_populates="gear")


class GearActivity(Base):
    __tablename__ = "gear_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gear_uuid: Mapped[str] = mapped_column(ForeignKey("gear.gear_uuid"))
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.activity_id"))

    gear: Mapped["Gear"] = relationship(back_populates="activity_links")
    activity: Mapped["Activity"] = relationship(back_populates="gear_links")


class TrainingPlan(Base):
    __tablename__ = "training_plans"

    plan_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    plan_type: Mapped[str] = mapped_column(String, default="")
    start_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    raw_json: Mapped[str] = mapped_column(Text, default="{}")

    workouts: Mapped[list["Workout"]] = relationship(back_populates="plan")


class Workout(Base):
    __tablename__ = "workouts"

    workout_id: Mapped[str] = mapped_column(String, primary_key=True)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("training_plans.plan_id"), nullable=True)
    name: Mapped[str] = mapped_column(String, default="")
    scheduled_date: Mapped[date_ | None] = mapped_column(Date, nullable=True)
    sport_type: Mapped[str] = mapped_column(String, default="")
    raw_json: Mapped[str] = mapped_column(Text, default="{}")

    plan: Mapped["TrainingPlan | None"] = relationship(back_populates="workouts")


class SyncLog(Base):
    __tablename__ = "sync_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ran_at: Mapped[datetime] = mapped_column(DateTime)
    success: Mapped[bool] = mapped_column(default=True)
    detail: Mapped[str] = mapped_column(Text, default="")
