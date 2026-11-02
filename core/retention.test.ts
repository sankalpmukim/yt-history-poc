import test from "node:test"
import assert from "node:assert/strict"
import { pruneRetention } from "./retention"
import type { WatchEvent } from "./types"
import { eventKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0) // Mon Nov 02 2026

function ev(videoId: string, watchedOn: string, occurrences = 1): WatchEvent {
  return {
    key: eventKeyOf(videoId, watchedOn),
    videoId,
    watchedOn,
    progressPct: null,
    progressAvgPct: null,
    occurrences,
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString()
  }
}

test("prunes events older than the retention window", () => {
  const shards = {
    "2024-11": { [ev("old", "2024-11-02").key]: ev("old", "2024-11-02") },
    "2025-11": { [ev("edge", "2025-11-02").key]: ev("edge", "2025-11-02") },
    "2026-11": { [ev("new", "2026-11-01").key]: ev("new", "2026-11-01") }
  }
  const out = pruneRetention({ eventShards: shards, retentionDays: 365, now: NOW })
  assert.equal(out.removedEvents, 1)
  assert.ok(out.eventShards["2025-11"], "boundary day (exactly 365d ago) is kept")
  assert.ok(out.eventShards["2026-11"])
  assert.equal(out.eventShards["2024-11"], undefined, "fully pruned month disappears")
})

test("retention=null keeps everything forever", () => {
  const shards = {
    "2015-01": { [ev("ancient", "2015-01-01").key]: ev("ancient", "2015-01-01") }
  }
  const out = pruneRetention({ eventShards: shards, retentionDays: null, now: NOW })
  assert.equal(out.removedEvents, 0)
  assert.ok(out.eventShards["2015-01"])
})

test("partially pruned months keep their newer events", () => {
  const shards = {
    "2025-10": {
      [ev("a", "2025-10-01").key]: ev("a", "2025-10-01"),
      [ev("b", "2025-11-30").key]: ev("b", "2025-11-30")
    }
  }
  const out = pruneRetention({ eventShards: shards, retentionDays: 365, now: NOW })
  assert.equal(out.removedEvents, 1)
  assert.ok(out.eventShards["2025-10"][ev("b", "2025-11-30").key])
  assert.equal(out.eventShards["2025-10"][ev("a", "2025-10-01").key], undefined)
})
