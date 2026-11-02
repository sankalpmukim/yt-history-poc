/** Categories manager: the 0–5 value ladder — edit, add, archive, reorder. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { writeCategories, writeSubcategories } from "../lib/data"
import type { Category, Subcategory } from "../../core/types"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"

function slugId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "cat"
  )
}

export function CategoriesView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const categories = useMemo(
    () => [...data.categories].sort((a, b) => a.order - b.order),
    [data.categories]
  )
  const subs = useMemo(
    () => [...data.subcategories].sort((a, b) => a.order - b.order),
    [data.subcategories]
  )
  const rulesUsing = (id: string) => data.rules.filter((r) => r.categoryId === id).length

  const persist = async (next: Category[], alsoRules = true) => {
    const normalized = next.map((c, i) => ({ ...c, order: i }))
    await writeCategories(normalized)
    if (alsoRules) await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }

  const update = (id: string, patch: Partial<Category>) =>
    persist(categories.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const move = async (cat: Category, dir: -1 | 1) => {
    const idx = categories.findIndex((c) => c.id === cat.id)
    const to = idx + dir
    if (to < 0 || to >= categories.length) return
    const next = [...categories]
    const [item] = next.splice(idx, 1)
    next.splice(to, 0, item)
    await persist(next)
  }

  const add = async () => {
    const nowIso = new Date().toISOString()
    let id = slugId("New category")
    let n = 2
    while (categories.some((c) => c.id === id) || subs.some((s) => s.id === id))
      id = slugId(`New category ${n++}`)
    await persist([
      ...categories,
      { id, name: "New category", emoji: "🏷️", color: "#60a5fa", valueScore: 2, order: categories.length }
    ])
  }

  const persistSubs = async (next: Subcategory[]) => {
    await writeSubcategories(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }
  const updateSub = (id: string, patch: Partial<Subcategory>) =>
    persistSubs(subs.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const addSub = async (parentId: string) => {
    let id = slugId(`${parentId}-new`)
    let n = 2
    while (subs.some((s) => s.id === id) || categories.some((c) => c.id === id))
      id = slugId(`${parentId}-new-${n++}`)
    const siblings = subs.filter((s) => s.parentId === parentId)
    await persistSubs([
      ...subs,
      { id, parentId, name: "New subcategory", emoji: "•", order: siblings.length }
    ])
  }
  const moveSub = async (sub: Subcategory, dir: -1 | 1) => {
    const siblings = subs.filter((s) => s.parentId === sub.parentId)
    const idx = siblings.findIndex((s) => s.id === sub.id)
    const to = idx + dir
    if (to < 0 || to >= siblings.length) return
    const reordered = [...siblings]
    const [item] = reordered.splice(idx, 1)
    reordered.splice(to, 0, item)
    const orders = new Map(reordered.map((s, i) => [s.id, i]))
    await persistSubs(subs.map((s) => (orders.has(s.id) ? { ...s, order: orders.get(s.id)! } : s)))
  }

  const archivedWarning = (cat: Category) => {
    const rules = rulesUsing(cat.id)
    if (cat.archivedAt && rules > 0)
      return (
        <span className="small" style={{ color: "var(--warn)" }}>
          {rules} rule(s) target this — they are skipped while archived
        </span>
      )
    return null
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h1>Categories</h1>
        <button className="btn btn-primary" onClick={() => void add()}>
          + Add category
        </button>
      </div>
      <p className="hint">
        The value ladder, 0 (brain rot) to 5 (deep learning) — it drives the time value index and
        low-value share. Subcategories live under a parent; videos can be assigned to a sub or
        the parent. Archived items keep history but stop receiving new videos.
      </p>

      <div className="card">
        {categories.map((c, i) => (
          <div key={c.id} className="queueitem" style={{ flexWrap: "wrap", opacity: c.archivedAt ? 0.55 : 1 }}>
            <span className="row">
              <button className="btn btn-sm" disabled={i === 0} onClick={() => void move(c, -1)}>↑</button>
              <button className="btn btn-sm" disabled={i === categories.length - 1} onClick={() => void move(c, 1)}>↓</button>
            </span>
            <input type="text" value={c.emoji} maxLength={4} style={{ width: 46, textAlign: "center" }}
              onChange={(e) => void update(c.id, { emoji: e.target.value })} />
            <input type="text" value={c.name} style={{ width: 210 }}
              onChange={(e) => void update(c.id, { name: e.target.value })} />
            <input type="color" value={c.color} style={{ width: 42, height: 32, padding: 2, background: "transparent", border: 0 }}
              onChange={(e) => void update(c.id, { color: e.target.value })} title={c.color} />
            <label className="small">
              value
              <select value={c.valueScore} onChange={(e) => void update(c.id, { valueScore: Number(e.target.value) as Category["valueScore"] })}>
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="muted small" style={{ minWidth: 90 }}>{rulesUsing(c.id)} rule(s)</span>
            {archivedWarning(c)}
            <button className="btn btn-sm" style={{ marginLeft: "auto" }}
              onClick={() => void update(c.id, { archivedAt: c.archivedAt ? undefined : new Date().toISOString() })}>
              {c.archivedAt ? "Unarchive" : "Archive"}
            </button>
            <button className="btn btn-sm" onClick={() => void addSub(c.id)}>+ sub</button>
            {subs.filter((s) => s.parentId === c.id).map((s, si, arr) => (
              <div key={s.id} className="queueitem" style={{ width: "100%", paddingLeft: 48, opacity: s.archivedAt ? 0.55 : 1 }}>
                <span className="row">
                  <button className="btn btn-sm" disabled={si === 0} onClick={() => void moveSub(s, -1)}>↑</button>
                  <button className="btn btn-sm" disabled={si === arr.length - 1} onClick={() => void moveSub(s, 1)}>↓</button>
                </span>
                <input type="text" value={s.emoji} maxLength={4} style={{ width: 46, textAlign: "center" }}
                  onChange={(e) => void updateSub(s.id, { emoji: e.target.value })} />
                <input type="text" value={s.name} style={{ width: 210 }}
                  onChange={(e) => void updateSub(s.id, { name: e.target.value })} />
                <span className="muted small">{rulesUsing(s.id)} rule(s)</span>
                <button className="btn btn-sm" style={{ marginLeft: "auto" }}
                  onClick={() => void updateSub(s.id, { archivedAt: s.archivedAt ? undefined : new Date().toISOString() })}>
                  {s.archivedAt ? "Unarchive" : "Archive"}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
