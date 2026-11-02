/**
 * Duration resolver (M2): backfills missing video durations by fetching
 * public watch pages (`youtube.com/watch?v=ID`), parsing lengthSeconds and
 * the Shorts page type out of the embedded player response.
 *
 * Pure orchestration — the fetcher and sleep are injected, so the loop runs
 * deterministically in unit tests. The service worker provides a real
 * `fetch` bound by host permissions and a small inter-request delay.
 */

import type { VideoRecord } from "./types"
import { extractIsShort, extractLengthSeconds } from "./duration"

export type FetchVideoPage = (videoId: string) => Promise<string | null>

export interface ResolveParams {
  videos: Record<string, VideoRecord>
  queue: string[]
  /** videoId -> failed attempts so far */
  attempts: Record<string, number>
  fetchPage: FetchVideoPage
  now: Date
  maxFetches?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export interface ResolveResult {
  videos: Record<string, VideoRecord>
  /** videoIds still worth fetching later (unresolved, under the attempt cap) */
  remainingQueue: string[]
  attempts: Record<string, number>
  resolvedCount: number
  failedCount: number
}

const MAX_ATTEMPTS = 3

export async function resolveDurations(params: ResolveParams): Promise<ResolveResult> {
  const maxFetches = params.maxFetches ?? 15
  const delayMs = params.delayMs ?? 600
  const sleep =
    params.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const videos: Record<string, VideoRecord> = { ...params.videos }
  const attempts: Record<string, number> = { ...params.attempts }
  const queue: string[] = [...params.queue]
  const requeue: string[] = []

  let fetches = 0
  let resolvedCount = 0
  let failedCount = 0

  while (queue.length > 0 && fetches < maxFetches) {
    const id = queue.shift() as string
    const v = videos[id]
    if (!v || v.durationSec != null || (attempts[id] ?? 0) >= MAX_ATTEMPTS) continue

    fetches++
    let html: string | null = null
    try {
      html = await params.fetchPage(id)
    } catch {
      html = null
    }

    const secs = html != null ? extractLengthSeconds(html) : null
    if (secs != null && html != null) {
      const isShort = extractIsShort(html)
      videos[id] = {
        ...v,
        durationSec: secs,
        durationSource: "watch-page",
        isShort: isShort ?? v.isShort ?? false
      }
      resolvedCount++
      delete attempts[id]
    } else {
      attempts[id] = (attempts[id] ?? 0) + 1
      failedCount++
      if (attempts[id] < MAX_ATTEMPTS) requeue.push(id)
    }

    if (queue.length > 0 && fetches < maxFetches) await sleep(delayMs)
  }

  return {
    videos,
    remainingQueue: [...queue, ...requeue],
    attempts,
    resolvedCount,
    failedCount
  }
}
