import test from "node:test"
import assert from "node:assert/strict"
import { resolveDurations } from "./resolve"
import type { VideoRecord } from "./types"

const NOW = new Date(2026, 10, 2, 12, 0, 0)
const noSleep = async () => {}

function vid(videoId: string, durationSec: number | null): VideoRecord {
  return {
    videoId,
    title: `Video ${videoId}`,
    channel: "CHAN",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationSec,
    durationSource: null,
    isShort: null,
    categoryOverride: null,
    autoCategoryId: null,
    appliedRuleId: null,
    firstSeenAt: NOW.toISOString(),
    lastSeenAt: NOW.toISOString()
  }
}

function watchHtml(secs: number, pageType: "WATCH" | "SHORTS" = "WATCH"): string {
  return `<html>var ytInitialPlayerResponse = {"videoDetails":{"lengthSeconds":"${secs}"}}; "webPageType":"WEB_PAGE_TYPE_${pageType}"</html>`
}

test("resolves durations and the shorts fact from watch pages", async () => {
  const fetched: string[] = []
  const out = await resolveDurations({
    videos: { a: vid("a", null), b: vid("b", null) },
    queue: ["a", "b"],
    attempts: {},
    fetchPage: async (id) => {
      fetched.push(id)
      return watchHtml(id === "a" ? 754 : 42, id === "a" ? "WATCH" : "SHORTS")
    },
    now: NOW,
    sleep: noSleep,
    maxFetches: 10,
    delayMs: 0
  })
  assert.equal(out.resolvedCount, 2)
  assert.equal(out.videos.a.durationSec, 754)
  assert.equal(out.videos.a.durationSource, "watch-page")
  assert.equal(out.videos.a.isShort, false)
  assert.equal(out.videos.b.durationSec, 42)
  assert.equal(out.videos.b.isShort, true)
  assert.deepEqual(out.remainingQueue, [])
  assert.deepEqual(fetched, ["a", "b"])
})

test("failed fetches increment attempts, requeue under the cap, drop at the cap", async () => {
  let calls = 0
  const fetchPage = async () => {
    calls++
    return calls <= 3 ? null : watchHtml(100) // 3 failures, then success
  }

  // run 1: fail → 1 attempt, requeued
  let out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: ["a"],
    attempts: {},
    fetchPage,
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.failedCount, 1)
  assert.deepEqual(out.remainingQueue, ["a"])
  assert.equal(out.attempts.a, 1)

  // run 2: fail → 2 attempts, requeued
  out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: out.remainingQueue,
    attempts: out.attempts,
    fetchPage,
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.attempts.a, 2)
  assert.deepEqual(out.remainingQueue, ["a"])

  // run 3: fail → 3 attempts → dropped from the queue for good
  out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: out.remainingQueue,
    attempts: out.attempts,
    fetchPage,
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.attempts.a, 3)
  assert.deepEqual(out.remainingQueue, [], "at cap → not requeued")

  // run 4: a capped video never gets fetched even if present in the queue
  let unexpectedFetch = 0
  out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: ["a"],
    attempts: { a: 3 },
    fetchPage: async () => {
      unexpectedFetch++
      return watchHtml(100)
    },
    now: NOW,
    sleep: noSleep
  })
  assert.equal(unexpectedFetch, 0)
  assert.equal(out.resolvedCount, 0)
})

test("success clears the attempt counter", async () => {
  const out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: ["a"],
    attempts: { a: 2 },
    fetchPage: async () => watchHtml(100),
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.resolvedCount, 1)
  assert.equal(out.attempts.a, undefined)
})

test("skips videos that are gone or already have a duration; respects maxFetches", async () => {
  const fetched: string[] = []
  const out = await resolveDurations({
    videos: { has: vid("has", 100), c: vid("c", null), d: vid("d", null) },
    queue: ["gone", "has", "c", "d"],
    attempts: {},
    fetchPage: async (id) => {
      fetched.push(id)
      return watchHtml(100)
    },
    now: NOW,
    sleep: noSleep,
    maxFetches: 1
  })
  assert.deepEqual(fetched, ["c"], "only the first fetchable video is fetched")
  assert.equal(out.videos.c.durationSec, 100)
  assert.equal(out.videos.d.durationSec, null)
  assert.deepEqual(out.remainingQueue, ["d"])
})

test("unknown page shapes (consent/error) count as failures, not resolutions", async () => {
  const out = await resolveDurations({
    videos: { a: vid("a", null) },
    queue: ["a"],
    attempts: {},
    fetchPage: async () => "<html>consent</html>",
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.resolvedCount, 0)
  assert.equal(out.failedCount, 1)
  assert.equal(out.videos.a.durationSec, null)
  assert.equal(out.videos.a.durationSource, null)
  assert.equal(out.videos.a.isShort, null)
})

test("a resolved video keeps its previous isShort when the page type is unclear", async () => {
  const out = await resolveDurations({
    videos: { a: { ...vid("a", null), isShort: true } },
    queue: ["a"],
    attempts: {},
    fetchPage: async () => '<html>"lengthSeconds":"95"</html>',
    now: NOW,
    sleep: noSleep
  })
  assert.equal(out.videos.a.durationSec, 95)
  assert.equal(out.videos.a.isShort, true)
})
