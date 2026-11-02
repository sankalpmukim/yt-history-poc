/**
 * Manual categorization actions shared by the dashboard views:
 *  - setVideoCategory: per-video override (null clears it)
 *  - bulkAssign: many videos at once
 *  - ensureChannelRule: the "always categorize CHANNEL as X" one-click rule
 * Each mutation is followed by a rules pass so everything stays consistent.
 */

import type { Rule } from "./types"
import { KEYS } from "./types"
import { readRules, readVideos, KV } from "./storage"
import { runRulesPass } from "./ledger"

/** Set (or clear with null) the manual category override for one video. */
export async function setVideoCategory(
  kv: KV,
  videoId: string,
  categoryId: string | null,
  now: Date
): Promise<void> {
  const videos = await readVideos(kv)
  const video = videos[videoId]
  if (!video) return
  videos[videoId] = { ...video, categoryOverride: categoryId }
  await kv.set({ [KEYS.videos]: videos })
  await runRulesPass(kv, now)
}

/** Bulk-assign a category override to many videos (null clears overrides). */
export async function bulkAssign(
  kv: KV,
  videoIds: string[],
  categoryId: string | null,
  now: Date
): Promise<number> {
  if (videoIds.length === 0) return 0
  const videos = await readVideos(kv)
  let changed = 0
  for (const id of videoIds) {
    const video = videos[id]
    if (!video) continue
    videos[id] = { ...video, categoryOverride: categoryId }
    changed++
  }
  if (changed > 0) {
    await kv.set({ [KEYS.videos]: videos })
    await runRulesPass(kv, now)
  }
  return changed
}

/**
 * Create-or-repoint a channel rule ("always categorize CHANNEL as CATEGORY").
 * If an enabled channelEquals rule for this channel already exists, its
 * target category is updated; otherwise a new high-priority rule is created.
 */
export async function ensureChannelRule(
  kv: KV,
  channel: string,
  categoryId: string,
  now: Date
): Promise<Rule | null> {
  const trimmed = channel.trim()
  if (!trimmed) return null
  const nowIso = now.toISOString()
  const rules = await readRules(kv)
  const existing = rules.find(
    (r) =>
      r.enabled &&
      (r.match.channelEquals ?? "").trim().toLowerCase() === trimmed.toLowerCase()
  )
  let next: Rule
  if (existing) {
    next = { ...existing, categoryId, updatedAt: nowIso }
  } else {
    next = {
      id: `channel-${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${now.getTime().toString(36)}`,
      name: `Always: ${trimmed} → category`,
      enabled: true,
      priority: 50, // above the starter keyword rules (100+)
      match: { channelEquals: trimmed },
      categoryId,
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    }
  }
  const nextRules = existing
    ? rules.map((r) => (r.id === existing.id ? next : r))
    : [...rules, next]
  await kv.set({ [KEYS.rules]: nextRules })
  await runRulesPass(kv, now)
  return next
}
