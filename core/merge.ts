/**
 * Single-writer merge of fetched history sections into the v2 store shape.
 *
 * Semantics (see PLAN.md §5/§7):
 *  - day labels are resolved to local calendar days at merge time
 *  - events are keyed `${videoId}|${watchedOn}`; occurrences within a day are
 *    counted from the fetch (the feed is authoritative, so the latest fetched
 *    count REPLACES the stored count — no double counting across syncs)
 *  - within a day section the feed is newest-first, so the FIRST occurrence of
 *    a video carries the latest progress; the average across occurrences is
 *    kept for estimation
 *  - video-level facts (title/channel/url) refresh; duration only ever
 *    improves (null → known); manual/rule category fields are never touched
 */

import type { HistorySection } from "../utils/history-types"
import type { VideoRecord, WatchEvent } from "./types"
import { eventKeyOf, monthOf, dateKeyOf } from "./types"
import { parseProgressPct, guessIsShortFromDuration } from "./duration"
import { dayLabelToDate } from "../utils/day"

export interface MergeDiagnostics {
  sections: number
  items: number
  skippedItems: number
  unresolvedDayLabels: string[]
  newVideos: number
  updatedVideos: number
  newEvents: number
  updatedEvents: number
  touchedMonths: string[]
}

export interface MergeResult {
  videos: Record<string, VideoRecord>
  /** month ("YYYY-MM") -> eventKey -> WatchEvent */
  eventShards: Record<string, Record<string, WatchEvent>>
  diagnostics: MergeDiagnostics
}

export function mergeFetchResult(params: {
  videos: Record<string, VideoRecord>
  eventShards: Record<string, Record<string, WatchEvent>>
  sections: HistorySection[]
  now: Date
}): MergeResult {
  const nowIso = params.now.toISOString()
  const videos: Record<string, VideoRecord> = { ...params.videos }
  const eventShards: Record<string, Record<string, WatchEvent>> = {}
  for (const [month, shard] of Object.entries(params.eventShards)) {
    eventShards[month] = { ...shard }
  }

  const diagnostics: MergeDiagnostics = {
    sections: 0,
    items: 0,
    skippedItems: 0,
    unresolvedDayLabels: [],
    newVideos: 0,
    updatedVideos: 0,
    newEvents: 0,
    updatedEvents: 0,
    touchedMonths: []
  }

  // Pre-combine sections by day label: the same day may arrive split across
  // multiple section objects (e.g. continuation pages), and occurrences must
  // be counted across the whole day, not per chunk.
  const combined = new Map<string, HistorySection>()
  for (const section of params.sections) {
    const existing = combined.get(section.dayLabel)
    if (existing) existing.items.push(...section.items)
    else combined.set(section.dayLabel, { dayLabel: section.dayLabel, items: [...section.items] })
  }

  for (const section of combined.values()) {
    const day = dayLabelToDate(section.dayLabel, params.now)
    if (!day) {
      diagnostics.skippedItems += section.items.length
      if (!diagnostics.unresolvedDayLabels.includes(section.dayLabel)) {
        diagnostics.unresolvedDayLabels.push(section.dayLabel)
      }
      continue
    }
    const watchedOn = dateKeyOf(day)
    const month = monthOf(watchedOn)
    if (!eventShards[month]) eventShards[month] = {}
    const shard = eventShards[month]
    if (!diagnostics.touchedMonths.includes(month)) diagnostics.touchedMonths.push(month)
    diagnostics.sections++

    // group this day's items by videoId, preserving feed order (newest first)
    const byVideo = new Map<string, { progress: number | null }[]>()
    for (const item of section.items) {
      if (!item?.videoId) {
        diagnostics.skippedItems++
        continue
      }
      diagnostics.items++
      let list = byVideo.get(item.videoId)
      if (!list) {
        list = []
        byVideo.set(item.videoId, list)
      }
      list.push({ progress: parseProgressPct(item.watchState) })
    }

    for (const [videoId, occ] of byVideo.entries()) {
      const item = section.items.find((i) => i.videoId === videoId)!

      // ---- video record ------------------------------------------------
      const prev = videos[videoId]
      if (prev) {
        videos[videoId] = {
          ...prev,
          title: item.title || prev.title,
          channel: item.channel || prev.channel,
          url: item.url || prev.url,
          durationSec: item.durationSec ?? prev.durationSec ?? null,
          durationSource:
            item.durationSec != null
              ? item.durationSource ?? "overlay"
              : prev.durationSource,
          // never downgrade a definitive isShort (resolver page-type) with
          // the duration heuristic — only fill nulls
          isShort: prev.isShort ?? guessIsShortFromDuration(item.durationSec ?? null),
          lastSeenAt: nowIso
        }
        diagnostics.updatedVideos++
      } else {
        videos[videoId] = {
          videoId,
          title: item.title,
          channel: item.channel,
          url: item.url,
          durationSec: item.durationSec ?? null,
          durationSource: item.durationSec != null ? item.durationSource ?? "overlay" : null,
          isShort: guessIsShortFromDuration(item.durationSec ?? null),
          categoryOverride: null,
          autoCategoryId: null,
          appliedRuleId: null,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso
        }
        diagnostics.newVideos++
      }

      // ---- watch event -------------------------------------------------
      const known = occ.filter((o) => o.progress != null).map((o) => o.progress as number)
      const progressPct = occ.length ? occ[0].progress : null // newest occurrence
      const progressAvgPct =
        known.length > 0
          ? Math.round(known.reduce((a, b) => a + b, 0) / known.length)
          : null

      const key = eventKeyOf(videoId, watchedOn)
      const prevEvent = shard[key]
      if (prevEvent) {
        shard[key] = {
          ...prevEvent,
          progressPct,
          progressAvgPct,
          occurrences: occ.length, // latest fetched count is authoritative
          lastSeenAt: nowIso
        }
        diagnostics.updatedEvents++
      } else {
        shard[key] = {
          key,
          videoId,
          watchedOn,
          progressPct,
          progressAvgPct,
          occurrences: occ.length,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso
        }
        diagnostics.newEvents++
      }
    }
  }

  return { videos, eventShards, diagnostics }
}
