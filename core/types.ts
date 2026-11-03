/**
 * YT Ledger v2 data model: pure types + storage key helpers.
 * No chrome.* dependencies — these modules run in the service worker, the
 * dashboard, content scripts, and node unit tests alike.
 */

export type ValueScore = 0 | 1 | 2 | 3 | 4 | 5
export type BudgetMode = "off" | "gentle" | "strict"
export type DurationSource = "overlay" | "legacy" | "watch-page"

export interface Category {
  id: string
  name: string
  emoji: string
  color: string
  /** Internal derived score for legacy calculations and backup compatibility. */
  valueScore: ValueScore
  /** Visible ladder position, highest-value first. */
  order: number
  archivedAt?: string
}

/** Child of a top-level category. Ids are unique across categories + subs. */
export interface Subcategory {
  id: string
  parentId: string
  name: string
  emoji: string
  /** Optional per-subcategory accent; older backups inherit the parent color. */
  color?: string
  order: number
  archivedAt?: string
}

export interface RuleMatch {
  /** exact channel name, case-insensitive */
  channelEquals?: string
  /** substring of channel name, case-insensitive */
  channelContains?: string
  /** any-of substrings of the title, case-insensitive */
  titleContains?: string[]
  /** regex source against the title (pair with titleRegexFlags) */
  titleRegex?: string
  titleRegexFlags?: string
  isShort?: boolean
  maxDurationSec?: number
}

export interface Rule {
  id: string
  name: string
  enabled: boolean
  /** lower wins; first match wins */
  priority: number
  match: RuleMatch
  /** assignment target: a live category id OR subcategory id */
  categoryId: string
  createdAt: string
  updatedAt: string
  hitCount: number
  lastHitAt?: string
}

export interface VideoRecord {
  videoId: string
  title: string
  channel: string
  url: string
  durationSec: number | null
  durationSource: DurationSource | null
  isShort: boolean | null
  /** manual assignment (category or subcategory id) — always wins over rules */
  categoryOverride: string | null
  /** last rule result (category or subcategory id) */
  autoCategoryId: string | null
  appliedRuleId: string | null
  firstSeenAt: string
  lastSeenAt: string
}

export interface WatchEvent {
  /** `${videoId}|${watchedOn}` */
  key: string
  videoId: string
  /** local calendar day the watch happened on: yyyy-mm-dd */
  watchedOn: string
  /** latest resume point % (first item in feed order = newest); null = no bar */
  progressPct: number | null
  /** average progress % across occurrences (estimation); null if all unknown */
  progressAvgPct: number | null
  /** repeats of this video within that day (latest fetched count) */
  occurrences: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface Settings {
  /** default 365; null = keep forever */
  retentionDays: number | null
  /** lookback for automatic syncs; manual syncs may override per-run */
  fetchWindowDays: number
  budgetMode: BudgetMode
  /** categoryId -> seconds per week */
  budgetsWeekly: Record<string, number>
  debugOverlay: boolean
  devRelay: boolean
  onboardedAt: string | null
}

export interface SyncDiagnostics {
  sections: number
  items: number
  skippedItems: number
  unresolvedDayLabels: string[]
  newVideos: number
  updatedVideos: number
  newEvents: number
  updatedEvents: number
}

export interface MetaState {
  version: 2
  settings: Settings
  installedAt: string
  lastSyncedAt: string | null
  lastSyncStatus: string
  lastSyncDiagnostics: SyncDiagnostics | null
}

/* ------------------------------------------------------------------ */
/* storage keys                                                        */
/* ------------------------------------------------------------------ */

export const EVENTS_KEY_PREFIX = "yl.v2.events."

export const KEYS = {
  meta: "yl.v2.meta",
  videos: "yl.v2.videos",
  categories: "yl.v2.categories",
  subcategories: "yl.v2.subcategories",
  rules: "yl.v2.rules",
  durationQueue: "yl.v2.durationQueue",
  durationAttempts: "yl.v2.durationAttempts",
  budgetStatus: "yl.v2.budgetStatus",
  syncState: "yl.v2.syncState"
} as const

/** storage key for a monthly event shard; month = "YYYY-MM" */
export function eventsKey(month: string): string {
  return EVENTS_KEY_PREFIX + month
}

export function isEventsKey(key: string): boolean {
  return key.startsWith(EVENTS_KEY_PREFIX)
}

export function eventKeyOf(videoId: string, watchedOn: string): string {
  return `${videoId}|${watchedOn}`
}

export function monthOf(watchedOn: string): string {
  return watchedOn.slice(0, 7)
}

/** local-time yyyy-mm-dd for a Date */
export function dateKeyOf(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
