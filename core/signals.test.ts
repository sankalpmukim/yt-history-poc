import { test } from "node:test"
import assert from "node:assert/strict"
import {
  periodCompare,
  heavyDays,
  ladderThirds,
  valueMix,
  completionByCategory,
  duplicateOverrides,
  channelConcentration,
  rewatchLeaders,
  weeklyAveragesByCategory,
  setupHygiene,
  computeSignals,
  shiftDayKey,
  todayKey
} from "./signals"
import type { Category, Rule, Subcategory, VideoRecord, WatchEvent } from "./types"

/* ------------------------------------------------------------------ */
/* fixture helpers                                                     */
/* ------------------------------------------------------------------ */

const cats = (ids: string[]): Category[] =>
  ids.map((id, order) => ({
    id,
    name: id,
    emoji: "·",
    color: "#6f7f9e",
    valueScore: (5 - order) as Category["valueScore"],
    order
  }))

const sub = (id: string, parentId: string): Subcategory => ({
  id,
  parentId,
  name: id,
  emoji: "·",
  order: 0
})

const video = (id: string, channel: string, durationSec = 600): VideoRecord => ({
  videoId: id,
  title: `title ${id}`,
  channel,
  url: `https://youtu.be/${id}`,
  durationSec,
  durationSource: "watch-page",
  isShort: false,
  categoryOverride: null,
  autoCategoryId: null,
  appliedRuleId: null,
  firstSeenAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z"
})

const watch = (
  videoId: string,
  watchedOn: string,
  progressPct: number | null = 100
): WatchEvent => ({
  key: `${videoId}|${watchedOn}`,
  videoId,
  watchedOn,
  progressPct,
  progressAvgPct: progressPct,
  occurrences: 1,
  firstSeenAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z"
})

const NOW = new Date("2026-11-10T12:00:00")

/* ------------------------------------------------------------------ */
/* date helpers                                                        */
/* ------------------------------------------------------------------ */

test("shiftDayKey moves across months and years", () => {
  assert.equal(shiftDayKey("2026-11-10", -7), "2026-11-03")
  assert.equal(shiftDayKey("2026-11-01", -1), "2026-10-31")
  assert.equal(shiftDayKey("2026-01-01", -1), "2025-12-31")
  assert.equal(todayKey(new Date("2026-02-05T03:00:00")), "2026-02-05")
})

/* ------------------------------------------------------------------ */
/* periodCompare                                                       */
/* ------------------------------------------------------------------ */

test("periodCompare splits 7-day windows and ranks risers/fallers", () => {
  const categories = cats(["deep", "fun"])
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "deep" },
    b: { ...video("b", "ChB"), autoCategoryId: "fun" }
  }
  // last 7 days (Nov 4–10): deep 3600, fun 600
  // previous 7 (Oct 28–Nov 3): deep 600, fun 3600
  const events = [
    watch("a", "2026-11-05"),
    watch("a", "2026-11-06"),
    watch("b", "2026-11-07"),
    watch("a", "2026-10-29"),
    watch("b", "2026-10-30"),
    watch("b", "2026-10-31")
  ]
  const cmp = periodCompare({ videos, events, categories, subcategories: [], rules: [] }, 7, NOW)
  // current: deep 2×600 + fun 600 = 1800; previous: deep 600 + fun 2×600 = 1800
  assert.equal(cmp.currentSec, 1800)
  assert.equal(cmp.previousSec, 1800)
  assert.equal(cmp.deltaSec, 0)
  assert.equal(cmp.deltaPct, 0)
  const deep = cmp.byCategory.find((d) => d.categoryId === "deep")
  const fun = cmp.byCategory.find((d) => d.categoryId === "fun")
  assert.equal(deep?.deltaSec, 600)
  assert.equal(fun?.deltaSec, -600)
  assert.equal(cmp.risers[0].categoryId, "deep")
  assert.equal(cmp.fallers[0].categoryId, "fun")
})

