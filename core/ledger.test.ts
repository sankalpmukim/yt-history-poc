import test from "node:test"
import assert from "node:assert/strict"
import { MemoryKV } from "./storage"
import { ensureInitialized, applySyncResult } from "./ledger"
import { pruneNow } from "./retention"
import type { HistorySection, StoreShape } from "../utils/history-types"
import { KEYS, eventsKey, eventKeyOf, dateKeyOf } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)

function section(dayLabel: string, ...videoIds: string[]): HistorySection {
  return {
    dayLabel,
    items: videoIds.map((videoId) => ({
      videoId,
      title: `Video ${videoId}`,
      channel: "CHAN",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      watchState: "",
      durationSec: null
    }))
  }
}

test("ensureInitialized writes defaults exactly once (no v1 present)", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  const meta = (await kv.get(KEYS.meta)) as any
  assert.equal(meta.version, 2)
  assert.equal(meta.settings.retentionDays, 365)
  assert.ok(Array.isArray(await kv.get(KEYS.categories)))
  assert.ok(Array.isArray(await kv.get(KEYS.rules)))
  assert.deepEqual(await kv.get(KEYS.videos), {}, "migration marked as considered")

  // re-run must not clobber a sync status written meanwhile
  const metaWithSync = { ...meta, lastSyncedAt: NOW.toISOString(), lastSyncStatus: "ok · earlier" }
  await kv.set({ [KEYS.meta]: metaWithSync })
  await ensureInitialized(kv, NOW)
  const again = (await kv.get(KEYS.meta)) as any
  assert.equal(again.lastSyncStatus, "ok · earlier")
})

test("v1 POC cache is migrated once on init", async () => {
  const kv = new MemoryKV()
  const v1: StoreShape = {
    version: 1,
    lastSyncedAt: null,
    lastSyncStatus: "",
    entries: {
      a: {
        videoId: "a",
        title: "A",
        channel: "C",
        url: "https://www.youtube.com/watch?v=a",
        watchState: "Watched 40%",
        dayLabel: "Today",
        firstSeenAt: new Date(2026, 10, 2, 8).toISOString(),
        lastSeenAt: new Date(2026, 10, 2, 8).toISOString()
      }
    }
  }
  await kv.set({ ytHistoryPoc: "noise", ytHistoryPocV1: "noise" })
  await kv.set({ "ytHistoryPoc.v1": v1 })

  await ensureInitialized(kv, NOW)
  const videos = (await kv.get(KEYS.videos)) as any
  assert.ok(videos.a, "v1 entry became a v2 video")
  const shard = (await kv.get(eventsKey("2026-11"))) as any
  assert.ok(shard[eventKeyOf("a", "2026-11-02")], "v1 entry became a v2 event")
  assert.equal(shard[eventKeyOf("a", "2026-11-02")].progressPct, 40)

  // v1 key is left untouched; migration never runs again
  const v1After = (await kv.get("ytHistoryPoc.v1")) as any
  assert.equal(v1After.entries.a.title, "A")
})

test("applySyncResult persists shards, videos, queue and status", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)

  const summary = await applySyncResult(kv, {
    sections: [section("Today", "a", "b"), section("Yesterday", "c")],
    now: NOW
  })
  assert.equal(summary.ok, true)

  const videos = (await kv.get(KEYS.videos)) as any
  assert.ok(videos.a && videos.b && videos.c)

  const nov = (await kv.get(eventsKey("2026-11"))) as any
  assert.ok(nov[eventKeyOf("a", "2026-11-02")])
  assert.ok(nov[eventKeyOf("c", "2026-11-01")])
  assert.equal(Object.keys(nov).length, 3)

  const queue = (await kv.get(KEYS.durationQueue)) as string[]
  assert.deepEqual([...queue].sort(), ["a", "b", "c"], "unknown durations queued")

  const meta = (await kv.get(KEYS.meta)) as any
  assert.equal(meta.lastSyncedAt, NOW.toISOString())
  assert.ok(meta.lastSyncStatus.startsWith("ok ·"))
  assert.equal(meta.lastSyncDiagnostics.newEvents, 3)
})

test("duration resolver queue drops videos that gained a duration", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  await applySyncResult(kv, { sections: [section("Today", "a", "b")], now: NOW })
  await applySyncResult(kv, {
    sections: [
      {
        dayLabel: "Today",
        items: [
          {
            videoId: "a",
            title: "Video a",
            channel: "CHAN",
            url: "https://www.youtube.com/watch?v=a",
            watchState: "",
            durationSec: 754,
            durationSource: "overlay"
          }
        ]
      }
    ],
    now: NOW
  })
  const queue = (await kv.get(KEYS.durationQueue)) as string[]
  assert.deepEqual(queue, ["b"])
})

test("pruneNow applies the retention setting end-to-end", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  // meta default retention is 365d; sneak in an event older than that
  const oldDate = new Date(2025, 0, 1)
  const oldKey = eventKeyOf("ancient", dateKeyOf(oldDate))
  await kv.set({
    [eventsKey("2025-01")]: {
      [oldKey]: {
        key: oldKey,
        videoId: "ancient",
        watchedOn: dateKeyOf(oldDate),
        progressPct: null,
        progressAvgPct: null,
        occurrences: 1,
        firstSeenAt: NOW.toISOString(),
        lastSeenAt: NOW.toISOString()
      }
    }
  })
  const removed = await pruneNow(kv, NOW)
  assert.equal(removed.removedEvents, 1)
  const shard = await kv.get(eventsKey("2025-01"))
  assert.deepEqual(shard, {})
})
