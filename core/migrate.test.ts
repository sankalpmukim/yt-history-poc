import test from "node:test"
import assert from "node:assert/strict"
import { migrateV1Store } from "./migrate"
import type { StoreShape } from "../utils/history-types"
import { eventKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)

function v1(entries: StoreShape["entries"]): StoreShape {
  return { version: 1, lastSyncedAt: null, lastSyncStatus: "", entries }
}

test("migrates v1 entries into v2 videos + events", () => {
  const store = v1({
    a: {
      videoId: "a",
      title: "Video A",
      channel: "Chan A",
      url: "https://www.youtube.com/watch?v=a",
      watchState: "Watched 16%",
      dayLabel: "Today",
      firstSeenAt: new Date(2026, 10, 2, 8, 0, 0).toISOString(),
      lastSeenAt: new Date(2026, 10, 2, 8, 0, 0).toISOString()
    },
    b: {
      videoId: "b",
      title: "Video B",
      channel: "Chan B",
      url: "https://www.youtube.com/watch?v=b",
      watchState: "",
      dayLabel: "Monday",
      firstSeenAt: new Date(2026, 9, 26, 9, 0, 0).toISOString(), // Mon Oct 26
      lastSeenAt: new Date(2026, 9, 26, 9, 0, 0).toISOString()
    }
  })
  const out = migrateV1Store({ v1: store, now: NOW })

  assert.equal(out.migratedEvents, 2)
  assert.equal(Object.keys(out.videos).length, 2)
  assert.equal(out.videos.a.durationSec, null)
  assert.equal(out.videos.a.categoryOverride, null)

  const evA = out.eventShards["2026-11"][eventKeyOf("a", "2026-11-02")]
  assert.ok(evA)
  assert.equal(evA.progressPct, 16)
  assert.equal(evA.occurrences, 1)

  const evB = out.eventShards["2026-10"][eventKeyOf("b", "2026-10-26")]
  assert.ok(evB)
  assert.equal(evB.progressPct, null)
  assert.equal(evB.progressAvgPct, null)
})

test("skips entries with unresolvable day labels or missing ids", () => {
  const store = v1({
    bad1: { videoId: "bad1", title: "x", channel: "", url: "", watchState: "", dayLabel: "Someday", firstSeenAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() },
    bad2: { videoId: "", title: "x", channel: "", url: "", watchState: "", dayLabel: "Today", firstSeenAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() }
  })
  const out = migrateV1Store({ v1: store, now: NOW })
  assert.equal(out.migratedEvents, 0)
  assert.equal(out.skippedEntries, 2)
  assert.equal(Object.keys(out.videos).length, 0)
})

test("two v1 entries collapsing to the same video+day keep the first", () => {
  const store = v1({
    a: { videoId: "a", title: "1", channel: "", url: "", watchState: "", dayLabel: "Today", firstSeenAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() },
    a2: { videoId: "a", title: "2", channel: "", url: "", watchState: "", dayLabel: "Today", firstSeenAt: NOW.toISOString(), lastSeenAt: NOW.toISOString() }
  })
  const out = migrateV1Store({ v1: store, now: NOW })
  assert.equal(out.migratedEvents, 1)
  assert.equal(out.skippedEntries, 1)
})
