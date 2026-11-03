/** Rules: ordered list with enable/reorder/delete + full editor with test-run. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { writeRules } from "../lib/data"
import type { Rule, RuleMatch } from "../../core/types"
import { compileRules, previewMatches, describeMatch } from "../../core/rules"
import { validTargetIds } from "../../core/taxonomy"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"
import { CategoryChip, TaxonomyPicker } from "../lib/ui"
import { labelForTarget } from "../../core/taxonomy"

const BLANK_MATCH: RuleMatch = {}

function newRule(now: Date): Rule {
  const iso = now.toISOString()
  return {
    id: `rule-${now.getTime().toString(36)}`,
    name: "New rule",
    enabled: true,
    priority: 150,
    match: { ...BLANK_MATCH },
    categoryId: "",
    createdAt: iso,
    updatedAt: iso,
    hitCount: 0
  }
}

export function RulesView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Rule | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const rules = useMemo(
    () => [...data.rules].sort((a, b) => a.priority - b.priority),
    [data.rules]
  )
  const liveTargets = useMemo(
    () => validTargetIds(data.categories, data.subcategories),
    [data.categories, data.subcategories]
  )

  const save = async (rule: Rule) => {
    const exists = data.rules.some((r) => r.id === rule.id)
    const next = exists
      ? data.rules.map((r) => (r.id === rule.id ? { ...rule, updatedAt: new Date().toISOString() } : r))
      : [...data.rules, { ...rule, updatedAt: new Date().toISOString() }]
    await writeRules(next)
    await runRulesPass(new ChromeKV(), new Date())
    setEditing(null)
    await reload()
  }

  const move = async (rule: Rule, dir: -1 | 1) => {
    const idx = rules.findIndex((r) => r.id === rule.id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= rules.length) return
    // priorities are the order: renumber the pair by swapping priority values
    const next = [...data.rules]
    const a = next.findIndex((r) => r.id === rules[idx].id)
    const b = next.findIndex((r) => r.id === rules[swapIdx].id)
    const pa = next[a].priority
    next[a] = { ...next[a], priority: next[b].priority }
    next[b] = { ...next[b], priority: pa }
    await writeRules(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }

  const toggle = async (rule: Rule) => {
    await writeRules(data.rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)))
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
  }

  const remove = async (id: string) => {
    await writeRules(data.rules.filter((r) => r.id !== id))
    await runRulesPass(new ChromeKV(), new Date())
    setConfirmDelete(null)
    await reload()
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h1>Rules</h1>
        <button className="btn btn-primary" onClick={() => setEditing(newRule(new Date()))}>
          + New rule
        </button>
      </div>
      <p className="hint">
        Applied top-down on every sync — first match wins. Priority number = position (smaller is
        higher). Manual video overrides always beat rules.
      </p>

      <div className="card">
        {rules.length === 0 ? (
          <div className="empty">No rules yet — create one, or use the Ledger’s “always for this channel”.</div>
        ) : (
          rules.map((r, i) => {
            const dead = r.categoryId && !liveTargets.has(r.categoryId)
            return (
              <div key={r.id} className="queueitem" style={{ flexWrap: "wrap" }}>
                <input type="checkbox" checked={r.enabled} onChange={() => void toggle(r)} title="enabled" />
                <div style={{ width: 46 }} className="muted small">
                  #{i + 1}
                </div>
                <div style={{ minWidth: 220, flex: 1 }}>
                  <div>{r.name || <span className="muted">(unnamed)</span>}</div>
                  <div className="muted small">{describeMatch(r.match)}</div>
                  {dead ? <div className="small" style={{ color: "var(--danger)" }}>target no longer exists — skipped</div> : null}
                </div>
                <span className="muted small" title="videos currently assigned by this rule">
                  {r.hitCount} video(s)
                </span>
                <CategoryChip
                  targetId={r.categoryId}
                  categories={data.categories}
                  subcategories={data.subcategories}
                  onClick={() => setEditing(r)}
                />
                <span className="row">
                  <button className="btn btn-sm" disabled={i === 0} onClick={() => void move(r, -1)}>
                    ↑
                  </button>
                  <button className="btn btn-sm" disabled={i === rules.length - 1} onClick={() => void move(r, 1)}>
                    ↓
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                  {confirmDelete === r.id ? (
                    <>
                      <button className="btn btn-sm btn-danger" onClick={() => void remove(r.id)}>
                        really delete
                      </button>
                      <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                        no
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setConfirmDelete(r.id)}>
                      Delete
                    </button>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>

      {editing ? (
        <RuleEditor
          rule={editing}
          data={data}
          reload={reload}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}

function RuleEditor({
  rule,
  data,
  reload,
  onSave,
  onClose
}: {
  rule: Rule
  data: LedgerData
  reload: () => Promise<void>
  onSave: (r: Rule) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Rule>({ ...rule, match: { ...rule.match } })
  const [preview, setPreview] = useState<{ count: number; sampleIds: string[] } | null>(null)
  const [regexError, setRegexError] = useState<string | null>(null)
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)

  const setMatch = (patch: Partial<RuleMatch>) =>
    setDraft((d) => ({ ...d, match: { ...d.match, ...patch } }))

  const runPreview = () => {
    setRegexError(null)
    try {
      if (draft.match.titleRegex) new RegExp(draft.match.titleRegex, draft.match.titleRegexFlags ?? "")
    } catch (e: any) {
      setRegexError(String(e?.message ?? e))
      return
    }
    const compiled = compileRules([draft], validTargetIds(data.categories, data.subcategories))
    if (compiled.length === 0) {
      setRegexError("rule is unusable (bad regex, disabled, or unknown category)")
      return
    }
    setPreview(previewMatches(compiled, Object.values(data.videos)))
  }

  const sampleTitles = (preview?.sampleIds ?? [])
    .map((id) => data.videos[id]?.title ?? id)
    .slice(0, 5)

  return (
    <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="menu" style={{ width: 560 }}>
        <h3>{rule.name ? `Edit “${rule.name}”` : "New rule"}</h3>
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <label className="small">
            Name
            <input type="text" style={{ width: "100%" }} value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <div className="small">
            <span>Category</span>
            <button type="button" className="btn" style={{ width: "100%", textAlign: "left" }} onClick={() => setTargetPickerOpen(true)} aria-label="Choose rule category">
              {draft.categoryId ? labelForTarget(draft.categoryId, data.categories, data.subcategories) : "Choose category or subcategory…"}
            </button>
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>All chosen conditions must hold (AND).</div>
          <label className="small">
            Channel is exactly
            <input type="text" style={{ width: "100%" }} placeholder="e.g. FORMULA 1"
              value={draft.match.channelEquals ?? ""}
              onChange={(e) => setMatch({ channelEquals: e.target.value || undefined })} />
          </label>
          <label className="small">
            Channel contains
            <input type="text" style={{ width: "100%" }} placeholder="substring"
              value={draft.match.channelContains ?? ""}
              onChange={(e) => setMatch({ channelContains: e.target.value || undefined })} />
          </label>
          <label className="small">
            Title contains (comma-separated, any-of)
            <input type="text" style={{ width: "100%" }} placeholder="tutorial, how to"
              value={(draft.match.titleContains ?? []).join(", ")}
              onChange={(e) =>
                setMatch({
                  titleContains: e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                })
              } />
          </label>
          <div className="row">
            <label className="small" style={{ flex: 1 }}>
              Title regex
              <input type="text" style={{ width: "100%" }} placeholder="\\b(lecture|talk)\\b"
                value={draft.match.titleRegex ?? ""}
                onChange={(e) => setMatch({ titleRegex: e.target.value || undefined })} />
            </label>
            <label className="small" style={{ width: 70 }}>
              Flags
              <input type="text" style={{ width: "100%" }} placeholder="i"
                value={draft.match.titleRegexFlags ?? ""}
                onChange={(e) => setMatch({ titleRegexFlags: e.target.value || undefined })} />
            </label>
          </div>
          <div className="row">
            <label className="small">
              Shorts
              <select value={draft.match.isShort == null ? "" : String(draft.match.isShort)}
                onChange={(e) =>
                  setMatch({ isShort: e.target.value === "" ? undefined : e.target.value === "true" })
                }>
                <option value="">any</option>
                <option value="true">only Shorts</option>
                <option value="false">not Shorts</option>
              </select>
            </label>
            <label className="small">
              Duration ≤ (sec)
              <input type="number" min={0} style={{ width: 90 }}
                value={draft.match.maxDurationSec ?? ""}
                onChange={(e) =>
                  setMatch({ maxDurationSec: e.target.value === "" ? undefined : Number(e.target.value) })
                } />
            </label>
            <label className="small">
              Priority
              <input type="number" style={{ width: 80 }} value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} />
            </label>
          </div>
        </div>
        {targetPickerOpen ? (
          <TaxonomyPicker
            title="Choose rule target"
            categories={data.categories}
            subcategories={data.subcategories}
            current={draft.categoryId || null}
            reload={reload}
            onChoose={({ categoryId }) => {
              if (categoryId) setDraft((current) => ({ ...current, categoryId }))
              setTargetPickerOpen(false)
            }}
            onClose={() => setTargetPickerOpen(false)}
          />
        ) : null}

        {regexError ? <div className="small" style={{ color: "var(--danger)", marginTop: 8 }}>{regexError}</div> : null}
        {preview ? (
          <div className="small" style={{ marginTop: 8, color: preview.count > 0 ? "var(--ok)" : "var(--muted)" }}>
            Would currently match <b>{preview.count}</b> stored video(s)
            {sampleTitles.length > 0 ? ` — e.g. “${sampleTitles.join("”, “")}”` : ""}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn" onClick={runPreview}>Test run</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!draft.categoryId} onClick={() => void onSave(draft)}>
            Save rule
          </button>
        </div>
      </div>
    </div>
  )
}
