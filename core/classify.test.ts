import test from "node:test"
import assert from "node:assert/strict"
import { classifyForBudget, isCategoryOverBudget, isTargetOverBudget } from "./classify"
import { DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES } from "./defaults"
import { compileRules } from "./rules"
import type { Rule, VideoRecord } from "./types"

const NOW = new Date().toISOString()
const CATS = new Set(["brain-rot", "fun", "practical"])

function rule(partial: Partial<Rule> & { match: Rule["match"]; categoryId: string }): Rule {
  return {
    id: partial.id ?? "r1",
    name: "r",
    enabled: partial.enabled ?? true,
    priority: partial.priority ?? 100,
    match: partial.match,
    categoryId: partial.categoryId,
    createdAt: NOW,
    updatedAt: NOW,
    hitCount: 0
  }
}

function stored(over: Partial<VideoRecord>): VideoRecord {
  return {
    videoId: "aaaaaaaaaaa",
    title: "t",
    channel: "c",
    url: "u",
    durationSec: null,
    durationSource: null,
    isShort: null,
    categoryOverride: null,
    autoCategoryId: null,
    appliedRuleId: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...over
  }
}

test("stored override wins over stored auto and live rules", () => {
  const compiled = compileRules(
    [rule({ match: { titleContains: ["tutorial"] }, categoryId: "practical" })],
    CATS
  )
  const cat = classifyForBudget(
    {
      stored: stored({
        categoryOverride: "fun",
        autoCategoryId: "practical",
        title: "Docker tutorial"
      }),
      title: "Docker tutorial",
      channel: "X",
      durationSec: null,
      isShort: null
    },
    compiled
  )
  assert.equal(cat, "fun")
})

test("stored auto-category used when no override", () => {
  const cat = classifyForBudget(
    {
      stored: stored({ autoCategoryId: "practical" }),
      title: "",
      channel: "",
      durationSec: null,
      isShort: null
    },
    []
  )
  assert.equal(cat, "practical")
})

test("live rules classify unseen videos; unknown stays null (fail-open)", () => {
  const compiled = compileRules(
    [rule({ match: { channelEquals: "FORMULA 1" }, categoryId: "fun" })],
    CATS
  )
  assert.equal(
    classifyForBudget(
      { stored: undefined, title: "Race", channel: "FORMULA 1", durationSec: 600, isShort: false },
      compiled
    ),
    "fun"
  )
  assert.equal(
    classifyForBudget(
      { stored: undefined, title: "cats", channel: "Random", durationSec: null, isShort: null },
      compiled
    ),
    null
  )
})

test("live guard classification uses visible title and channel with channel rule precedence", () => {
  const compiled = compileRules(
    [
      rule({
        id: "channel-first",
        priority: 1,
        match: { channelContains: "NASA" },
        categoryId: "practical"
      }),
      rule({
        id: "title-catchall",
        priority: 10,
        match: { titleRegex: ".", titleRegexFlags: "i" },
        categoryId: "fun"
      })
    ],
    CATS
  )

  assert.equal(
    classifyForBudget(
      { stored: undefined, title: "Artemis mission update", channel: "NASA", durationSec: 900, isShort: false },
      compiled
    ),
    "practical",
    "the channel substring rule wins even though the title catch-all also matches"
  )
  assert.equal(
    classifyForBudget(
      { stored: undefined, title: "A cooking video", channel: "Other channel", durationSec: 900, isShort: false },
      compiled
    ),
    "fun",
    "the title regex classifies ordinary visible titles from unmatched channels"
  )
  assert.equal(
    classifyForBudget(
      { stored: undefined, title: "", channel: "Other channel", durationSec: 900, isShort: false },
      compiled
    ),
    null,
    "empty titles do not match the catch-all regex"
  )
})

test("uncategorized stored video still gets a live-rule match from DOM facts", () => {
  const compiled = compileRules(
    [rule({ match: { isShort: true }, categoryId: "brain-rot" })],
    CATS
  )
  assert.equal(
    classifyForBudget(
      {
        stored: stored({ autoCategoryId: null, isShort: null }),
        title: "clip",
        channel: "x",
        durationSec: 40,
        isShort: true
      },
      compiled
    ),
    "brain-rot"
  )
})

test("isCategoryOverBudget fails open for unknown", () => {
  const over = new Set(["brain-rot"])
  assert.equal(isCategoryOverBudget("brain-rot", over), true)
  assert.equal(isCategoryOverBudget("fun", over), false)
  assert.equal(isCategoryOverBudget(null, over), false)
})

test("isTargetOverBudget rolls a subcategory up to its parent", () => {
  const over = new Set(["practical"])
  assert.equal(
    isTargetOverBudget("practical-coding", over, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES),
    true
  )
  assert.equal(
    isTargetOverBudget("deep-lectures", over, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES),
    false
  )
  assert.equal(isTargetOverBudget(null, over, DEFAULT_CATEGORIES, DEFAULT_SUBCATEGORIES), false)
})
