/**
 * Resolve assignment targets that may be a top-level category OR a
 * subcategory. Charts/budgets always roll up to the parent category.
 */

import type { Category, Subcategory } from "./types"

export interface ResolvedTarget {
  /** raw stored id (category or subcategory) */
  targetId: string
  /** top-level category id (parent if target is a sub) */
  categoryId: string
  subcategoryId: string | null
  category: Category
  subcategory: Subcategory | null
}

/** A visible category position maps evenly onto the existing internal 0–5 scale. */
export function scoreAtPosition(index: number, count: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (count <= 1) return 5
  return Math.round((5 * (count - 1 - index)) / (count - 1)) as 0 | 1 | 2 | 3 | 4 | 5
}

/** Persist visible order and keep valueScore as a derived, backwards-compatible field. */
export function deriveCategoryScores(categories: Category[]): Category[] {
  return categories.map((category, index) => ({
    ...category,
    order: index,
    valueScore: scoreAtPosition(index, categories.length)
  }))
}

/**
 * Upgrade the former independently-ranked ladder in memory/storage. Legacy
 * categories could be in any order with manually assigned scores; preserve
 * that value hierarchy by sorting high-to-low, then derive scores from position.
 */
export function normalizeCategoryLadder(categories: Category[]): Category[] {
  const byOrder = categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => a.category.order - b.category.order || a.index - b.index)
    .map(({ category }) => category)
  const alreadyHighToLow = byOrder.every(
    (category, index) => index === 0 || category.valueScore <= byOrder[index - 1].valueScore
  )
  const valueOrder = alreadyHighToLow
    ? byOrder
    : [...byOrder].sort((a, b) => b.valueScore - a.valueScore || a.order - b.order)
  return deriveCategoryScores(valueOrder)
}

/** Return a reordered copy, bounded to the existing list. */
export function reorderById<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] {
  const fromIndex = items.findIndex((item) => item.id === id)
  if (fromIndex < 0 || items.length === 0) return items
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item)
  return next
}

export function validTargetIds(
  categories: Category[],
  subcategories: Subcategory[]
): Set<string> {
  const liveParents = new Set(categories.filter((c) => !c.archivedAt).map((c) => c.id))
  const ids = new Set<string>(liveParents)
  for (const s of subcategories) {
    if (!s.archivedAt && liveParents.has(s.parentId)) ids.add(s.id)
  }
  return ids
}

export function resolveTarget(
  targetId: string | null | undefined,
  categories: Category[],
  subcategories: Subcategory[]
): ResolvedTarget | null {
  if (!targetId) return null
  const cat = categories.find((c) => c.id === targetId)
  if (cat) {
    return { targetId, categoryId: cat.id, subcategoryId: null, category: cat, subcategory: null }
  }
  const sub = subcategories.find((s) => s.id === targetId)
  if (!sub) return null
  const parent = categories.find((c) => c.id === sub.parentId)
  if (!parent) return null
  return {
    targetId,
    categoryId: parent.id,
    subcategoryId: sub.id,
    category: parent,
    subcategory: sub
  }
}

/** Top-level category id for charts/budgets; null if unknown/uncategorized. */
export function topLevelCategoryId(
  targetId: string | null | undefined,
  categories: Category[],
  subcategories: Subcategory[]
): string | null {
  return resolveTarget(targetId, categories, subcategories)?.categoryId ?? null
}

/** "Practical how-tos › Coding" or "Practical how-tos" or "Uncategorized". */
export function labelForTarget(
  targetId: string | null | undefined,
  categories: Category[],
  subcategories: Subcategory[]
): string {
  const r = resolveTarget(targetId, categories, subcategories)
  if (!r) return "Uncategorized"
  if (r.subcategory) return `${r.category.name} › ${r.subcategory.name}`
  return r.category.name
}

export function chipLabelForTarget(
  targetId: string | null | undefined,
  categories: Category[],
  subcategories: Subcategory[]
): { emoji: string; text: string; color: string } | null {
  const r = resolveTarget(targetId, categories, subcategories)
  if (!r) return null
  const emoji = r.subcategory?.emoji || r.category.emoji
  const text = r.subcategory ? `${r.category.name} › ${r.subcategory.name}` : r.category.name
  return { emoji, text, color: r.subcategory?.color ?? r.category.color }
}
