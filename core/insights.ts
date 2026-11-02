/**
 * Insights (pure): channel rankings by value band, weekday averages, and
 * rule suggestions derived from user behavior.
 */

import type { Category, Subcategory, VideoRecord, WatchEvent } from "./types"
import { aggregateRange } from "./aggregate"

export interface ChannelStat {
  channel: string
  seconds: number
  watchCount: number
}

/** Channels ranked by estimated time in categories whose score is within [minScore, maxScore]. */
export function channelTimeByScoreBand(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
  subcategories?: Subcategory[]
  from?: string | null
  minScore: number
  maxScore: number
  limit?: number
}): ChannelStat[] {
  const agg = aggregateRange({
    videos: params.videos,
    events: params.events,
    categories: params.categories,
    subcategories: params.subcategories,
    from: params.from ?? null
  })
  const scoreOf = new Map(params.categories.map((c) => [c.id, c.valueScore] as const))
  const byChannel = new Map<string, ChannelStat>()
  for (const row of agg.rows) {
    if (row.categoryId == null || row.estimatedSeconds == null) continue
    const score = scoreOf.get(row.categoryId)
    if (score == null || score < params.minScore || score > params.maxScore) continue
    const ch = row.video.channel || "(unknown)"
    const cur = byChannel.get(ch) ?? { channel: ch, seconds: 0, watchCount: 0 }
    cur.seconds += row.estimatedSeconds
    cur.watchCount++
    byChannel.set(ch, cur)
  }
  return [...byChannel.values()].sort((a, b) => b.seconds - a.seconds).slice(0, params.limit ?? 10)
}

export interface WeekdayAvg {
  weekday: number
  label: string
  /** average seconds on this weekday across the calendar span covered */
  secondsPerOccurrence: number
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function toDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Average watch seconds per weekday, dividing by the number of calendar
 * occurrences of each weekday in the covered span (not just days with data).
 */
export function weekdayAverages(
  byDay: Array<{ date: string; seconds: number }>,
  now: Date = new Date()
): WeekdayAvg[] {
  if (byDay.length === 0) return []
  const totals = new Array<number>(7).fill(0)
  const counts = new Array<number>(7).fill(0)
  const perDay = new Map(byDay.map((d) => [d.date, d.seconds] as const))
  const todayKey = keyOf(now)
  const firstKey = byDay[0].date < todayKey ? byDay[0].date : todayKey
  const cursor = toDate(firstKey)
  const end = toDate(todayKey)
  while (cursor.getTime() <= end.getTime()) {
    counts[cursor.getDay()]++
    totals[cursor.getDay()] += perDay.get(keyOf(cursor)) ?? 0
    cursor.setDate(cursor.getDate() + 1)
  }
  return totals.map((t, i) => ({
    weekday: i,
    label: WEEKDAY_LABELS[i],
    secondsPerOccurrence: counts[i] > 0 ? t / counts[i] : 0
  }))
}

export type RuleSuggestionKind = "manual-consistency" | "uncategorized-time"

export interface RuleSuggestion {
  kind: RuleSuggestionKind
  channel: string
  /** suggested target category (null = user must pick) */
  categoryId: string | null
  /** human-readable evidence */
  evidence: string
  uncategorizedSeconds: number
}

/**
 * Suggest channel rules from behavior:
 *  1. manual-consistency — the user manually put ≥2 videos of a channel into
 *     the same category → suggest making it a channel rule
 *  2. uncategorized-time — channels with the most uncategorized watch time
 *     (≥3 videos or ≥30 min) → suggest categorizing them
 */
export function suggestChannelRules(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
  subcategories?: Subcategory[]
  from?: string | null
  limit?: number
}): RuleSuggestion[] {
  const agg = aggregateRange({
    videos: params.videos,
    events: params.events,
    categories: params.categories,
    subcategories: params.subcategories,
    from: params.from ?? null
  })
  const out: RuleSuggestion[] = []
  const suggested = new Set<string>()

  // 1) manual consistency
  const pairs = new Map<string, { channel: string; categoryId: string; count: number; seconds: number }>()
  for (const row of agg.rows) {
    const cat = row.video.categoryOverride
    if (cat == null) continue
    const ch = row.video.channel || "(unknown)"
    if (!ch) continue
    const key = `${ch.toLowerCase()}||${cat}`
    const cur = pairs.get(key) ?? { channel: ch, categoryId: cat, count: 0, seconds: 0 }
    cur.count++
    cur.seconds += row.estimatedSeconds ?? 0
    pairs.set(key, cur)
  }
  for (const p of [...pairs.values()].sort((a, b) => b.seconds - a.seconds)) {
    if (p.count < 2) continue
    out.push({
      kind: "manual-consistency",
      channel: p.channel,
      categoryId: p.categoryId,
      evidence: `${p.count} videos manually categorized the same way`,
      uncategorizedSeconds: 0
    })
    suggested.add(p.channel.toLowerCase())
    if (out.length >= (params.limit ?? 6)) return out
  }

  // 2) uncategorized time per channel
  const byChannel = new Map<string, { seconds: number; count: number }>()
  for (const row of agg.rows) {
    if (row.categoryId != null || row.estimatedSeconds == null) continue
    const ch = row.video.channel || "(unknown)"
    if (!ch) continue
    const cur = byChannel.get(ch) ?? { seconds: 0, count: 0 }
    cur.seconds += row.estimatedSeconds
    cur.count++
    byChannel.set(ch, cur)
  }
  for (const c of [...byChannel.entries()].sort((a, b) => b[1].seconds - a[1].seconds)) {
    if (c[1].count < 3 && c[1].seconds < 1800) continue
    if (suggested.has(c[0].toLowerCase())) continue
    out.push({
      kind: "uncategorized-time",
      channel: c[0],
      categoryId: null,
      evidence: `${c[1].count} uncategorized video(s)`,
      uncategorizedSeconds: c[1].seconds
    })
    if (out.length >= (params.limit ?? 6)) break
  }
  return out
}
