/**
 * Shared types + constants for the YT History POC.
 * Used by both the MAIN-world fetcher and the isolated-world sync script
 * (each content script is bundled separately, so this module gets inlined twice).
 */

export const STORAGE_KEY = "ytHistoryPoc.v1"

/** The window we care about: Today + Yesterday. */
export const MAX_DAYS = 2

/** Retention for cached entries: never keep anything first seen more than 48h ago. */
export const RETENTION_MS = 48 * 60 * 60 * 1000

export interface HistoryItem {
  videoId: string
  title: string
  channel: string
  url: string
  /** e.g. "Watched 43%" or "" when unknown */
  watchState: string
}

export interface HistorySection {
  /** Day-group header as YouTube renders it: "Today", "Yesterday", "Friday", "Oct 31, 2026", ... */
  dayLabel: string
  items: HistoryItem[]
}

export interface FetchMeta {
  pagesFetched: number
  stoppedBecause: "cutoff" | "no-more" | "page-cap" | "empty" | "error"
  error?: string
}

export interface FetchResult {
  ok: boolean
  sections: HistorySection[]
  meta: FetchMeta
  fetchedAt: string
  /** TEMP POC debug: raw first page JSON (sliced), relayed via storage. */
  debugRaw?: string
}

export interface StoredEntry extends HistoryItem {
  /** Day label at the most recent sync where this entry was seen. */
  dayLabel: string
  firstSeenAt: string
  lastSeenAt: string
}

export interface StoreShape {
  version: 1
  lastSyncedAt: string | null
  lastSyncStatus: string
  entries: Record<string, StoredEntry>
}

export function emptyStore(): StoreShape {
  return { version: 1, lastSyncedAt: null, lastSyncStatus: "never synced", entries: {} }
}
