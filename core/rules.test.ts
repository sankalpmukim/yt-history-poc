import test from "node:test"
import assert from "node:assert/strict"
import {
  compileRules,
  matchesRule,
  matchFirstRule,
  effectiveCategoryId,
  previewMatches,
  targetOfVideo
} from "./rules"
import type { Rule, VideoRecord } from "./types"
import { guessIsShortFromDuration } from "./duration"

const NOW = new Date(2026, 10, 2, 12, 0, 0).toISOString()
const CATS = new Set(["brain-rot", "fun", "practical", "deep"])

function rule(partial: Partial<Rule> & { match: Rule["match"]; categoryId: string }): Rule {
  return {
    id: partial.id ?? "r" + Math.random().toString(36).slice(2, 7),
    name: partial.name ?? "test rule",
    enabled: partial.enabled ?? true,
    priority: partial.priority ?? 100,
    match: partial.match,
    categoryId: partial.categoryId,
    createdAt: NOW,
    updatedAt: NOW,
    hitCount: 0
  }
}

function video(partial: Partial<VideoRecord> & { videoId: string }): VideoRecord {
  return {
    title: "",
    channel: "",
    url: "",
    durationSec: null,
    durationSource: null,
    isShort: null,
    categoryOverride: null,
    autoCategoryId: null,
    appliedRuleId: null,
    firstSeenAt: NOW,
    lastSeenAt: NOW,
    ...partial
  }
}

/* ------------------------------------------------------------------ */
/* single-condition matching                                           */
/* ------------------------------------------------------------------ */

test("channelEquals is exact but case/space-insensitive", () => {
  const r = rule({ match: { channelEquals: "Formula 1" }, categoryId: "fun" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", channel: "FORMULA 1" })), c[0]))
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", channel: " formula 1 " })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", channel: "Formula 1 Highlights" })), c[0]))
})

test("channelContains is a case-insensitive substring", () => {
  const r = rule({ match: { channelContains: "MIT" }, categoryId: "deep" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", channel: "mit open course ware" })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", channel: "Khan Academy" })), c[0]))
})

test("titleContains is any-of, case-insensitive, blank terms ignored", () => {
  const r = rule({ match: { titleContains: ["tutorial", "HOW TO"] }, categoryId: "practical" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", title: "Git Tutorial for beginners" })), c[0]))
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", title: "how to fold a fitted sheet" })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", title: "F1 highlights" })), c[0]))
  // a list of only blanks matches nothing
  const blank = compileRules([rule({ match: { titleContains: ["", "  "] }, categoryId: "practical" })], CATS)
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", title: "anything" })), blank[0]))
})

test("titleRegex with flags, stateless across calls", () => {
  const r = rule({
    match: { titleRegex: "\\b(lecture|crash course)\\b", titleRegexFlags: "i" },
    categoryId: "deep"
  })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", title: "CS50 LECTURE 3" })), c[0]))
  // word boundary: "lectures" must NOT match \blecture\b
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", title: "lectures are fun" })), c[0]))
  // 'gi' flags get sanitized — repeated tests stay correct
  const g = compileRules(
    [rule({ match: { titleRegex: "cool", titleRegexFlags: "gi" }, categoryId: "fun" })],
    CATS
  )
  const t = targetOfVideo(video({ videoId: "a", title: "so cool so cool" }))
  assert.ok(matchesRule(t, g[0]))
  assert.ok(matchesRule(t, g[0]))
})

test("invalid regex rules are skipped entirely", () => {
  const r = rule({ match: { titleRegex: "(unclosed" }, categoryId: "fun" })
  const c = compileRules([r], CATS)
  assert.equal(c.length, 0)
})

test("isShort: true matches only known shorts; unknown never matches", () => {
  const r = rule({ match: { isShort: true }, categoryId: "brain-rot" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", isShort: true })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", isShort: false })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", isShort: null })), c[0]))
})

