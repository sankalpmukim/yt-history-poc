/**
 * Shared types + constants between the MAIN-world fetcher/observer and the
 * isolated-world sync script. Also keeps the legacy v1 POC shapes that the
 * one-time v1→v2 migration reads.
 */

/** Legacy POC cache key (kept as the migration source; never written again). */
export const STORAGE_KEY = "ytHistoryPoc.v1"

export interface HistoryItem {
  videoId: string
  title: string
  channel: string
  url: string
  /** e.g. "Watched 43%" or "" when unknown */
  watchState: string
  /** Duration in seconds when the history item exposed it, else null/absent. */
  durationSec?: number | null
  /** Where durationSec came from ("overlay" | "legacy"); null when unknown. */
  durationSource?: "overlay" | "legacy" | null
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
}

/* ------------------------------------------------------------------ */
/* legacy v1 POC store (read-only, migration source)                    */
/* ------------------------------------------------------------------ */

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
