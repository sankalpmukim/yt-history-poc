/**
 * Report entry for query-store.mjs: bundled against the repo's own core
 * modules, so every number matches the dashboard exactly. The runner calls
 * runReport(report, args, store) and prints the returned text.
 */

import {
  computeSignals,
  periodCompare,
  heavyDays,
  completionByCategory,
  duplicateOverrides,
  channelConcentration,
  fmtDurSec
} from "../../../../core/signals"
import { aggregateRange } from "../../../../core/aggregate"
import type { Category, Rule, Subcategory, VideoRecord, WatchEvent } from "../../../../core/types"

const fmt = fmtDurSec
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`)
const plural = (n: number, one: string, many?: string) => `${n.toLocaleString()} ${n === 1 ? one : (many ?? one + "s")}`

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === "object") return Object.values(value as Record<string, T>)
  return []
}

function summary(store: Record<string, unknown>): string {
  const videos = store["yl.v2.videos"] as Record<string, VideoRecord> | undefined
  const categories = asArray<Category>(store["yl.v2.categories"])
  const subcategories = asArray<Subcategory>(store["yl.v2.subcategories"])
  const rules = store["yl.v2.rules"] as Rule[] | undefined
  const meta = store["yl.v2.meta"] as any
  const events: WatchEvent[] = []
  for (const [key, shard] of Object.entries(store)) {
    if (!key.startsWith("yl.v2.events.")) continue
    events.push(...asArray<WatchEvent>(shard))
  }
  const days = [...new Set(events.map((e) => e.watchedOn))].sort()
  const agg = aggregateRange({ videos: videos ?? {}, events, categories, subcategories, from: null })
  const overrides = Object.values(videos ?? {}).filter((v) => v.categoryOverride != null).length
  const settings = meta?.settings ?? {}
  const lines = [
    "YT LEDGER STORE SUMMARY",
    `videos: ${Object.keys(videos ?? {}).length} | events: ${events.length} | active days: ${days.length}`,
    days.length ? `span: ${days[0]} → ${days[days.length - 1]}` : "",
    `estimated watch time: ${fmt(agg.totalSeconds)} (${fmt(agg.totalSeconds / Math.max(1, days.length))} per active day)`,
    `watches: ${agg.totalEvents} | distinct videos: ${agg.distinctVideos}`,
    `manual overrides: ${overrides} | auto-categorized: ${Object.values(videos ?? {}).filter((v) => v.autoCategoryId != null).length}`,
    `categories: ${categories.length} (live: ${categories.filter((c) => !c.archivedAt).length}) | subcategories: ${subcategories.length} | rules: ${rules?.length ?? 0}`,
    `budget mode: ${settings.budgetMode ?? "?"} | budgets: ${JSON.stringify(settings.budgetsWeekly ?? {})}`,
    `last synced: ${meta?.lastSyncedAt ?? "never"}`,
    `sync status: ${meta?.lastSyncStatus ?? "?"}`,
    "",
    "TIME BY CATEGORY (ladder order)"
  ]
  const byId = new Map(categories.map((c) => [c.id, c] as const))
  for (const row of [...agg.byCategory].sort((a, b) => (byId.get(a.categoryId ?? "")?.order ?? 99) - (byId.get(b.categoryId ?? "")?.order ?? 99))) {
    const name = row.categoryId == null ? "Uncategorized" : byId.get(row.categoryId)?.name ?? row.categoryId
    lines.push(`  ${name.padEnd(26)} ${fmt(row.seconds).padStart(8)}  ${pct(row.share).padStart(4)}  ${plural(row.watchCount, "watch", "watches")}`)
  }
  return lines.filter((l) => l !== "").join("\n")
}

function signals(store: Record<string, unknown>, _args: string[]): string {
  const ctx = makeCtx(store)
  const cards = computeSignals(ctx, new Date())
  if (cards.length === 0) return "No signals yet — need more history (a few active days)."
  return cards.map((s) => {
    const head = `[${s.severity}] ${s.title}`
    const body = s.body
    const ev = s.evidence.length ? `\n  ${s.evidence.map((e) => `${e.label}: ${e.value}`).join("\n  ")}` : ""
    return `${head}\n  ${body}${ev}`
  }).join("\n\n")
}

function makeCtx(store: Record<string, unknown>) {
  const videos = store["yl.v2.videos"] as Record<string, VideoRecord> | undefined
  const categories = asArray<Category>(store["yl.v2.categories"])
  const subcategories = asArray<Subcategory>(store["yl.v2.subcategories"])
  const rules = store["yl.v2.rules"] as Rule[] | undefined
  const meta = store["yl.v2.meta"] as any
  const events: WatchEvent[] = []
  for (const [key, shard] of Object.entries(store)) {
    if (!key.startsWith("yl.v2.events.")) continue
    events.push(...asArray<WatchEvent>(shard))
  }
  return {
    videos: videos ?? {},
    events,
    categories,
    subcategories,
    rules: rules ?? [],
    budgetsWeekly: meta?.settings?.budgetsWeekly ?? {}
  }
}

function channels(store: Record<string, unknown>, args: string[]): string {
  const limit = Number(args[0] ?? 15)
  const ctx = makeCtx(store)
  const conc = channelConcentration(ctx, null, limit)
  if (conc.distinctChannels === 0) return "No watch time in the store."
  const lines = [`TOP ${limit} CHANNELS (${conc.distinctChannels} distinct, top-10 share ${pct(conc.top10Share)})`]
  for (const t of conc.top) lines.push(`  ${t.channel.slice(0, 40).padEnd(40)} ${fmt(t.seconds).padStart(8)}  ${pct(t.share).padStart(4)}`)
  return lines.join("\n")
}

function day(store: Record<string, unknown>, args: string[]): string {
  const date = args[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return "Usage: day YYYY-MM-DD"
  const ctx = makeCtx(store)
  const agg = aggregateRange({ videos: ctx.videos, events: ctx.events, categories: ctx.categories, subcategories: ctx.subcategories, from: date, to: date })
  if (agg.rows.length === 0) return `No watches on ${date}.`
  const lines = [`${date} — ${fmt(agg.totalSeconds)} in ${plural(agg.totalEvents, "watch", "watches")}`]
  for (const row of agg.rows) {
    lines.push(`  ${fmt(row.estimatedSeconds ?? 0).padStart(6)}  ${row.video.channel?.slice(0, 28).padEnd(28) ?? "?"}  ${row.video.title?.slice(0, 48) ?? ""}`)
  }
  return lines.join("\n")
}

function videos(store: Record<string, unknown>, args: string[]): string {
  const limit = Number(args.find((a) => /^\d+$/.test(a)) ?? 20)
  const catArg = args.find((a, i) => args[i - 1] === "--cat")
  const ctx = makeCtx(store)
  const catById = new Map(ctx.categories.map((c) => [c.id, c] as const))
  const subById = new Map(ctx.subcategories.map((s) => [s.id, s] as const))
  const nameOf = (id: string | null) => (id == null ? "—" : catById.get(id)?.name ?? subById.get(id)?.name ?? id)
  const topOf = (id: string | null) => subById.get(id ?? "")?.parentId ?? id
  const rows = Object.values(ctx.videos)
    .filter((v) => !catArg || topOf(v.categoryOverride ?? v.autoCategoryId) === catArg || v.categoryOverride === catArg || v.autoCategoryId === catArg)
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""))
    .slice(0, limit)
  const lines = [`VIDEOS${catArg ? ` in ${nameOf(catArg)}` : ""} (${rows.length} shown of ${Object.keys(ctx.videos).length})`]
  for (const v of rows) {
    lines.push(`  ${nameOf(v.categoryOverride ?? v.autoCategoryId).padEnd(28)} ${fmt(v.durationSec).padStart(6)}  ${(v.channel ?? "?").slice(0, 30).padEnd(30)}  ${v.title?.slice(0, 44) ?? ""}`)
  }
  return lines.join("\n")
}

function rules(store: Record<string, unknown>, _args: string[]): string {
  const ctx = makeCtx(store)
  if (ctx.rules.length === 0) return "No rules in the store."
  const catById = new Map(ctx.categories.map((c) => [c.id, c] as const))
  const subById = new Map(ctx.subcategories.map((s) => [s.id, s] as const))
  const nameOf = (id: string) => catById.get(id)?.name ?? subById.get(id)?.name ?? id
  const lines = [`RULES (${ctx.rules.length}, priority order)`]
  for (const r of [...ctx.rules].sort((a, b) => a.priority - b.priority)) {
    lines.push(`  #${r.priority} ${r.enabled ? "on " : "off"} hits:${String(r.hitCount).padStart(3)} → ${nameOf(r.categoryId).padEnd(24)} ${r.name}`)
  }
  return lines.join("\n")
}

