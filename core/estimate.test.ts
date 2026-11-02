import test from "node:test"
import assert from "node:assert/strict"
import { estimateEventSeconds, estimateTotalSeconds } from "./estimate"
import type { VideoRecord, WatchEvent } from "./types"

function video(durationSec: number | null): Pick<VideoRecord, "durationSec"> {
  return { durationSec }
}

function event(progressAvgPct: number | null, occurrences = 1): Pick<WatchEvent, "progressAvgPct" | "occurrences"> {
  return { progressAvgPct, occurrences }
}

test("high confidence: duration + progress known", () => {
  const est = estimateEventSeconds(event(50), video(600))
  assert.equal(est.seconds, 300)
  assert.equal(est.confidence, "high")
})

test("medium confidence: duration known, progress assumed full", () => {
  const est = estimateEventSeconds(event(null), video(600))
  assert.equal(est.seconds, 600)
  assert.equal(est.confidence, "medium")
})

test("low confidence: duration unknown → excluded from totals", () => {
  const est = estimateEventSeconds(event(50), video(null))
  assert.equal(est.seconds, null)
  assert.equal(est.confidence, "low")
})

test("occurrences multiply, avg progress used, fraction clamped", () => {
  // 2 occurrences, avg 58% of 1000s → 1160s
  assert.equal(estimateEventSeconds(event(58, 2), video(1000)).seconds, 1160)
  // >100% would be nonsense — clamped to 1
  assert.equal(estimateEventSeconds(event(150, 1), video(600)).seconds, 600)
  // 0 occurrences treated as 1
  assert.equal(estimateEventSeconds(event(null, 0), video(120)).seconds, 120)
})

test("estimateTotalSeconds sums and counts unestimable events", () => {
  const total = estimateTotalSeconds([
    { event: event(50), video: video(600) },
    { event: event(null), video: video(300) },
    { event: event(10), video: video(null) }
  ])
  assert.equal(total.seconds, 600) // 300 (50% of 600) + 300 (assumed full)
  assert.equal(total.unestimatedCount, 1)
})
