import test from "node:test"
import assert from "node:assert/strict"
import { computeBudgetStatus, startOfWeek, overBudgetCategories } from "./budget"
import type { Category, VideoRecord, WatchEvent } from "./types"
import { eventKeyOf } from "./types"

const CATS: Category[] = [
  { id: "rot", name: "Rot", emoji: "🧟", color: "#e11d48", valueScore: 0, order: 0 },
  { id: "deep", name: "Deep", emoji: "🎓", color: "#8b5cf6", valueScore: 5, order: 1 }
]

function video(id: string, cat: string | null): VideoRecord {
  return {
    videoId: id,
    title: id,
    channel: "C",
    url: "u",
    durationSec: 600,
    durationSource: "overlay",
    isShort: null,
    categoryOverride: null,
    autoCategoryId: cat,
    appliedRuleId: null,
    firstSeenAt: "",
    lastSeenAt: ""
  }
}

function event(videoId: string, day: string, occurrences = 1): WatchEvent {
  return {
    key: eventKeyOf(videoId, day),
    videoId,
    watchedOn: day,
    progressPct: 100,
    progressAvgPct: 100,
    occurrences,
    firstSeenAt: "",
    lastSeenAt: ""
  }
}

test("startOfWeek lands on Monday 00:00 local", () => {
  // Thu Nov 5 2026 → Mon Nov 2
  const mon = startOfWeek(new Date(2026, 10, 5, 15, 30))
  assert.equal(mon.getDay(), 1)
  assert.equal(mon.getDate(), 2)
  assert.equal(mon.getHours(), 0)
  // Sunday Nov 8 belongs to the week starting Mon Nov 2
  const sun = startOfWeek(new Date(2026, 10, 8, 22, 0))
  assert.equal(sun.getDate(), 2)
  // Monday itself at 00:00
  const monItself = startOfWeek(new Date(2026, 10, 2, 0, 0))
  assert.equal(monItself.getDate(), 2)
})

test("computeBudgetStatus aggregates this week only, budgeted categories only", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0) // Wed Nov 4 — week Mon Nov 2..Sun Nov 8
  const videos = {
    r1: video("r1", "rot"),
    r2: video("r2", "rot"),
    d1: video("d1", "deep"),
    u1: video("u1", null)
  }
  const events = [
    event("r1", "2026-11-02"),      // in week — 600
    event("r2", "2026-11-04", 2),   // in week — 1200
    event("r1", "2026-11-01"),      // BEFORE week (Sunday) — ignored
    event("d1", "2026-11-03"),      // in week but no budget for deep — ignored
    event("u1", "2026-11-03")       // uncategorized — ignored
  ]
  const status = computeBudgetStatus({
    videos,
    events,
    categories: CATS,
    budgetsWeekly: { rot: 1500, deep: 0 },
    now
  })
  assert.equal(status.weekStart, "2026-11-02")
  assert.equal(status.weekEnd, "2026-11-09")
  assert.equal(status.entries.length, 1, "only budgeted categories get entries")
  const rot = status.entries[0]
  assert.equal(rot.spentSec, 1800)
  assert.equal(rot.budgetSec, 1500)
  assert.equal(rot.over, true)
  assert.equal(rot.deltaSec, 300)
  assert.deepEqual([...overBudgetCategories(status)], ["rot"])
  // spentByCategory covers unbudgeted categories too
  assert.equal(status.spentByCategory.deep, 600)
  assert.equal(status.spentByCategory.rot, 1800)
  assert.equal(status.spentByCategory["uncategorized"], undefined, "uncategorized excluded")
})

test("under-budget and no-spend cases", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0)
  const status = computeBudgetStatus({
    videos: { d1: video("d1", "deep") },
    events: [event("d1", "2026-11-03")],
    categories: CATS,
    budgetsWeekly: { deep: 3600, rot: 1800 },
    now
  })
  const deep = status.entries.find((e) => e.categoryId === "deep")!
  assert.equal(deep.over, false)
  assert.equal(deep.deltaSec, -3000)
  const rot = status.entries.find((e) => e.categoryId === "rot")!
  assert.equal(rot.spentSec, 0)
  assert.equal(rot.over, false)
  assert.equal(overBudgetCategories(status).size, 0)
})

test("subcategory watch time rolls up into its top-level budget", () => {
  const now = new Date(2026, 10, 4, 12, 0, 0)
  const subcategories = [
    { id: "deep-lectures", parentId: "deep", name: "Lectures", emoji: "📚", order: 0 }
  ]
  const status = computeBudgetStatus({
    videos: { lecture: video("lecture", "deep-lectures") },
    events: [event("lecture", "2026-11-03")],
    categories: CATS,
    subcategories,
    budgetsWeekly: { deep: 300, "deep-lectures": 1 },
    now
  })
  assert.equal(status.spentByCategory.deep, 600)
  assert.equal(status.entries.length, 1, "budgets remain top-level only")
  assert.equal(status.entries[0].categoryId, "deep")
  assert.equal(status.entries[0].spentSec, 600)
  assert.equal(status.entries[0].over, true)
})
