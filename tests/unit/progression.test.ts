// The weight hints on the live screen and the "total lifted" numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateOneRepMax,
  parseTargetProgression,
  percentFromRpeAndReps,
  suggestNextWeight,
} from "@/lib/exercise-progression";
import { loggedKg } from "@/lib/progress";

test("Epley 1RM, with reps of 0 treated as 1", () => {
  assert.equal(Math.round(estimateOneRepMax(100, 5) * 100) / 100, 116.67);
  assert.equal(estimateOneRepMax(100, 0), estimateOneRepMax(100, 1));
});

test("RPE to %1RM, clamped to 30–100", () => {
  assert.equal(percentFromRpeAndReps(10, 1), 100);
  assert.equal(percentFromRpeAndReps(8, 5), 85);
  assert.equal(percentFromRpeAndReps(1, 20), 30);
});

test("coach targets that give a hint, and ones that don't", () => {
  assert.deepEqual(parseTargetProgression("70% 1RM x5"), { type: "percent1rm", percent: 70 });
  assert.deepEqual(parseTargetProgression("RPE 8 x5"), { type: "rpe", rpe: 8, reps: 5 });
  assert.deepEqual(parseTargetProgression("rpe 7.5 for 3 reps"), { type: "rpe", rpe: 7.5, reps: 3 });
  assert.equal(parseTargetProgression("RPE 8"), null);
  assert.equal(parseTargetProgression("3 x 10"), null);
  assert.equal(parseTargetProgression(null), null);
});

test("suggestions round to 2.5kg plates", () => {
  assert.deepEqual(suggestNextWeight(100, 5, "70% 1RM"), {
    suggestedKg: 82.5,
    basis: "70% of your ~117kg est. 1RM",
  });
  assert.equal(suggestNextWeight(100, 5, "RPE 8 x5")?.suggestedKg, 100);
  // No reps logged: the weight is taken as roughly a 1RM, so it never overshoots.
  assert.equal(suggestNextWeight(100, null, "70% 1RM")?.suggestedKg, 72.5);
  assert.equal(suggestNextWeight(100, 5, "3 x 10"), null);
});

test("only weight metrics count towards kg lifted", () => {
  assert.equal(loggedKg({ metricType: "weight_kg", weightKg: 50, reps: null }), 50);
  assert.equal(loggedKg({ metricType: "weight_kg_and_reps", weightKg: 50, reps: 5 }), 250);
  assert.equal(loggedKg({ metricType: "weight_kg_and_reps", weightKg: 50, reps: null }), 0);
  assert.equal(loggedKg({ metricType: "reps_only", weightKg: null, reps: 12 }), 0);
});
