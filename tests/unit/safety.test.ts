// Small functions that stand between the app and something going wrong:
// HTML injection in emails, the cron secret, raw database errors, weak
// passwords, and broken workouts being saved.
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { escapeHtml } from "@/lib/html";
import { isAuthorisedBearer } from "@/lib/cron-auth";
import { userFacingError } from "@/lib/user-facing-error";
import { newPasswordProblem } from "@/lib/pwned-password";
import { workoutProblem } from "@/lib/workout-store";
import type { ExerciseInput, SegmentInput } from "@/lib/workout-content";

test("escapeHtml escapes every character that can break out of HTML", () => {
  assert.equal(
    escapeHtml(`<a href="x">Tom & Jerry's</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;"
  );
});

test("cron bearer check accepts only the exact header", () => {
  assert.equal(isAuthorisedBearer("Bearer s3cret", "s3cret"), true);
  assert.equal(isAuthorisedBearer(null, "s3cret"), false);
  assert.equal(isAuthorisedBearer("Bearer s3cre", "s3cret"), false);
  assert.equal(isAuthorisedBearer("bearer s3cret", "s3cret"), false);
  assert.equal(isAuthorisedBearer("Bearer s3cretX", "s3cret"), false);
});

test("userFacingError hides raw database messages", (t) => {
  t.mock.method(console, "error", () => {});
  assert.equal(
    userFacingError({ code: "42501", message: 'new row violates row-level security policy for table "bookings"' }),
    "You don't have permission to do that."
  );
  assert.equal(
    userFacingError({ code: "23505", message: 'duplicate key value violates unique constraint "bookings_pkey"' }),
    "That's already been saved."
  );
  assert.equal(userFacingError({ code: "XX000", message: "internal" }, "Could not save."), "Could not save.");
  assert.equal(userFacingError(null), "Something went wrong — please try again.");
});

test("userFacingError passes our own SQL messages and Auth errors through", () => {
  assert.equal(userFacingError({ code: "P0001", message: "This class is full" }), "This class is full");
  assert.equal(userFacingError({ code: "22023", message: "That class has started" }), "That class has started");
  assert.equal(
    userFacingError({ name: "AuthApiError", message: "A user with this email address has already been registered" }),
    "A user with this email address has already been registered"
  );
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("new passwords: length and match are checked before any network call", async () => {
  globalThis.fetch = () => assert.fail("should not reach HaveIBeenPwned");
  assert.equal(await newPasswordProblem("short", "short"), "Password must be at least 10 characters.");
  assert.equal(await newPasswordProblem("longenough1", "longenough2"), "Passwords don't match.");
});

test("the breach check sends only a 5-character hash prefix", async () => {
  const password = "correct horse battery";
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return new Response(`0000000000000000000000000000000000A:3\r\n${hash.slice(5)}:42\r\n`);
  }) as typeof fetch;

  assert.match((await newPasswordProblem(password, password)) ?? "", /known data breach/);
  assert.deepEqual(urls, [`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`]);
});

test("the breach check fails open when HaveIBeenPwned is down", async () => {
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.equal(await newPasswordProblem("perfectly fine password", "perfectly fine password"), null);
});

const squat: ExerciseInput = {
  name: "Back squat",
  metricType: "weight_kg_and_reps",
  eachSide: false,
  tempo: null,
  note: null,
  videoUrl: null,
  sets: [{ target: "5", restSeconds: 90 }],
};

function exercisePart(exercises: ExerciseInput[]): SegmentInput {
  return { type: "straight", label: null, defaultRounds: null, isScored: true, textContent: null, scoreType: "none", exercises };
}

test("workoutProblem stops incomplete workouts being saved", () => {
  assert.equal(workoutProblem([]), "Add at least one segment.");
  assert.equal(workoutProblem([exercisePart([])]), "Every segment needs at least one exercise.");
  assert.equal(workoutProblem([exercisePart([{ ...squat, name: "  " }])]), "Every exercise needs a name.");
  assert.equal(workoutProblem([exercisePart([{ ...squat, sets: [] }])]), "Every exercise needs at least one set.");
  assert.equal(workoutProblem([exercisePart([squat])]), null);
  // A text-only part (0065) needs no exercises.
  assert.equal(workoutProblem([{ ...exercisePart([]), textContent: "10 min AMRAP", scoreType: "rounds_reps" }]), null);
});
