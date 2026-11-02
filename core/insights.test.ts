import test from "node:test"
import assert from "node:assert/strict"
import {
  channelTimeByScoreBand,
  weekdayAverages,
  suggestChannelRules
} from "./insights"
import type { Category, VideoRecord, WatchEvent } from "./types"
import { eventKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)

const CATS: Category[] = [
  { id: "rot", name: "Rot", emoji: "🧟", color: "#e11d48", valueScore: 0, order: 0 },
  { id: "fun", name: "Fun", emoji: "🎬", color: "#eab308", valueScore: 2, order: 1 },
  { id: "deep", name: "Deep", emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 2 }
]

function video(id: string, over: Partial<VideoRecord> = {}): VideoRecord {
  return {
    videoId: id,
    title: "T " + id,
    channel: "Chan" + id.slice(0, 1),
    url: "u",
    durationSec: 600,
    durationSource: "overlay",
    isShort: null,
    categoryOverride: null,
    autoCategoryId: null,
    appliedRuleId: null,
    firstSeenAt: "",
    lastSeenAt: "",
    ...over
  }
}

function event(videoId: string, day: string): WatchEvent {
  return {
    key: eventKeyOf(videoId, day),
    videoId,
    watchedOn: day,
    progressPct: 100,
    progressAvgPct: 100,
    occurrences: 1,
    firstSeenAt: "",
    lastSeenAt: ""
  }
}

test("channelTimeByScoreBand ranks channels in a score band", () => {
  const videos = {
    r1: video("r1", { autoCategoryId: "rot", channel: "RotChan" }),
    r2: video("r2", { autoCategoryId: "rot", channel: "RotChan" }),
    d1: video("d1", { autoCategoryId: "deep", channel: "DeepChan" }),
    f1: video("f1", { autoCategoryId: "fun", channel: "FunChan" })
  }
  const events = [event("r1", "2026-11-01"), event("r2", "2026-11-01"), event("d1", "2026-11-01"), event("f1", "2026-11-01")]
  const low = channelTimeByScoreBand({ videos, events, categories: CATS, minScore: 0, maxScore: 1 })
  assert.deepEqual(low.map((c) => c.channel), ["RotChan"])
  assert.equal(low[0].seconds, 1200)
  assert.equal(low[0].watchCount, 2)
  const high = channelTimeByScoreBand({ videos, events, categories: CATS, minScore: 4, maxScore: 5 })
  assert.deepEqual(high.map((c) => c.channel), ["DeepChan"])
})

test("weekdayAverages divides by calendar occurrences, not active days", () => {
  // Sat Oct 31 2026, Sun Nov 1, Mon Nov 2 (today, no data yet)
  const now = new Date(2026, 10, 2, 12, 0, 0)
  const byDay = [
    { date: "2026-10-31", seconds: 600 }, // Saturday
    { date: "2026-11-01", seconds: 1200 } // Sunday
  ]
  const avgs = weekdayAverages(byDay, now)
  assert.equal(avgs.length, 7)
  const sat = avgs.find((a) => a.label === "Sat")!
  const sun = avgs.find((a) => a.label === "Sun")!
  const mon = avgs.find((a) => a.label === "Mon")!
  assert.equal(sat.secondsPerOccurrence, 600, "one Saturday in span")
  assert.equal(sun.secondsPerOccurrence, 1200)
  assert.equal(mon.secondsPerOccurrence, 0, "Monday present in calendar but no data")
  assert.ok(avgs.every((a) => Number.isFinite(a.secondsPerOccurrence)))
})

test("suggestChannelRules: manual consistency and uncategorized time", () => {
  const videos = {
    a: video("a", { channel: "SameChan", categoryOverride: "deep" }),
    b: video("b", { channel: "SameChan", categoryOverride: "deep" }),
    c: video("c", { channel: "MessyChan" }),
    d: video("d", { channel: "MessyChan" }),
    e: video("e", { channel: "MessyChan" })
  }
  const events = ["a", "b", "c", "d", "e"].map((id) => event(id, "2026-11-01"))
  const sugg = suggestChannelRules({ videos, events, categories: CATS })
  assert.ok(sugg.length >= 2)
  const consistency = sugg.find((s) => s.kind === "manual-consistency")!
  assert.equal(consistency.channel, "SameChan")
  assert.equal(consistency.categoryId, "deep")
  const uncategorized = sugg.find((s) => s.kind === "uncategorized-time")!
  assert.equal(uncategorized.channel, "MessyChan")
  assert.equal(uncategorized.categoryId, null)
  assert.equal(uncategorized.uncategorizedSeconds, 1800)
})

test("suggestChannelRules skips one-off manual overrides", () => {
  const videos = { a: video("a", { channel: "OnceChan", categoryOverride: "fun" }) }
  const sugg = suggestChannelRules({ videos, events: [event("a", "2026-11-01")], categories: CATS })
  assert.equal(sugg.length, 0, "single override is not a pattern")
})
