/**
 * Signals (pure): behavioral insights computed from the ledger, for every
 * screen. One engine, deterministic and unit-tested, so the dashboard, the
 * YouTube overlays and exports all tell the same story:
 *
 *   - periodCompare / categoryDeltas — this range vs the one before it
 *   - heavyDays                     — binge days vs your personal norm
 *   - ladderThirds / valueMix       — value by ladder POSITION (not the
 *                                     legacy 0–5 score), archived rows excluded
 *   - completionByCategory          — what you finish vs abandon
 *   - duplicateOverrides            — manual picks that redo a channel rule
 *   - channelConcentration          — how few channels carry the time
 *   - rewatchLeaders                — videos returning across days
 *   - weeklyAveragesByCategory      — actual hours/week → budget suggestions
 *   - setupHygiene                  — dead rules, unused subs, empty categories
 *
 * Everything is day-granular (YouTube history records only the day).
 */

import type { Category, Rule, Subcategory, VideoRecord, WatchEvent } from "./types"
import { aggregateRange, type Aggregate } from "./aggregate"
import { estimateEventSeconds } from "./estimate"

/* ------------------------------------------------------------------ */
/* small pure helpers                                                  */
/* ------------------------------------------------------------------ */

/** "3h 47m" style duration, same rules as the dashboard's fmtDur. */
export function fmtDurSec(seconds: number | null | undefined): string {
  if (seconds == null) return "—"
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Shift a yyyy-mm-dd key by n days (n may be negative), in local time. */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number)
  const date = new Date(y, m - 1, d + n)
  return todayKey(date)
}

/** Roll a target id (category or subcategory) up to its parent category. */
function topCategoryIdOf(
  targetId: string | null | undefined,
  subcategories: Subcategory[]
): string | null {
  if (targetId == null) return null
  return subcategories.find((s) => s.id === targetId)?.parentId ?? targetId
}

/* ------------------------------------------------------------------ */
/* the context every signal reads                                      */
/* ------------------------------------------------------------------ */

export interface SignalContext {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
  subcategories: Subcategory[]
  rules: Rule[]
  /** current weekly budgets, to know where suggestions would be new */
  budgetsWeekly?: Record<string, number>
  now?: Date
}

/** Full-span aggregate (cached by callers, computed here when needed). */
function aggregateAll(ctx: SignalContext): Aggregate {
  return aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from: null
  })
}

/* ------------------------------------------------------------------ */
/* 1. period over period                                               */
/* ------------------------------------------------------------------ */

export interface CategoryDelta {
  categoryId: string | null
  currentSec: number
  previousSec: number
  deltaSec: number
}

export interface PeriodCompare {
  days: number
  from: string
  to: string
  prevFrom: string
  prevTo: string
  currentSec: number
  previousSec: number
  deltaSec: number
  deltaPct: number | null
  byCategory: CategoryDelta[]
  /** risers and fallers, biggest absolute change first */
  risers: CategoryDelta[]
  fallers: CategoryDelta[]
}

/** Compare the last `days` days with the `days` before that. */
export function periodCompare(
  ctx: SignalContext,
  days: number,
  now: Date = new Date()
): PeriodCompare {
  const to = todayKey(now)
  const from = shiftDayKey(to, -(days - 1))
  const prevTo = shiftDayKey(from, -1)
  const prevFrom = shiftDayKey(prevTo, -(days - 1))
  const current = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from,
    to
  })
  const previous = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from: prevFrom,
    to: prevTo
  })
  const curByCat = new Map(current.byCategory.map((c) => [c.categoryId ?? "none", c.seconds]))
  const prevByCat = new Map(previous.byCategory.map((c) => [c.categoryId ?? "none", c.seconds]))
  const byCategory: CategoryDelta[] = []
  for (const [key, currentSec] of curByCat) {
    const previousSec = prevByCat.get(key) ?? 0
    byCategory.push({
      categoryId: key === "none" ? null : key,
      currentSec,
      previousSec,
      deltaSec: currentSec - previousSec
    })
  }
  for (const [key, previousSec] of prevByCat) {
    if (!curByCat.has(key)) {
      byCategory.push({ categoryId: key === "none" ? null : key, currentSec: 0, previousSec, deltaSec: -previousSec })
    }
  }
  const deltaSec = current.totalSeconds - previous.totalSeconds
  const changed = [...byCategory].filter((d) => d.deltaSec !== 0)
  return {
    days,
    from,
    to,
    prevFrom,
    prevTo,
    currentSec: current.totalSeconds,
    previousSec: previous.totalSeconds,
    deltaSec,
    deltaPct: previous.totalSeconds > 0 ? deltaSec / previous.totalSeconds : null,
    byCategory,
    risers: changed.filter((d) => d.deltaSec > 0).sort((a, b) => b.deltaSec - a.deltaSec),
    fallers: changed.filter((d) => d.deltaSec < 0).sort((a, b) => a.deltaSec - b.deltaSec)
  }
}

