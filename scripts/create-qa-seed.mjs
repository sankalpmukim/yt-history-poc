#!/usr/bin/env node

/** Generate the importable QA backup with sample events in the current week. */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const output = resolve(process.argv[2] ?? "fixtures/qa-seed.json")
const liveOutput = resolve(process.argv[3] ?? "fixtures/qa-seed-live.json")
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

function writeBackup(path, backup) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(backup, null, 2)}\n`)
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

writeBackup(output, backup)
console.log(`Wrote ${output} (week starts ${watchedOn}; News budget 60s, seeded spend 1800s).`)

// The live fixture classifies arbitrary visible YouTube titles, so the seeded
// IDs need not appear in the user's feed. The narrow channel rule sorts first;
// ordinary items from every other channel fall through to the title catch-all.
const liveChannelCategory = {
  id: "qa-live-channel",
  name: "QA · Channel match",
  emoji: "📡",
  color: "#d97706",
  valueScore: 2,
  order: 3
}
const liveTitleCategory = {
  id: "qa-live-title",
  name: "QA · Other live titles",
  emoji: "▶️",
  color: "#0891b2",
  valueScore: 1,
  order: 4
}
const liveRules = [
  {
    id: "qa-live-channel-match",
    name: "QA live: channel contains NASA",
    enabled: true,
    priority: 1,
    match: { channelContains: "NASA" },
    categoryId: liveChannelCategory.id,
    createdAt: iso,
    updatedAt: iso,
    hitCount: 0
  },
  {
    id: "qa-live-title-catchall",
    name: "QA live: nearly every title",
    enabled: true,
    priority: 10,
    match: { titleRegex: ".", titleRegexFlags: "i" },
    categoryId: liveTitleCategory.id,
    createdAt: iso,
    updatedAt: iso,
    hitCount: 0
  }
]
const liveSamples = [
  sample("ylqlive0001", "QA live seed: channel match spend A", 900, 100, liveChannelCategory.id, liveRules[0].id),
  sample("ylqlive0002", "QA live seed: channel match spend B", 900, 100, liveChannelCategory.id, liveRules[0].id),
  sample("ylqlive0003", "QA live seed: title match spend A", 900, 100, liveTitleCategory.id, liveRules[1].id),
  sample("ylqlive0004", "QA live seed: title match spend B", 900, 100, liveTitleCategory.id, liveRules[1].id)
]
// Give the seeded channel samples the same visible channel that the live rule
// targets; all other fields and the original deterministic fixture stay intact.
for (const { video } of liveSamples.slice(0, 2)) video.channel = "NASA"
const liveBackup = structuredClone(backup)
liveBackup.data.categories.push(liveChannelCategory, liveTitleCategory)
liveBackup.data.rules = [...liveRules, ...liveBackup.data.rules]
liveBackup.data.videos = {
  ...liveBackup.data.videos,
  ...Object.fromEntries(liveSamples.map(({ video }) => [video.videoId, video]))
}
liveBackup.data.events = {
  ...liveBackup.data.events,
  ...Object.fromEntries(liveSamples.map(({ event }) => [event.key, event]))
}
liveBackup.data.meta.settings.budgetsWeekly = {
  ...liveBackup.data.meta.settings.budgetsWeekly,
  [liveChannelCategory.id]: 60,
  [liveTitleCategory.id]: 60
}
writeBackup(liveOutput, liveBackup)
console.log(`Wrote ${liveOutput} (both live-rule categories budgeted at 60s with 1800s seeded spend each).`)
