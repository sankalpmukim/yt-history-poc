/**
 * Weekly time budgets (pure). A budget is seconds-per-week per category;
 * the week runs Monday 00:00 local. The service worker materializes a
 * BudgetStatus snapshot into yl.v2.budgetStatus whenever the underlying
 * data changes, so consumers (the on-YouTube guard) never aggregate events
 * themselves.
 */

import type { Category, Subcategory, VideoRecord, WatchEvent } from "./types"
import { estimateEventSeconds } from "./estimate"
import { effectiveCategoryId } from "./rules"
import { topLevelCategoryId } from "./taxonomy"

export interface BudgetStatusEntry {
  categoryId: string
  budgetSec: number
  spentSec: number
  over: boolean
  /** spent − budget; negative while under */
  deltaSec: number
}

export interface BudgetStatus {
  /** Monday the week started on (yyyy-mm-dd, inclusive) */
  weekStart: string
  /** next Monday (yyyy-mm-dd, exclusive) */
  weekEnd: string
  computedAt: string
  /** only categories with a budget set (budgetSec > 0) */
  entries: BudgetStatusEntry[]
  /** this week's estimated seconds for EVERY category (incl. unbudgeted) */
  spentByCategory: Record<string, number>
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Monday 00:00 local of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const shift = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - shift)
  return d
}

export function computeBudgetStatus(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
  subcategories?: Subcategory[]
  budgetsWeekly: Record<string, number>
  now: Date
}): BudgetStatus {
  const weekStartDate = startOfWeek(params.now)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekEndDate.getDate() + 7)
  const weekStart = keyOf(weekStartDate)
  const weekEnd = keyOf(weekEndDate)

  const topLevelIds = new Set(params.categories.map((category) => category.id))
  const budgeted = new Set(
    Object.entries(params.budgetsWeekly)
      .filter(([id, sec]) => topLevelIds.has(id) && typeof sec === "number" && sec > 0)
      .map(([id]) => id)
  )
  const spent = new Map<string, number>()
  for (const event of params.events) {
    if (event.watchedOn < weekStart || event.watchedOn >= weekEnd) continue
    const video = params.videos[event.videoId]
    if (!video) continue
    const cat = topLevelCategoryId(
      effectiveCategoryId(video),
      params.categories,
      params.subcategories ?? []
    )
    if (cat == null) continue
    const est = estimateEventSeconds(event, video)
    if (est.seconds == null) continue
    spent.set(cat, (spent.get(cat) ?? 0) + est.seconds)
  }

  const entries: BudgetStatusEntry[] = [...budgeted]
    .map((categoryId) => {
      const budgetSec = params.budgetsWeekly[categoryId] ?? 0
      const spentSec = Math.round(spent.get(categoryId) ?? 0)
      const deltaSec = spentSec - budgetSec
      return { categoryId, budgetSec, spentSec, deltaSec, over: deltaSec > 0 }
    })
    .sort((a, b) => b.deltaSec - a.deltaSec)

  return {
    weekStart,
    weekEnd,
    computedAt: params.now.toISOString(),
    entries,
    spentByCategory: Object.fromEntries(spent)
  }
}

/** True when at least one budgeted category is over budget. */
export function anyOverBudget(status: BudgetStatus | null | undefined): boolean {
  return !!status?.entries.some((e) => e.over)
}

export function overBudgetCategories(status: BudgetStatus | null | undefined): Set<string> {
  return new Set((status?.entries ?? []).filter((e) => e.over).map((e) => e.categoryId))
}
