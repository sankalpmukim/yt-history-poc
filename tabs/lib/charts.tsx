/** Hand-rolled SVG charts: no chart library, tiny bundle.
 *  All charts are interactive: hover highlights and cross-highlights through
 *  shared ids, clicks drill down (usually into a Ledger deep link). */

import { useEffect, useRef, useState } from "react"
import type { DayAgg } from "../../core/aggregate"
import { fmtDur, fmtDate } from "./ui"

/** Round a seconds value up to a readable axis ceiling (15m, 30m, 1h, 2h…). */
function niceCeiling(seconds: number): number {
  const steps = [900, 1800, 3600, 7200, 10800, 14400, 21600, 28800, 43200, 86400]
  return steps.find((step) => step >= seconds) ?? Math.ceil(seconds / 86400) * 86400
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/* ------------------------------------------------------------------ */
/* donut                                                               */
/* ------------------------------------------------------------------ */

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function arcPath(cx: number, cy: number, rOuter: number, rInner: number, fromDeg: number, toDeg: number): string {
  const large = toDeg - fromDeg > 180 ? 1 : 0
  const [x1, y1] = polar(cx, cy, rOuter, toDeg)
  const [x2, y2] = polar(cx, cy, rOuter, fromDeg)
  const [x3, y3] = polar(cx, cy, rInner, fromDeg)
  const [x4, y4] = polar(cx, cy, rInner, toDeg)
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 0 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 1 ${x4} ${y4} Z`
}

/**
 * Interactive share-of-total donut. Hovering (or focusing) a slice calls
 * onHover with its id so parents can cross-highlight rows and bars; the
 * center reads the active slice, or the total when nothing is active.
 */
export function DonutChart({
  slices,
  size = 190,
  thickness = 30,
  activeId = null,
  pinnedId = null,
  onHover,
  onSelect,
  totalLabel = "Total",
  fmtValue = fmtDur,
  ariaLabel = "Share of watch time"
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  /** transient hover id (from this chart or elsewhere) */
  activeId?: string | null
  /** selected/sticky id (from this chart or elsewhere) */
  pinnedId?: string | null
  onHover?: (id: string | null) => void
  onSelect?: (id: string | null) => void
  totalLabel?: string
  fmtValue?: (seconds: number) => string
  ariaLabel?: string
}) {
  const live = slices.filter((s) => s.value > 0)
  const total = live.reduce((a, s) => a + s.value, 0)
  if (live.length === 0 || total <= 0) return null
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 2
  const rInner = rOuter - thickness
  const gapDeg = live.length > 1 ? Math.min(2.4, 180 / live.length) : 0
  const shown = activeId ?? pinnedId
  const shownSlice = live.find((s) => s.id === shown) ?? null

  let angle = 0
  const arcs = live.map((slice) => {
    const sweep = (slice.value / total) * 360
    const from = angle
    const to = angle + sweep
    angle = to
    const isActive = shown === slice.id
    const isDim = shown != null && !isActive
    const bump = isActive ? 3 : 0
    const mid = (from + to) / 2
    const [dx, dy] = [cx + bump * Math.cos(((mid - 90) * Math.PI) / 180), cy + bump * Math.sin(((mid - 90) * Math.PI) / 180)]
    return { slice, from: from + gapDeg / 2, to: to - gapDeg / 2, isActive, isDim, dx, dy, share: slice.value / total }
  })

  return (
    <div className="donut-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => onHover?.(null)}
      >
        {arcs.map(({ slice, from, to, isActive, isDim, dx, dy }) => (
          <path
            key={slice.id}
            d={arcPath(dx, dy, rOuter, rInner, from, to)}
            fill={slice.color}
            className={"donut-slice" + (isActive ? " active" : "") + (isDim ? " dim" : "") + (onSelect ? " clickable" : "")}
            onMouseEnter={() => onHover?.(slice.id)}
            onClick={() => onSelect?.(isActive ? null : slice.id)}
          >
            <title>{`${slice.label}: ${fmtValue(slice.value)}`}</title>
          </path>
        ))}
        <text className="donut-center-value" x={cx} y={cy - 4} textAnchor="middle">
          {fmtValue(shownSlice ? shownSlice.value : total)}
        </text>
        <text className="donut-center-label" x={cx} y={cy + 16} textAnchor="middle">
          {shownSlice ? `${shownSlice.label} · ${Math.round((shownSlice.value / total) * 100)}%` : totalLabel}
        </text>
      </svg>
      <ul className="sr-only">
        {live.map((s) => (
          <li key={s.id}>{`${s.label}: ${fmtValue(s.value)} (${Math.round((s.value / total) * 100)}%)`}</li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* daily stacked bars                                                  */
/* ------------------------------------------------------------------ */

/**
 * Daily stacked bars by category. Segments stack bottom-up in the order the
 * aggregate gives them. Hovering a day dims the others and shows a breakdown
 * tooltip; `focusCategoryId` (from a legend, row or donut elsewhere) dims
 * every other category; clicking a day drills via onDaySelect. A visually
 * hidden table carries the same numbers for screen readers.
 */
export function StackedDailyBars({
  days,
  colorOf,
  labelOf,
  height = 220,
  barW = 16,
  gap = 8,
  maxBars = 120,
  focusCategoryId = null,
  onCategoryHover,
  onDaySelect
}: {
  days: DayAgg[]
  colorOf: (categoryId: string | null) => string
  labelOf: (categoryId: string | null) => string
  height?: number
  barW?: number
  gap?: number
  maxBars?: number
  /** cross-highlight this category, dim the rest */
  focusCategoryId?: string | null
  onCategoryHover?: (id: string | null) => void
  /** click a day to drill into it */
  onDaySelect?: (date: string) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameW, setFrameW] = useState(960)
  const [hoverDay, setHoverDay] = useState<string | null>(null)
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
  const hoverIndex = hoverDay == null ? -1 : shown.findIndex((d) => d.date === hoverDay)
  const hoverDayAgg = hoverIndex >= 0 ? shown[hoverIndex] : null
  return (
    <>
      {truncated ? <p className="muted small" style={{ margin: "0 0 8px" }}>Showing the last {maxBars} days.</p> : null}
      <div ref={frameRef} className="trace-frame" role="region" aria-label="Daily watch time chart" tabIndex={0}>
        <svg className="trace-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" onMouseLeave={() => setHoverDay(null)}>
          {[0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line className="trace-ruler" x1={axisW} y1={y(ceiling * fraction) + 0.5} x2={width} y2={y(ceiling * fraction) + 0.5} />
              <text className="trace-label" x={axisW - 8} y={y(ceiling * fraction) + 4} textAnchor="end">{fmtDur(ceiling * fraction)}</text>
            </g>
          ))}
          {shown.map((day, dayIndex) => {
            const barX = axisW + dayIndex * step + (step - barW) / 2
            const isHover = hoverDay === day.date
            const isDim = hoverDay != null && !isHover
            let top = topPad + chartH
            return (
              <g
                key={day.date}
                className={"day-bar" + (isDim ? " dim" : "") + (isHover ? " hot" : "")}
                onMouseEnter={() => setHoverDay(day.date)}
                onClick={() => onDaySelect?.(day.date)}
                style={onDaySelect ? { cursor: "pointer" } : undefined}
              >
                {day.byCategory.map((slice, i) => {
                  const h = (slice.seconds / ceiling) * chartH
                  top -= h
                  const unfocused = focusCategoryId != null && slice.categoryId !== focusCategoryId
                  return (
                    <rect
                      key={i}
                      x={barX}
                      y={top}
                      width={barW}
                      height={Math.max(h, slice.seconds > 0 ? 1 : 0)}
                      fill={colorOf(slice.categoryId)}
                      className={unfocused ? "cat-dim" : "cat-hot"}
                      onMouseEnter={() => onCategoryHover?.(slice.categoryId ?? null)}
                    />
                  )
                })}
                <rect
                  x={barX - gap / 2}
                  y={topPad}
                  width={barW + gap}
                  height={chartH}
                  fill="transparent"
                />
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
        {hoverDayAgg ? (
          <div
            className="chart-tip"
            style={{ left: clamp01((axisW + hoverIndex * step + step / 2) / width) * 100 + "%" }}
            role="status"
          >
            <b>{fmtDate(hoverDayAgg.date)}</b>
            <span className="chart-tip-total">{fmtDur(hoverDayAgg.seconds)}</span>
            {onDaySelect ? <span className="chart-tip-hint">Click to open this day</span> : null}
            <ul>
              {hoverDayAgg.byCategory.slice(0, 6).map((s) => (
                <li key={s.categoryId ?? "none"}>
                  <span className="swatch" style={{ background: colorOf(s.categoryId) }} aria-hidden="true" />
                  <span className="chart-tip-label">{labelOf(s.categoryId)}</span>
                  <span className="chart-tip-value">{fmtDur(s.seconds)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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

/* ------------------------------------------------------------------ */
/* paired compare bars (two periods)                                   */
/* ------------------------------------------------------------------ */

export interface CompareRow {
  id: string
  label: string
  prevSeconds: number
  currSeconds: number
  color: string
  href?: string
}

/**
 * Horizontal paired bars: previous period as a hollow/muted bar, current as
 * a filled one, per category. Hovering a row emphasizes it and dims the
 * rest; clicking follows `href` (usually a Ledger deep link).
 */
export function PairedCompareBars({ rows, prevLabel = "before", currLabel = "now" }: { rows: CompareRow[]; prevLabel?: string; currLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null)
  if (rows.length === 0) return null
  const max = Math.max(...rows.flatMap((r) => [r.prevSeconds, r.currSeconds]), 1)
  return (
    <div className="compare-bars" onMouseLeave={() => setHover(null)}>
      {rows.map((row) => {
        const dim = hover != null && hover !== row.id
        const delta = row.currSeconds - row.prevSeconds
        const deltaPct = row.prevSeconds > 0 ? Math.round((delta / row.prevSeconds) * 100) : null
        const content = (
          <>
            <div className="compare-row-head">
              <span className="swatch" style={{ background: row.color }} aria-hidden="true" />
              <span className="compare-label">{row.label}</span>
              <span className={"delta " + (delta > 0 ? "up" : delta < 0 ? "down" : "flat")}>
                {delta === 0 ? "level" : `${delta > 0 ? "+" : "−"}${fmtDur(Math.abs(delta))}${deltaPct != null && Math.abs(deltaPct) <= 999 ? ` (${delta > 0 ? "+" : "−"}${Math.abs(deltaPct)}%)` : ""}`}
              </span>
            </div>
            <div className="compare-bar prev" style={{ width: `${Math.max(0.5, (row.prevSeconds / max) * 100)}%` }} />
            <div className="compare-bar curr" style={{ width: `${Math.max(0.5, (row.currSeconds / max) * 100)}%`, background: row.color }} />
            <div className="compare-values">
              <span>{prevLabel} <b>{fmtDur(row.prevSeconds)}</b></span>
              <span>{currLabel} <b>{fmtDur(row.currSeconds)}</b></span>
            </div>
          </>
        )
        return row.href ? (
          <a
            key={row.id}
            href={row.href}
            className={"compare-row" + (dim ? " dim" : "") + (hover === row.id ? " hot" : "")}
            onMouseEnter={() => setHover(row.id)}
          >
            {content}
          </a>
        ) : (
          <div key={row.id} className={"compare-row" + (dim ? " dim" : "") + (hover === row.id ? " hot" : "")} onMouseEnter={() => setHover(row.id)}>
            {content}
          </div>
        )
      })}
    </div>
  )
}
