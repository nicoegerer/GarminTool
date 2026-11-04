import assert from "node:assert/strict";
import test from "node:test";
import { latestMetric, performanceMetrics, powerCurvePoints, trainingLoadHistory, trainingStatusLabel } from "../src/lib/performance.ts";

test("missing device-specific data does not create performance scores", () => {
  assert.deepEqual(performanceMetrics({}, {}), []);
  assert.equal(trainingStatusLabel({}), null);
  assert.deepEqual(powerCurvePoints(null), []);
});

test("new performance data preserves sport, units, precise VO2max and zero readiness", () => {
  const metrics = performanceMetrics({
    max_metrics_latest: { generic: { vo2MaxValue: 42 }, cycling: { calendarDate: "2026-11-03", vo2MaxPreciseValue: 55.3, vo2MaxValue: 55 } },
    cycling_ftp: { functionalThresholdPower: 250 },
    lactate_threshold: { speed_and_heart_rate: { heartRate: 180 } },
  }, { readiness: [{ calendarDate: "2026-11-03", score: 0 }] });
  assert.equal(metrics.find((row) => row.key === "cycling_vo2").value, 55.3);
  assert.equal(metrics.find((row) => row.key === "ftp").unit, "W");
  assert.equal(metrics.find((row) => row.key === "threshold_hr").unit, "bpm");
  assert.equal(metrics.find((row) => row.key === "readiness").value, 0);
  assert.equal(metrics.find((row) => row.key === "readiness").section, "daily.readiness");
});

test("dated series use the latest measurement and the correct training status", () => {
  assert.equal(latestMetric([{ calendarDate: "2026-11-03", score: 20 }, { calendarDate: "2026-10-01", score: 80 }], ["score"]).value, 20);
  assert.equal(trainingStatusLabel({ training_status: { mostRecentTrainingStatus: { latestTrainingStatusData: { watch: { trainingStatusFeedbackPhrase: "UNPRODUCTIVE" } } } } }), "Unproduktiv");
  assert.equal(trainingStatusLabel({ training_status: { mostRecentTrainingStatus: { latestTrainingStatusData: { watch: { trainingStatusFeedbackPhrase: "UNRECOGNIZED" } } } } }), null);
  assert.deepEqual(trainingLoadHistory({ rows: [{ calendarDate: "2026-11-02", weeklyTrainingLoad: 400 }] }), [{ date: "2026-11-02", value: 400 }]);
});

test("power curves keep recorded duration and watts without inferring unknown formats", () => {
  assert.deepEqual(powerCurvePoints({ series: [{ duration: 300, power: 220 }, { durationInSeconds: 60, maxAveragePower: 350 }, { duration: -1, power: 10 }] }), [{ seconds: 60, watts: 350 }, { seconds: 300, watts: 220 }]);
  assert.deepEqual(powerCurvePoints({ unknown: [[10, 400]] }), []);
});
