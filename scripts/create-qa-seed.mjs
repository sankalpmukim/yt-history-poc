#!/usr/bin/env node

/** Generate the importable QA backup with sample events in the current week. */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const output = resolve(process.argv[2] ?? "fixtures/qa-seed.json")
const now = new Date()
const monday = new Date(now)
monday.setHours(0, 0, 0, 0)
monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
const todayKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
const watchedOn = todayKey(monday)
const iso = now.toISOString()

const categories = [
  { id: "news", name: "News & updates", emoji: "📰", color: "#22c55e", valueScore: 3, order: 0 },
  { id: "practical", name: "Practical how-tos", emoji: "🛠️", color: "#3b82f6", valueScore: 4, order: 1 },
  { id: "deep", name: "Courses & lectures", emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 2 }
]
const subcategories = [
  { id: "news-world", parentId: "news", name: "World news", emoji: "🌍", order: 0 },
  { id: "news-sports", parentId: "news", name: "Sports", emoji: "🏆", order: 1 },
  { id: "practical-coding", parentId: "practical", name: "Coding", emoji: "⌨️", order: 0 },
  { id: "practical-cooking", parentId: "practical", name: "Cooking", emoji: "🍳", order: 1 },
  { id: "deep-lectures", parentId: "deep", name: "Lectures", emoji: "📚", order: 0 }
]
const rules = [
  {
    id: "qa-simple-flying-news",
    name: "Simple Flying channel → News › World news (QA fixture)",
    enabled: true,
    priority: 10,
    match: { channelContains: "Simple Flying" },
    categoryId: "news-world",
    createdAt: iso,
    updatedAt: iso,
    hitCount: 0
  },
  {
    id: "qa-tutorial-coding",
    name: "Tutorial titles → Practical › Coding (QA fixture)",
    enabled: true,
    priority: 20,
    match: { titleRegex: "\\b(tutorial|how to|guide)\\b", titleRegexFlags: "i" },
    categoryId: "practical-coding",
    createdAt: iso,
    updatedAt: iso,
    hitCount: 0
  }
]

function sample(id, title, durationSec, secondsProgress, categoryId, ruleId) {
  const eventKey = `${id}|${watchedOn}`
  return {
    video: {
      videoId: id,
      title,
      channel: "Simple Flying",
      url: `https://www.youtube.com/watch?v=${id}`,
      durationSec,
      durationSource: "watch-page",
      isShort: false,
      categoryOverride: null,
      autoCategoryId: categoryId,
      appliedRuleId: ruleId,
      firstSeenAt: iso,
      lastSeenAt: iso
    },
    event: {
      key: eventKey,
      videoId: id,
      watchedOn,
      progressPct: secondsProgress,
      progressAvgPct: secondsProgress,
      occurrences: 1,
      firstSeenAt: iso,
      lastSeenAt: iso
    }
  }
}

const samples = [
  sample("ylqa0000001", "QA seed: airline fleet news", 900, 100, "news-world", rules[0].id),
  sample("ylqa0000002", "QA seed: aircraft industry update", 900, 100, "news-world", rules[0].id),
  sample("ylqa0000003", "QA seed: aircraft maintenance tutorial", 600, 100, "practical-coding", rules[1].id)
]
const videos = Object.fromEntries(samples.map(({ video }) => [video.videoId, video]))
const events = Object.fromEntries(samples.map(({ event }) => [event.key, event]))

const backup = {
  app: "yt-ledger",
  backupVersion: 1,
  exportedAt: iso,
  data: {
    meta: {
      version: 2,
      settings: {
        retentionDays: 365,
        fetchWindowDays: 14,
        budgetMode: "strict",
        budgetsWeekly: { news: 60 },
        debugOverlay: false,
        devRelay: false,
        onboardedAt: iso
      },
      installedAt: iso,
      lastSyncedAt: iso,
      lastSyncStatus: "QA seed fixture",
      lastSyncDiagnostics: null
    },
    categories,
    subcategories,
    rules,
    videos,
    events
  }
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(backup, null, 2)}\n`)
console.log(`Wrote ${output} (week starts ${watchedOn}; News budget 60s, seeded spend 1800s).`)
