import test from "node:test"
import assert from "node:assert/strict"
import { aggregateRange, uncategorizedVideos } from "./aggregate"
import type { Category, VideoRecord, WatchEvent } from "./types"
import { eventKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0).toISOString()

const CATS: Category[] = [
  { id: "brain-rot", name: "Brain rot", emoji: "🧟", color: "#e11d48", valueScore: 0, order: 0 },
  { id: "fun", name: "Fun", emoji: "🎬", color: "#eab308", valueScore: 2, order: 1 },
  { id: "deep", name: "Deep", emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 2 }
]

function video(id: string, over: Partial<VideoRecord> = {}): VideoRecord {
  return {
    videoId: id,
    title: "Title " + id,
    channel: "Chan " + id.slice(0, 1),
    url: "https://www.youtube.com/watch?v=" + id,
    durationSec: 600,
    durationSource: "overlay",
    isShort: null,
    categoryOverride: null,
    autoCategoryId: null,
    appliedRuleId: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...over
  }
}

function event(videoId: string, watchedOn: string, over: Partial<WatchEvent> = {}): WatchEvent {
  return {
    key: eventKeyOf(videoId, watchedOn),
    videoId,
    watchedOn,
    progressPct: 100,
    progressAvgPct: 100,
    occurrences: 1,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...over
  }
}

test("aggregates totals, breakdowns, days and shares", () => {
  const videos = {
    a: video("a", { autoCategoryId: "brain-rot" }),
    b: video("b", { categoryOverride: "deep" }),
    c: video("c") // uncategorized
  }
  const events = [
    event("a", "2026-11-01"),
    event("a", "2026-11-02", { occurrences: 2 }), // 2×600s
    event("b", "2026-11-02", { progressAvgPct: 50 }), // 300s
    event("c", "2026-10-25") // outside a Nov 1-30 range below
  ]
  const agg = aggregateRange({ videos, events, categories: CATS, from: "2026-11-01", to: "2026-11-30" })

  assert.equal(agg.totalEvents, 3)
  assert.equal(agg.totalSeconds, 600 + 1200 + 300)
  assert.equal(agg.byDay.length, 2)
  assert.equal(agg.byDay[0].date, "2026-11-01")
  assert.equal(agg.byDay[1].seconds, 1500)

  const brain = agg.byCategory.find((c) => c.categoryId === "brain-rot")!
  assert.equal(brain.seconds, 1800)
  assert.equal(brain.watchCount, 2)
  assert.equal(brain.videoCount, 1, "distinct videos, not watches")
  assert.ok(Math.abs(brain.share - 1800 / 2100) < 1e-9)

  const deep = agg.byCategory.find((c) => c.categoryId === "deep")!
  assert.equal(deep.seconds, 300)
  // c was outside the range → no uncategorized bucket at all
  assert.equal(agg.byCategory.length, 2)
  assert.equal(agg.byCategory.find((c) => c.categoryId == null), undefined)
})

test("value index and low-value share cover categorized seconds only", () => {
  const videos = {
    a: video("a", { autoCategoryId: "brain-rot" }), // score 0, 600s
    b: video("b", { autoCategoryId: "fun" }), // score 2, 600s
    c: video("c", { autoCategoryId: "deep" }), // score 5, 600s
    d: video("d") // uncategorized 600s
  }
  const events = [event("a", "2026-11-01"), event("b", "2026-11-01"), event("c", "2026-11-01"), event("d", "2026-11-01")]
  const agg = aggregateRange({ videos, events, categories: CATS })

  assert.equal(agg.totalSeconds, 2400)
  assert.ok(Math.abs(agg.valueIndex! - (0 + 2 + 5) / 3) < 1e-9, "uncategorized excluded from index")
  assert.ok(Math.abs(agg.lowValueShare! - 600 / 1800) < 1e-9)
  assert.equal(agg.uncategorizedSeconds, 600)
  assert.equal(agg.uncategorizedVideoCount, 1)
})

test("unestimated events are counted but add no seconds", () => {
  const videos = { a: video("a", { durationSec: null, durationSource: null }), b: video("b") }
  const events = [event("a", "2026-11-01"), event("b", "2026-11-01")]
  const agg = aggregateRange({ videos, events, categories: CATS })
  assert.equal(agg.unestimatedCount, 1)
  assert.equal(agg.totalSeconds, 600)
  assert.equal(agg.byDay.length, 1, "days built from estimated rows only")
})

test("orphan events (video missing) are skipped", () => {
  const agg = aggregateRange({ videos: {}, events: [event("a", "2026-11-01")], categories: CATS })
  assert.equal(agg.totalEvents, 0)
  assert.equal(agg.totalSeconds, 0)
})

test("uncategorizedVideos lists recent uncategorized videos seen in events", () => {
  const videos = {
    a: video("a"),
    b: video("b", { autoCategoryId: "fun" }),
    c: video("c", { categoryOverride: "deep" }),
    old: video("old") // not in events → excluded
  }
  const list = uncategorizedVideos({ videos, events: [event("a", "2026-11-01"), event("b", "2026-11-01"), event("c", "2026-11-01")] })
  assert.deepEqual(list.map((v) => v.videoId), ["a"])
})

test("subcategory assignments roll up to the parent; drilldown groups by sub", () => {
  const subs = [
    { id: "deep-lectures", parentId: "deep", name: "Lectures", emoji: "📚", order: 0 },
    { id: "deep-docs", parentId: "deep", name: "Docs", emoji: "🎬", order: 1 }
  ]
  const videos = {
    a: video("a", { autoCategoryId: "deep-lectures" }),
    b: video("b", { autoCategoryId: "deep-docs" }),
    c: video("c", { autoCategoryId: "deep" }), // parent only
    d: video("d", { autoCategoryId: "fun" })
  }
  const events = ["a", "b", "c", "d"].map((id) => event(id, "2026-11-01"))
  const top = aggregateRange({ videos, events, categories: CATS, subcategories: subs })
  const deep = top.byCategory.find((c) => c.categoryId === "deep")!
  assert.equal(deep.seconds, 1800, "three deep videos roll up")
  assert.equal(deep.videoCount, 3)

  const drilled = aggregateRange({
    videos,
    events,
    categories: CATS,
    subcategories: subs,
    drilldownParentId: "deep"
  })
  assert.equal(drilled.totalEvents, 3)
  assert.ok(drilled.byCategory.find((c) => c.categoryId === "deep-lectures"))
  assert.ok(drilled.byCategory.find((c) => c.categoryId === "deep-docs"))
  assert.ok(drilled.byCategory.find((c) => c.categoryId === "deep"), "parent-only bucket")
})