test("isShort: false matches only known non-shorts", () => {
  const r = rule({ match: { isShort: false, titleContains: ["doc"] }, categoryId: "deep" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", isShort: false, title: "a doc" })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", isShort: null, title: "a doc" })), c[0]))
})

test("maxDurationSec requires a known duration within the bound", () => {
  const r = rule({ match: { maxDurationSec: 60 }, categoryId: "brain-rot" })
  const c = compileRules([r], CATS)
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", durationSec: 59 })), c[0]))
  assert.ok(matchesRule(targetOfVideo(video({ videoId: "a", durationSec: 60 })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", durationSec: 61 })), c[0]))
  assert.ok(!matchesRule(targetOfVideo(video({ videoId: "a", durationSec: null })), c[0]))
})

test("multiple conditions AND together", () => {
  const r = rule({
    match: { channelContains: "podcast", titleContains: ["history"], maxDurationSec: 7200 },
    categoryId: "deep"
  })
  const c = compileRules([r], CATS)
  assert.ok(
    matchesRule(
      targetOfVideo(video({ videoId: "a", channel: "Some Podcast Channel", title: "A history of Rome", durationSec: 3600 })),
      c[0]
    )
  )
  assert.ok(
    !matchesRule(
      targetOfVideo(video({ videoId: "a", channel: "Some Podcast Channel", title: "A history of Rome", durationSec: 9000 })),
      c[0]
    )
  )
  assert.ok(
    !matchesRule(
      targetOfVideo(video({ videoId: "a", channel: "Some Podcast Channel", title: "Sci-fi picks", durationSec: 3600 })),
      c[0]
    )
  )
})

/* ------------------------------------------------------------------ */
/* resolution order                                                    */
/* ------------------------------------------------------------------ */

test("first match wins in priority order; disabled and bad-category rules skipped", () => {
  const rules = [
    rule({ id: "low", priority: 200, match: { titleContains: ["x"] }, categoryId: "fun" }),
    rule({ id: "off", enabled: false, priority: 1, match: { channelContains: "" }, categoryId: "fun" }),
    rule({ id: "dead", priority: 2, match: { channelContains: "" }, categoryId: "nope" }),
    rule({ id: "high", priority: 10, match: { titleContains: ["x"] }, categoryId: "deep" })
  ]
  const c = compileRules(rules, CATS)
  assert.deepEqual(c.map((x) => x.rule.id), ["high", "low"], "sorted by priority, unusable filtered")
  const hit = matchFirstRule(c, targetOfVideo(video({ videoId: "a", title: "xxx" })))
  assert.equal(hit?.rule.id, "high")
})

test("effectiveCategoryId: manual override beats rules", () => {
  assert.equal(effectiveCategoryId({ categoryOverride: "fun", autoCategoryId: "deep" }), "fun")
  assert.equal(effectiveCategoryId({ categoryOverride: null, autoCategoryId: "deep" }), "deep")
  assert.equal(effectiveCategoryId({ categoryOverride: null, autoCategoryId: null }), null)
})

test("previewMatches counts and samples without assigning", () => {
  const c = compileRules(
    [rule({ match: { titleContains: ["tutorial"] }, categoryId: "practical" })],
    CATS
  )
  const vids = ["a", "b", "c", "d"].map((id, i) =>
    video({ videoId: id, title: i % 2 === 0 ? "Tutorial " + id : "vlog " + id })
  )
  const p = previewMatches(c, vids)
  assert.equal(p.count, 2)
  assert.deepEqual(p.sampleIds, ["a", "c"])
})

/* ------------------------------------------------------------------ */
/* duration → short heuristic                                          */
/* ------------------------------------------------------------------ */

test("guessIsShortFromDuration is conclusive only at the extremes", () => {
  assert.equal(guessIsShortFromDuration(null), null)
  assert.equal(guessIsShortFromDuration(60), true)
  assert.equal(guessIsShortFromDuration(45), true)
  assert.equal(guessIsShortFromDuration(90), null) // ambiguous zone
  assert.equal(guessIsShortFromDuration(180), null)
  assert.equal(guessIsShortFromDuration(181), false)
})
