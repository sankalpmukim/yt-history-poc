/**
 * Storage layer: a tiny KV abstraction over chrome.storage.local with an
 * in-memory implementation for unit tests, plus typed read/write helpers for
 * the v2 keys. Event shards are stored under separate monthly keys so a sync
 * only rewrites the shards it actually touched.
 */

import type {
  Category,
  MetaState,
  Rule,
  Subcategory,
  VideoRecord,
  WatchEvent
} from "./types"
import { KEYS, EVENTS_KEY_PREFIX, eventsKey, isEventsKey } from "./types"

export interface KV {
  get(key: string): Promise<unknown | undefined>
  set(entries: Record<string, unknown>): Promise<void>
  /** all keys present in storage (used to enumerate event shards) */
  getKeys(): Promise<string[]>
}

export class MemoryKV implements KV {
  private map = new Map<string, unknown>()

  async get(key: string): Promise<unknown | undefined> {
    return this.map.get(key)
  }

  async set(entries: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v)
  }

  async getKeys(): Promise<string[]> {
    return [...this.map.keys()]
  }
}

/** Adapter over chrome.storage.local (extension contexts only). */
export class ChromeKV implements KV {
  async get(key: string): Promise<unknown | undefined> {
    const bag = await chrome.storage.local.get(key)
    return bag?.[key]
  }

  async set(entries: Record<string, unknown>): Promise<void> {
    await chrome.storage.local.set(entries)
  }

  async getKeys(): Promise<string[]> {
    try {
      const anyArea = chrome.storage.local as unknown as {
        getKeys?: () => Promise<string[]>
      }
      if (typeof anyArea.getKeys === "function") {
        return await anyArea.getKeys()
      }
    } catch {}
    const all = await chrome.storage.local.get(null)
    return Object.keys(all ?? {})
  }
}

export function chromeKV(): ChromeKV {
  return new ChromeKV()
}

/* ------------------------------------------------------------------ */
/* typed helpers                                                       */
/* ------------------------------------------------------------------ */

export async function readMeta(kv: KV): Promise<MetaState | null> {
  const m = await kv.get(KEYS.meta)
  return m && (m as MetaState).version === 2 ? (m as MetaState) : null
}

export async function writeMeta(kv: KV, meta: MetaState): Promise<void> {
  await kv.set({ [KEYS.meta]: meta })
}

export async function readVideos(
  kv: KV
): Promise<Record<string, VideoRecord>> {
  const v = await kv.get(KEYS.videos)
  return v && typeof v === "object" ? (v as Record<string, VideoRecord>) : {}
}

export async function readCategories(kv: KV): Promise<Category[]> {
  const c = await kv.get(KEYS.categories)
  return Array.isArray(c) ? (c as Category[]) : []
}

export async function readSubcategories(kv: KV): Promise<Subcategory[]> {
  const s = await kv.get(KEYS.subcategories)
  return Array.isArray(s) ? (s as Subcategory[]) : []
}

export async function readRules(kv: KV): Promise<Rule[]> {
  const r = await kv.get(KEYS.rules)
  return Array.isArray(r) ? (r as Rule[]) : []
}

/**
 * Load event shards. With `months`, only those shards; otherwise every
 * `yl.v2.events.*` key in storage.
 */
export async function readEventShards(
  kv: KV,
  months?: string[]
): Promise<Record<string, Record<string, WatchEvent>>> {
  const out: Record<string, Record<string, WatchEvent>> = {}
  const wanted = months ?? (await kv.getKeys()).filter(isEventsKey).map((k) => k.slice(EVENTS_KEY_PREFIX.length))
  for (const month of wanted) {
    const shard = await kv.get(eventsKey(month))
    if (shard && typeof shard === "object") {
      out[month] = shard as Record<string, WatchEvent>
    }
  }
  return out
}

export async function writeEventShard(
  kv: KV,
  month: string,
  events: Record<string, WatchEvent>
): Promise<void> {
  await kv.set({ [eventsKey(month)]: events })
}

export async function readDurationQueue(kv: KV): Promise<string[]> {
  const q = await kv.get(KEYS.durationQueue)
  return Array.isArray(q) ? (q as string[]) : []
}
