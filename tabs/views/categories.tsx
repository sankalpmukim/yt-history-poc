/** Categories: the value ladder, highest at the top, with drag, keyboard and button reordering. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { writeCategories, writeSubcategories } from "../lib/data"
import type { Category, Subcategory } from "../../core/types"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"
import { aggregateRange } from "../../core/aggregate"
import { reorderById, scoreAtPosition } from "../../core/taxonomy"
import { ledgerHref } from "../lib/router"
import { fmtDur, fmtPct, plural } from "../lib/ui"

export function CategoriesView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const categories = useMemo(() => [...data.categories].sort((a, b) => a.order - b.order), [data.categories])
  const subs = useMemo(() => [...data.subcategories].sort((a, b) => a.order - b.order), [data.subcategories])
  const rulesUsing = (id: string) => data.rules.filter((rule) => rule.categoryId === id).length

  // Usage behind each row: what reordering is actually trading off.
  const usage = useMemo(() => {
    const agg = aggregateRange({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      from: null
    })
    const total = agg.totalSeconds || 1
    const byTop = new Map<string, { seconds: number; watches: number }>()
    const bySub = new Map<string, { seconds: number; watches: number }>()
    for (const row of agg.rows) {
      const secs = row.estimatedSeconds ?? 0
      const top = byTop.get(row.categoryId ?? "none") ?? { seconds: 0, watches: 0 }
      top.seconds += secs
      top.watches++
      byTop.set(row.categoryId ?? "none", top)
      if (row.subcategoryId != null) {
        const s = bySub.get(row.subcategoryId) ?? { seconds: 0, watches: 0 }
        s.seconds += secs
        s.watches++
        bySub.set(row.subcategoryId, s)
      }
    }
    return { byTop, bySub, total }
  }, [data])
  const usageLabel = (id: string, map: Map<string, { seconds: number; watches: number }>) => {
    const u = map.get(id) ?? { seconds: 0, watches: 0 }
    if (u.seconds === 0) return ""
    const share = u.seconds / usage.total
    return `${fmtDur(u.seconds)} · ${fmtPct(share)} · ${plural(u.watches, "watch", "watches")}`
  }

  const persist = async (next: Category[]) => {
    await writeCategories(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }
  const persistSubs = async (next: Subcategory[]) => {
    await writeSubcategories(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }
  const [announcement, setAnnouncement] = useState("")
  const moveCategory = (id: string, to: number) => {
    const name = categories.find((category) => category.id === id)?.name ?? "Category"
    setAnnouncement(`${name} moved to position ${to + 1} of ${categories.length}.`)
    return persist(reorderById(categories, id, to))
  }
  const moveSubcategory = (parentId: string, id: string, to: number) => {
    const siblings = subs.filter((sub) => sub.parentId === parentId)
    setAnnouncement(`${siblings.find((sub) => sub.id === id)?.name ?? "Subcategory"} moved to position ${to + 1} of ${siblings.length}.`)
    const reordered = reorderById(siblings, id, to).map((sub, order) => ({ ...sub, order }))
    const byId = new Map(reordered.map((sub) => [sub.id, sub]))
    return persistSubs(subs.map((sub) => byId.get(sub.id) ?? sub))
  }
  const dragStart = (event: React.DragEvent, kind: "category" | "subcategory", id: string, parentId?: string) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", JSON.stringify({ kind, id, parentId }))
  }
  const dropCategory = (event: React.DragEvent, targetIndex: number) => {
    event.preventDefault()
    try {
      const source = JSON.parse(event.dataTransfer.getData("text/plain")) as { kind: string; id: string }
      if (source.kind === "category") void moveCategory(source.id, targetIndex)
    } catch { /* Ignore malformed external drops. */ }
  }
  const dropSubcategory = (event: React.DragEvent, parentId: string, targetIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      const source = JSON.parse(event.dataTransfer.getData("text/plain")) as { kind: string; id: string; parentId?: string }
      if (source.kind === "subcategory" && source.parentId === parentId) void moveSubcategory(parentId, source.id, targetIndex)
    } catch { /* Ignore malformed external drops. */ }
  }
  const pausedRules = (id: string, archived: boolean) => {
    const count = rulesUsing(id)
    if (count === 0) return null
    return archived
      ? <span className="small text-warn">{plural(count, "rule")} paused while archived</span>
      : <span className="item-meta">{plural(count, "rule")}</span>
  }
  const toggleArchive = <T extends { id: string; archivedAt?: string }>(items: T[], id: string): T[] =>
    items.map((item) => item.id === id ? { ...item, archivedAt: item.archivedAt ? undefined : new Date().toISOString() } : item)

  const addCategory = async () => {
    let id = "new-category"
    for (let suffix = 2; categories.some((category) => category.id === id) || subs.some((sub) => sub.id === id); suffix++) id = `new-category-${suffix}`
    await persist([...categories, { id, name: "New category", emoji: "🏷️", color: "#6f7f9e", valueScore: 0, order: categories.length }])
  }
  const addSubcategory = async (parentId: string) => {
    let id = `${parentId}-new`
    for (let suffix = 2; subs.some((sub) => sub.id === id) || categories.some((category) => category.id === id); suffix++) id = `${parentId}-new-${suffix}`
    const siblings = subs.filter((sub) => sub.parentId === parentId)
    await persistSubs([...subs, { id, parentId, name: "New subcategory", emoji: "•", order: siblings.length }])
  }

  return (
    <div>
      <div className="page-head">
        <h1>Categories</h1>
        <button type="button" className="btn btn-primary" onClick={() => void addCategory()}>Add category</button>
      </div>
      <p className="lede">
        Order matters: the higher a category sits, the more its time is worth. Drag the grip or use
        the arrows to move one. Archiving keeps past videos where they are and stops new ones from
        landing there.
      </p>

      <section className="card" aria-label="Categories, ordered from higher to lower value">
        <div className="ladder-end" aria-hidden="true">Higher value</div>
        <div role="list">
          {categories.map((category, index) => {
            const children = subs.filter((sub) => sub.parentId === category.id)
            const rank = `Position ${index + 1} of ${categories.length}`
            return (
              <div
                key={category.id}
                className={"category-ladder-item" + (category.archivedAt ? " archived" : "")}
                role="listitem"
                data-testid={`category-item-${category.id}`}
                onDragOver={(event) => { if (event.dataTransfer.types.includes("text/plain")) event.preventDefault() }}
                onDrop={(event) => dropCategory(event, index)}
              >
                <div className="queueitem category-main-row" draggable={false}>
                  <button
                    type="button"
                    className="btn btn-sm btn-quiet taxonomy-drag-handle"
                    aria-label={`Reorder category ${category.name}; use arrow keys`}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    title="Drag to reorder, or use the arrow keys"
                    draggable
                    onDragStart={(event) => dragStart(event, "category", category.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); void moveCategory(category.id, index - 1) }
                      if (event.key === "ArrowDown" && index < categories.length - 1) { event.preventDefault(); void moveCategory(category.id, index + 1) }
                    }}
                  >⠿</button>
                  <input aria-label={`${category.name} emoji`} className="emoji-input" type="text" value={category.emoji} maxLength={4} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, emoji: event.target.value } : item))} />
                  <input aria-label={`${category.name} name`} type="text" value={category.name} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} />
                  <input aria-label={`${category.name} color`} type="color" value={category.color} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, color: event.target.value } : item))} title={category.color} />
                  <span className="category-position-track" aria-hidden="true">
                    <span style={{ width: `${Math.max(4, scoreAtPosition(index, categories.length) * 20)}%` }} />
                  </span>
                  <span className="sr-only">{rank}{index === 0 ? ", highest value" : index === categories.length - 1 ? ", lowest value" : ""}</span>
                  <span className="usage-meta-wrap">
                    {usageLabel(category.id, usage.byTop) ? (
                      <a className="usage-meta rowlink" href={ledgerHref({ cat: category.id })} title={`Open ${category.name} watches in the Ledger`}>
                        {usageLabel(category.id, usage.byTop)}
                      </a>
                    ) : (
                      <span className="usage-meta muted">{category.archivedAt ? "" : "No watches yet"}</span>
                    )}
                  </span>
                  {category.archivedAt ? <span className="tag" style={{ marginLeft: 0 }}>Archived</span> : null}
                  {pausedRules(category.id, !!category.archivedAt)}
                  <span className="item-actions row-push">
                    <button type="button" className="btn btn-sm btn-quiet btn-icon" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => void moveCategory(category.id, index - 1)}>↑</button>
                    <button type="button" className="btn btn-sm btn-quiet btn-icon" aria-label={`Move ${category.name} down`} disabled={index === categories.length - 1} onClick={() => void moveCategory(category.id, index + 1)}>↓</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => void addSubcategory(category.id)}>Add subcategory</button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => void persist(toggleArchive(categories, category.id))}>{category.archivedAt ? "Unarchive" : "Archive"}</button>
                  </span>
                </div>
                {children.map((sub, subIndex) => (
                  <div
                    key={sub.id}
                    className={"queueitem category-sub-row" + (sub.archivedAt ? " archived" : "")}
                    data-testid={`subcategory-item-${sub.id}`}
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation() }}
                    onDrop={(event) => dropSubcategory(event, category.id, subIndex)}
                  >
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet taxonomy-drag-handle"
                      aria-label={`Reorder ${sub.name} within ${category.name}; use arrow keys`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="Drag to reorder, or use the arrow keys"
                      draggable
                      onDragStart={(event) => { event.stopPropagation(); dragStart(event, "subcategory", sub.id, category.id) }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" && subIndex > 0) { event.preventDefault(); void moveSubcategory(category.id, sub.id, subIndex - 1) }
                        if (event.key === "ArrowDown" && subIndex < children.length - 1) { event.preventDefault(); void moveSubcategory(category.id, sub.id, subIndex + 1) }
                      }}
                    >⠿</button>
                    <input aria-label={`${sub.name} emoji`} className="emoji-input" type="text" value={sub.emoji} maxLength={4} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, emoji: event.target.value } : item))} />
                    <input aria-label={`${sub.name} name`} type="text" value={sub.name} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, name: event.target.value } : item))} />
                    <input aria-label={`${sub.name} color`} type="color" value={sub.color ?? category.color} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, color: event.target.value } : item))} title={sub.color ?? category.color} />
                    <span className="usage-meta-wrap sub">
                      {usageLabel(sub.id, usage.bySub) ? (
                        <a className="usage-meta rowlink" href={ledgerHref({ cat: sub.id })} title={`Open ${sub.name} watches in the Ledger`}>
                          {usageLabel(sub.id, usage.bySub)}
                        </a>
                      ) : (
                        <span className="usage-meta muted">{sub.archivedAt || rulesUsing(sub.id) > 0 ? "" : "Unused"}</span>
                      )}
                    </span>
                    {sub.archivedAt ? <span className="tag" style={{ marginLeft: 0 }}>Archived</span> : null}
                    {pausedRules(sub.id, !!sub.archivedAt)}
                    <span className="item-actions row-push">
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => void persistSubs(toggleArchive(subs, sub.id))}>{sub.archivedAt ? "Unarchive" : "Archive"}</button>
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        <div className="ladder-end" aria-hidden="true">Lower value</div>
        <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
      </section>
    </div>
  )
}
