/** Categories manager: a high-to-low value ladder with pointer and keyboard reordering. */

import { useMemo } from "react"
import type { LedgerData } from "../lib/data"
import { writeCategories, writeSubcategories } from "../lib/data"
import type { Category, Subcategory } from "../../core/types"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"
import { reorderById, scoreAtPosition } from "../../core/taxonomy"

export function CategoriesView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const categories = useMemo(() => [...data.categories].sort((a, b) => a.order - b.order), [data.categories])
  const subs = useMemo(() => [...data.subcategories].sort((a, b) => a.order - b.order), [data.subcategories])
  const rulesUsing = (id: string) => data.rules.filter((rule) => rule.categoryId === id).length

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
  const moveCategory = (id: string, to: number) => persist(reorderById(categories, id, to))
  const moveSubcategory = (parentId: string, id: string, to: number) => {
    const siblings = subs.filter((sub) => sub.parentId === parentId)
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
  const archivedWarning = (category: Category) => {
    const count = rulesUsing(category.id)
    return category.archivedAt && count > 0
      ? <span className="small" style={{ color: "var(--warn)" }}>{count} rule(s) target this — skipped while archived</span>
      : null
  }

  const addCategory = async () => {
    let id = "new-category"
    for (let suffix = 2; categories.some((category) => category.id === id) || subs.some((sub) => sub.id === id); suffix++) id = `new-category-${suffix}`
    await persist([...categories, { id, name: "New category", emoji: "🏷️", color: "#60a5fa", valueScore: 0, order: categories.length }])
  }
  const addSubcategory = async (parentId: string) => {
    let id = `${parentId}-new`
    for (let suffix = 2; subs.some((sub) => sub.id === id) || categories.some((category) => category.id === id); suffix++) id = `${parentId}-new-${suffix}`
    const siblings = subs.filter((sub) => sub.parentId === parentId)
    await persistSubs([...subs, { id, parentId, name: "New subcategory", emoji: "•", order: siblings.length }])
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h1>Categories</h1>
        <button className="btn btn-primary" onClick={() => void addCategory()}>+ Add category</button>
      </div>
      <p className="hint">Arrange categories from higher value at the top to lower value at the bottom. Drag rows to reorder, or focus the grip and use the arrow keys. Archived items keep history but stop receiving new videos.</p>

      <div className="card" role="list" aria-label="Categories, ordered from higher to lower value">
        {categories.map((category, index) => {
          const children = subs.filter((sub) => sub.parentId === category.id)
          return (
            <div
              key={category.id}
              className="category-ladder-item"
              role="listitem"
              data-testid={`category-item-${category.id}`}
              style={{ opacity: category.archivedAt ? 0.55 : 1 }}
              onDragOver={(event) => { if (event.dataTransfer.types.includes("text/plain")) event.preventDefault() }}
              onDrop={(event) => dropCategory(event, index)}
            >
              <div className="queueitem category-main-row" draggable={false}>
                <button
                  type="button"
                  className="btn btn-sm taxonomy-drag-handle"
                  aria-label={`Reorder category ${category.name}; use arrow keys`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  title="Drag to reorder · arrow keys also work"
                  draggable
                  onDragStart={(event) => dragStart(event, "category", category.id)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); void moveCategory(category.id, index - 1) }
                    if (event.key === "ArrowDown" && index < categories.length - 1) { event.preventDefault(); void moveCategory(category.id, index + 1) }
                  }}
                >⠿</button>
                <input aria-label={`${category.name} emoji`} type="text" value={category.emoji} maxLength={4} style={{ width: 46, textAlign: "center" }} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, emoji: event.target.value } : item))} />
                <input aria-label={`${category.name} name`} type="text" value={category.name} style={{ width: 210 }} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, name: event.target.value } : item))} />
                <input aria-label={`${category.name} color`} type="color" value={category.color} style={{ width: 42, height: 32, padding: 2, background: "transparent", border: 0 }} onChange={(event) => void persist(categories.map((item) => item.id === category.id ? { ...item, color: event.target.value } : item))} title={category.color} />
                <span className="category-position-track" aria-label={index === 0 ? "Highest value position" : index === categories.length - 1 ? "Lowest value position" : "Value position"}>
                  <span style={{ width: `${scoreAtPosition(index, categories.length) * 20}%`, background: category.color }} />
                </span>
                <span className="muted small">{rulesUsing(category.id)} rule(s)</span>
                {archivedWarning(category)}
                <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => void persist(categories.map((item) => item.id === category.id ? { ...item, archivedAt: item.archivedAt ? undefined : new Date().toISOString() } : item))}>{category.archivedAt ? "Unarchive" : "Archive"}</button>
                <button type="button" className="btn btn-sm" onClick={() => void addSubcategory(category.id)}>+ sub</button>
              </div>
              {children.map((sub, subIndex) => {
                const siblings = children
                return (
                  <div
                    key={sub.id}
                    className="queueitem category-sub-row"
                    data-testid={`subcategory-item-${sub.id}`}
                    style={{ opacity: sub.archivedAt ? 0.55 : 1 }}
                    onDragOver={(event) => { event.preventDefault(); event.stopPropagation() }}
                    onDrop={(event) => dropSubcategory(event, category.id, subIndex)}
                  >
                    <button
                      type="button"
                      className="btn btn-sm taxonomy-drag-handle"
                      aria-label={`Reorder ${sub.name} within ${category.name}; use arrow keys`}
                      aria-keyshortcuts="ArrowUp ArrowDown"
                      title="Drag to reorder · arrow keys also work"
                      draggable
                      onDragStart={(event) => { event.stopPropagation(); dragStart(event, "subcategory", sub.id, category.id) }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp" && subIndex > 0) { event.preventDefault(); void moveSubcategory(category.id, sub.id, subIndex - 1) }
                        if (event.key === "ArrowDown" && subIndex < siblings.length - 1) { event.preventDefault(); void moveSubcategory(category.id, sub.id, subIndex + 1) }
                      }}
                    >⠿</button>
                    <input aria-label={`${sub.name} emoji`} type="text" value={sub.emoji} maxLength={4} style={{ width: 46, textAlign: "center" }} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, emoji: event.target.value } : item))} />
                    <input aria-label={`${sub.name} name`} type="text" value={sub.name} style={{ width: 210 }} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, name: event.target.value } : item))} />
                    <input aria-label={`${sub.name} color`} type="color" value={sub.color ?? category.color} style={{ width: 42, height: 32, padding: 2, background: "transparent", border: 0 }} onChange={(event) => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, color: event.target.value } : item))} title={sub.color ?? category.color} />
                    <span className="muted small">{rulesUsing(sub.id)} rule(s)</span>
                    <button type="button" className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={() => void persistSubs(subs.map((item) => item.id === sub.id ? { ...item, archivedAt: item.archivedAt ? undefined : new Date().toISOString() } : item))}>{sub.archivedAt ? "Unarchive" : "Archive"}</button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
