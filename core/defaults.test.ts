import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_CATEGORIES, fallbackStarterRules, defaultSettings } from "./defaults"

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
  // the approved ladder, lowest → highest value
  assert.deepEqual(
    DEFAULT_CATEGORIES.map((c) => c.id),
    ["brain-rot", "junk-fun", "fun", "talk-fun", "news", "informative", "practical", "deep"]
  )
})

test("fallback starter rules reference existing categories", () => {
  const catIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id))
  const rules = fallbackStarterRules(new Date().toISOString())
  assert.ok(rules.length >= 2 && rules.length <= 3, "small, non-irritating set")
  for (const r of rules) {
    assert.ok(catIds.has(r.categoryId), `rule ${r.id} → known category`)
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
