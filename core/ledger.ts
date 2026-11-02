/**
 * High-level ledger operations used by the service worker:
 *  - ensureInitialized: defaults + one-time v1→v2 migration (idempotent)
 *  - applySyncResult: single-writer merge of fetched sections into storage
 *    (the SW is the only writer; content scripts only forward raw sections)
 *  - pruneNow: retention pass (delegated to retention.ts)
 */

import type { HistorySection, StoreShape } from "../utils/history-types"
import type { MetaState, SyncDiagnostics } from "./types"
import { KEYS, monthOf, dateKeyOf, eventsKey } from "./types"
import { readMeta, readVideos, readEventShards, writeEventShard, readDurationQueue } from "./storage"
import type { KV } from "./storage"
import { mergeFetchResult } from "./merge"
import { migrateV1Store } from "./migrate"
import { DEFAULT_CATEGORIES, fallbackStarterRules, defaultMeta } from "./defaults"
import { dayLabelToDate } from "../utils/day"

const LEGACY_V1_KEY = "ytHistoryPoc.v1"
const MAX_DURATION_QUEUE = 500

export interface SyncResultSummary {
  ok: boolean
  status: string
  diagnostics: SyncDiagnostics | null
  error?: string
}

/** Write defaults for any missing top-level keys (idempotent, safe to re-run). */
export async function ensureInitialized(kv: KV, now: Date): Promise<void> {
  const nowIso = now.toISOString()
  const meta = await readMeta(kv)
  if (!meta) {
    await kv.set({
      [KEYS.meta]: defaultMeta(nowIso),
      [KEYS.categories]: DEFAULT_CATEGORIES,
      [KEYS.rules]: fallbackStarterRules(nowIso)
    })
  }
  await maybeMigrateV1(kv, now)
}

/**
 * One-time v1 → v2 migration. Marks completion by writing the videos key
 * (even when empty) so the POC cache is never re-imported.
 */
async function maybeMigrateV1(kv: KV, now: Date): Promise<void> {
  const hasVideosKey = (await kv.get(KEYS.videos)) != null
  if (hasVideosKey) return
  const v1 = await kv.get(LEGACY_V1_KEY)
  if (!v1 || typeof v1 !== "object" || !(v1 as StoreShape).entries) {
    await kv.set({ [KEYS.videos]: {} }) // mark migration as considered
    return
  }
  const result = migrateV1Store({ v1: v1 as StoreShape, now })
  const writes: Record<string, unknown> = { [KEYS.videos]: result.videos }
  for (const [month, shard] of Object.entries(result.eventShards)) {
    writes[eventsKey(month)] = shard
  }
  await kv.set(writes)
}

/**
 * Merge fetched sections into storage and update sync status.
 * Caller (the SW) is responsible for the in-flight lock.
 */
export async function applySyncResult(
  kv: KV,
  params: { sections: HistorySection[]; now: Date }
): Promise<SyncResultSummary> {
  const nowIso = params.now.toISOString()
  let meta = await readMeta(kv)
  if (!meta) {
    await ensureInitialized(kv, params.now)
    meta = (await readMeta(kv)) as MetaState
  }

  const videos = await readVideos(kv)

  // resolve which monthly shards this fetch touches, load only those
  const months = new Set<string>()
  for (const s of params.sections) {
    const d = dayLabelToDate(s.dayLabel, params.now)
    if (d) months.add(monthOf(dateKeyOf(d)))
  }
  const shards = await readEventShards(kv, [...months])

  const merged = mergeFetchResult({
    videos,
    eventShards: shards,
    sections: params.sections,
    now: params.now
  })

  await kv.set({ [KEYS.videos]: merged.videos })
  for (const month of merged.diagnostics.touchedMonths) {
    await writeEventShard(kv, month, merged.eventShards[month])
  }

  // queue videos without a duration for the (M2) duration resolver
  const queue = await readDurationQueue(kv)
  const missing = Object.values(merged.videos)
    .filter((v) => v.durationSec == null)
    .map((v) => v.videoId)
  const nextQueue = [
    ...new Set([
      ...queue.filter((id) => merged.videos[id] && merged.videos[id].durationSec == null),
      ...missing
    ])
  ].slice(0, MAX_DURATION_QUEUE)
  await kv.set({ [KEYS.durationQueue]: nextQueue })

  const d = merged.diagnostics
  const status = `ok · ${d.items} item(s) in ${d.sections} day(s) · ${d.newEvents} new / ${d.updatedEvents} updated events · ${d.newVideos} new / ${d.updatedVideos} updated videos · ${Object.keys(merged.videos).length} videos total`
  const nextMeta: MetaState = {
    ...meta,
    lastSyncedAt: nowIso,
    lastSyncStatus: status,
    lastSyncDiagnostics: {
      sections: d.sections,
      items: d.items,
      skippedItems: d.skippedItems,
      unresolvedDayLabels: d.unresolvedDayLabels,
      newVideos: d.newVideos,
      updatedVideos: d.updatedVideos,
      newEvents: d.newEvents,
      updatedEvents: d.updatedEvents
    }
  }
  await kv.set({ [KEYS.meta]: nextMeta })

  return { ok: true, status, diagnostics: nextMeta.lastSyncDiagnostics }
}

/**
 * Record a coordinator/diagnostic status line (e.g. "hidden tab opened")
 * WITHOUT claiming a sync happened — lastSyncedAt stays untouched.
 */
export async function noteStatus(kv: KV, status: string): Promise<void> {
  const meta = await readMeta(kv)
  if (!meta) return
  await kv.set({ [KEYS.meta]: { ...meta, lastSyncStatus: status } })
}
