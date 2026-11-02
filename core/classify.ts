/**
 * Classify a visible YouTube video for budget enforcement (M8).
 *
 * Order: stored manual override → stored auto-category → live rules on
 * (title, channel, isShort, duration). Unknown → null (fail-open: never
 * treat as over-budget).
 */

import type { VideoRecord } from "./types"
import { effectiveCategoryId } from "./rules"
import type { CompiledRule } from "./rules"
import { matchFirstRule } from "./rules"

export interface ClassifyInput {
  stored: VideoRecord | undefined
  title: string
  channel: string
  durationSec: number | null
  isShort: boolean | null
}

export function classifyForBudget(
  input: ClassifyInput,
  compiled: CompiledRule[]
): string | null {
  if (input.stored) {
    const known = effectiveCategoryId(input.stored)
    if (known) return known
  }
  if (compiled.length === 0) return null
  const hit = matchFirstRule(compiled, {
    title: input.title || input.stored?.title || "",
    channel: input.channel || input.stored?.channel || "",
    isShort: input.isShort ?? input.stored?.isShort ?? null,
    durationSec: input.durationSec ?? input.stored?.durationSec ?? null
  })
  return hit?.rule.categoryId ?? null
}

/** Unknown / uncategorized videos are never over-budget (fail-open). */
export function isCategoryOverBudget(
  categoryId: string | null,
  overCategories: Set<string>
): boolean {
  return categoryId != null && overCategories.has(categoryId)
}
