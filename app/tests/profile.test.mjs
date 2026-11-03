import assert from "node:assert/strict";
import test from "node:test";
import { athleteName } from "../src/lib/profile.ts";

test("restored athlete name is displayed without surrounding whitespace", () => {
  assert.equal(athleteName({ full_name: "  Nico  " }), "Nico");
});

test("account IDs and missing names never become a greeting", () => {
  for (const full_name of [undefined, null, "", "  ", "11111111-2222-4333-8444-555555555555", "11111111222243338444555555555555"]) {
    assert.equal(athleteName({ full_name }), undefined);
  }
  assert.equal(athleteName(null), undefined);
  assert.equal(athleteName(undefined), undefined);
});
