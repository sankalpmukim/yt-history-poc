/** Hand-rolled SVG charts: no chart library, tiny bundle. */

import { useEffect, useRef, useState } from "react"
import type { DayAgg } from "../../core/aggregate"
import { fmtDur, fmtDate } from "./ui"

/** Round a seconds value up to a readable axis ceiling (15m, 30m, 1h, 2h…). */
function niceCeiling(seconds: number): number {
  const steps = [900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200, 86400]
  return steps.find((step) => step >= seconds) ?? Math.ceil(seconds / 86400) * 86400
}

/**
 * Daily stacked bars by category. Segments stack bottom-up in the order the
 * aggregate gives them. Hover shows the day's breakdown; a visually hidden
 * table carries the same numbers for screen readers.
 */
export function StackedDailyBars({
  days,
  colorOf,
  labelOf,
  height = 220,
  barW = 16,
  gap = 8,
  maxBars = 120
}: {
  days: DayAgg[]
  colorOf: (categoryId: string | null) => string
  labelOf: (categoryId: string | null) => string
  height?: number
  barW?: number
  gap?: number
  maxBars?: number
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameW, setFrameW] = useState(960)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => setFrameW(Math.max(320, el.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [days.length > 0])
  if (days.length === 0) return <p className="empty">No watch time in this range yet. Open YouTube while signed in and the next sync fills this in.</p>
  const shown = days.length > maxBars ? days.slice(days.length - maxBars) : days
  const truncated = days.length > shown.length
  const ceiling = niceCeiling(Math.max(...shown.map((d) => d.seconds), 1))
  const axisW = 48
  const topPad = 12
  const chartH = height - 28 - topPad
  const plotW = Math.max(frameW - axisW, shown.length * (barW + gap))
  const width = plotW + axisW
  const step = plotW / shown.length
  const y = (seconds: number) => topPad + chartH - (seconds / ceiling) * chartH
  return (
    <>
      {truncated ? <p className="muted small" style={{ margin: "0 0 8px" }}>Showing the last {maxBars} days.</p> : null}
      <div ref={frameRef} className="trace-frame" role="region" aria-label="Daily watch time chart" tabIndex={0}>
        <svg className="trace-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {[0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line className="trace-ruler" x1={axisW} y1={y(ceiling * fraction) + 0.5} x2={width} y2={y(ceiling * fraction) + 0.5} />
              <text className="trace-label" x={axisW - 8} y={y(ceiling * fraction) + 4} textAnchor="end">{fmtDur(ceiling * fraction)}</text>
            </g>
          ))}
          {shown.map((day, dayIndex) => {
            const barX = axisW + dayIndex * step + (step - barW) / 2
            let top = topPad + chartH
            const title = `${fmtDate(day.date)}: ${fmtDur(day.seconds)}\n${day.byCategory
              .map((s) => `${labelOf(s.categoryId)}: ${fmtDur(s.seconds)}`)
              .join("\n")}`
            return (
              <g key={day.date}>
                {day.byCategory.map((slice, i) => {
                  const h = (slice.seconds / ceiling) * chartH
                  top -= h
                  return (
                    <rect key={i} x={barX} y={top} width={barW} height={Math.max(h, slice.seconds > 0 ? 1 : 0)} fill={colorOf(slice.categoryId)} />
                  )
                })}
                <rect x={barX - gap / 2} y={topPad} width={barW + gap} height={chartH} fill="transparent">
                  <title>{title}</title>
                </rect>
              </g>
            )
          })}
          <line className="trace-axis" x1={axisW} y1={topPad + chartH + 0.5} x2={width} y2={topPad + chartH + 0.5} />
          {shown.length === 1 ? (
            <text className="trace-label" x={axisW + plotW / 2} y={height - 6} textAnchor="middle">{fmtDate(shown[0].date)}</text>
          ) : (
            <>
              <text className="trace-label" x={axisW} y={height - 6}>{fmtDate(shown[0].date)}</text>
              <text className="trace-label" x={width} y={height - 6} textAnchor="end">{fmtDate(shown[shown.length - 1].date)}</text>
            </>
          )}
        </svg>
      </div>
      <table className="sr-only">
        <caption>Estimated watch time per day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Total</th><th scope="col">Breakdown</th></tr></thead>
        <tbody>
          {shown.map((day) => (
            <tr key={day.date}>
              <td>{fmtDate(day.date)}</td>
              <td>{fmtDur(day.seconds)}</td>
              <td>{day.byCategory.map((s) => `${labelOf(s.categoryId)} ${fmtDur(s.seconds)}`).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
