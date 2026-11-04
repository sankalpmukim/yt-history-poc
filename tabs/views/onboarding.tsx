/** First-run setup: how it works → name categories → starter rules → YouTube behaviour → done. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, writeCategories, writeRules } from "../lib/data"
import type { Category, Rule } from "../../core/types"
import { compileRules, previewMatches } from "../../core/rules"
import { validTargetIds } from "../../core/taxonomy"
import { BudgetModeControl, budgetModeDetail, plural } from "../lib/ui"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"

const STEPS = ["How it works", "Categories", "Starter rules", "YouTube", "Done"]

export function OnboardingView({
  data,
  reload,
  onFinish
}: {
  data: LedgerData
  reload: () => Promise<void>
  onFinish: () => void
}) {
  const [step, setStep] = useState(0)
  const finish = async () => {
    await patchSettings({ onboardedAt: new Date().toISOString() })
    await reload()
    onFinish()
  }

  return (
    <main className="setup">
      <h1 className="brand">YT Ledger setup</h1>
      <ol className="steps" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className={"step" + (i === step ? " active" : i < step ? " done" : "")} aria-current={i === step ? "step" : undefined}>
            {s}{i < step ? <span className="sr-only">, done</span> : null}
          </li>
        ))}
      </ol>

      {step === 0 ? <WelcomeStep onNext={() => setStep(1)} /> : null}
      {step === 1 ? <CategoriesStep data={data} reload={reload} onNext={() => setStep(2)} /> : null}
      {step === 2 ? <StarterRulesStep data={data} reload={reload} onNext={() => setStep(3)} /> : null}
      {step === 3 ? <BudgetModeStep onNext={() => setStep(4)} /> : null}
      {step === 4 ? (
        <Step title="You’re set">
          <p>
            YT Ledger syncs quietly whenever you visit YouTube. Give videos a category from the
            Ledger or the Overview, and your rules handle the rest.
          </p>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => void finish()}>Open dashboard</button>
          </div>
        </Step>
      ) : null}
    </main>
  )
}

/** One setup step. Focus moves to its heading so screen readers hear the new step. */
function Step({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <section className="card">
      <h2 ref={ref} tabIndex={-1}>{title}</h2>
      {children}
    </section>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <Step title="Track where your YouTube time goes">
      <p>
        YT Ledger works like an expense tracker for your watch history. Each video you watch is
        logged and given a category, and the totals show where the hours went.
      </p>
      <ul className="setup-points">
        <li>
          <strong>It stays on this computer.</strong>
          Everything is stored in this browser. There’s no account and no server.
        </li>
        <li>
          <strong>It reads the history YouTube already keeps.</strong>
          When you visit YouTube, YT Ledger reads your watch history page and sorts new videos
          with your rules.
        </li>
        <li>
          <strong>Times are estimates.</strong>
          YouTube records the day, not the minute, so time is worked out from video length, how
          far you got and replays. When the progress is missing, it assumes you watched to the end.
        </li>
        <li>
          <strong>You decide.</strong>
          A category you pick always beats a rule, and you can export or delete everything from
          Settings.
        </li>
      </ul>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>Start setup</button>
      </div>
    </Step>
  )
}

function CategoriesStep({ data, reload, onNext }: { data: LedgerData; reload: () => Promise<void>; onNext: () => void }) {
  const [cats, setCats] = useState<Category[]>(() => [...data.categories].sort((a, b) => a.order - b.order))
  const update = (id: string, patch: Partial<Category>) =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const save = async () => {
    await writeCategories(cats.map((c, i) => ({ ...c, order: i })))
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
    onNext()
  }

  return (
    <Step title="Name your categories">
      <p className="muted">
        The list runs from higher value at the top to lower value at the bottom. Rename anything
        that doesn’t fit how you think. You can reorder, recolor and add categories later.
      </p>
      <ol className="list" style={{ marginTop: 24 }}>
        {cats.map((c) => {
          const subs = data.subcategories
            .filter((s) => s.parentId === c.id && !s.archivedAt)
            .sort((a, b) => a.order - b.order)
            .map((s) => s.name)
          return (
            <li key={c.id} className="queueitem">
              <span aria-hidden="true" style={{ width: 24, textAlign: "center" }}>{c.emoji}</span>
              <div className="item-main">
                <input type="text" aria-label={`Category ${data.categories.findIndex((x) => x.id === c.id) + 1} name`} value={c.name} style={{ width: "100%" }} onChange={(e) => update(c.id, { name: e.target.value })} />
                <div className="item-sub" style={{ marginTop: 4 }}>{subs.length ? subs.join(", ") : "No subcategories"}</div>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="actions">
        <button type="button" className="btn btn-quiet" onClick={onNext}>Keep defaults</button>
        <button type="button" className="btn btn-primary" onClick={() => void save()}>Continue</button>
      </div>
    </Step>
  )
}

function StarterRulesStep({ data, reload, onNext }: { data: LedgerData; reload: () => Promise<void>; onNext: () => void }) {
  const [rules, setRules] = useState<Rule[]>(() => [...data.rules].sort((a, b) => a.priority - b.priority))
  const videosArr = useMemo(() => Object.values(data.videos), [data.videos])
  const validIds = useMemo(() => validTargetIds(data.categories, data.subcategories), [data.categories, data.subcategories])

  const matchCount = (rule: Rule): number => {
    const compiled = compileRules([{ ...rule, enabled: true }], validIds)
    if (compiled.length === 0) return 0
    return previewMatches(compiled, videosArr).count
  }

  const toggle = (id: string) => setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const save = async (enableNone: boolean) => {
    const next = enableNone ? rules.map((r) => ({ ...r, enabled: false })) : rules
    await writeRules(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
    onNext()
  }

  return (
    <Step title="Starter rules">
      <p className="muted">
        A few simple keyword rules to sort videos from day one. Tick the ones you want. You can
        write precise channel and title rules later on the Rules page.
      </p>
      <ul className="list" style={{ marginTop: 24 }}>
        {rules.map((r) => {
          const count = matchCount(r)
          return (
            <li key={r.id} className="queueitem">
              <label className="check" style={{ flex: 1, alignItems: "flex-start" }}>
                <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} style={{ marginTop: 2 }} />
                <span>
                  <span className="item-title">{r.name}</span>
                  <span className="item-sub" style={{ display: "block" }}>
                    {count > 0 ? `Matches ${plural(count, "video")} you’ve already watched` : "No matches in your history yet"}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="actions">
        <button type="button" className="btn btn-quiet" onClick={() => void save(true)}>Start with no rules</button>
        <button type="button" className="btn btn-primary" onClick={() => void save(false)}>Continue</button>
      </div>
    </Step>
  )
}

function BudgetModeStep({ onNext }: { onNext: () => void }) {
  const [mode, setMode] = useState<"off" | "gentle" | "strict">("off")
  const label = mode[0].toUpperCase() + mode.slice(1)
  return (
    <Step title="What should happen on YouTube when you’re over budget?">
      <p className="muted">
        Once you set weekly hours on the Budgets page, YT Ledger can act on them while you browse.
        Without a budget, nothing changes on YouTube.
      </p>
      <div style={{ margin: "24px 0 12px" }}>
        <BudgetModeControl value={mode} onChange={setMode} />
      </div>
      <p className="muted small">{budgetModeDetail(mode)} You can change this any time on the Budgets page.</p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            void patchSettings({ budgetMode: mode })
            onNext()
          }}
        >
          Continue with {label}
        </button>
      </div>
    </Step>
  )
}
