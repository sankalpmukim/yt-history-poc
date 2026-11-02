/**
 * One-time migration from the legacy POC v1 cache (ytHistoryPoc.v1) to the
 * v2 ledger. v1 deduped by videoId with a 48h retention, so:
 *  - one VideoRecord per v1 entry
 *  - one WatchEvent per entry, occurrences = 1 (v1 could not see repeats)
 *  - watchedOn resolved from the day label relative to the entry's own
 *    firstSeenAt (the label was contemporaneous with that timestamp)
 *  - durations were never captured in v1 → null (duration queue will backfill)
 */

import type { StoreShape } from "../utils/history-types"
import type { VideoRecord, WatchEvent } from "./types"
import { eventKeyOf, monthOf, dateKeyOf } from "./types"
import { parseProgressPct } from "./duration"
import { dayLabelToDate } from "../utils/day"

export interface MigrationResult {
  videos: Record<string, VideoRecord>
  /** month ("YYYY-MM") -> eventKey -> WatchEvent */
  eventShards: Record<string, Record<string, WatchEvent>>
  migratedEvents: number
  skippedEntries: number
}

export function migrateV1Store(params: { v1: StoreShape; now: Date }): MigrationResult {
  const videos: Record<string, VideoRecord> = {}
  const eventShards: Record<string, Record<string, WatchEvent>> = {}
  let migratedEvents = 0
  let skippedEntries = 0

  for (const entry of Object.values(params.v1.entries ?? {})) {
    if (!entry?.videoId) {
      skippedEntries++
      continue
    }
    // resolve the day label as of the time the entry was first seen
    let reference: Date
    try {
      reference = new Date(entry.firstSeenAt)
      if (isNaN(reference.getTime())) reference = params.now
    } catch {
      reference = params.now
    }
    const day = dayLabelToDate(entry.dayLabel ?? "", reference)
    if (!day) {
      skippedEntries++
      continue
    }
    const watchedOn = dateKeyOf(day)
    const month = monthOf(watchedOn)
    if (!eventShards[month]) eventShards[month] = {}
    const key = eventKeyOf(entry.videoId, watchedOn)
    if (eventShards[month][key]) {
      // two v1 entries collapsed to the same video+day (label churn) — keep first
      skippedEntries++
      continue
    }

    const nowIso = params.now.toISOString()
    const progress = parseProgressPct(entry.watchState)
    eventShards[month][key] = {
      key,
      videoId: entry.videoId,
      watchedOn,
      progressPct: progress,
      progressAvgPct: progress,
      occurrences: 1,
      firstSeenAt: entry.firstSeenAt ?? nowIso,
      lastSeenAt: entry.lastSeenAt ?? nowIso
    }
    videos[entry.videoId] = {
      videoId: entry.videoId,
      title: entry.title ?? "",
      channel: entry.channel ?? "",
      url: entry.url ?? `https://www.youtube.com/watch?v=${entry.videoId}`,
      durationSec: null,
      durationSource: null,
      isShort: null,
      categoryOverride: null,
      autoCategoryId: null,
      appliedRuleId: null,
      firstSeenAt: entry.firstSeenAt ?? nowIso,
      lastSeenAt: entry.lastSeenAt ?? nowIso
    }
    migratedEvents++
  }

  return { videos, eventShards, migratedEvents, skippedEntries }
}
