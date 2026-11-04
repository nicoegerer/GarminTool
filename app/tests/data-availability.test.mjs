import assert from "node:assert/strict";
import test from "node:test";
import { historicalDataLabels } from "../src/lib/data-availability.ts";

test("retained unavailable or failed measurements are labelled historical", () => {
  assert.deepEqual(historicalDataLabels({ sections: {
    "daily.vo2max": { ok: false, status: "unavailable", retained: true },
    "fitness.training_status": { ok: true },
    "fitness.race_predictions": { ok: false, status: "unavailable", retained: false },
    "records": { ok: false, status: "unavailable", retained: true },
  } }), ["VO₂max", "Rekorde"]);
  assert.deepEqual(historicalDataLabels({ sections: { "fitness.training_status": { ok: false, retained: true } } }), ["Trainingsstatus"]);
});

test("new installations and live supported exports do not show a history notice", () => {
  assert.deepEqual(historicalDataLabels(null), []);
  assert.deepEqual(historicalDataLabels({ sections: { "daily.steps": { ok: true } } }), []);
});
