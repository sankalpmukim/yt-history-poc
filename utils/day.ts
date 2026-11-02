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

  const t = Date.parse(label)
  if (!isNaN(t)) {
    const d = startOfDay(new Date(t))
    // Labels without a year ("Oct 31") parse to the current year; if that lands
    // in the future, assume the previous year.
    if (d.getTime() > startOfDay(now).getTime() + 24 * 60 * 60 * 1000) {
      d.setFullYear(d.getFullYear() - 1)
    }
    return d
  }

  return null
}
