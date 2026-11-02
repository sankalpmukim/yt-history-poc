/**
 * Rules engine (M3): priority-ordered, first-match-wins auto-categorization.
 *
 * A rule matches when ALL of its specified conditions hold (AND semantics).
 * Matching is deliberately forgiving: case-insensitive everywhere, and
 * conditions on data we may not have yet (duration, isShort) fail closed —
 * "unknown" never matches, so a video gains a category only when the rule's
 * evidence is actually present.
 *
 * Pure module: used by the service worker (sync-time application), the
 * dashboard (rule editor test-runs, M5), and the on-YouTube budget guard
 * (M8) — anywhere a {title, channel, isShort, durationSec} is available.
 */

import type { Rule, RuleMatch, VideoRecord } from "./types"

/** The subset of a VideoRecord that rules can see. */
export interface RuleTarget {
  title: string
  channel: string
  isShort: boolean | null
  durationSec: number | null
}

export interface CompiledRule {
  rule: Rule
  /** precompiled titleRegex (stateless flags only), null when not used */
  regex: RegExp | null
}

export function targetOfVideo(
  video: Pick<VideoRecord, "title" | "channel" | "isShort" | "durationSec">
): RuleTarget {
  return {
    title: video.title ?? "",
    channel: video.channel ?? "",
    isShort: video.isShort ?? null,
    durationSec: video.durationSec ?? null
  }
}

/**
 * Rules usable for assignment: enabled, targeting a live (non-archived,
 * existing) category, with a compilable regex — sorted by priority (lower
 * first; stable for ties), so iteration order is resolution order.
 */
export function compileRules(rules: Rule[], validCategoryIds: Set<string>): CompiledRule[] {
  const out: CompiledRule[] = []
  const usable = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled && validCategoryIds.has(rule.categoryId))
    .sort((a, b) => a.rule.priority - b.rule.priority || a.index - b.index)
  for (const { rule } of usable) {
    let regex: RegExp | null = null
    if (rule.match.titleRegex) {
      try {
        // strip stateful flags — test() must be position-independent
        const flags = (rule.match.titleRegexFlags ?? "").replace(/[gy]/g, "")
        regex = new RegExp(rule.match.titleRegex, flags)
      } catch {
        continue // invalid regex → rule can never match; skip it
      }
    }
    out.push({ rule, regex })
  }
  return out
}

export function matchesRule(target: RuleTarget, compiled: CompiledRule): boolean {
  const m: RuleMatch = compiled.rule.match

  if (m.channelEquals != null) {
    if (target.channel.trim().toLowerCase() !== m.channelEquals.trim().toLowerCase()) return false
  }
  if (m.channelContains != null) {
    if (!target.channel.toLowerCase().includes(m.channelContains.trim().toLowerCase())) return false
  }
  if (m.titleContains != null && m.titleContains.length > 0) {
    const t = target.title.toLowerCase()
    const ok = m.titleContains.some(
      (s) => s.trim().length > 0 && t.includes(s.trim().toLowerCase())
    )
    if (!ok) return false
  }
  if (compiled.regex != null && m.titleRegex != null) {
    if (!compiled.regex.test(target.title)) return false
  }
  if (m.isShort != null && target.isShort !== m.isShort) return false
  if (m.maxDurationSec != null) {
    if (target.durationSec == null || target.durationSec > m.maxDurationSec) return false
  }
  return true
}

/** First match wins (compileRules already ordered + filtered). */
export function matchFirstRule(compiled: CompiledRule[], target: RuleTarget): CompiledRule | null {
  for (const c of compiled) {
    if (matchesRule(target, c)) return c
  }
  return null
}

/** Effective category: manual override always wins over any rule. */
export function effectiveCategoryId(
  video: Pick<VideoRecord, "categoryOverride" | "autoCategoryId">
): string | null {
  return video.categoryOverride ?? video.autoCategoryId ?? null
}

/**
 * How many stored videos a rule (or rule list) would currently match — used
 * by the rule editor's test-run (M5). Pure; does not assign anything.
 */
export function previewMatches(
  compiled: CompiledRule[],
  videos: Array<Pick<VideoRecord, "videoId" | "title" | "channel" | "isShort" | "durationSec">>
): { count: number; sampleIds: string[] } {
  const sampleIds: string[] = []
  let count = 0
  for (const v of videos) {
    if (matchFirstRule(compiled, targetOfVideo(v)) != null) {
      count++
      if (sampleIds.length < 10) sampleIds.push(v.videoId)
    }
  }
  return { count, sampleIds }
}
