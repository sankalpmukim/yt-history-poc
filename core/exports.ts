/**
 * Backup (JSON) + CSV export builders, and backup validation for import.
 * Pure: the file I/O lives in the settings view.
 */

import type { Category, MetaState, Rule, VideoRecord, WatchEvent } from "./types"
import { KEYS } from "./types"
import { estimateEventSeconds } from "./estimate"
import { effectiveCategoryId } from "./rules"

export interface BackupShape {
  app: "yt-ledger"
  backupVersion: 1
  exportedAt: string
  data: {
    meta: MetaState | null
    categories: Category[]
    rules: Rule[]
    videos: Record<string, VideoRecord>
    /** flat: every event, keyed by event.key */
    events: Record<string, WatchEvent>
  }
}

export function buildBackup(params: {
  meta: MetaState | null
  categories: Category[]
  rules: Rule[]
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  now?: Date
}): BackupShape {
  const events: Record<string, WatchEvent> = {}
  for (const ev of params.events) events[ev.key] = ev
  return {
    app: "yt-ledger",
    backupVersion: 1,
    exportedAt: (params.now ?? new Date()).toISOString(),
    data: {
      meta: params.meta,
      categories: params.categories,
      rules: params.rules,
      videos: params.videos,
      events
    }
  }
}

/** Throws Error with a readable reason when the payload isn't a valid backup. */
export function validateBackup(json: unknown): BackupShape {
  let b: any
  try {
    b = typeof json === "string" ? JSON.parse(json) : json
  } catch {
    throw new Error("not valid JSON")
  }
  if (!b || typeof b !== "object") throw new Error("not an object")
  if (b.app !== "yt-ledger") throw new Error("not a YT Ledger backup (app mismatch)")
  if (b.backupVersion !== 1) throw new Error(`unsupported backup version ${b.backupVersion}`)
  const d = b.data
  if (!d || typeof d !== "object") throw new Error("missing data section")
  if (!Array.isArray(d.categories)) throw new Error("categories missing or invalid")
  if (!Array.isArray(d.rules)) throw new Error("rules missing or invalid")
  if (!d.videos || typeof d.videos !== "object") throw new Error("videos missing or invalid")
  if (!d.events || typeof d.events !== "object") throw new Error("events missing or invalid")
  for (const ev of Object.values(d.events) as any[]) {
    if (!ev?.videoId || typeof ev.watchedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ev.watchedOn)) {
      throw new Error("event entries invalid (need videoId + watchedOn yyyy-mm-dd)")
    }
  }
  return b as BackupShape
}

/** Group flat backup events into monthly shards ready for storage writes. */
export function backupToShards(backup: BackupShape): Record<string, Record<string, WatchEvent>> {
  const shards: Record<string, Record<string, WatchEvent>> = {}
  for (const ev of Object.values(backup.data.events)) {
    const month = ev.watchedOn.slice(0, 7)
    if (!shards[month]) shards[month] = {}
    shards[month][ev.key] = ev
  }
  return shards
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Watch-event ledger as CSV: one row per event, joined with video facts. */
export function buildCsv(params: {
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  categories: Category[]
}): string {
  const catName = new Map(params.categories.map((c) => [c.id, c.name] as const))
  const header = [
    "date",
    "videoId",
    "title",
    "channel",
    "category",
    "categorySource",
    "durationSec",
    "progressPct",
    "progressAvgPct",
    "occurrences",
    "estimatedSeconds",
    "confidence",
    "url"
  ]
  const rows: string[] = [header.join(",")]
  const events = [...params.events].sort((a, b) =>
    a.watchedOn === b.watchedOn
      ? a.videoId.localeCompare(b.videoId)
      : b.watchedOn.localeCompare(a.watchedOn)
  )
  for (const ev of events) {
    const v = params.videos[ev.videoId]
    if (!v) continue
    const est = estimateEventSeconds(ev, v)
    const cat = effectiveCategoryId(v)
    const source = v.categoryOverride != null ? "manual" : v.appliedRuleId ? "rule" : "none"
    rows.push(
      [
        ev.watchedOn,
        ev.videoId,
        v.title,
        v.channel,
        cat == null ? "" : catName.get(cat) ?? cat,
        source,
        v.durationSec,
        ev.progressPct,
        ev.progressAvgPct,
        ev.occurrences,
        est.seconds,
        est.confidence,
        v.url
      ]
        .map(csvCell)
        .join(",")
    )
  }
  return rows.join("\n") + "\n"
}

/** All storage keys YT Ledger owns (for wipe / export). */
export const LEDGER_KEY_PREFIX = "yl.v2."

export function isLedgerKey(key: string): boolean {
  return key.startsWith(LEDGER_KEY_PREFIX) || key.startsWith("ytHistoryPoc.v1")
}

export { KEYS }
