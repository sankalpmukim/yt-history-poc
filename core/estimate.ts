/**
 * Watch-time estimation (docs/PLAN.md §5).
 *
 *   watchedSec = durationSec × progressFraction × occurrences
 *   progressFraction = progressAvgPct/100 when known, else 1.0
 *
 * Confidence:
 *   high   — duration + progress known
 *   medium — duration known, progress assumed (no bar ⇒ likely fully watched)
 *   low    — duration unknown (excluded from time totals until resolved)
 */

import type { VideoRecord, WatchEvent } from "./types"

export type EstimateConfidence = "high" | "medium" | "low"

export interface EventEstimate {
  seconds: number | null
  confidence: EstimateConfidence
}

export function estimateEventSeconds(
  event: Pick<WatchEvent, "progressAvgPct" | "occurrences">,
  video: Pick<VideoRecord, "durationSec">
): EventEstimate {
  if (video.durationSec == null) return { seconds: null, confidence: "low" }
  const occurrences = Math.max(1, event.occurrences || 1)
  const fraction =
    event.progressAvgPct != null
      ? Math.min(1, Math.max(0, event.progressAvgPct / 100))
      : 1
  const seconds = Math.round(video.durationSec * fraction * occurrences)
  return {
    seconds,
    confidence: event.progressAvgPct != null ? "high" : "medium"
  }
}

/** Sum estimates over events (nulls skipped) + aggregate confidence. */
export function estimateTotalSeconds(
  pairs: Array<{ event: Pick<WatchEvent, "progressAvgPct" | "occurrences">; video: Pick<VideoRecord, "durationSec"> }>
): { seconds: number; unestimatedCount: number } {
  let seconds = 0
  let unestimatedCount = 0
  for (const p of pairs) {
    const est = estimateEventSeconds(p.event, p.video)
    if (est.seconds == null) unestimatedCount++
    else seconds += est.seconds
  }
  return { seconds, unestimatedCount }
}
