/** Categories manager: the 0–5 value ladder — edit, add, archive, reorder. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { writeCategories } from "../lib/data"
import type { Category } from "../../core/types"
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
  const rulesUsing = (catId: string) => data.rules.filter((r) => r.categoryId === catId).length

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
    while (categories.some((c) => c.id === id)) id = slugId(`New category ${n++}`)
    await persist([
      ...categories,
      { id, name: "New category", emoji: "🏷️", color: "#60a5fa", valueScore: 2, order: categories.length }
    ])
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
        low-value share. Archived categories keep their history but stop receiving new videos.
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
          </div>
        ))}
      </div>
    </div>
  )
}
