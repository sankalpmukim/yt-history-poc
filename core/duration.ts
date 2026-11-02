/**
 * Pure parsing helpers for duration / progress strings found in YouTube data.
 * Usable in every world (MAIN, isolated, SW) and in node tests.
 */

/**
 * Parse a duration badge like "12:34", "1:02" or "1:23:45" into seconds.
 * Returns null for anything unparseable ("LIVE", "PREMIERE", "", garbage).
 */
export function parseDurationText(text: string | null | undefined): number | null {
  if (!text) return null
  const t = String(text).trim()
  if (!/^\d{1,4}(:\d{2}){1,2}$/.test(t)) return null
  const parts = t.split(":").map((p) => parseInt(p, 10))
  let secs = 0
  for (const p of parts) secs = secs * 60 + p
  return secs
}

/**
 * Parse a watch-state string like "Watched 16%" into the percent number.
 * Returns null when there is no progress information.
 */
export function parseProgressPct(watchState: string | null | undefined): number | null {
  if (!watchState) return null
  const m = /watched\s+(\d+)\s*%/i.exec(String(watchState))
  if (!m) return null
  const pct = parseInt(m[1], 10)
  if (isNaN(pct) || pct < 0 || pct > 100) return null
  return pct
}

/**
 * Extract lengthSeconds from a watch-page HTML payload
 * (ytInitialPlayerResponse → videoDetails.lengthSeconds).
 */
export function extractLengthSeconds(html: string): number | null {
  const m = /"lengthSeconds":"(\d+)"/.exec(html)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Detect whether a watch page is a Shorts page (canonical /shorts/ URL →
 * WEB_PAGE_TYPE_SHORTS). Returns null when the page type can't be determined
 * (e.g. a consent interstitial or an error page).
 */
export function extractIsShort(html: string): boolean | null {
  if (/"webPageType":"WEB_PAGE_TYPE_SHORTS"/.test(html)) return true
  if (/"webPageType":"WEB_PAGE_TYPE_WATCH"/.test(html)) return false
  return null
}

/**
 * Best-effort Shorts guess from duration alone (used when only the history
 * overlay duration is known). Shorts can now run to ~3 minutes, so only the
 * extremes are conclusive:
 *   ≤60s   → true  (practically all ≤60s videos are Shorts)
 *   61–180s → null (ambiguous; wait for the resolver's page-type answer)
 *   >180s  → false (too long to be a Short)
 */
export function guessIsShortFromDuration(durationSec: number | null): boolean | null {
  if (durationSec == null) return null
  if (durationSec <= 60) return true
  if (durationSec <= 180) return null
  return false
}