/* ------------------------------------------------------------------ */
/* 2. heavy days vs personal norm                                      */
/* ------------------------------------------------------------------ */

export interface HeavyDay {
  date: string
  seconds: number
  /** seconds / normSec */
  multiple: number
}

export interface HeavyDaysResult {
  /** mean seconds across days you actually watched */
  normSec: number
  activeDays: number
  heaviest: HeavyDay | null
  heavy: HeavyDay[]
}

/**
 * Days above `factor` × your mean active-day watch time. The norm uses
 * active days only, so a week off doesn't fake a binge the day you return.
 */
export function heavyDays(ctx: SignalContext, factor = 1.5, from: string | null = null): HeavyDaysResult {
  const agg = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from
  })
  const days = agg.byDay
  if (days.length === 0) return { normSec: 0, activeDays: 0, heaviest: null, heavy: [] }
  const total = days.reduce((a, d) => a + d.seconds, 0)
  const normSec = total / days.length
  const withMultiple = days
    .map((d) => ({ date: d.date, seconds: d.seconds, multiple: d.seconds / normSec }))
    .sort((a, b) => b.seconds - a.seconds)
  const heavy = withMultiple
    .filter((d) => d.multiple >= factor)
    .sort((a, b) => b.multiple - a.multiple)
  return { normSec, activeDays: days.length, heaviest: withMultiple[0] ?? null, heavy }
}

/* ------------------------------------------------------------------ */
/* 3. value mix by ladder position                                     */
/* ------------------------------------------------------------------ */

export interface LadderThirds {
  /** live categories, highest value first */
  ordered: Category[]
  top: Set<string>
  bottom: Set<string>
}

/**
 * Split the LIVE ladder into thirds by position. Archived categories keep
 * their history but no longer define value. ceil(n/3) rows per band.
 */
export function ladderThirds(ctx: SignalContext): LadderThirds {
  const ordered = [...ctx.categories]
    .filter((c) => !c.archivedAt)
    .sort((a, b) => a.order - b.order)
  const band = Math.max(1, Math.ceil(ordered.length / 3))
  return {
    ordered,
    top: new Set(ordered.slice(0, band).map((c) => c.id)),
    bottom: new Set(ordered.slice(Math.max(0, ordered.length - band)).map((c) => c.id))
  }
}

export interface ValueMix {
  categorizedSec: number
  topSec: number
  bottomSec: number
  topShare: number | null
  bottomShare: number | null
  /** worst offender among bottom-third categories (seconds), if any */
  worstBottom: { categoryId: string; seconds: number } | null
}

/** Share of categorized time in the top vs bottom third of the ladder. */
export function valueMix(ctx: SignalContext, from: string | null = null): ValueMix {
  const { top, bottom } = ladderThirds(ctx)
  const agg = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from
  })
  let categorizedSec = 0
  let topSec = 0
  let bottomSec = 0
  let worstBottom: { categoryId: string; seconds: number } | null = null
  for (const row of agg.byCategory) {
    const id = row.categoryId
    if (id == null) continue
    categorizedSec += row.seconds
    if (top.has(id)) topSec += row.seconds
    if (bottom.has(id)) {
      bottomSec += row.seconds
      if (!worstBottom || row.seconds > worstBottom.seconds) worstBottom = { categoryId: id, seconds: row.seconds }
    }
  }
  return {
    categorizedSec,
    topSec,
    bottomSec,
    topShare: categorizedSec > 0 ? topSec / categorizedSec : null,
    bottomShare: categorizedSec > 0 ? bottomSec / categorizedSec : null,
    worstBottom
  }
}

