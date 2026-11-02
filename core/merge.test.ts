import test from "node:test"
import assert from "node:assert/strict"
import { mergeFetchResult } from "./merge"
import type { HistoryItem, HistorySection } from "../utils/history-types"
import { eventKeyOf } from "./types"

// Mon Nov 02 2026, noon local — deterministic reference for day labels
const NOW = new Date(2026, 10, 2, 12, 0, 0)
const TODAY = "2026-11-02"
const YESTERDAY = "2026-11-01"
const FRIDAY = "2026-10-30" // most recent Friday before Mon Nov 2

function item(
  videoId: string,
  opts: { watchState?: string; durationSec?: number | null; title?: string } = {}
): HistoryItem {
  return {
    videoId,
    title: opts.title ?? `Video ${videoId}`,
    channel: "CHAN",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    watchState: opts.watchState ?? "",
    durationSec: opts.durationSec ?? null,
    durationSource: opts.durationSec != null ? "overlay" : null
  }
}

function section(dayLabel: string, ...items: HistoryItem[]): HistorySection {
  return { dayLabel, items }
}

test("basic merge creates one video + one event per item", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Today", item("a"), item("b", { watchState: "Watched 50%" }))],
    now: NOW
  })
  assert.equal(Object.keys(out.videos).length, 2)
  assert.equal(out.diagnostics.newVideos, 2)
  assert.equal(out.diagnostics.newEvents, 2)
  assert.deepEqual(out.diagnostics.touchedMonths, ["2026-11"])

  const evA = out.eventShards["2026-11"][eventKeyOf("a", TODAY)]
  assert.ok(evA)
  assert.equal(evA.occurrences, 1)
  assert.equal(evA.progressPct, null)
  assert.equal(evA.progressAvgPct, null)
  const evB = out.eventShards["2026-11"][eventKeyOf("b", TODAY)]
  assert.equal(evB.progressPct, 50)
})

test("repeat watches within a day: occurrences counted, avg kept for estimates", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [
      section("Today", item("x", { watchState: "Watched 16%" }), item("x", { watchState: "Watched 100%" }))
    ],
    now: NOW
  })
  assert.equal(Object.keys(out.videos).length, 1)
  const ev = out.eventShards["2026-11"][eventKeyOf("x", TODAY)]
  assert.equal(ev.occurrences, 2)
  assert.equal(ev.progressPct, 16) // newest occurrence first in feed order
  assert.equal(ev.progressAvgPct, 58) // (16+100)/2
})

test("unresolvable day labels are skipped and reported", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Garbage Day!", item("a")), section("Today", item("b"))],
    now: NOW
  })
  assert.equal(out.diagnostics.skippedItems, 1)
  assert.deepEqual(out.diagnostics.unresolvedDayLabels, ["Garbage Day!"])
  assert.equal(out.eventShards["2026-11"][eventKeyOf("a", TODAY)], undefined)
  assert.ok(out.eventShards["2026-11"][eventKeyOf("b", TODAY)])
})

test("the same day split across section objects is combined before counting", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [
      section("Today", item("x", { watchState: "Watched 90%" })),
      section("Today", item("x", { watchState: "Watched 30%" }))
    ],
    now: NOW
  })
  const ev = out.eventShards["2026-11"][eventKeyOf("x", TODAY)]
  assert.equal(ev.occurrences, 2)
  assert.equal(ev.progressPct, 90) // first item of the first chunk is the newest
})

test("re-sync replaces occurrences with the latest fetched count (no double counting)", () => {
  const first = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Today", item("x"), item("x"))],
    now: NOW
  })
  const second = mergeFetchResult({
    videos: first.videos,
    eventShards: first.eventShards,
    sections: [section("Today", item("x"))],
    now: NOW
  })
  const ev = second.eventShards["2026-11"][eventKeyOf("x", TODAY)]
  assert.equal(ev.occurrences, 1)
  assert.equal(second.diagnostics.updatedEvents, 1)
  assert.equal(second.diagnostics.newEvents, 0)
  assert.equal(second.diagnostics.updatedVideos, 1)
})

test("video facts refresh, duration only improves, category fields untouched", () => {
  const first = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Today", item("x", { title: "Old title" }))],
    now: NOW
  })
  first.videos.x.categoryOverride = "deep"
  first.videos.x.autoCategoryId = "fun"
  first.videos.x.appliedRuleId = "r1"

  const second = mergeFetchResult({
    videos: first.videos,
    eventShards: first.eventShards,
    sections: [section("Today", item("x", { title: "New title", durationSec: 754 }))],
    now: NOW
  })
  const v = second.videos.x
  assert.equal(v.title, "New title")
  assert.equal(v.durationSec, 754)
  assert.equal(v.durationSource, "overlay")
  assert.equal(v.categoryOverride, "deep")
  assert.equal(v.autoCategoryId, "fun")
  assert.equal(v.appliedRuleId, "r1")

  // a later fetch without duration info must not clobber the known duration
  const third = mergeFetchResult({
    videos: second.videos,
    eventShards: second.eventShards,
    sections: [section("Today", item("x"))],
    now: NOW
  })
  assert.equal(third.videos.x.durationSec, 754)
  assert.equal(third.videos.x.durationSource, "overlay")
})

test("multi-day fetch lands in the right monthly shards", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [
      section("Today", item("a")),
      section("Yesterday", item("b")),
      section("Friday", item("c")),
      section("Oct 31, 2026", item("d"))
    ],
    now: NOW
  })
  assert.ok(out.eventShards["2026-11"][eventKeyOf("a", TODAY)])
  assert.ok(out.eventShards["2026-11"][eventKeyOf("b", YESTERDAY)])
  assert.ok(out.eventShards["2026-10"][eventKeyOf("c", FRIDAY)])
  assert.ok(out.eventShards["2026-10"][eventKeyOf("d", "2026-10-31")])
  assert.equal(out.diagnostics.sections, 4)
})

test("a video watched on two different days gets two events", () => {
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Today", item("x")), section("Yesterday", item("x"))],
    now: NOW
  })
  assert.ok(out.eventShards["2026-11"][eventKeyOf("x", TODAY)])
  assert.ok(out.eventShards["2026-11"][eventKeyOf("x", YESTERDAY)])
  assert.equal(Object.keys(out.videos).length, 1)
})

test("items without a videoId are skipped", () => {
  const bad = { ...item(""), videoId: "" }
  const out = mergeFetchResult({
    videos: {},
    eventShards: {},
    sections: [section("Today", bad, item("b"))],
    now: NOW
  })
  assert.equal(out.diagnostics.skippedItems, 1)
  assert.equal(Object.keys(out.videos).length, 1)
})
