/**
 * Default category ladder + fallback starter rules + default settings.
 * The onboarding flow (M6) lets the user reshape all of this; these are the
 * non-irritating fallbacks that apply when onboarding is skipped or fails.
 */

import type { Category, MetaState, Rule, Settings, Subcategory } from "./types"

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "deep",        name: "Courses & lectures",       emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 0 },
  { id: "practical",   name: "Practical how-tos",        emoji: "🛠️", color: "#3b82f6", valueScore: 4, order: 1 },
  { id: "informative", name: "Informative talk",         emoji: "🧠", color: "#14b8a6", valueScore: 4, order: 2 },
  { id: "news",        name: "News & updates",           emoji: "📰", color: "#22c55e", valueScore: 3, order: 3 },
  { id: "talk-fun",    name: "Recreational talk",        emoji: "🎙️", color: "#84cc16", valueScore: 2, order: 4 },
  { id: "fun",         name: "Intentional entertainment",emoji: "🎬", color: "#eab308", valueScore: 1, order: 5 },
  { id: "junk-fun",    name: "Mindless entertainment",   emoji: "🍿", color: "#f97316", valueScore: 1, order: 6 },
  { id: "brain-rot",   name: "Brain rot",                emoji: "🧟", color: "#e11d48", valueScore: 0, order: 7 }
]

/**
 * Default subcategories under each parent. Users can rename/reorder/archive/
 * add; existing category-level assignments (no sub) remain valid.
 */
export const DEFAULT_SUBCATEGORIES: Subcategory[] = [
  { id: "brain-rot-shorts", parentId: "brain-rot", name: "Shorts", emoji: "📱", order: 0 },
  { id: "brain-rot-memes", parentId: "brain-rot", name: "Memes & reaction", emoji: "😂", order: 1 },
  { id: "brain-rot-drama", parentId: "brain-rot", name: "Drama", emoji: "🔥", order: 2 },
  { id: "junk-fun-compilations", parentId: "junk-fun", name: "Compilations", emoji: "📼", order: 0 },
  { id: "junk-fun-background", parentId: "junk-fun", name: "Background TV", emoji: "📺", order: 1 },
  { id: "junk-fun-fails", parentId: "junk-fun", name: "Fails & pranks", emoji: "💥", order: 2 },
  { id: "fun-films", parentId: "fun", name: "Films & series", emoji: "🎥", order: 0 },
  { id: "fun-music", parentId: "fun", name: "Music", emoji: "🎵", order: 1 },
  { id: "fun-gaming", parentId: "fun", name: "Gaming", emoji: "🎮", order: 2 },
  { id: "talk-fun-podcasts", parentId: "talk-fun", name: "Recreational podcasts", emoji: "🎧", order: 0 },
  { id: "talk-fun-interviews", parentId: "talk-fun", name: "Interviews", emoji: "💬", order: 1 },
  { id: "talk-fun-comedy", parentId: "talk-fun", name: "Comedy", emoji: "🎤", order: 2 },
  { id: "news-world", parentId: "news", name: "World news", emoji: "🌍", order: 0 },
  { id: "news-sports", parentId: "news", name: "Sports", emoji: "🏆", order: 1 },
  { id: "news-tech", parentId: "news", name: "Tech news", emoji: "💻", order: 2 },
  { id: "informative-essays", parentId: "informative", name: "Video essays", emoji: "📝", order: 0 },
  { id: "informative-explainers", parentId: "informative", name: "Explainers", emoji: "💡", order: 1 },
  { id: "informative-podcasts", parentId: "informative", name: "Intellectual podcasts", emoji: "🧩", order: 2 },
  { id: "practical-coding", parentId: "practical", name: "Coding", emoji: "⌨️", order: 0 },
  { id: "practical-cooking", parentId: "practical", name: "Cooking", emoji: "🍳", order: 1 },
  { id: "practical-diy", parentId: "practical", name: "DIY & maker", emoji: "🔧", order: 2 },
  { id: "practical-research", parentId: "practical", name: "Purchase research", emoji: "🛒", order: 3 },
  { id: "deep-lectures", parentId: "deep", name: "Lectures", emoji: "📚", order: 0 },
  { id: "deep-courses", parentId: "deep", name: "Courses", emoji: "🧑‍🏫", order: 1 },
  { id: "deep-docs", parentId: "deep", name: "Documentaries", emoji: "🎬", order: 2 }
]

/**
 * Fallback starter rules (used until/since onboarding). Deliberately small
 * and visible: two gentle enabled keyword rules + one disabled Shorts rule.
 * Targets are subcategories when a fit is obvious; parent otherwise.
 */
export function fallbackStarterRules(nowIso: string): Rule[] {
  return [
    {
      id: "starter-tutorial",
      name: "Tutorial-ish titles → Practical how-tos › Coding",
      enabled: true,
      priority: 100,
      match: { titleRegex: "\\b(tutorial|how to|guide|walkthrough|step[- ]by[- ]step)\\b", titleRegexFlags: "i" },
      categoryId: "practical-coding",
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    },
    {
      id: "starter-lecture",
      name: "Lecture-ish titles → Courses & lectures › Lectures",
      enabled: true,
      priority: 110,
      match: { titleRegex: "\\b(lecture|course|crash course|seminar|conference talk|documentary)\\b", titleRegexFlags: "i" },
      categoryId: "deep-lectures",
      createdAt: nowIso,
      updatedAt: nowIso,
      hitCount: 0
    },
    {
      id: "starter-shorts",
      name: "Shorts (≤60s) → Brain rot › Shorts",
      enabled: false,
      priority: 120,
      match: { isShort: true },
      categoryId: "brain-rot-shorts",
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
