// UK wall-clock maths: booking cut-offs and check-in weeks. Vercel runs in
// UTC, so these are the places a clock change could quietly shift things.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lastBookableDate, ukSessionStart } from "@/lib/booking-window";
import { latestCheckinWeek, openCheckinWeek, shiftWeek } from "@/lib/weekly-checkin";

test("ukSessionStart takes an hour off in BST, nothing in GMT", () => {
  assert.equal(ukSessionStart("2026-10-05", "18:30:00"), Date.UTC(2026, 9, 5, 17, 30));
  assert.equal(ukSessionStart("2026-12-01", "06:00:00"), Date.UTC(2026, 11, 1, 6, 0));
});

test("ukSessionStart on clock-change days", () => {
  // Clocks go forward 29 Mar 2026 and back 25 Oct 2026, both at 01:00 UTC.
  assert.equal(ukSessionStart("2026-03-29", "09:00:00"), Date.UTC(2026, 2, 29, 8, 0));
  assert.equal(ukSessionStart("2026-10-25", "09:00:00"), Date.UTC(2026, 9, 25, 9, 0));
});

test("ukSessionStart just after UK midnight in summer is the previous UTC day", () => {
  assert.equal(ukSessionStart("2026-07-01", "00:30:00"), Date.UTC(2026, 5, 30, 23, 30));
});

test("lastBookableDate is a week ahead, across month and year ends", () => {
  assert.equal(lastBookableDate("2026-10-25"), "2026-11-01");
  assert.equal(lastBookableDate("2026-12-28"), "2027-01-04");
});

test("a check-in opens Sunday and stays open to Wednesday", () => {
  assert.equal(openCheckinWeek(new Date("2026-10-25T12:00:00Z")), "2026-10-25");
  assert.equal(openCheckinWeek(new Date("2026-10-28T12:00:00Z")), "2026-10-25");
  assert.equal(openCheckinWeek(new Date("2026-10-29T12:00:00Z")), null);
  assert.equal(openCheckinWeek(new Date("2026-10-31T12:00:00Z")), null);
});

test("check-in weeks follow UK dates, not UTC", () => {
  // 23:30 UTC on Saturday 24 Oct is 00:30 Sunday in BST.
  assert.equal(openCheckinWeek(new Date("2026-10-24T23:30:00Z")), "2026-10-25");
  assert.equal(latestCheckinWeek(new Date("2026-10-31T12:00:00Z")), "2026-10-25");
  assert.equal(shiftWeek("2026-10-25", -1), "2026-10-18");
});
