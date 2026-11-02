/**
 * Default category ladder + fallback starter rules + default settings.
 * The onboarding flow (M6) lets the user reshape all of this; these are the
 * non-irritating fallbacks that apply when onboarding is skipped or fails.
 */

import type { Category, MetaState, Rule, Settings } from "./types"

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "brain-rot",   name: "Brain rot",                emoji: "🧟", color: "#e11d48", valueScore: 0, order: 0 },
  { id: "junk-fun",    name: "Mindless entertainment",   emoji: "🍿", color: "#f97316", valueScore: 1, order: 1 },
  { id: "fun",         name: "Intentional entertainment",emoji: "🎬", color: "#eab308", valueScore: 2, order: 2 },
  { id: "talk-fun",    name: "Recreational talk",        emoji: "🎙️", color: "#84cc16", valueScore: 3, order: 3 },
  { id: "news",        name: "News & updates",           emoji: "📰", color: "#22c55e", valueScore: 3, order: 4 },
  { id: "informative", name: "Informative talk",         emoji: "🧠", color: "#14b8a6", valueScore: 4, order: 5 },
  { id: "practical",   name: "Practical how-tos",        emoji: "🛠️", color: "#3b82f6", valueScore: 4, order: 6 },
  { id: "deep",        name: "Courses & lectures",       emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 7 }
]

/**
 * Fallback starter rules (used until/since onboarding). Deliberately small
 * and visible: two gentle enabled keyword rules + one disabled Shorts rule.
 */
export function fallbackStarterRules(nowIso: string): Rule[] {
  return [
    {
      id: "starter-tutorial",
      name: "Tutorial-ish titles → Practical how-tos",
      enabled: true,
      priority: 100,
      match: { titleRegex: "\\b(tutorial|how to|guide|walkthrough|step[- ]by[- ]step)\\b", titleRegexFlags: "i" },
      categoryId: "practical",
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    },
    {
      id: "starter-lecture",
      name: "Lecture-ish titles → Courses & lectures",
      enabled: true,
      priority: 110,
      match: { titleRegex: "\\b(lecture|course|crash course|seminar|conference talk|documentary)\\b", titleRegexFlags: "i" },
      categoryId: "deep",
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    },
    {
      id: "starter-shorts",
      name: "Shorts (≤60s) → Brain rot",
      enabled: false,
      priority: 120,
      match: { isShort: true },
      categoryId: "brain-rot",
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    }
  ]
}

export function defaultSettings(): Settings {
  return {
    retentionDays: 365,
    fetchWindowDays: 14,
    budgetMode: "off",
    budgetsWeekly: {},
    debugOverlay: false,
    devRelay: false,
    onboardedAt: null
  }
}

export function defaultMeta(nowIso: string): MetaState {
  return {
    version: 2,
    settings: defaultSettings(),
    installedAt: nowIso,
    lastSyncedAt: null,
    lastSyncStatus: "never synced",
    lastSyncDiagnostics: null
  }
}