function key(store: Record<string, unknown>, args: string[]): string {
  const k = args[0]
  if (!k || !(k in store)) return `Key ${k ?? "(none)"} not found. Store keys:\n${Object.keys(store).sort().map((x) => `  ${x}`).join("\n")}`
  return `${k}: ${JSON.stringify(store[k], null, 1)}`
}

function health(store: Record<string, unknown>, _args: string[]): string {
  const ctx = makeCtx(store)
  const lines = [
    "HEALTH CHECKS",
    `videos without duration: ${Object.values(ctx.videos).filter((v) => v.durationSec == null).length}`,
    `orphan events (video missing): ${ctx.events.filter((e) => !ctx.videos[e.videoId]).length}`,
    `duplicate manual picks (match a channel rule): ${duplicateOverrides(ctx).redundant.length}`,
    `conflicting picks (fight a channel rule): ${duplicateOverrides(ctx).conflicting.length}`,
    `dead rules (0 hits, >14d old): ${ctx.rules.filter((r) => r.enabled && r.hitCount === 0 && Date.now() - new Date(r.createdAt).getTime() > 14 * 86400000).length}`,
    `completion by category:`
  ]
  for (const c of completionByCategory(ctx)) {
    lines.push(`  ${c.categoryId.padEnd(26)} finish ${pct(c.finishRate)}  abandon ${pct(c.abandonRate)}  (${plural(c.started, "watch", "watches")})`)
  }
  const hd = heavyDays(ctx)
  if (hd.heaviest) lines.push(`heaviest day: ${hd.heaviest.date} ${fmt(hd.heaviest.seconds)} (${hd.heaviest.multiple.toFixed(1)}× the ${fmt(hd.normSec)} active-day norm)`)
  const cmp = periodCompare(ctx, 7)
  if (cmp.previousSec > 0) lines.push(`last 7d vs prior: ${fmt(cmp.currentSec)} vs ${fmt(cmp.previousSec)} (${cmp.deltaSec >= 0 ? "+" : "−"}${fmt(Math.abs(cmp.deltaSec))})`)
  return lines.join("\n")
}

export function runReport(report: string, args: string[], store: Record<string, unknown>): string {
  switch (report) {
    case "summary": return summary(store)
    case "signals": return signals(store, args)
    case "channels": return channels(store, args)
    case "day": return day(store, args)
    case "videos": return videos(store, args)
    case "rules": return rules(store, args)
    case "health": return health(store, args)
    case "key": return key(store, args)
    default:
      return `Unknown report "${report}". Available: summary, signals, channels, day, videos, rules, health, key`
  }
}
