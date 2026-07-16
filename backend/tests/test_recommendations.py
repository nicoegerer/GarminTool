from datetime import date

from app.recommendations import TrainingContext, recommend


def test_overreaching_recommends_rest():
    ctx = TrainingContext(today=date(2026, 7, 15), acute_load=400, chronic_load=200, readiness_score=60)
    rec = recommend(ctx)
    assert rec.session_type == "rest"
    assert any("Belastungsverhältnis" in r for r in rec.rationale)


def test_low_readiness_recommends_recovery():
    ctx = TrainingContext(today=date(2026, 7, 15), acute_load=100, chronic_load=100, readiness_score=30)
    rec = recommend(ctx)
    assert rec.session_type == "recovery"


def test_bad_sleep_recommends_recovery_even_with_good_readiness():
    ctx = TrainingContext(today=date(2026, 7, 15), acute_load=100, chronic_load=100, readiness_score=80, sleep_score=45)
    rec = recommend(ctx)
    assert rec.session_type == "recovery"
    assert any("Schlaf-Score" in r for r in rec.rationale)


def test_hrv_unbalanced_recommends_recovery():
    ctx = TrainingContext(today=date(2026, 7, 15), acute_load=100, chronic_load=100, readiness_score=80, hrv_status="UNBALANCED")
    rec = recommend(ctx)
    assert rec.session_type == "recovery"


def test_scheduled_workout_takes_priority_when_healthy():
    ctx = TrainingContext(
        today=date(2026, 7, 15),
        acute_load=100,
        chronic_load=100,
        readiness_score=80,
        scheduled_workout_name="8x400m Intervalle",
    )
    rec = recommend(ctx)
    assert rec.session_type == "planned"
    assert rec.title == "8x400m Intervalle"


def test_scheduled_workout_flagged_for_moderate_readiness():
    ctx = TrainingContext(
        today=date(2026, 7, 15),
        acute_load=100,
        chronic_load=100,
        readiness_score=55,
        scheduled_workout_name="Tempolauf",
    )
    rec = recommend(ctx)
    assert rec.session_type == "planned"
    assert any("drosseln" in r for r in rec.rationale)


def test_deficit_in_aerobic_high_recommends_intervals():
    ctx = TrainingContext(
        today=date(2026, 7, 15),
        acute_load=100,
        chronic_load=100,
        readiness_score=80,
        recent_effect_labels=["AEROBIC_BASE"],
        aerobic_high=100,
        aerobic_high_target_min=300,
    )
    rec = recommend(ctx)
    assert rec.session_type == "intervals"


def test_avoids_repeating_yesterdays_hard_session_type():
    ctx = TrainingContext(
        today=date(2026, 7, 15),
        acute_load=100,
        chronic_load=100,
        readiness_score=80,
        recent_effect_labels=["VO2MAX"],
    )
    rec = recommend(ctx)
    assert rec.session_type == "easy"


def test_no_data_falls_back_to_easy():
    ctx = TrainingContext(today=date(2026, 7, 15))
    rec = recommend(ctx)
    assert rec.session_type == "easy"
    assert rec.rationale