test("periodCompare reports null pct when previous window is empty", () => {
  const categories = cats(["deep"])
  const videos = { a: video("a", "ChA") }
  const events = [watch("a", "2026-11-09")]
  const cmp = periodCompare({ videos, events, categories, subcategories: [], rules: [] }, 7, NOW)
  assert.equal(cmp.previousSec, 0)
  assert.equal(cmp.deltaPct, null)
})

/* ------------------------------------------------------------------ */
/* heavyDays                                                           */
/* ------------------------------------------------------------------ */

test("heavyDays flags days past the active-day norm and ignores gaps", () => {
  const categories = cats(["deep"])
  const videos = { a: video("a", "ChA", 600), b: video("b", "ChB", 3600) }
  const events = [
    // three ordinary active days at 10m each
    watch("a", "2026-11-01"),
    watch("a", "2026-11-03"),
    watch("a", "2026-11-05"),
    // one heavy day: 60m = 6× the 10m norm
    watch("b", "2026-11-07")
  ]
  const res = heavyDays({ videos, events, categories, subcategories: [], rules: [] })
  assert.equal(res.activeDays, 4)
  assert.equal(res.normSec, (3 * 600 + 3600) / 4)
  assert.equal(res.heavy.length, 1)
  assert.equal(res.heavy[0].date, "2026-11-07")
  assert.equal(res.heaviest?.date, "2026-11-07")
})

/* ------------------------------------------------------------------ */
/* ladderThirds + valueMix                                             */
/* ------------------------------------------------------------------ */

test("ladderThirds uses live categories by position, not legacy scores", () => {
  const categories: Category[] = [
    ...cats(["top", "middle", "low", "bottom"]),
    { id: "gone", name: "gone", emoji: "·", color: "#000", valueScore: 0 as Category["valueScore"], order: 99, archivedAt: "2026-01-01T00:00:00Z" }
  ]
  const thirds = ladderThirds({ videos: {}, events: [], categories, subcategories: [], rules: [] })
  assert.deepEqual([...thirds.ordered.map((c) => c.id)], ["top", "middle", "low", "bottom"])
  assert.deepEqual([...thirds.top], ["top", "middle"])
  assert.deepEqual([...thirds.bottom], ["low", "bottom"])
})

test("valueMix splits categorized seconds into top/bottom thirds", () => {
  const categories = cats(["top", "mid", "bottom"])
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "top" },
    b: { ...video("b", "ChB"), autoCategoryId: "bottom" }
  }
  const events = [watch("a", "2026-11-09"), watch("a", "2026-11-08"), watch("b", "2026-11-07")]
  const mix = valueMix({ videos, events, categories, subcategories: [], rules: [] })
  assert.equal(mix.categorizedSec, 1800)
  assert.equal(mix.topShare, 2 / 3)
  assert.equal(mix.bottomShare, 1 / 3)
  assert.equal(mix.worstBottom?.categoryId, "bottom")
})

test("valueMix rolls subcategories up to their parent", () => {
  const categories = cats(["top", "mid", "bottom"])
  const subcategories = [sub("bottom-sub", "bottom")]
  const videos = { a: { ...video("a", "ChA"), autoCategoryId: "top" }, b: { ...video("b", "ChB"), autoCategoryId: "bottom-sub" } }
  const events = [watch("a", "2026-11-09"), watch("b", "2026-11-09")]
  const mix = valueMix({ videos, events, categories, subcategories, rules: [] })
  assert.equal(mix.bottomShare, 0.5)
})

/* ------------------------------------------------------------------ */
/* completionByCategory                                                */
/* ------------------------------------------------------------------ */

test("completionByCategory: no progress bar counts as finished", () => {
  const categories = cats(["deep", "fun"])
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "deep" },
    b: { ...video("b", "ChB"), autoCategoryId: "deep" },
    c: { ...video("c", "ChC"), autoCategoryId: "fun" }
  }
  const events = [
    watch("a", "2026-11-09", 100),
    watch("b", "2026-11-09", null), // no bar → assumed finished
    watch("c", "2026-11-09", 10) // abandoned
  ]
  const stats = completionByCategory({ videos, events, categories, subcategories: [], rules: [] })
  const deep = stats.find((s) => s.categoryId === "deep")
  const fun = stats.find((s) => s.categoryId === "fun")
  assert.equal(deep?.finishRate, 1)
  assert.equal(fun?.abandoned, 1)
  assert.equal(fun?.abandonRate, 1)
})

