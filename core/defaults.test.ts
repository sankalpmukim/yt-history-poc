import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES, fallbackStarterRules, defaultSettings } from "./defaults"
import { validTargetIds } from "./taxonomy"

test("default categories: unique ids, ordered ladder, sane scores", () => {
  const ids = DEFAULT_CATEGORIES.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.order),
    DEFAULT_CATEGORIES.map((_, i) => i)
  )
  for (const c of DEFAULT_CATEGORIES) {
    assert.ok(c.valueScore >= 0 && c.valueScore <= 5, `${c.id} score in range`)
    assert.ok(c.name.length > 0 && c.color.startsWith("#"))
  }
  // the visible ladder is highest → lowest value
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.id),
    ["deep", "practical", "informative", "news", "talk-fun", "fun", "junk-fun", "brain-rot"]
  )
  assert.deepEqual(DEFAULT_CATEGORIES.map((c) => c.valueScore), [5, 4, 4, 3, 2, 1, 1, 0])
})

test("fallback starter rules reference live category or subcategory targets", () => {
  const ids = validTargetIds(DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES)
  const rules = fallbackStarterRules(new Date().toISOString())
  assert.ok(rules.length >= 2 && rules.length <= 3, "small, non-irritating set")
  for (const r of rules) {
    assert.ok(ids.has(r.categoryId), `rule ${r.id} → known target ${r.categoryId}`)
    assert.ok(r.enabled !== undefined)
  }
})

test("default settings match the approved decisions", () => {
  const s = defaultSettings()
  assert.equal(s.retentionDays, 365)
  assert.equal(s.fetchWindowDays, 14)
  assert.equal(s.budgetMode, "off")
  assert.equal(s.debugOverlay, false)
  assert.equal(s.onboardedAt, null)
})
