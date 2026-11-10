/** Shared UI atoms for the dashboard. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { BudgetMode, Category, Subcategory } from "../../core/types"
import { chipLabelForTarget, labelForTarget } from "../../core/taxonomy"
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

/** "3 watches", "1 watch". Pass the plural when it isn't just +s. */
export function plural(n: number, one: string, many?: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many ?? one + "s"}`
}

/** "just now", "12 minutes ago", "3 hours ago", "yesterday", or a date. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never"
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "never"
  const mins = Math.round((now - then) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${plural(mins, "minute")} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${plural(hours, "hour")} ago`
  if (hours < 48) return "yesterday"
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const NEUTRAL_COLOR = "#737a65"

export function CategoryChip({
  category,
  targetId,
  categories,
  subcategories,
  onClick
}: {
  category?: Category | undefined
  targetId?: string | null
  categories?: Category[]
  subcategories?: Subcategory[]
  onClick?: () => void
}) {
  const chip =
    targetId !== undefined && categories
      ? chipLabelForTarget(targetId, categories, subcategories ?? [])
      : category
        ? { emoji: category.emoji, text: category.name, color: category.color }
        : null
  if (!chip) {
    return (
      <button type="button" className="chip none" onClick={onClick} title="Choose a category">
        Uncategorized
      </button>
    )
  }
  return (
    <button type="button" className="chip" onClick={onClick} title={`${chip.text}. Change category`}>
      <span className="swatch" style={{ background: chip.color }} aria-hidden="true" />
      <span className="chip-text">{chip.text}</span>
    </button>
  )
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal: portal, focus moved in and restored, Tab trapped, Escape
 * closes. Keys are handled at the document by the topmost dialog only, so a
 * dialog opened from another closes only itself, and the trap still works
 * after the focused control unmounts (focus would otherwise fall to <body>).
 */
export function Dialog({
  labelledBy,
  onClose,
  className = "",
  initialFocus,
  children
}: {
  labelledBy: string
  onClose: () => void
  className?: string
  initialFocus?: React.RefObject<HTMLElement>
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    const target = initialFocus?.current ?? dialog?.querySelector<HTMLElement>(FOCUSABLE)
    ;(target ?? dialog)?.focus()
    const isTopmost = () => {
      const all = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
      return all[all.length - 1] === dialog
    }
    const controls = () => Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null)
    const onKey = (event: KeyboardEvent) => {
      if (!dialog || !isTopmost()) return
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return }
      if (event.key !== "Tab") return
      const list = controls()
      if (!list.length) { event.preventDefault(); dialog.focus(); return }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      const inside = active instanceof Node && dialog.contains(active)
      if (!inside) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && (active === first || active === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog || !isTopmost()) return
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.focus()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("focusin", onFocusIn)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("focusin", onFocusIn)
      // Return focus to the opener; if it's gone, to the page itself.
      const fallback = document.getElementById("main")
      setTimeout(() => {
        if (previous && document.contains(previous)) previous.focus()
        else fallback?.focus()
      })
    }
  }, [])
  return createPortal(
    <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={ref} className={`menu ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body
  )
}

export interface CategoryChoice {
  categoryId: string | null
  alsoChannelRule: boolean
}

/** Target of the enabled channel-equals rule for this channel, if one exists. */
export function channelRuleTarget(
  rules: ReadonlyArray<{ enabled: boolean; match: { channelEquals?: string }; categoryId: string }>,
  channel: string | null | undefined
): string | null {
  if (!channel) return null
  const needle = channel.trim().toLowerCase()
  return rules.find((r) => r.enabled && (r.match.channelEquals ?? "").trim().toLowerCase() === needle)?.categoryId ?? null
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
  channelRuleCategoryId,
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
  /** target of an existing enabled channel-equals rule for `channel`, if any */
  channelRuleCategoryId?: string | null
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
  const [draft, setDraft] = useState({ name: "", emoji: "", color: "#6f7f9e" })
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
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
    await writeCategories([...categories, { id, name, emoji: "🏷️", color: "#6f7f9e", valueScore: 0, order: categories.length }])
    await refreshTaxonomy()
    setSelected(id)
    setQuery("")
    setError("")
    inputRef.current?.focus()
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
    inputRef.current?.focus()
  }
  const beginEdit = (item: Category | Subcategory) => {
    const isCategory = "valueScore" in item
    const parent = isCategory ? undefined : categories.find((category) => category.id === item.parentId)
    setEditingId(item.id)
    setDraft({ name: item.name, emoji: item.emoji, color: isCategory ? item.color : item.color ?? parent?.color ?? "#6f7f9e" })
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
    inputRef.current?.focus()
  }

  const chooseWithKeyboard = (key: "ArrowDown" | "ArrowUp" | "Enter") => {
    if (key === "Enter") {
      const id = visibleTargets[activeIndex]
      if (id) setSelected(id)
      return
    }
    if (visibleTargets.length) setActiveIndex((index) => (index + (key === "ArrowDown" ? 1 : -1) + visibleTargets.length) % visibleTargets.length)
  }

  const editForm = (id: string, includeColor = true) => editingId === id
    ? <TaxonomyEditForm draft={draft} setDraft={setDraft} error={error} onSave={() => void saveEdit(id)} onCancel={() => { setEditingId(null); setError(""); inputRef.current?.focus() }} includeColor={includeColor} />
    : null

  return (
    <Dialog labelledBy="taxonomy-picker-title" onClose={onClose} className="taxonomy-dialog" initialFocus={inputRef}>
      <h3 id="taxonomy-picker-title">{title}</h3>
      {contextLine ? <p className="menu-context">{contextLine}</p> : null}
      <label className="taxonomy-search-label" htmlFor="taxonomy-search">Search categories and subcategories</label>
      <input
        ref={inputRef}
        id="taxonomy-search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="taxonomy-options"
        aria-describedby="taxonomy-search-hint"
        aria-activedescendant={visibleTargets[activeIndex] ? `taxonomy-option-${visibleTargets[activeIndex]}` : undefined}
        autoComplete="off"
        type="text"
        value={query}
        placeholder="Type to filter, or to name a new category"
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setError("") }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); chooseWithKeyboard(event.key) }
          if (event.key === "Enter") { event.preventDefault(); chooseWithKeyboard("Enter") }
        }}
      />
      <span id="taxonomy-search-hint" className="sr-only">Use the arrow keys to move through results and Enter to select. Type a new name to create a category.</span>
      {trimmedQuery ? (
        <div className="taxonomy-create-row">
          <button type="button" className="btn btn-sm" disabled={duplicateCategory} onClick={() => void createCategory()}>
            Create category “{trimmedQuery}”
          </button>
          {duplicateCategory ? <span className="muted small">That category already exists.</span> : null}
        </div>
      ) : null}
      {current && !selected ? <div className="taxonomy-notice">This category is archived. Pick an active one, or cancel to keep it.</div> : null}
      <div id="taxonomy-options" role="listbox" aria-label="Available categories and subcategories" className="taxonomy-options">
        {live.map((category) => {
          const subs = liveSubs.filter((sub) => sub.parentId === category.id && matchesSub(sub, category)).sort((a, b) => a.order - b.order)
          return (
            <div key={category.id} className="taxonomy-group">
              {matchesCategory(category) ? (
                <div className="taxonomy-option-row">
                  <button id={`taxonomy-option-${category.id}`} type="button" role="option" tabIndex={-1} aria-selected={selected === category.id} className={`opt${visibleTargets[activeIndex] === category.id ? " keyboard-active" : ""}`} onClick={() => setSelected(category.id)}>
                    <span className="swatch" style={{ background: category.color }} />{category.emoji} {category.name}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm edit-btn" aria-label={`Edit ${category.name}`} onClick={() => beginEdit(category)}>Edit</button>
                </div>
              ) : <div className="taxonomy-parent-label">{category.emoji} {category.name}</div>}
              {editForm(category.id)}
              {subs.map((sub) => (
                <div key={sub.id}>
                  <div className="taxonomy-option-row taxonomy-subrow">
                    <button id={`taxonomy-option-${sub.id}`} type="button" role="option" tabIndex={-1} aria-selected={selected === sub.id} className={`opt${visibleTargets[activeIndex] === sub.id ? " keyboard-active" : ""}`} onClick={() => setSelected(sub.id)}>
                      <span className="swatch" style={{ background: sub.color ?? category.color }} />{sub.emoji} {category.name} › {sub.name}
                    </button>
                    <button type="button" className="btn btn-quiet btn-sm edit-btn" aria-label={`Edit ${sub.name}`} onClick={() => beginEdit(sub)}>Edit</button>
                  </div>
                  {editForm(sub.id)}
                </div>
              ))}
              {trimmedQuery ? (
                <div className="taxonomy-create-row taxonomy-subcreate">
                  <button type="button" className="btn btn-link btn-sm" disabled={duplicateSubParents.has(category.id)} onClick={() => void createSubcategory(category)}>
                    Create “{trimmedQuery}” under {category.name}
                  </button>
                  {duplicateSubParents.has(category.id) ? <span className="muted small">That subcategory already exists.</span> : null}
                </div>
              ) : null}
            </div>
          )
        })}
        {live.length === 0 ? <div className="empty">No active categories yet. Type a name above to create one.</div> : null}
      </div>
      {categories.some((category) => category.archivedAt) || subcategories.some((sub) => sub.archivedAt)
        ? <p className="muted small" style={{ margin: "8px 0 0" }}>Archived categories are hidden here. Videos already in them keep their category.</p>
        : null}
      {error && !editingId ? <div role="alert" className="taxonomy-error">{error}</div> : null}
      {channel && channelRuleCategoryId ? (
        <p className="picker-rule-note" role="note">
          Videos from <b>{channel}</b> already sort into{" "}
          <b>{labelForTarget(channelRuleCategoryId, categories, subcategories)}</b> automatically.
          {current === channelRuleCategoryId
            ? " This pick would just repeat that rule."
            : " Picking something else here only changes this video unless you update the rule."}
        </p>
      ) : null}
      {channel ? (
        <label className="check" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={alsoRule} onChange={(e) => setAlsoRule(e.target.checked)} />
          <span>
            {channelRuleCategoryId
             ? <>Update the {channel} rule to use this category too</>
              : <>Use this for every video from <b>{channel}</b></>}
          </span>
        </label>
      ) : null}
      <div className="menu-footer">
        {canClear ? (
          <button type="button" className="btn btn-quiet" onClick={() => onChoose({ categoryId: null, alsoChannelRule: false })}>
            Reset to automatic
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={selected == null}
          onClick={() => onChoose({ categoryId: selected, alsoChannelRule: alsoRule })}
        >
          Apply
        </button>
      </div>
    </Dialog>
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
    <div className="taxonomy-edit" role="group" aria-label="Edit details">
      <label className="field">Name<input aria-label="Name" autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="field">Emoji<input aria-label="Emoji" maxLength={4} value={draft.emoji} onChange={(event) => setDraft({ ...draft, emoji: event.target.value })} /></label>
      {includeColor ? <label className="field">Color<input aria-label="Color" type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} /></label> : null}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn btn-sm btn-primary" onClick={onSave}>Save</button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={onCancel}>Cancel edit</button>
      </div>
      {error ? <span role="alert" className="taxonomy-error" style={{ width: "100%" }}>{error}</span> : null}
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
  options: ReadonlyArray<{ id: string; label: string }>
}) {
  return (
    <div className="rangebar" role="group" aria-label="Date range">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
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
 * Accessible segmented control for the on-YouTube enforcement mode: real
 * buttons in a radiogroup with roving tabindex and arrow keys (a native
 * <select> proved unreliable for keyboard users and automation).
 */
export const BUDGET_MODE_OPTIONS = [
  { value: "off", label: "Off", hint: "Just track", detail: "YouTube looks the same. Budgets only show up here." },
  { value: "gentle", label: "Gentle", hint: "Flag videos", detail: "Over-budget videos get an outline and a label, and watch pages show a note you can dismiss." },
  { value: "strict", label: "Strict", hint: "Hide videos", detail: "Over-budget thumbnails and titles are covered until you click them, and watch pages ask before playing." }
] as const

export function budgetModeDetail(mode: BudgetMode): string {
  return BUDGET_MODE_OPTIONS.find((o) => o.value === mode)?.detail ?? ""
}

export function BudgetModeControl({
  value,
  onChange,
  compact = false,
  label = "What happens on YouTube"
}: {
  value: BudgetMode
  onChange: (mode: BudgetMode) => void
  /** hide the short hint under each label */
  compact?: boolean
  label?: string
}) {
  const groupRef = useRef<HTMLDivElement | null>(null)
  const index = BUDGET_MODE_OPTIONS.findIndex((o) => o.value === value)

  const choose = (delta: number) => {
    const next = (index + delta + BUDGET_MODE_OPTIONS.length) % BUDGET_MODE_OPTIONS.length
    const mode = BUDGET_MODE_OPTIONS[next].value
    onChange(mode)
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)?.focus()
  }

  return (
    <div
      ref={groupRef}
      className={"segmented" + (compact ? " compact" : "")}
      role="radiogroup"
      aria-label={label}
      data-testid="budget-mode-control"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); choose(1) }
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); choose(-1) }
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
            aria-label={`${o.label}: ${o.hint}`}
            data-mode={o.value}
            tabIndex={active ? 0 : -1}
            className={"segment" + (active ? " active" : "")}
            onClick={() => onChange(o.value)}
          >
            <span className="segment-label">{o.label}</span>
            {compact ? null : <span className="segment-hint">{o.hint}</span>}
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