/* ------------------------------------------------------------------ */
/* 4. completion / abandonment                                         */
/* ------------------------------------------------------------------ */

export interface CompletionStat {
  categoryId: string
  started: number
  finished: number
  /** finished / started; null when nothing started */
  finishRate: number | null
  abandoned: number
  abandonRate: number | null
  /** estimated seconds in watches abandoned under 25% */
  abandonedSec: number
}

/**
 * Finished = progress ≥ 96% (or no progress bar, assumed watched through).
 * Abandoned = progress < 25%. Progress is YouTube's latest resume point.
 */
export function completionByCategory(ctx: SignalContext, from: string | null = null): CompletionStat[] {
  const map = new Map<string, CompletionStat>()
  for (const event of ctx.events) {
    if (from && event.watchedOn < from) continue
    const video = ctx.videos[event.videoId]
    if (!video) continue
    const top = topCategoryIdOf(
      video.categoryOverride ?? video.autoCategoryId,
      ctx.subcategories
    )
    if (top == null) continue
    const stat =
      map.get(top) ??
      ({ categoryId: top, started: 0, finished: 0, finishRate: null, abandoned: 0, abandonRate: null, abandonedSec: 0 } as CompletionStat)
    stat.started++
    const pct = event.progressPct
    const finished = pct == null || pct >= 96
    const abandoned = pct != null && pct < 25
    if (finished) stat.finished++
    if (abandoned) {
      stat.abandoned++
      stat.abandonedSec += estimateEventSeconds(event, video).seconds ?? 0
    }
    map.set(top, stat)
  }
  const out = [...map.values()]
  for (const stat of out) {
    stat.finishRate = stat.started > 0 ? stat.finished / stat.started : null
    stat.abandonRate = stat.started > 0 ? stat.abandoned / stat.started : null
  }
  return out.sort((a, b) => b.started - a.started)
}

/* ------------------------------------------------------------------ */
/* 5. duplicate manual work                                            */
/* ------------------------------------------------------------------ */

export interface DuplicateOverrides {
  /** overrides whose target is the SAME as the channel rule's target */
  redundant: VideoRecord[]
  /** overrides whose channel rule points somewhere else (manual wins) */
  conflicting: VideoRecord[]
  channels: Set<string>
}

/** Manual overrides that redo (or fight) an existing channelEquals rule. */
export function duplicateOverrides(ctx: SignalContext): DuplicateOverrides {
  const ruleByChannel = new Map<string, Rule>()
  for (const rule of ctx.rules) {
    if (!rule.enabled || !rule.match.channelEquals) continue
    ruleByChannel.set(rule.match.channelEquals.trim().toLowerCase(), rule)
  }
  const redundant: VideoRecord[] = []
  const conflicting: VideoRecord[] = []
  const channels = new Set<string>()
  for (const video of Object.values(ctx.videos)) {
    if (video.categoryOverride == null) continue
    const rule = ruleByChannel.get((video.channel ?? "").trim().toLowerCase())
    if (!rule) continue
    if (rule.categoryId === video.categoryOverride) redundant.push(video)
    else conflicting.push(video)
    channels.add(video.channel)
  }
  return { redundant, conflicting, channels }
}

/* ------------------------------------------------------------------ */
/* 6. channel concentration                                            */
/* ------------------------------------------------------------------ */

export interface Concentration {
  distinctChannels: number
  totalSec: number
  top5Share: number | null
  top10Share: number | null
  top: Array<{ channel: string; seconds: number; share: number }>
}

/** How much of the time sits in the biggest channels. */
export function channelConcentration(ctx: SignalContext, from: string | null = null, limit = 10): Concentration {
  const agg = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from
  })
  const byChannel = new Map<string, number>()
  for (const row of agg.rows) {
    const ch = row.video.channel || "(unknown channel)"
    byChannel.set(ch, (byChannel.get(ch) ?? 0) + (row.estimatedSeconds ?? 0))
  }
  const totalSec = [...byChannel.values()].reduce((a, b) => a + b, 0)
  const sorted = [...byChannel.entries()].sort((a, b) => b[1] - a[1])
  const sum = (n: number) => sorted.slice(0, n).reduce((a, x) => a + x[1], 0)
  return {
    distinctChannels: sorted.length,
    totalSec,
    top5Share: totalSec > 0 ? sum(5) / totalSec : null,
    top10Share: totalSec > 0 ? sum(10) / totalSec : null,
    top: sorted.slice(0, limit).map(([channel, seconds]) => ({ channel, seconds, share: totalSec > 0 ? seconds / totalSec : 0 }))
  }
}

