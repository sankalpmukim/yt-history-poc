import test from "node:test"
import assert from "node:assert/strict"
import { buildBackup, validateBackup, backupToShards, buildCsv } from "./exports"
import { describeMatch } from "./rules"
import type { Category, VideoRecord, WatchEvent, MetaState } from "./types"
import { eventKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)

const CATS: Category[] = [
  { id: "fun", name: "Fun", emoji: "🎬", color: "#eab308", valueScore: 2, order: 0 }
]

function video(id: string, over: Partial<VideoRecord> = {}): VideoRecord {
  return {
    videoId: id,
    title: `Title ${id}`,
    channel: "Chan",
    url: `https://www.youtube.com/watch?v=${id}`,
    durationSec: 600,
    durationSource: "overlay",
    isShort: null,
    categoryOverride: null,
    autoCategoryId: "fun",
    appliedRuleId: "r1",
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString(),
    ...over
  }
}

function event(videoId: string, watchedOn: string): WatchEvent {
  return {
    key: eventKeyOf(videoId, watchedOn),
    videoId,
    watchedOn,
    progressPct: 50,
    progressAvgPct: 50,
    occurrences: 1,
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString()
  }
}

test("describeMatch renders readable condition summaries", () => {
  assert.equal(describeMatch({}), "matches everything")
  assert.equal(describeMatch({ channelEquals: "F1" }), 'channel is “F1”')
  assert.equal(
    describeMatch({ titleContains: ["tutorial", "guide"], isShort: true }),
    'title contains “tutorial” or “guide” and is a Short'
  )
  assert.equal(describeMatch({ maxDurationSec: 60 }), "duration ≤ 60s")
})

test("backup round-trip: build → validate → shards", () => {
  const backup = buildBackup({
    meta: null,
    categories: CATS,
    rules: [],
    videos: { a: video("a") },
    events: [event("a", "2026-11-01"), event("a", "2026-10-20")],
    now: NOW
  })
  const parsed = validateBackup(JSON.stringify(backup))
  assert.equal(parsed.app, "yt-ledger")
  const shards = backupToShards(parsed)
  assert.ok(shards["2026-11"][eventKeyOf("a", "2026-11-01")])
  assert.ok(shards["2026-10"][eventKeyOf("a", "2026-10-20")])
})

test("validateBackup rejects garbage and foreign payloads", () => {
  assert.throws(() => validateBackup("nope"), /not valid JSON/)
  assert.throws(() => validateBackup({ app: "other" }), /app mismatch/)
  assert.throws(() => validateBackup({ app: "yt-ledger", backupVersion: 2 }), /unsupported/)
  assert.throws(
    () =>
      validateBackup({
        app: "yt-ledger",
        backupVersion: 1,
        data: { categories: [], rules: [], videos: {}, events: { x: { videoId: "a" } } }
      }),
    /event entries invalid/
  )
})

test("buildCsv emits header + one row per event with escapes", () => {
  const csv = buildCsv({
    videos: { a: video("a", { title: 'Video "best", part 1' }), b: video("b", { categoryOverride: null, autoCategoryId: null, appliedRuleId: null }) },
    events: [event("b", "2026-11-02"), event("a", "2026-11-01")],
    categories: CATS
  })
  const lines = csv.trim().split("\n")
  assert.equal(lines.length, 3)
  assert.ok(lines[0].startsWith("date,videoId,title,"))
  assert.ok(lines[1].startsWith("2026-11-02,b,"))
  assert.ok(lines[1].includes(",none,"), "unmatched video → source none")
  assert.ok(lines[2].includes('"Video ""best"", part 1"'), "CSV quoting")
  assert.ok(lines[2].includes(",Fun,rule,"), "rule-sourced category")
  assert.ok(lines[2].includes(",300,high,"), "estimate 600×50%")
})
