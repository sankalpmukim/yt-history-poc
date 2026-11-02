/**
 * dayLabelToDate matrix (QA FAIL-2 / M1-023).
 *
 * All expectations use local-time Date constructors because YouTube labels are
 * local-day labels and dayLabelToDate resolves them in local time.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { dayLabelToDate, startOfDay } from "./day"

function local(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function ymd(d: Date | null): string {
  if (d == null) return "null"
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

test("Today → start of the current day", () => {
  const now = local(2026, 11, 2, 23, 45)
  assert.equal(ymd(dayLabelToDate("Today", now)), "2026-11-02")
  assert.equal(dayLabelToDate("Today", now)!.getHours(), 0)
})

test("Yesterday → start of the previous day, across month boundaries", () => {
  assert.equal(ymd(dayLabelToDate("Yesterday", local(2026, 11, 2, 9))), "2026-11-01")
  assert.equal(ymd(dayLabelToDate("Yesterday", local(2026, 11, 1, 9))), "2026-10-31")
  assert.equal(ymd(dayLabelToDate("Yesterday", local(2026, 1, 1, 9))), "2025-12-31")
})

test("weekday names resolve to the most recent occurrence (0–6 days ago)", () => {
  // 2026-11-02 is a Monday.
  const now = local(2026, 11, 2, 18)
  assert.equal(ymd(dayLabelToDate("Monday", now)), "2026-11-02")
  assert.equal(ymd(dayLabelToDate("Sunday", now)), "2026-11-01")
  assert.equal(ymd(dayLabelToDate("Friday", now)), "2026-10-30")
  assert.equal(ymd(dayLabelToDate("Tuesday", now)), "2026-10-27")
})

test('"Oct 31" without a year uses the current year when it is not in the future', () => {
  assert.equal(ymd(dayLabelToDate("Oct 31", local(2026, 11, 2, 12))), "2026-10-31")
  assert.equal(dayLabelToDate("Oct 31", local(2026, 11, 2, 12))!.getHours(), 0)
})

test('New Year rollback: "Dec 31" seen in January → previous year', () => {
  assert.equal(ymd(dayLabelToDate("Dec 31", local(2026, 1, 2, 10))), "2025-12-31")
  assert.equal(ymd(dayLabelToDate("Dec 30", local(2026, 1, 1, 10))), "2025-12-30")
  // A label from the current year should not be rolled back.
  assert.equal(ymd(dayLabelToDate("Jan 1", local(2026, 1, 2, 10))), "2026-01-01")
})

test("labels are trimmed and case-insensitive", () => {
  const now = local(2026, 11, 2, 12)
  assert.equal(ymd(dayLabelToDate("  today  ", now)), "2026-11-02")
  assert.equal(ymd(dayLabelToDate("YESTERDAY", now)), "2026-11-01")
  assert.equal(ymd(dayLabelToDate(" friday ", now)), "2026-10-30")
})

test("unresolvable labels return null", () => {
  assert.equal(dayLabelToDate("", new Date()), null)
  assert.equal(dayLabelToDate("   ", new Date()), null)
  assert.equal(dayLabelToDate("not-a-date", new Date()), null)
})

test("startOfDay zeroes the clock without mutating the input", () => {
  const input = local(2026, 11, 2, 23, 59)
  const out = startOfDay(input)
  assert.equal(out.getHours(), 0)
  assert.equal(out.getMinutes(), 0)
  assert.equal(input.getHours(), 23, "input is not mutated")
})
