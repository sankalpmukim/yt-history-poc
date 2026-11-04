/** Rules: ordered list with enable/reorder/delete + full editor with test-run. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { writeRules } from "../lib/data"
import type { Rule, RuleMatch } from "../../core/types"
import { compileRules, previewMatches, describeMatch } from "../../core/rules"
import { validTargetIds } from "../../core/taxonomy"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"
import { CategoryChip, Dialog, TaxonomyPicker, plural } from "../lib/ui"
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
      <div className="page-head">
        <h1>Rules</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newRule(new Date()))}>
          New rule
        </button>
      </div>
      <p className="lede">
        Rules sort new videos into categories on every sync. They run top to bottom and the first
        match wins. A category you choose yourself always beats a rule.
      </p>

      <section className="card" aria-label="Rules, in the order they run">
        {rules.length === 0 ? (
          <p className="empty">No rules yet. Create one, or choose a video’s category in the Ledger and tick “Use this for every video from” its channel.</p>
        ) : (
          <ol className="list">
            {rules.map((r, i) => {
              const dead = r.categoryId && !liveTargets.has(r.categoryId)
              const name = r.name || "Untitled rule"
              return (
                <li key={r.id} className={"queueitem" + (r.enabled ? "" : " item-off")} style={{ flexWrap: "wrap" }}>
                  <input type="checkbox" checked={r.enabled} onChange={() => void toggle(r)} aria-label={`Use rule ${name}`} />
                  <span className="item-index" aria-hidden="true">{i + 1}</span>
                  <div className="item-main">
                    <div className="item-title">{name}{r.enabled ? null : <span className="tag">Off</span>}</div>
                    <div className="item-sub">{describeMatch(r.match)}</div>
                    {dead ? <div className="small text-danger" style={{ marginTop: 4 }}>Its category is archived, so this rule is skipped. Edit it to pick another.</div> : null}
                  </div>
                  <span className="item-meta" title="Videos this rule currently categorizes">
                    {r.hitCount > 0 ? plural(r.hitCount, "video") : "No videos yet"}
                  </span>
                  <CategoryChip
                    targetId={r.categoryId}
                    categories={data.categories}
                    subcategories={data.subcategories}
                    onClick={() => setEditing(r)}
                  />
                  {confirmDelete === r.id ? (
                    <span className="confirm">
                      <span className="confirm-text small">Delete this rule?</span>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void remove(r.id)}>Delete rule</button>
                      <button type="button" className="btn btn-sm btn-quiet" autoFocus onClick={() => setConfirmDelete(null)}>Cancel</button>
                    </span>
                  ) : (
                    <span className="item-actions">
                      <button type="button" className="btn btn-sm btn-quiet btn-icon" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => void move(r, -1)}>↑</button>
                      <button type="button" className="btn btn-sm btn-quiet btn-icon" aria-label={`Move ${name} down`} disabled={i === rules.length - 1} onClick={() => void move(r, 1)}>↓</button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditing(r)}>Edit</button>
                      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(r.id)}>Delete</button>
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {editing ? (
        <RuleEditor
          rule={editing}
          isNew={!data.rules.some((r) => r.id === editing.id)}
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
  isNew,
  data,
  reload,
  onSave,
  onClose
}: {
  rule: Rule
  isNew: boolean
  data: LedgerData
  reload: () => Promise<void>
  onSave: (r: Rule) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Rule>({ ...rule, match: { ...rule.match } })
  const [preview, setPreview] = useState<{ count: number; sampleIds: string[] } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [targetPickerOpen, setTargetPickerOpen] = useState(false)

  const setMatch = (patch: Partial<RuleMatch>) =>
    setDraft((d) => ({ ...d, match: { ...d.match, ...patch } }))

  const runPreview = () => {
    setProblem(null)
    setPreview(null)
    try {
      if (draft.match.titleRegex) new RegExp(draft.match.titleRegex, draft.match.titleRegexFlags ?? "")
    } catch (e: any) {
      setProblem(`The title regex isn’t valid: ${String(e?.message ?? e)}`)
      return
    }
    if (!draft.categoryId) {
      setProblem("Choose a category for this rule first.")
      return
    }
    const compiled = compileRules([{ ...draft, enabled: true }], validTargetIds(data.categories, data.subcategories))
    if (compiled.length === 0) {
      const live = validTargetIds(data.categories, data.subcategories)
      setProblem(live.has(draft.categoryId) ? "Add at least one condition so the rule knows what to match." : "Its category is archived. Choose another one.")
      return
    }
    setPreview(previewMatches(compiled, Object.values(data.videos)))
  }

  const sampleTitles = (preview?.sampleIds ?? [])
    .map((id) => data.videos[id]?.title ?? id)
    .slice(0, 3)

  return (
    <Dialog labelledBy="rule-editor-title" onClose={onClose} className="menu-wide">
      <h3 id="rule-editor-title">{isNew ? "New rule" : `Edit “${rule.name || "Untitled rule"}”`}</h3>
      <div style={{ display: "grid", gap: 16 }}>
        <label className="field">
          Name
          <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <div className="field">
          <span id="rule-category-label">Category</span>
          <button
            type="button"
            className="btn"
            style={{ justifyContent: "flex-start" }}
            onClick={() => setTargetPickerOpen(true)}
            aria-label={`Choose rule category${draft.categoryId ? `: ${labelForTarget(draft.categoryId, data.categories, data.subcategories)}` : ""}`}
          >
            {draft.categoryId ? labelForTarget(draft.categoryId, data.categories, data.subcategories) : "Choose a category or subcategory…"}
          </button>
        </div>
      </div>

      <fieldset className="fieldset">
        <legend>Matches videos where all of these are true</legend>
        <div className="field-row">
          <label className="field field-grow">
            Channel is exactly
            <input type="text" placeholder="FORMULA 1" value={draft.match.channelEquals ?? ""}
              onChange={(e) => setMatch({ channelEquals: e.target.value || undefined })} />
          </label>
          <label className="field field-grow">
            Channel contains
            <input type="text" placeholder="Part of a channel name" value={draft.match.channelContains ?? ""}
              onChange={(e) => setMatch({ channelContains: e.target.value || undefined })} />
          </label>
        </div>
        <label className="field">
          Title contains any of
          <input type="text" aria-describedby="title-contains-hint" placeholder="tutorial, how to"
            value={(draft.match.titleContains ?? []).join(", ")}
            onChange={(e) => setMatch({ titleContains: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          <span id="title-contains-hint" className="field-hint">Separate words with commas.</span>
        </label>
        <div className="field-row">
          <label className="field field-grow">
            Title regex
            <input type="text" placeholder="\b(lecture|talk)\b" value={draft.match.titleRegex ?? ""}
              onChange={(e) => setMatch({ titleRegex: e.target.value || undefined })} />
          </label>
          <label className="field" style={{ width: 64 }}>
            Flags
            <input type="text" placeholder="i" value={draft.match.titleRegexFlags ?? ""}
              onChange={(e) => setMatch({ titleRegexFlags: e.target.value || undefined })} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            Shorts
            <select value={draft.match.isShort == null ? "" : String(draft.match.isShort)}
              onChange={(e) => setMatch({ isShort: e.target.value === "" ? undefined : e.target.value === "true" })}>
              <option value="">Any video</option>
              <option value="true">Only Shorts</option>
              <option value="false">No Shorts</option>
            </select>
          </label>
          <label className="field">
            Max length in seconds
            <input type="number" min={0} style={{ width: 128 }} value={draft.match.maxDurationSec ?? ""}
              onChange={(e) => setMatch({ maxDurationSec: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </label>
          <label className="field">
            Priority
            <input type="number" style={{ width: 96 }} aria-describedby="priority-hint" value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })} />
          </label>
        </div>
        <span id="priority-hint" className="field-hint small muted">Sets the rule’s place in the list: lower numbers run first.</span>
      </fieldset>

      <div role="status" aria-live="polite">
        {problem ? <div className="preview error">{problem}</div> : null}
        {preview ? (
          <div className="preview">
            {preview.count > 0
              ? <>Matches {plural(preview.count, "video")} you’ve watched, like {sampleTitles.map((t) => `“${t}”`).join(", ")}.</>
              : "Matches no videos you’ve watched yet."}
          </div>
        ) : null}
      </div>

      <div className="menu-footer">
        <button type="button" className="btn btn-quiet" onClick={runPreview}>Preview matches</button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!draft.categoryId} onClick={() => void onSave(draft)}>
          Save rule
        </button>
      </div>

      {targetPickerOpen ? (
        <TaxonomyPicker
          title="Choose the rule’s category"
          categories={data.categories}
          subcategories={data.subcategories}
          current={draft.categoryId || null}
          canClear={false}
          reload={reload}
          onChoose={({ categoryId }) => {
            if (categoryId) setDraft((current) => ({ ...current, categoryId }))
            setTargetPickerOpen(false)
          }}
          onClose={() => setTargetPickerOpen(false)}
        />
      ) : null}
    </Dialog>
  )
}
