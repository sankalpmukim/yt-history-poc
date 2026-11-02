/** Resolve YouTube's day-group labels ("Today", "Yesterday", "Friday", "Oct 31") to Dates. */

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Returns the start-of-day Date for a history section label, or null when the
 * label can't be resolved. Uses the most recent plausible occurrence of the
 * label relative to `now`.
 */
export function dayLabelToDate(label: string, now: Date = new Date()): Date | null {
  const l = (label || "").trim().toLowerCase()
  if (!l) return null

  if (l === "today") return startOfDay(now)

  if (l === "yesterday") {
    const d = startOfDay(now)
    d.setDate(d.getDate() - 1)
    return d
  }

  const wd = WEEKDAYS.indexOf(l)
  if (wd >= 0) {
    // Most recent occurrence of this weekday (0..6 days ago).
    const d = startOfDay(now)
    const diff = (d.getDay() - wd + 7) % 7
    d.setDate(d.getDate() - diff)
    return d
  }

  const t = parseMonthDay(label, now)
  if (t != null) return t

  const parsed = Date.parse(label)
  if (!isNaN(parsed)) {
    const d = startOfDay(new Date(parsed))
    // Explicit years are trusted as-is; bare labels are handled above.
    return d
  }

  return null
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
}

/**
 * Parse YouTube's "Oct 31" style labels ourselves.
 *
 * V8's Date.parse("Oct 31") silently returns **2001**-10-31, so the old
 * "current year, roll back if future" logic never ran. Parsing explicitly
 * keeps the intended behaviour: use the current year, and if that date is in
 * the future, assume the previous year (e.g. "Dec 31" seen on Jan 2).
 */
function parseMonthDay(label: string, now: Date): Date | null {
  const m = label.trim().match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/)
  if (!m) return null
  const month = MONTH_INDEX[m[1].slice(0, 3).toLowerCase()]
  const day = Number(m[2])
  if (month == null || !Number.isInteger(day) || day < 1 || day > 31) return null

  const explicitYear = m[3] != null ? Number(m[3]) : null
  if (explicitYear != null) {
    const d = new Date(explicitYear, month, day)
    return isNaN(d.getTime()) ? null : startOfDay(d)
  }

  const d = new Date(now.getFullYear(), month, day)
  if (isNaN(d.getTime())) return null
  if (d.getDate() !== day) return null // e.g. Feb 31
  if (d.getTime() > startOfDay(now).getTime() + 24 * 60 * 60 * 1000) {
    d.setFullYear(d.getFullYear() - 1)
  }
  return startOfDay(d)
}
