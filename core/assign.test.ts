import test from "node:test"
import assert from "node:assert/strict"
import { MemoryKV } from "./storage"
import { setVideoCategory, bulkAssign, ensureChannelRule } from "./assign"
import { ensureInitialized, applySyncResult } from "./ledger"
import { KEYS } from "./types"
import type { HistorySection } from "../utils/history-types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)

function section(dayLabel: string, ...videoIds: string[]): HistorySection {
  return {
    dayLabel,
    items: videoIds.map((videoId) => ({
      videoId,
      title: `Video ${videoId}`,
      channel: videoId.startsWith("f1") ? "FORMULA 1" : "Chan",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      watchState: "",
      durationSec: null
    }))
  }
}

test("setVideoCategory overrides rules; clearing lets rules back in", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  await applySyncResult(kv, { sections: [section("Today", "a")], now: NOW })

  await setVideoCategory(kv, "a", "fun", NOW)
  let videos = (await kv.get(KEYS.videos)) as any
  assert.equal(videos.a.categoryOverride, "fun")

  // sync again — merge must preserve the override
  await applySyncResult(kv, { sections: [section("Today", "a")], now: NOW })
  videos = (await kv.get(KEYS.videos)) as any
  assert.equal(videos.a.categoryOverride, "fun")

  await setVideoCategory(kv, "a", null, NOW)
  videos = (await kv.get(KEYS.videos)) as any
  assert.equal(videos.a.categoryOverride, null)
})

test("bulkAssign sets many overrides at once", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  await applySyncResult(kv, { sections: [section("Today", "a", "b", "c")], now: NOW })

  const changed = await bulkAssign(kv, ["a", "b", "missing"], "news", NOW)
  assert.equal(changed, 2)
  const videos = (await kv.get(KEYS.videos)) as any
  assert.equal(videos.a.categoryOverride, "news")
  assert.equal(videos.b.categoryOverride, "news")
  assert.equal(videos.c.categoryOverride, null)
})

test("ensureChannelRule creates a high-priority rule and applies it", async () => {
  const kv = new MemoryKV()
  await ensureInitialized(kv, NOW)
  await applySyncResult(kv, { sections: [section("Today", "f1a", "f1b", "c")], now: NOW })

  const rule = await ensureChannelRule(kv, "formula 1", "fun", NOW)
  assert.ok(rule)
  assert.equal(rule.priority, 50)
  assert.equal(rule.match.channelEquals, "formula 1")

  const videos = (await kv.get(KEYS.videos)) as any
  assert.equal(videos.f1a.autoCategoryId, "fun", "existing videos re-categorized immediately")
  assert.equal(videos.f1b.autoCategoryId, "fun")
  assert.equal(videos.c.autoCategoryId, null)

  // re-ensuring the same channel updates instead of duplicating
  const again = await ensureChannelRule(kv, "FORMULA 1", "news", NOW)
  const rules = (await kv.get(KEYS.rules)) as any[]
  assert.equal(rules.filter((r) => r.match.channelEquals).length, 1)
  assert.equal(again!.categoryId, "news")
  const after = (await kv.get(KEYS.videos)) as any
  assert.equal(after.f1a.autoCategoryId, "news")
})
