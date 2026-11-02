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
