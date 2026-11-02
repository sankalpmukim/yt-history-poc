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
