/** Shared UI atoms for the dashboard. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { BudgetMode, Category, Subcategory } from "../../core/types"
import { chipLabelForTarget } from "../../core/taxonomy"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"
import { writeCategories, writeSubcategories } from "./data"

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
 * Shared, searchable taxonomy picker. Creation and inline edits are persisted
 * immediately; assignment remains an explicit final action.
 */
export function TaxonomyPicker({
  title,
  contextLine,
  categories,
  subcategories = [],
  current,
  canClear = current != null,
  channel,
  onChoose,
  onClose,
  reload
}: {
  title: string
  contextLine?: ReactNode
  categories: Category[]
  subcategories?: Subcategory[]
  current: string | null
  canClear?: boolean
  channel?: string
  onChoose: (choice: CategoryChoice) => void
  onClose: () => void
  reload: () => Promise<void>
}) {
  const [selected, setSelected] = useState<string | null>(
    categories.some((category) => category.id === current && !category.archivedAt) ||
    subcategories.some((sub) => sub.id === current && !sub.archivedAt)
      ? current
      : null
  )
  const [alsoRule, setAlsoRule] = useState(false)
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ name: "", emoji: "", color: "#3b82f6" })
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const live = useMemo(() => categories.filter((category) => !category.archivedAt), [categories])
  const liveSubs = useMemo(() => subcategories.filter((sub) => !sub.archivedAt), [subcategories])
  const trimmedQuery = query.trim()
  const lowerQuery = trimmedQuery.toLocaleLowerCase()
  const matchesCategory = (category: Category) => !lowerQuery || `${category.emoji} ${category.name}`.toLocaleLowerCase().includes(lowerQuery)
  const matchesSub = (sub: Subcategory, parent: Category) => !lowerQuery || `${sub.emoji} ${parent.name} ${sub.name}`.toLocaleLowerCase().includes(lowerQuery)
  const visibleTargets = live.flatMap((category) => [
    ...(matchesCategory(category) ? [category.id] : []),
    ...liveSubs.filter((sub) => sub.parentId === category.id && matchesSub(sub, category)).map((sub) => sub.id)
  ])
  const duplicateCategory = trimmedQuery.length > 0 && categories.some((category) => category.name.trim().toLocaleLowerCase() === lowerQuery)
  const duplicateSubParents = new Set(subcategories.filter((sub) => sub.name.trim().toLocaleLowerCase() === lowerQuery).map((sub) => sub.parentId))

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => previousFocus?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const uniqueId = (name: string) => {
    const base = name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 32) || "category"
    const used = new Set([...categories.map((item) => item.id), ...subcategories.map((item) => item.id)])
    let id = base
    for (let suffix = 2; used.has(id); suffix++) id = `${base.slice(0, 27)}-${suffix}`
    return id
  }
  const refreshTaxonomy = async () => {
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }
  const createCategory = async () => {
    const name = trimmedQuery
    if (!name || duplicateCategory) return
    const id = uniqueId(name)
    await writeCategories([...categories, { id, name, emoji: "🏷️", color: "#3b82f6", valueScore: 0, order: categories.length }])
    await refreshTaxonomy()
    setSelected(id)
    setQuery("")
    setError("")
  }
  const createSubcategory = async (parent: Category) => {
    const name = trimmedQuery
    if (!name || duplicateSubParents.has(parent.id)) return
    const id = uniqueId(`${parent.id}-${name}`)
    const siblings = liveSubs.filter((sub) => sub.parentId === parent.id)
    await writeSubcategories([...subcategories, { id, parentId: parent.id, name, emoji: "•", color: parent.color, order: siblings.length }])
    await refreshTaxonomy()
    setSelected(id)
    setQuery("")
    setError("")
  }
  const beginEdit = (item: Category | Subcategory) => {
    const isCategory = "valueScore" in item
    const parent = isCategory ? undefined : categories.find((category) => category.id === item.parentId)
    setEditingId(item.id)
    setDraft({ name: item.name, emoji: item.emoji, color: isCategory ? item.color : item.color ?? parent?.color ?? "#3b82f6" })
    setError("")
  }
  const saveEdit = async (id: string) => {
    const name = draft.name.trim()
    if (!name) {
      setError("Name cannot be empty.")
      return
    }
    const category = categories.find((item) => item.id === id)
    const subcategory = subcategories.find((item) => item.id === id)
    const isDuplicate = category
      ? categories.some((item) => item.id !== id && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
      : subcategories.some((item) => item.id !== id && item.parentId === subcategory?.parentId && item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
    if (isDuplicate) {
      setError("That name is already used in this list.")
      return
    }
    if (category) {
      await writeCategories(categories.map((item) => item.id === id ? { ...item, name, emoji: draft.emoji.trim() || "🏷️", color: draft.color } : item))
    } else {
      await writeSubcategories(subcategories.map((item) => item.id === id ? { ...item, name, emoji: draft.emoji.trim() || "•", color: draft.color } : item))
    }
    await refreshTaxonomy()
    setEditingId(null)
    setError("")
  }

  const chooseWithKeyboard = (key: "ArrowDown" | "ArrowUp" | "Enter") => {
    if (key === "Enter") {
      const id = visibleTargets[activeIndex]
      if (id) setSelected(id)
      return
    }
    if (visibleTargets.length) setActiveIndex((index) => (index + (key === "ArrowDown" ? 1 : -1) + visibleTargets.length) % visibleTargets.length)
  }

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="menu taxonomy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="taxonomy-picker-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return
          const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
          ) ?? []).filter((element) => element.offsetParent !== null)
          if (!controls.length) { event.preventDefault(); inputRef.current?.focus(); return }
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
        }}
      >
        <h3 id="taxonomy-picker-title">{title}</h3>
        {contextLine ? <div className="muted small" style={{ marginBottom: 10 }}>{contextLine}</div> : null}
        <label className="small taxonomy-search-label" htmlFor="taxonomy-search">Search or create</label>
        <input
          ref={inputRef}
          id="taxonomy-search"
          role="combobox"
          aria-label="Search categories and subcategories"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="taxonomy-options"
          aria-activedescendant={visibleTargets[activeIndex] ? `taxonomy-option-${visibleTargets[activeIndex]}` : undefined}
          autoComplete="off"
          type="text"
          value={query}
          placeholder="Type a category or subcategory…"
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setError("") }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); chooseWithKeyboard(event.key) }
            if (event.key === "Enter") { event.preventDefault(); chooseWithKeyboard("Enter") }
          }}
        />
        {trimmedQuery ? (
          <div className="taxonomy-create-row">
            <button type="button" className="btn btn-sm" disabled={duplicateCategory} onClick={() => void createCategory()}>
              Create category “{trimmedQuery}”
            </button>
            {duplicateCategory ? <span className="muted small">That category already exists.</span> : null}
          </div>
        ) : null}
        {current && !selected ? <div className="taxonomy-notice">The current assignment is archived. It remains on existing history but cannot be selected for new assignments.</div> : null}
        {categories.some((category) => category.archivedAt) || subcategories.some((sub) => sub.archivedAt)
          ? <div className="muted small">Archived items stay on existing history and are hidden from new picks.</div>
          : null}
        <div id="taxonomy-options" role="listbox" aria-label="Available categories and subcategories" className="taxonomy-options">
          {live.map((category) => {
            const subs = liveSubs.filter((sub) => sub.parentId === category.id && matchesSub(sub, category)).sort((a, b) => a.order - b.order)
            return (
              <div key={category.id} className="taxonomy-group">
                {matchesCategory(category) ? (
                  <div className="taxonomy-option-row">
                    <button id={`taxonomy-option-${category.id}`} type="button" role="option" aria-selected={selected === category.id} className={`opt${visibleTargets[activeIndex] === category.id ? " keyboard-active" : ""}`} onClick={() => setSelected(category.id)}>
                      <span className="swatch" style={{ background: category.color }} />{category.emoji} {category.name}
                    </button>
                    <button type="button" className="btn btn-sm" aria-label={`Edit ${category.name}`} onClick={() => beginEdit(category)}>Edit</button>
                  </div>
                ) : <div className="taxonomy-parent-label">{category.emoji} {category.name}</div>}
                {editingId === category.id ? <TaxonomyEditForm draft={draft} setDraft={setDraft} error={error} onSave={() => void saveEdit(category.id)} onCancel={() => { setEditingId(null); setError("") }} /> : null}
                {subs.map((sub) => (
                  <div key={sub.id}>
                    <div className="taxonomy-option-row taxonomy-subrow">
                      <button id={`taxonomy-option-${sub.id}`} type="button" role="option" aria-selected={selected === sub.id} className={`opt${visibleTargets[activeIndex] === sub.id ? " keyboard-active" : ""}`} onClick={() => setSelected(sub.id)}>
                        <span className="swatch" style={{ background: sub.color ?? category.color }} />{sub.emoji} {category.name} › {sub.name}
                      </button>
                      <button type="button" className="btn btn-sm" aria-label={`Edit ${sub.name}`} onClick={() => beginEdit(sub)}>Edit</button>
                    </div>
                    {editingId === sub.id ? <TaxonomyEditForm draft={draft} setDraft={setDraft} error={error} onSave={() => void saveEdit(sub.id)} onCancel={() => { setEditingId(null); setError("") }} includeColor /> : null}
                  </div>
                ))}
                {trimmedQuery ? (
                  <div className="taxonomy-create-row taxonomy-subcreate">
                    <button type="button" className="btn btn-sm" disabled={duplicateSubParents.has(category.id)} onClick={() => void createSubcategory(category)}>
                      Create “{trimmedQuery}” under {category.name}
                    </button>
                    {duplicateSubParents.has(category.id) ? <span className="muted small">That subcategory already exists.</span> : null}
                  </div>
                ) : null}
              </div>
            )
          })}
          {live.length === 0 ? <div className="empty">No active categories. Create one above.</div> : null}
        </div>
        {error && !editingId ? <div role="alert" className="taxonomy-error">{error}</div> : null}
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
          {canClear ? (
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

function TaxonomyEditForm({
  draft,
  setDraft,
  error,
  onSave,
  onCancel,
  includeColor = true
}: {
  draft: { name: string; emoji: string; color: string }
  setDraft: (draft: { name: string; emoji: string; color: string }) => void
  error: string
  onSave: () => void
  onCancel: () => void
  includeColor?: boolean
}) {
  return (
    <div className="taxonomy-edit" aria-label="Edit taxonomy item">
      <label className="small">Name<input aria-label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="small">Emoji<input aria-label="Emoji" maxLength={4} value={draft.emoji} onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} /></label>
      {includeColor ? <label className="small">Color<input aria-label="Color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label> : null}
      {error ? <span role="alert" className="taxonomy-error">{error}</span> : null}
      <div className="row"><button type="button" className="btn btn-sm btn-primary" onClick={onSave}>Save</button><button type="button" className="btn btn-sm" onClick={onCancel}>Cancel edit</button></div>
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
