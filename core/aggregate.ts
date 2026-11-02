/**
 * Aggregation over the ledger (pure): joins watch events with videos,
 * estimates time, and produces everything the dashboard needs — totals,
 * per-category breakdowns with top channels, daily trend series, the
 * time-value index, and low-value / uncategorized shares.
 *
 * valueIndex and lowValueShare are computed over CATEGORIZED seconds only
 * (uncategorized time is reported separately, never scored as zero).
 */

import type { Category, VideoRecord, WatchEvent } from "./types"
import { estimateEventSeconds } from "./estimate"
import type { EstimateConfidence } from "./estimate"
import { effectiveCategoryId } from "./rules"

export interface LedgerRow {
  event: WatchEvent
  video: VideoRecord
  categoryId: string | null
  estimatedSeconds: number | null
  confidence: EstimateConfidence
}

export interface ChannelAgg {
  channel: string
  seconds: number
}

export interface CategoryAgg {
  categoryId: string | null
  seconds: number
  watchCount: number
  videoCount: number
  share: number
  topChannels: ChannelAgg[]
}

export interface DayCategorySlice {
  categoryId: string | null
  seconds: number
}

export interface DayAgg {
  date: string
  seconds: number
  byCategory: DayCategorySlice[]
}

export interface Aggregate {
  rows: LedgerRow[]
  totalSeconds: number
  totalEvents: number
  distinctVideos: number
  unestimatedCount: number
  byCategory: CategoryAgg[]
  byDay: DayAgg[]
  /** weighted avg value score over categorized seconds; null when none */
  valueIndex: number | null
  lowValueSeconds: number
  /** low-value (score ≤1) share of categorized seconds; null when none */
  lowValueShare: number | null
  uncategorizedSeconds: number
  uncategorizedVideoCount: number
}

export function aggregateRange(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
  /** inclusive yyyy-mm-dd, null = open start */
  from?: string | null
  /** inclusive yyyy-mm-dd, null = open end */
  to?: string | null
}): Aggregate {
  const from = params.from ?? null
  const to = params.to ?? null
  const scoreOf = new Map(params.categories.map((c) => [c.id, c.valueScore] as const))

  const rows: LedgerRow[] = []
  for (const event of params.events) {
    if (from && event.watchedOn < from) continue
    if (to && event.watchedOn > to) continue
    const video = params.videos[event.videoId]
    if (!video) continue // orphan event (video pruned) — skip
    const est = estimateEventSeconds(event, video)
    rows.push({
      event,
      video,
      categoryId: effectiveCategoryId(video),
      estimatedSeconds: est.seconds,
      confidence: est.confidence
    })
  }

  rows.sort((a, b) =>
    a.event.watchedOn === b.event.watchedOn
      ? b.event.lastSeenAt.localeCompare(a.event.lastSeenAt)
      : b.event.watchedOn.localeCompare(a.event.watchedOn)
  )

  let totalSeconds = 0
  let unestimatedCount = 0
  let categorizedSeconds = 0
  let lowValueSeconds = 0
  let uncategorizedSeconds = 0
  let scoredWeighted = 0

  const catMap = new Map<string | null, { seconds: number; watchCount: number; videos: Set<string>; channels: Map<string, number> }>()
  const dayMap = new Map<string, { seconds: number; byCategory: Map<string | null, number> }>()

  for (const row of rows) {
    const secs = row.estimatedSeconds
    if (secs == null) {
      unestimatedCount++
    } else {
      totalSeconds += secs
    }
    const cat = catMap.get(row.categoryId) ?? {
      seconds: 0,
      watchCount: 0,
      videos: new Set<string>(),
      channels: new Map<string, number>()
    }
    cat.watchCount++
    cat.videos.add(row.video.videoId)
    if (secs != null) {
      cat.seconds += secs
      const ch = row.video.channel || "(unknown channel)"
      cat.channels.set(ch, (cat.channels.get(ch) ?? 0) + secs)
      const day = dayMap.get(row.event.watchedOn) ?? { seconds: 0, byCategory: new Map() }
      day.seconds += secs
      day.byCategory.set(row.categoryId, (day.byCategory.get(row.categoryId) ?? 0) + secs)
      dayMap.set(row.event.watchedOn, day)

      if (row.categoryId == null) {
        uncategorizedSeconds += secs
      } else {
        categorizedSeconds += secs
        const score = scoreOf.get(row.categoryId)
        if (score != null) {
          scoredWeighted += score * secs
          if (score <= 1) lowValueSeconds += secs
        }
      }
    }
    catMap.set(row.categoryId, cat)
  }

  const byCategory: CategoryAgg[] = [...catMap.entries()]
    .map(([categoryId, c]) => ({
      categoryId,
      seconds: c.seconds,
      watchCount: c.watchCount,
      videoCount: c.videos.size,
      share: totalSeconds > 0 ? c.seconds / totalSeconds : 0,
      topChannels: [...c.channels.entries()]
        .map(([channel, seconds]) => ({ channel, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 3)
    }))
    .sort((a, b) => b.seconds - a.seconds)

  const byDay: DayAgg[] = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => ({
      date,
      seconds: d.seconds,
      byCategory: [...d.byCategory.entries()]
        .map(([categoryId, seconds]) => ({ categoryId, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
    }))

  const uncategorizedVideoCount = new Set(
    rows.filter((r) => r.categoryId == null).map((r) => r.video.videoId)
  ).size

  return {
    rows,
    totalSeconds,
    totalEvents: rows.length,
    distinctVideos: new Set(rows.map((r) => r.video.videoId)).size,
    unestimatedCount,
    byCategory,
    byDay,
    valueIndex: categorizedSeconds > 0 ? scoredWeighted / categorizedSeconds : null,
    lowValueSeconds,
    lowValueShare: categorizedSeconds > 0 ? lowValueSeconds / categorizedSeconds : null,
    uncategorizedSeconds,
    uncategorizedVideoCount
  }
}

/** Uncategorized videos from `videos` not covered by any event in range (review queue). */
export function uncategorizedVideos(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  limit?: number
}): VideoRecord[] {
  const seen = new Set(params.events.map((e) => e.videoId))
  return Object.values(params.videos)
    .filter((v) => seen.has(v.videoId) && effectiveCategoryId(v) == null)
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, params.limit ?? 15)
}
