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
  return { emoji, text, color: r.category.color }
}
