/** Hand-rolled SVG charts — no chart library, tiny bundle. */

import type { DayAgg } from "../../core/aggregate"
import { fmtDur, fmtDate } from "./ui"

/**
 * Daily stacked bars by category. Each bar's segments stack bottom-up in the
 * category order given by colorOf; hover shows date + total.
 */
export function StackedDailyBars({
  days,
  colorOf,
  labelOf,
  height = 170,
  barW = 14,
  gap = 4,
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
  if (days.length === 0) return <div className="empty">No estimated watch time in this range yet.</div>
  const shown = days.length > maxBars ? days.slice(days.length - maxBars) : days
  const truncated = days.length > shown.length
  const max = Math.max(...shown.map((d) => d.seconds), 1)
  const chartH = height - 34
  const width = Math.max(960, shown.length * (barW + gap))
  const step = width / shown.length
  const points = shown.map((day, i) => `${(i + 0.5) * step},${Math.max(5, chartH - (day.seconds / max) * chartH)}`)
  const path = points.length > 1 ? `M ${points.join(" L ")}` : ""
  return (
    <div style={{ overflowX: "auto" }}>
      {truncated ? (
        <div className="muted small" style={{ marginBottom: 4 }}>
          showing the last {maxBars} days
        </div>
      ) : null}
      <svg className="trace-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily estimated watch time by category">
        {[1, 2, 3].map((quarter) => (
          <line key={quarter} className="trace-ruler" x1={0} y1={(chartH * quarter) / 4} x2={width} y2={(chartH * quarter) / 4} />
        ))}
        {shown.map((day, dayIndex) => {
          const barX = dayIndex * step + (step - barW) / 2
          let y = chartH
          const title = `${fmtDate(day.date)} — ${fmtDur(day.seconds)}\n${day.byCategory
            .map((s) => `${labelOf(s.categoryId)}: ${fmtDur(s.seconds)}`)
            .join("\n")}`
          return (
            <g key={day.date}>
              {day.byCategory.map((slice, i) => {
                const h = (slice.seconds / max) * chartH
                y -= h
                return (
                  <rect
                    key={i}
                    className="trace-bar-segment"
                    x={barX}
                    y={y}
                    width={barW}
                    height={Math.max(h, slice.seconds > 0 ? 1 : 0)}
                    fill={colorOf(slice.categoryId)}
                  >
                    <title>{title}</title>
                  </rect>
                )
              })}
              {/* invisible hit target for the whole column */}
              <rect x={barX} y={0} width={barW} height={chartH} fill="transparent">
                <title>{title}</title>
              </rect>
            </g>
          )
        })}
        {path ? <path className="trace-line" d={path} /> : null}
        {points.map((point, i) => {
          const [cx, cy] = point.split(",").map(Number)
          return <circle key={shown[i].date} className="trace-point" cx={cx} cy={cy} r={3.5} />
        })}
        <line x1={0} y1={chartH + 0.5} x2={width} y2={chartH + 0.5} stroke="var(--border)" />
        {shown.length === 1 ? (
          <text x={width / 2} y={height - 6} fill="var(--muted)" fontSize={10} textAnchor="middle">
            {fmtDate(shown[0].date)}
          </text>
        ) : (
          <>
            <text x={4} y={height - 6} fill="var(--muted)" fontSize={10}>
              {fmtDate(shown[0].date)}
            </text>
            <text x={width} y={height - 6} fill="var(--muted)" fontSize={10} textAnchor="end">
              {fmtDate(shown[shown.length - 1].date)}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}

export interface DonutSlice {
  categoryId: string | null
  seconds: number
}

/** Donut of shares; center shows the total. */
export function Donut({
  slices,
  colorOf,
  labelOf,
  onSliceClick,
  total,
  size = 190,
  thickness = 26
}: {
  slices: DonutSlice[]
  colorOf: (categoryId: string | null) => string
  labelOf: (categoryId: string | null) => string
  onSliceClick?: (categoryId: string | null) => void
  total: number
  size?: number
  thickness?: number
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let cum = 0
  return (
    <svg width={size} height={size} role="img" style={{ flex: "0 0 " + size + "px" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel2)" strokeWidth={thickness} />
      {slices.map((s, i) => {
        const frac = total > 0 ? s.seconds / total : 0
        const dash = frac * c
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colorOf(s.categoryId)}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-cum}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            role={onSliceClick && s.categoryId ? "button" : undefined}
            tabIndex={onSliceClick && s.categoryId ? 0 : undefined}
            aria-label={onSliceClick && s.categoryId ? `Drill into ${labelOf(s.categoryId)}` : undefined}
            style={onSliceClick && s.categoryId ? { cursor: "pointer" } : undefined}
            onClick={() => {
              if (s.categoryId) onSliceClick?.(s.categoryId)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                if (s.categoryId) onSliceClick?.(s.categoryId)
              }
            }}
          >
            <title>{`${labelOf(s.categoryId)}: ${fmtDur(s.seconds)}`}</title>
          </circle>
        )
        cum += dash
        return el
      })}
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        fill="var(--text)"
        fontSize={17}
        fontWeight={700}
      >
        {fmtDur(total)}
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fill="var(--muted)" fontSize={10}>
        estimated
      </text>
    </svg>
  )
}
