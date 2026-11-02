/**
 * Dashboard data access: one snapshot of the whole ledger + a debounced
 * subscription to storage changes. The dashboard is an extension page, so
 * chrome.storage is directly available.
 */

import type { Category, MetaState, Rule, VideoRecord, WatchEvent } from "../../core/types"
import { KEYS, isEventsKey } from "../../core/types"
import type { Settings } from "../../core/types"
import { defaultSettings } from "../../core/defaults"
import type { BudgetStatus } from "../../core/budget"

export interface LedgerData {
  meta: MetaState | null
  categories: Category[]
  rules: Rule[]
  videos: Record<string, VideoRecord>
  events: WatchEvent[]
  budgetStatus: BudgetStatus | null
}

export async function loadLedgerData(): Promise<LedgerData> {
  const all = (await chrome.storage.local.get(null)) as Record<string, unknown>
  const meta = (all[KEYS.meta] as MetaState) ?? null
  const categories = Array.isArray(all[KEYS.categories])
    ? (all[KEYS.categories] as Category[])
    : []
  const rules = Array.isArray(all[KEYS.rules]) ? (all[KEYS.rules] as Rule[]) : []
  const videos =
    (all[KEYS.videos] as Record<string, VideoRecord>) ?? ({} as Record<string, VideoRecord>)
  const events: WatchEvent[] = []
  for (const key of Object.keys(all)) {
    if (!isEventsKey(key)) continue
    const shard = all[key] as Record<string, WatchEvent>
    for (const ev of Object.values(shard ?? {})) events.push(ev)
  }
  events.sort(
    (a, b) => b.watchedOn.localeCompare(a.watchedOn) || b.lastSeenAt.localeCompare(a.lastSeenAt)
  )
  const budgetStatus = (all[KEYS.budgetStatus] as BudgetStatus) ?? null
  return { meta, categories, rules, videos, events, budgetStatus }
}

export function settingsOf(data: LedgerData): Settings {
  return data.meta?.settings ?? defaultSettings()
}

export function subscribeLedger(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area !== "local") return
    const touched = Object.keys(changes).some((k) => k.startsWith("yl.v2"))
    if (!touched) return
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(onChange, 150)
  }
  chrome.storage.onChanged.addListener(listener)
  return () => chrome.storage.onChanged.removeListener(listener)
}

/** Update settings (shallow merge) without clobbering concurrent meta fields. */
export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  const bag = (await chrome.storage.local.get(KEYS.meta)) as Record<string, MetaState>
  const meta = bag?.[KEYS.meta]
  if (!meta) return
  await chrome.storage.local.set({
    [KEYS.meta]: { ...meta, settings: { ...meta.settings, ...patch } }
  })
}

export async function writeCategories(categories: Category[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.categories]: categories })
}

export async function writeRules(rules: Rule[]): Promise<void> {
  await chrome.storage.local.set({ [KEYS.rules]: rules })
}