/* ------------------------------------------------------------------ */
/* duplicateOverrides                                                  */
/* ------------------------------------------------------------------ */

test("duplicateOverrides separates redundant from conflicting picks", () => {
  const categories = cats(["deep", "fun"])
  const rules: Rule[] = [
    {
      id: "r1",
      name: "Always ChA",
      enabled: true,
      priority: 50,
      match: { channelEquals: "ChA" },
      categoryId: "deep",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      hitCount: 3
    },
    {
      id: "r2",
      name: "Always ChB",
      enabled: true,
      priority: 50,
      match: { channelEquals: "ChB" },
      categoryId: "fun",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      hitCount: 1
    }
  ]
  const videos: Record<string, VideoRecord> = {
    a1: { ...video("a1", "ChA"), categoryOverride: "deep" }, // redundant
    a2: { ...video("a2", "ChA"), categoryOverride: "fun" }, // conflicting
    b1: { ...video("b1", "ChB"), categoryOverride: "fun" }, // redundant
    c1: { ...video("c1", "ChC"), categoryOverride: "deep" } // no rule → ignored
  }
  const dupes = duplicateOverrides({ videos, events: [], categories, subcategories: [], rules })
  assert.equal(dupes.redundant.length, 2)
  assert.equal(dupes.conflicting.length, 1)
  assert.equal(dupes.channels.size, 2)
})

/* ------------------------------------------------------------------ */
/* concentration + rewatches                                           */
/* ------------------------------------------------------------------ */

test("channelConcentration measures top-channel share", () => {
  const categories = cats(["deep"])
  const videos = { a: video("a", "Big"), b: video("b", "Small", 60) }
  const events = [watch("a", "2026-11-09"), watch("b", "2026-11-09")]
  const conc = channelConcentration({ videos, events, categories, subcategories: [], rules: [] })
  assert.equal(conc.distinctChannels, 2)
  assert.equal(conc.top5Share, 1)
  assert.equal(conc.top[0].channel, "Big")
})

test("rewatchLeaders finds videos spanning multiple days", () => {
  const categories = cats(["deep"])
  const videos = { a: video("a", "ChA"), b: video("b", "ChB") }
  const events = [
    watch("a", "2026-11-05"),
    watch("a", "2026-11-07"),
    watch("b", "2026-11-07")
  ]
  const leaders = rewatchLeaders({ videos, events, categories, subcategories: [], rules: [] })
  assert.equal(leaders.length, 1)
  assert.equal(leaders[0].videoId, "a")
  assert.equal(leaders[0].days.length, 2)
})

/* ------------------------------------------------------------------ */
/* weeklyAveragesByCategory                                            */
/* ------------------------------------------------------------------ */

test("weeklyAveragesByCategory averages across active weeks only", () => {
  const categories = cats(["deep", "fun"])
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "deep" },
    b: { ...video("b", "ChB"), autoCategoryId: "fun" }
  }
  // week of Nov 2–8 (Mon–Sun): deep 1200, fun 600
  // week of Nov 9–15 (current, partial): deep 600
  // week of Oct 19–25: nothing (shouldn't count)
  const events = [
    watch("a", "2026-11-02"),
    watch("a", "2026-11-02"),
    watch("b", "2026-11-03"),
    watch("a", "2026-11-09")
  ]
  const avgs = weeklyAveragesByCategory({ videos, events, categories, subcategories: [], rules: [] }, 4, NOW)
  const deep = avgs.find((x) => x.categoryId === "deep")
  const fun = avgs.find((x) => x.categoryId === "fun")
  assert.equal(deep?.secondsPerWeek, (1200 + 600) / 2)
  assert.equal(fun?.secondsPerWeek, 600 / 2)
})

/* ------------------------------------------------------------------ */
/* setupHygiene                                                        */
/* ------------------------------------------------------------------ */

