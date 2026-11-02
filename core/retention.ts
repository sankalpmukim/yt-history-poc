/**
 * Retention pruning of stored watch events (PLAN.md §6).
 * User-configurable; default 365 days; null = keep forever.
 */

import type { WatchEvent } from "./types"
import { dateKeyOf } from "./types"
import { readEventShards, writeEventShard, readMeta } from "./storage"
import type { KV } from "./storage"
import { startOfDay } from "../utils/day"

export function pruneRetention(params: {
  eventShards: Record<string, Record<string, WatchEvent>>
  retentionDays: number | null
  now: Date
}): { eventShards: Record<string, Record<string, WatchEvent>>; removedEvents: number } {
  if (params.retentionDays == null) {
    return { eventShards: params.eventShards, removedEvents: 0 }
  }
  const cutoff = startOfDay(params.now)
  cutoff.setDate(cutoff.getDate() - params.retentionDays)
  const cutoffKey = dateKeyOf(cutoff)

  const out: Record<string, Record<string, WatchEvent>> = {}
  let removedEvents = 0
  for (const [month, shard] of Object.entries(params.eventShards)) {
    const kept: Record<string, WatchEvent> = {}
    for (const [key, ev] of Object.entries(shard)) {
      if (ev.watchedOn < cutoffKey) {
        removedEvents++
      } else {
        kept[key] = ev
      }
    }
    if (Object.keys(kept).length > 0) out[month] = kept
  }
  return { eventShards: out, removedEvents }
}

/** Load all shards from storage, prune, write back changed shards. */
export async function pruneNow(kv: KV, now: Date): Promise<{ removedEvents: number }> {
  const meta = await readMeta(kv)
  if (!meta || meta.settings.retentionDays == null) return { removedEvents: 0 }
  const all = await readEventShards(kv)
  const { eventShards, removedEvents } = pruneRetention({
    eventShards: all,
    retentionDays: meta.settings.retentionDays,
    now
  })
  if (removedEvents > 0) {
    const before = new Set(Object.keys(all))
    const after = new Set(Object.keys(eventShards))
    for (const month of before) {
      // rewrite changed months; dropping a month entirely writes {}
      await writeEventShard(kv, month, eventShards[month] ?? {})
    }
    // sanity: months in after must always have been in before
    for (const month of after) {
      if (!before.has(month)) await writeEventShard(kv, month, eventShards[month])
    }
  }
  return { removedEvents }
}
