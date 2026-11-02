/** Shared UI atoms for the dashboard. */

import { useEffect, useRef, useState, type ReactNode } from "react"
import type { BudgetMode, Category, Subcategory } from "../../core/types"
import { chipLabelForTarget } from "../../core/taxonomy"

export function fmtDur(seconds: number | null | undefined): string {
  if (seconds == null) return "—"
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`
}

export function fmtPct(x: number | null | undefined): string {
  return x == null ? "—" : `${Math.round(x * 100)}%`
}

export function fmtDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  })
}

export function StatCard({ value, label, sub }: { value: ReactNode; label: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="v">{value}</div>
      <div className="l">
        {label}
        {sub ? <span className="muted"> · {sub}</span> : null}
      </div>
    </div>
  )
}

export function catColor(cat: Category | undefined): string {
  return cat?.color ?? "#6b7280"
}

export function CategoryChip({
  category,
  targetId,
  categories,
  subcategories,
  onClick,
  small
}: {
  category?: Category | undefined
  targetId?: string | null
  categories?: Category[]
  subcategories?: Subcategory[]
  onClick?: () => void
  small?: boolean
}) {
  const chip =
    targetId !== undefined && categories
      ? chipLabelForTarget(targetId, categories, subcategories ?? [])
      : category
        ? { emoji: category.emoji, text: category.name, color: category.color }
        : null
  if (!chip) {
    return (
      <button className="chip none" onClick={onClick} title="Uncategorized — click to categorize">
        ？ Uncategorized
      </button>
    )
  }
  return (
    <button
      className="chip"
      onClick={onClick}
      style={{ color: chip.color, borderColor: chip.color + "88", fontSize: small ? 11 : undefined }}
      title={chip.text}
    >
      {chip.emoji} {chip.text}
    </button>
  )
}

export interface CategoryChoice {
  categoryId: string | null
  alsoChannelRule: boolean
}

/**
 * Modal category picker: choose a category (or clear the override), with an
 * optional "always categorize this channel" action.
 */
export function CategoryModal({
  title,
  contextLine,
  categories,
  subcategories = [],
  current,
  channel,
  onChoose,
  onClose
}: {
  title: string
  contextLine?: ReactNode
  categories: Category[]
  subcategories?: Subcategory[]
  current: string | null
  channel?: string
  onChoose: (choice: CategoryChoice) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(current)
  const [alsoRule, setAlsoRule] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  const live = categories.filter((c) => !c.archivedAt)
  const liveSubs = (parentId: string) =>
    subcategories.filter((s) => s.parentId === parentId && !s.archivedAt).sort((a, b) => a.order - b.order)
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="menu" style={{ width: 420 }}>
        <h3>{title}</h3>
        {contextLine ? <div className="muted small" style={{ marginBottom: 10 }}>{contextLine}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto" }}>
          {live.map((c) => (
            <div key={c.id}>
              <button
                className="opt"
                onClick={() => setSelected(c.id)}
                style={selected === c.id ? { background: "#262d3d" } : undefined}
              >
                <span>
                  {c.emoji} {c.name}
                </span>
                <span className="muted small" style={{ marginLeft: "auto" }}>
                  value {c.valueScore}/5
                </span>
              </button>
              {liveSubs(c.id).map((s) => (
                <button
                  key={s.id}
                  className="opt"
                  onClick={() => setSelected(s.id)}
                  style={{
                    paddingLeft: 28,
                    ...(selected === s.id ? { background: "#262d3d" } : {})
                  }}
                >
                  <span>
                    {s.emoji} {c.name} › {s.name}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {channel ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0 0" }}>
            <input
              type="checkbox"
              checked={alsoRule}
              onChange={(e) => setAlsoRule(e.target.checked)}
            />
            <span className="small">
              Also always categorize <b>{channel}</b> this way (channel rule)
            </span>
          </label>
        ) : null}
        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          {current ? (
            <button
              className="btn"
              onClick={() => onChoose({ categoryId: null, alsoChannelRule: false })}
            >
              Clear override
            </button>
          ) : null}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={selected == null}
            onClick={() => onChoose({ categoryId: selected, alsoChannelRule: alsoRule })}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

export function RangeBar({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ id: string; label: string }>
}) {
  return (
    <div className="rangebar">
      {options.map((o) => (
        <button
          key={o.id}
          className={"btn btn-sm" + (value === o.id ? " active" : "")}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Accessible segmented control for the on-YouTube enforcement mode.
 *
 * Deliberately NOT a native <select>: QA automation and keyboard users both
 * failed to operate the previous dropdown reliably. These are real buttons in
 * a role="radiogroup" with aria-checked, roving tabindex and arrow keys, so
 * they can be clicked, tabbed to, and switched with Space/Enter.
 */
export const BUDGET_MODE_OPTIONS = [
  { value: "off", label: "Off", hint: "track only" },
  { value: "gentle", label: "Gentle", hint: "highlight" },
  { value: "strict", label: "Strict", hint: "blur / hide" }
] as const

export function BudgetModeControl({
  value,
  onChange,
  compact = false,
  label = "Budget enforcement mode"
}: {
  value: BudgetMode
  onChange: (mode: BudgetMode) => void
  /** hide the one-word hint under each label */
  compact?: boolean
  label?: string
}) {
  const groupRef = useRef<HTMLDivElement | null>(null)
  const index = BUDGET_MODE_OPTIONS.findIndex((o) => o.value === value)

  const choose = (delta: number) => {
    const next =
      (index + delta + BUDGET_MODE_OPTIONS.length) % BUDGET_MODE_OPTIONS.length
    const mode = BUDGET_MODE_OPTIONS[next].value
    onChange(mode)
    const el = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-mode="${mode}"]`
    )
    el?.focus()
  }

  return (
    <div
      ref={groupRef}
      className={"segmented" + (compact ? " compact" : "")}
      role="radiogroup"
      aria-label={label}
      data-testid="budget-mode-control"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault()
          choose(1)
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault()
          choose(-1)
        } else if (e.key === " " || e.key === "Enter") {
          // Let the focused button's click handler run.
        }
      }}
    >
      {BUDGET_MODE_OPTIONS.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label} — ${o.hint}`}
            data-mode={o.value}
            tabIndex={active ? 0 : -1}
            className={"segment" + (active ? " active" : "")}
            onClick={() => onChange(o.value)}
          >
            <span className="segment-mark" aria-hidden="true">
              {active ? "●" : "○"}
            </span>
            <span className="segment-body">
              <span className="segment-label">{o.label}</span>
              {compact ? null : <span className="segment-hint">{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export const RANGE_OPTIONS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "all", label: "All", days: 0 }
] as const

export function rangeFromDate(rangeId: string, now = new Date()): string | null {
  const opt = RANGE_OPTIONS.find((o) => o.id === rangeId)
  if (!opt || opt.days === 0) return null
  const d = new Date(now)
  d.setDate(d.getDate() - (opt.days - 1))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