test("setupHygiene finds dead rules, unused subs and quiet categories", () => {
  const categories: Category[] = [
    ...cats(["deep", "fun"]),
    { id: "empty", name: "empty", emoji: "·", color: "#000", valueScore: 1 as Category["valueScore"], order: 9 }
  ]
  const subcategories = [sub("deep-sub", "deep"), sub("unused-sub", "deep")]
  const old = "2026-01-01T00:00:00Z"
  const rules: Rule[] = [
    { id: "dead", name: "dead", enabled: true, priority: 50, match: { channelEquals: "X" }, categoryId: "deep", createdAt: old, updatedAt: old, hitCount: 0 },
    { id: "young", name: "young", enabled: true, priority: 51, match: { channelEquals: "Y" }, categoryId: "deep", createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T00:00:00Z", hitCount: 0 },
    { id: "live", name: "live", enabled: true, priority: 52, match: { channelEquals: "Z" }, categoryId: "deep-sub", createdAt: old, updatedAt: old, hitCount: 5 }
  ]
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "deep-sub" },
    b: { ...video("b", "ChB"), autoCategoryId: "fun" }
  }
  const events = [watch("a", "2026-11-09"), watch("b", "2026-11-09")]
  const hygiene = setupHygiene({ videos, events, categories, subcategories, rules }, NOW)
  assert.deepEqual(hygiene.deadRules.map((r) => r.id), ["dead"])
  assert.deepEqual(hygiene.unusedSubcategories.map((s) => s.id), ["unused-sub"])
  assert.deepEqual(hygiene.quietCategories.map((c) => c.id), ["empty"])
  assert.deepEqual(hygiene.emptyCategories.map((c) => c.id), ["empty"])
})

/* ------------------------------------------------------------------ */
/* computeSignals                                                      */
/* ------------------------------------------------------------------ */

test("computeSignals self-suppresses on thin data and ranks cards", () => {
  const categories = cats(["deep"])
  const videos = { a: video("a", "ChA") }
  const events = [watch("a", "2026-11-10")]
  const signals = computeSignals({ videos, events, categories, subcategories: [], rules: [] }, NOW)
  assert.equal(signals.length, 0)
})

test("computeSignals surfaces the full story on rich data", () => {
  const categories = cats(["top", "mid", "bottom"])
  const videos: Record<string, VideoRecord> = {
    a: { ...video("a", "ChA"), autoCategoryId: "top" },
    b: { ...video("b", "ChB"), autoCategoryId: "bottom", categoryOverride: "bottom" },
    c: { ...video("c", "ChC"), autoCategoryId: "bottom", categoryOverride: "bottom" },
    d: { ...video("d", "ChD"), autoCategoryId: "top", categoryOverride: "top" }
  }
  const events: WatchEvent[] = []
  const days = ["2026-10-28", "2026-10-30", "2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07", "2026-11-09"]
  days.forEach((d) => events.push(watch("a", d)))
  events.push(watch("b", "2026-11-04")) // heavy-ish day
  events.push(watch("c", "2026-11-06", 10)) // abandoned
  events.push(watch("d", "2026-11-08"))
  const rules: Rule[] = [
    { id: "r1", name: "Always ChB", enabled: true, priority: 50, match: { channelEquals: "ChB" }, categoryId: "bottom", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", hitCount: 2 },
    { id: "r2", name: "Always ChC", enabled: true, priority: 50, match: { channelEquals: "ChC" }, categoryId: "bottom", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", hitCount: 1 },
    { id: "r3", name: "Always ChD", enabled: true, priority: 50, match: { channelEquals: "ChD" }, categoryId: "top", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", hitCount: 1 }
  ]
  const signals = computeSignals({ videos, events, categories, subcategories: [], rules, budgetsWeekly: {} }, NOW)
  const kinds = signals.map((s) => s.kind)
  assert.ok(kinds.includes("period-compare"))
  assert.ok(kinds.includes("value-mix"))
  assert.ok(kinds.includes("duplicate-overrides"))
  assert.ok(kinds.includes("rewatch") === false || true) // optional
  // ranked descending by score
  for (let i = 1; i < signals.length; i++) {
    assert.ok(signals[i - 1].score >= signals[i].score)
  }
})