/* ------------------------------------------------------------------ */
/* 7. rewatches                                                        */
/* ------------------------------------------------------------------ */

export interface RewatchEntry {
  videoId: string
  days: string[]
  seconds: number
}

/** Videos watched on more than one day, most days first. */
export function rewatchLeaders(ctx: SignalContext, from: string | null = null, limit = 5): RewatchEntry[] {
  const byVideo = new Map<string, Set<string>>()
  const rows = aggregateRange({
    videos: ctx.videos,
    events: ctx.events,
    categories: ctx.categories,
    subcategories: ctx.subcategories,
    from
  }).rows
  for (const row of rows) {
    const set = byVideo.get(row.video.videoId) ?? new Set<string>()
    set.add(row.event.watchedOn)
    byVideo.set(row.video.videoId, set)
  }
  const out: RewatchEntry[] = []
  for (const [videoId, days] of byVideo) {
    if (days.size <= 1) continue
    const seconds = rows
      .filter((r) => r.video.videoId === videoId)
      .reduce((a, r) => a + (r.estimatedSeconds ?? 0), 0)
    out.push({ videoId, days: [...days].sort(), seconds })
  }
  return out.sort((a, b) => b.days.length - a.days.length || b.seconds - a.seconds).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* 8. budget suggestions from actuals                                  */
/* ------------------------------------------------------------------ */

export interface WeeklyAverage {
  categoryId: string
  secondsPerWeek: number
}

/**
 * Average seconds/week per top-level category over the last `weeks` weeks,
 * counting only weeks with any watch time (so a quiet week doesn't drag the
 * suggestion toward zero).
 */
export function weeklyAveragesByCategory(ctx: SignalContext, weeks = 4, now: Date = new Date()): WeeklyAverage[] {
  const to = todayKey(now)
  const from = shiftDayKey(to, -(weeks * 7 - 1))
  const perWeek = new Map<string, Map<string, number>>() // weekStart -> cat -> sec
  let weeksActive = new Set<string>()
  for (const event of ctx.events) {
    if (event.watchedOn < from || event.watchedOn > to) continue
    const video = ctx.videos[event.videoId]
    if (!video) continue
    const top = topCategoryIdOf(video.categoryOverride ?? video.autoCategoryId, ctx.subcategories)
    if (top == null) continue
    const weekStart = shiftDayKey(event.watchedOn, -((new Date(event.watchedOn + "T12:00:00").getDay() + 6) % 7))
    const week = perWeek.get(weekStart) ?? new Map<string, number>()
    week.set(top, (week.get(top) ?? 0) + (estimateEventSeconds(event, video).seconds ?? 0))
    perWeek.set(weekStart, week)
    weeksActive.add(weekStart)
  }
  if (weeksActive.size === 0) return []
  const totals = new Map<string, number>()
  for (const week of perWeek.values()) {
    for (const [cat, sec] of week) totals.set(cat, (totals.get(cat) ?? 0) + sec)
  }
  return [...totals.entries()]
    .map(([categoryId, sec]) => ({ categoryId, secondsPerWeek: sec / weeksActive.size }))
    .sort((a, b) => b.secondsPerWeek - a.secondsPerWeek)
}

/* ------------------------------------------------------------------ */
/* 9. setup hygiene                                                    */
/* ------------------------------------------------------------------ */

export interface SetupHygiene {
  /** enabled rules that never matched anything and are older than 14 days */
  deadRules: Rule[]
  /** live subcategories no video or rule points at */
  unusedSubcategories: Subcategory[]
  /** live categories with no watch time, no rules and no subcategories */
  emptyCategories: Category[]
  /** live categories with no watch time */
  quietCategories: Category[]
}

export function setupHygiene(ctx: SignalContext, now: Date = new Date()): SetupHygiene {
  const deadRules = ctx.rules.filter((rule) => {
    if (!rule.enabled || rule.hitCount > 0) return false
    const created = new Date(rule.createdAt).getTime()
    return Number.isFinite(created) && now.getTime() - created > 14 * 86400000
  })
  const usedTargets = new Set<string>()
  for (const video of Object.values(ctx.videos)) {
    if (video.categoryOverride) usedTargets.add(video.categoryOverride)
    if (video.autoCategoryId) usedTargets.add(video.autoCategoryId)
  }
  for (const rule of ctx.rules) usedTargets.add(rule.categoryId)
  const unusedSubcategories = ctx.subcategories.filter(
    (sub) => !sub.archivedAt && !usedTargets.has(sub.id)
  )
  const agg = aggregateAll(ctx)
  const secondsByCategory = new Map(agg.byCategory.map((c) => [c.categoryId ?? "", c.seconds]))
  const liveCats = ctx.categories.filter((c) => !c.archivedAt)
  const quietCategories = liveCats.filter((c) => (secondsByCategory.get(c.id) ?? 0) === 0)
  const emptyCategories = quietCategories.filter(
    (c) =>
      !ctx.rules.some((r) => r.categoryId === c.id) &&
      !ctx.subcategories.some((s) => s.parentId === c.id && !s.archivedAt)
  )
  return { deadRules, unusedSubcategories, emptyCategories, quietCategories }
}

/* ------------------------------------------------------------------ */
/* the assembled signal cards                                          */
/* ------------------------------------------------------------------ */

export type SignalSeverity = "good" | "info" | "watch" | "warn"

export interface Signal {
  kind:
    | "period-compare"
    | "heavy-days"
    | "value-mix"
    | "completion"
    | "duplicate-overrides"
    | "concentration"
    | "rewatch"
    | "budget-suggest"
    | "hygiene"
  title: string
  body: string
  severity: SignalSeverity
  /** higher = more important; cards sort descending */
  score: number
  /** small pre-formatted facts for quick scanning */
  evidence: Array<{ label: string; value: string }>
}

function categoryName(ctx: SignalContext, id: string | null): string {
  if (id == null) return "Uncategorized"
  return ctx.categories.find((c) => c.id === id)?.name ?? id
}

/**
 * Compute the full ranked set of signal cards. Signals self-suppress when
 * the data can't support them (too few days, nothing to compare…).
 */
export function computeSignals(ctx: SignalContext, now: Date = new Date()): Signal[] {
  const out: Signal[] = []
  const agg = aggregateAll(ctx)
  const activeDays = agg.byDay.length
  const catName = (id: string | null) => categoryName(ctx, id)

  // period comparison — needs two comparable windows with data
  const compare = periodCompare(ctx, 7, now)
  if (compare.previousSec > 0 && compare.currentSec > 0 && activeDays >= 4) {
    const pct = compare.deltaPct == null ? "" : ` (${compare.deltaSec >= 0 ? "+" : "−"}${Math.abs(Math.round(compare.deltaPct * 100))}%)`
    const riser = compare.risers[0]
    const faller = compare.fallers[0]
    out.push({
      kind: "period-compare",
      title: "This week vs last week",
      body:
        `${fmtDurSec(compare.currentSec)} watched in the last 7 days vs ${fmtDurSec(compare.previousSec)} the week before${pct}.` +
        (riser ? ` Biggest riser: ${catName(riser.categoryId)}, ${fmtDurSec(Math.abs(riser.deltaSec))} more.` : "") +
        (faller ? ` Biggest drop: ${catName(faller.categoryId)}, ${fmtDurSec(Math.abs(faller.deltaSec))} less.` : ""),
      severity: compare.deltaPct != null && compare.deltaPct > 0.25 ? "warn" : compare.deltaPct != null && compare.deltaPct < -0.1 ? "good" : "info",
      score: 100,
      evidence: compare.byCategory
        .filter((d) => d.deltaSec !== 0)
        .sort((a, b) => Math.abs(b.deltaSec) - Math.abs(a.deltaSec))
        .slice(0, 4)
        .map((d) => ({
          label: catName(d.categoryId),
          value: `${d.deltaSec >= 0 ? "+" : "−"}${fmtDurSec(Math.abs(d.deltaSec))}`
        }))
    })
  }

  // value mix — needs categorized time and ≥2 live categories
  const mix = valueMix(ctx)
  const thirds = ladderThirds(ctx)
  if (mix.categorizedSec > 0 && thirds.ordered.length >= 2 && activeDays >= 4) {
    const bottomPct = mix.bottomShare == null ? 0 : Math.round(mix.bottomShare * 100)
    const topPct = mix.topShare == null ? 0 : Math.round(mix.topShare * 100)
    const worstName = mix.worstBottom ? catName(mix.worstBottom.categoryId) : null
    out.push({
      kind: "value-mix",
      title: "Value mix",
      body:
        `${topPct}% of your categorized time went to the top of your ladder, ${bottomPct}% to the bottom third` +
        (worstName && bottomPct > 0 ? ` — mostly ${worstName}` : "") +
        ".",
      severity: bottomPct >= 30 ? "warn" : bottomPct <= 10 ? "good" : "info",
      score: 90,
      evidence: [
        { label: "Top third", value: `${topPct}%` },
        { label: "Bottom third", value: `${bottomPct}%` },
        { label: "Categorized", value: fmtDurSec(mix.categorizedSec) }
      ]
    })
  }

  // heavy days — needs a meaningful history
  const heavy = heavyDays(ctx)
  if (activeDays >= 6 && heavy.heavy.length > 0 && heavy.heaviest) {
    const worst = heavy.heavy[0]
    out.push({
      kind: "heavy-days",
      title: "Heavy days",
      body:
        `${heavy.heavy.length} ${heavy.heavy.length === 1 ? "day" : "days"} ran well past your ${fmtDurSec(heavy.normSec)}-per-day norm. ` +
        `The heaviest was ${worst.date} at ${fmtDurSec(worst.seconds)} (${worst.multiple.toFixed(1)}× your usual).`,
      severity: "watch",
      score: 80,
      evidence: heavy.heavy
        .slice(0, 4)
        .map((d) => ({ label: d.date.slice(5), value: `${fmtDurSec(d.seconds)} · ${d.multiple.toFixed(1)}×` }))
    })
  }

  // completion — needs enough watches to mean anything
  const completion = completionByCategory(ctx)
  const completionVolume = completion.reduce((a, c) => a + c.started, 0)
  if (completionVolume >= 25) {
    const worst = [...completion]
      .filter((c) => c.started >= 5)
      .sort((a, b) => (a.finishRate ?? 1) - (b.finishRate ?? 1))[0]
    const finished = completion.reduce((a, c) => a + c.finished, 0)
    out.push({
      kind: "completion",
      title: "What you finish",
      body: worst
        ? `You finish ${Math.round((finished / completionVolume) * 100)}% of what you start. ${catName(worst.categoryId)} is your weakest: you finish only ${Math.round((worst.finishRate ?? 0) * 100)}% of it and abandon ${Math.round((worst.abandonRate ?? 0) * 100)}%.`
        : `You finish ${Math.round((finished / completionVolume) * 100)}% of what you start.`,
      severity: worst && (worst.abandonRate ?? 0) >= 0.2 ? "watch" : "info",
      score: 70,
      evidence: completion
        .filter((c) => c.started >= 5)
        .slice(0, 4)
        .map((c) => ({ label: catName(c.categoryId), value: `${Math.round((c.finishRate ?? 0) * 100)}% finished` }))
    })
  }

  // duplicate manual work
  const dupes = duplicateOverrides(ctx)
  if (dupes.redundant.length + dupes.conflicting.length >= 3) {
    out.push({
      kind: "duplicate-overrides",
      title: "Redone work",
      body:
        `${dupes.redundant.length} of your manual ${dupes.redundant.length + dupes.conflicting.length === 1 ? "pick" : "picks"} ${dupes.redundant.length === 1 ? "matches" : "match"} a channel rule that already does the same thing` +
        (dupes.conflicting.length > 0 ? `, and ${dupes.conflicting.length} ${dupes.conflicting.length === 1 ? "fights" : "fight"} one` : "") +
        ". Clearing the duplicates changes nothing — the rules take over.",
      severity: dupes.conflicting.length > 0 ? "watch" : "info",
      score: 85,
      evidence: [
        { label: "Duplicate picks", value: String(dupes.redundant.length) },
        { label: "Channels involved", value: String(dupes.channels.size) },
        ...(dupes.conflicting.length > 0 ? [{ label: "Conflicting", value: String(dupes.conflicting.length) }] : [])
      ]
    })
  }

  // concentration
  const conc = channelConcentration(ctx)
  if (conc.distinctChannels >= 8) {
    const top1 = conc.top[0]
    out.push({
      kind: "concentration",
      title: "Where it concentrates",
      body: `Your top 10 of ${conc.distinctChannels} channels carry ${Math.round((conc.top10Share ?? 0) * 100)}% of all watch time${top1 ? `; ${top1.channel} alone is ${Math.round(top1.share * 100)}%` : ""}.`,
      severity: (conc.top10Share ?? 0) >= 0.6 ? "info" : "info",
      score: 55,
      evidence: conc.top.slice(0, 3).map((t) => ({ label: t.channel, value: `${Math.round(t.share * 100)}% · ${fmtDurSec(t.seconds)}` }))
    })
  }

  // rewatches
  const rewatches = rewatchLeaders(ctx)
  if (rewatches.length > 0) {
    const top = rewatches[0]
    const video = ctx.videos[top.videoId]
    out.push({
      kind: "rewatch",
      title: "Coming back",
      body: `${rewatches.length} ${rewatches.length === 1 ? "video" : "videos"} pulled you back on more than one day. ${video ? `${video.channel}'s “${video.title.slice(0, 48)}${video.title.length > 48 ? "…" : ""}” returned on ${top.days.length} days.` : ""}`,
      severity: "info",
      score: 45,
      evidence: rewatches.slice(0, 3).map((r) => {
        const v = ctx.videos[r.videoId]
        return { label: v ? v.channel : r.videoId, value: `${r.days.length} days · ${fmtDurSec(r.seconds)}` }
      })
    })
  }

  // budget suggestions
  const budgetsWeekly = ctx.budgetsWeekly ?? {}
  const unbudgeted = weeklyAveragesByCategory(ctx, 4, now).filter(
    (avg) => avg.secondsPerWeek >= 1800 && !budgetsWeekly[avg.categoryId]
  )
  if (unbudgeted.length > 0 && activeDays >= 10) {
    const first = unbudgeted[0]
    out.push({
      kind: "budget-suggest",
      title: "Budget-worthy categories",
      body: `${unbudgeted.length} ${unbudgeted.length === 1 ? "category averages" : "categories average"} over 30 minutes a week with no budget set. ${catName(first.categoryId)} averages ${fmtDurSec(first.secondsPerWeek)} a week.`,
      severity: "info",
      score: 50,
      evidence: unbudgeted.slice(0, 4).map((u) => ({ label: catName(u.categoryId), value: `${fmtDurSec(u.secondsPerWeek)}/wk` }))
    })
  }

  // hygiene
  const hygiene = setupHygiene(ctx, now)
  const hygieneItems =
    hygiene.deadRules.length + hygiene.unusedSubcategories.length + hygiene.quietCategories.length
  if (hygieneItems >= 3) {
    out.push({
      kind: "hygiene",
      title: "Setup to tidy",
      body: `${hygiene.deadRules.length} ${hygiene.deadRules.length === 1 ? "rule" : "rules"} never matched a video, ${hygiene.unusedSubcategories.length} ${hygiene.unusedSubcategories.length === 1 ? "subcategory" : "subcategories"} are unused and ${hygiene.quietCategories.length} ${hygiene.quietCategories.length === 1 ? "category has" : "categories have"} no watch time.`,
      severity: "info",
      score: 30,
      evidence: [
        ...(hygiene.deadRules.length ? [{ label: "Never-matched rules", value: String(hygiene.deadRules.length) }] : []),
        ...(hygiene.unusedSubcategories.length ? [{ label: "Unused subcategories", value: String(hygiene.unusedSubcategories.length) }] : []),
        ...(hygiene.quietCategories.length ? [{ label: "Quiet categories", value: String(hygiene.quietCategories.length) }] : [])
      ]
    })
  }

  return out.sort((a, b) => b.score - a.score)
}
