import test from "node:test"
import assert from "node:assert/strict"
import { parseDurationText, parseProgressPct } from "./duration"

test("parseDurationText handles mm:ss", () => {
  assert.equal(parseDurationText("12:34"), 754)
  assert.equal(parseDurationText("0:30"), 30)
  assert.equal(parseDurationText("1:02"), 62)
})

test("parseDurationText handles h:mm:ss", () => {
  assert.equal(parseDurationText("1:23:45"), 5025)
  assert.equal(parseDurationText("10:00:01"), 36001)
})

test("parseDurationText rejects garbage", () => {
  assert.equal(parseDurationText(""), null)
  assert.equal(parseDurationText(null), null)
  assert.equal(parseDurationText(undefined), null)
  assert.equal(parseDurationText("LIVE"), null)
  assert.equal(parseDurationText("PREMIERE 1:00"), null)
  assert.equal(parseDurationText("12:3"), null) // 1-digit seconds field
  assert.equal(parseDurationText("1:2:3"), null)
  assert.equal(parseDurationText("83:20"), 5000) // mm can exceed 59
})

test("parseProgressPct extracts percents", () => {
  assert.equal(parseProgressPct("Watched 16%"), 16)
  assert.equal(parseProgressPct("Watched 0%"), 0)
  assert.equal(parseProgressPct("Watched 100%"), 100)
  assert.equal(parseProgressPct("watched 7 %"), 7)
})

test("parseProgressPct returns null for unknown states", () => {
  assert.equal(parseProgressPct(""), null)
  assert.equal(parseProgressPct(null), null)
  assert.equal(parseProgressPct(undefined), null)
  assert.equal(parseProgressPct("Watched"), null)
})
