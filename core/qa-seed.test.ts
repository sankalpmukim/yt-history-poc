import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { validateBackup } from "./exports"
import { computeBudgetStatus } from "./budget"

test("QA seed is importable and demonstrates subcategory-to-parent over-budget rollup", () => {
  const raw = readFileSync(resolve(process.cwd(), "fixtures/qa-seed.json"), "utf8")
  const backup = validateBackup(raw)
  const { categories, subcategories, rules, videos, events, meta } = backup.data
  const subs = subcategories ?? []

  assert.ok(subs.some((subcategory) => subcategory.id === "news-world"))
  assert.ok(rules.some((rule) => rule.categoryId === "news-world"))
  assert.equal(meta?.settings.budgetMode, "strict")
  assert.equal(meta?.settings.budgetsWeekly.news, 60)

  const status = computeBudgetStatus({
    videos,
    events: Object.values(events),
    categories,
    subcategories: subs,
    budgetsWeekly: meta!.settings.budgetsWeekly,
    now: new Date()
  })
  const news = status.entries.find((entry) => entry.categoryId === "news")
  assert.equal(news?.spentSec, 1800)
  assert.equal(news?.over, true)
})

test("live QA seed imports with enabled precedence rules and both live categories over budget", () => {
  const raw = readFileSync(resolve(process.cwd(), "fixtures/qa-seed-live.json"), "utf8")
  const backup = validateBackup(raw)
  const { categories, subcategories, rules, videos, events, meta } = backup.data
  const subs = subcategories ?? []
  const channelRule = rules.find((rule) => rule.id === "qa-live-channel-match")
  const titleRule = rules.find((rule) => rule.id === "qa-live-title-catchall")

  assert.ok(channelRule?.enabled)
  assert.equal(channelRule?.match.channelContains, "NASA")
  assert.ok(titleRule?.enabled)
  assert.equal(titleRule?.match.titleRegex, ".")
  assert.ok(channelRule!.priority < titleRule!.priority)
  assert.equal(meta?.settings.budgetMode, "strict")
  assert.equal(meta?.settings.budgetsWeekly["qa-live-channel"], 60)
  assert.equal(meta?.settings.budgetsWeekly["qa-live-title"], 60)

  const status = computeBudgetStatus({
    videos,
    events: Object.values(events),
    categories,
    subcategories: subs,
    budgetsWeekly: meta!.settings.budgetsWeekly,
    now: new Date()
  })
  for (const categoryId of ["qa-live-channel", "qa-live-title"]) {
    const entry = status.entries.find((candidate) => candidate.categoryId === categoryId)
    assert.equal(entry?.spentSec, 1800)
    assert.equal(entry?.over, true)
  }
})
