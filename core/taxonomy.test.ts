import test from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES } from "./defaults"
import {
  validTargetIds,
  resolveTarget,
  topLevelCategoryId,
  labelForTarget,
  scoreAtPosition,
  deriveCategoryScores,
  normalizeCategoryLadder,
  reorderById
} from "./taxonomy"

test("default subs: unique ids, every parent exists, no collisions with categories", () => {
  const catIds = new Set(DEFAULT_CATEGORIES.map((c) => c.id))
  const subIds = DEFAULT_SUBCATEGORIES.map((s) => s.id)
  assert.equal(new Set(subIds).size, subIds.length)
  for (const s of DEFAULT_SUBCATEGORIES) {
    assert.ok(catIds.has(s.parentId), `${s.id} parent ${s.parentId} exists`)
    assert.ok(!catIds.has(s.id), `${s.id} does not collide with a category`)
  }
  for (const c of DEFAULT_CATEGORIES) {
    assert.ok(
      DEFAULT_SUBCATEGORIES.some((s) => s.parentId === c.id),
      `${c.id} has at least one default sub`
    )
  }
})

test("resolveTarget distinguishes parent vs sub", () => {
  const r1 = resolveTarget("practical", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES)!
  assert.equal(r1.categoryId, "practical")
  assert.equal(r1.subcategoryId, null)
  const r2 = resolveTarget("practical-coding", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES)!
  assert.equal(r2.categoryId, "practical")
  assert.equal(r2.subcategoryId, "practical-coding")
  assert.equal(resolveTarget("nope", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), null)
  assert.equal(resolveTarget(null, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), null)
})

test("topLevelCategoryId rolls subs up; labels use Parent › Sub", () => {
  assert.equal(topLevelCategoryId("practical-coding", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), "practical")
  assert.equal(topLevelCategoryId("practical", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), "practical")
  assert.equal(topLevelCategoryId(null, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), null)
  assert.equal(
    labelForTarget("practical-coding", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES),
    "Practical how-tos › Coding"
  )
  assert.equal(labelForTarget("practical", DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), "Practical how-tos")
  assert.equal(labelForTarget(null, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), "Uncategorized")
})

test("validTargetIds drops archived parents and their children", () => {
  const cats = DEFAULT_CATEGORIES.map((c) =>
    c.id === "practical" ? { ...c, archivedAt: "x" } : c
  )
  const ids = validTargetIds(cats, DEFAULT_SUBCATEGORIES)
  assert.ok(!ids.has("practical"))
  assert.ok(!ids.has("practical-coding"))
  assert.ok(ids.has("deep"))
  assert.ok(ids.has("deep-lectures"))
})

test("category position derives the legacy value scale from highest at top to lowest at bottom", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => scoreAtPosition(i, 8)), [5, 4, 4, 3, 2, 1, 1, 0])
  assert.equal(scoreAtPosition(0, 1), 5)
  assert.deepEqual(deriveCategoryScores([{ ...DEFAULT_CATEGORIES[0], order: 99 }]).map((c) => [c.order, c.valueScore]), [[0, 5]])
})

test("legacy score ordering upgrades to high-first and keeps backup categories intact", () => {
  const legacy = [...DEFAULT_CATEGORIES].reverse().map((category, index) => ({ ...category, order: index }))
  const normalized = normalizeCategoryLadder(legacy)
  assert.equal(normalized[0].id, "deep")
  assert.equal(normalized.at(-1)?.id, "brain-rot")
  assert.deepEqual(normalized.map((c) => c.valueScore), [5, 4, 4, 3, 2, 1, 1, 0])
  assert.equal(normalized.length, DEFAULT_CATEGORIES.length)
})

test("reorderById supports pointer and keyboard reorder targets without mutating input", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }]
  assert.deepEqual(reorderById(items, "c", 0).map((x) => x.id), ["c", "a", "b"])
  assert.deepEqual(reorderById(items, "missing", 0), items)
  assert.deepEqual(items.map((x) => x.id), ["a", "b", "c"])
})
