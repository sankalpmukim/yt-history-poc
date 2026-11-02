/** First-run onboarding: privacy intro → category ladder → starter rules → budget mode → done. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, writeCategories, writeRules } from "../lib/data"
import type { Category, Rule } from "../../core/types"
import { compileRules, previewMatches } from "../../core/rules"
import { runRulesPass } from "../../core/ledger"
import { ChromeKV } from "../../core/storage"

const STEPS = ["Welcome", "Categories", "Starter rules", "Budgets", "Done"]

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

  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px" }}>
      <div className="brand" style={{ fontSize: 22, marginBottom: 18 }}>
        📊 YT Ledger <span className="sub">setup</span>
      </div>
      <div className="steps">
        {STEPS.map((s, i) => (
          <div key={s} className={"step" + (i === step ? " active" : "")}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      {step === 0 ? <WelcomeStep onNext={() => setStep(1)} /> : null}
      {step === 1 ? (
        <CategoriesStep data={data} reload={reload} onNext={() => setStep(2)} />
      ) : null}
      {step === 2 ? (
        <StarterRulesStep data={data} reload={reload} onNext={() => setStep(3)} />
      ) : null}
      {step === 3 ? (
        <BudgetModeStep
          onNext={async () => {
            await patchSettings({ onboardedAt: new Date().toISOString() })
            await reload()
            setStep(4)
          }}
          onSkip={async () => {
            await patchSettings({ onboardedAt: new Date().toISOString() })
            await reload()
            onFinish()
          }}
        />
      ) : null}
      {step === 4 ? (
        <div className="card">
          <h2>You're set 🎉</h2>
          <p className="small">
            YT Ledger syncs quietly whenever you visit YouTube. Categorize from the Ledger or the
            review queue; rules do the rest automatically.
          </p>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-primary" onClick={onFinish}>
              Open dashboard
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="card">
      <h2>Welcome — an expense manager for your watch time</h2>
      <ul className="small" style={{ lineHeight: 1.9 }}>
        <li>
          <b>Local-only.</b> Everything lives in this browser's storage. Nothing is uploaded,
          ever — there is no server.
        </li>
        <li>
          <b>How it works.</b> On every YouTube visit the extension reads the history page your
          browser already loads (day-granular), merges it here, and auto-categorizes new videos
          with your rules.
        </li>
        <li>
          <b>Time is estimated</b> from video duration × watch progress × repeats. Each number
          carries a confidence dot: 🟢 high, 🟡 assumed-full, ⚪ unknown duration.
        </li>
        <li>
          <b>You're in control.</b> Manual categories always beat rules; export or wipe your data
          anytime from Settings.
        </li>
      </ul>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onNext}>
          Start setup
        </button>
      </div>
    </div>
  )
}

function CategoriesStep({
  data,
  reload,
  onNext
}: {
  data: LedgerData
  reload: () => Promise<void>
  onNext: () => void
}) {
  const [cats, setCats] = useState<Category[]>(() =>
    [...data.categories].sort((a, b) => a.order - b.order)
  )
  const update = (id: string, patch: Partial<Category>) =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const save = async () => {
    await writeCategories(cats.map((c, i) => ({ ...c, order: i })))
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
    onNext()
  }

  return (
    <div className="card">
      <h2>Your value ladder (0 = brain rot → 5 = deep learning)</h2>
      <p className="muted small">
        Rename or re-score anything — the ladder drives the "time value index". Colors, emoji,
        ordering and new categories can be managed later in the Categories tab.
      </p>
      {cats.map((c) => (
        <div key={c.id} className="queueitem">
          <span style={{ width: 30 }}>{c.emoji}</span>
          <input type="text" value={c.name} style={{ flex: 1 }} onChange={(e) => update(c.id, { name: e.target.value })} />
          <label className="small">
            value
            <select value={c.valueScore} onChange={(e) => update(c.id, { valueScore: Number(e.target.value) as Category["valueScore"] })}>
              {[0, 1, 2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" onClick={onNext}>Skip (keep defaults)</button>
        <button className="btn btn-primary" onClick={() => void save()}>Save &amp; continue</button>
      </div>
    </div>
  )
}

function StarterRulesStep({
  data,
  reload,
  onNext
}: {
  data: LedgerData
  reload: () => Promise<void>
  onNext: () => void
}) {
  const [rules, setRules] = useState<Rule[]>(() =>
    [...data.rules].sort((a, b) => a.priority - b.priority)
  )
  const videosArr = useMemo(() => Object.values(data.videos), [data.videos])
  const validIds = useMemo(() => new Set(data.categories.map((c) => c.id)), [data.categories])

  const matchCount = (rule: Rule): number => {
    if (!rule.enabled) return 0
    const compiled = compileRules([rule], validIds)
    if (compiled.length === 0) return 0
    return previewMatches(compiled, videosArr).count
  }

  const toggle = (id: string) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))

  const save = async (enabledAll: boolean | null) => {
    let next = rules
    if (enabledAll === false) next = rules.map((r) => ({ ...r, enabled: false }))
    if (enabledAll === true) next = rules.map((r) => ({ ...r, enabled: true }))
    await writeRules(next)
    await runRulesPass(new ChromeKV(), new Date())
    await reload()
    onNext()
  }

  return (
    <div className="card">
      <h2>Starter rules</h2>
      <p className="muted small">
        Small and deliberately gentle keyword rules to get you going — everything is editable
        later in the Rules tab, where you can build precise channel/title/Shorts rules.
      </p>
      {rules.map((r) => (
        <div key={r.id} className="queueitem">
          <input type="checkbox" checked={r.enabled} onChange={() => toggle(r.id)} />
          <div style={{ flex: 1 }}>
            <div>{r.name}</div>
            <div className="muted small">
              {r.enabled ? `would currently match ${matchCount(r)} video(s)` : "disabled"}
            </div>
          </div>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
        <button className="btn" onClick={() => void save(false)}>Start clean (no starter rules)</button>
        <button className="btn btn-primary" onClick={() => void save(null)}>Continue</button>
      </div>
    </div>
  )
}

function BudgetModeStep({
  onNext,
  onSkip
}: {
  onNext: () => void | Promise<void>
  onSkip: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<"off" | "gentle" | "strict">("off")
  return (
    <div className="card">
      <h2>Budget enforcement on YouTube (optional)</h2>
      <p className="muted small">
        Once you set weekly time budgets (Budgets tab), YT Ledger can act on them while you browse:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "12px 0" }}>
        {(
          [
            ["off", "Off — just track, never touch YouTube"],
            ["gentle", "Gentle — subtly highlight over-budget videos (red border + label)"],
            ["strict", "Strict — blur/hide over-budget thumbnails & titles in feeds; interstitial on watch pages"]
          ] as const
        ).map(([m, label]) => (
          <label key={m} className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="radio" name="budgetmode" checked={mode === m} onChange={() => setMode(m)} />
            {label}
          </label>
        ))}
      </div>
      <p className="muted small">You can change or disable this anytime in Settings. No budget set = nothing happens.</p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className="btn"
          onClick={() => {
            void patchSettings({ budgetMode: "off" })
            void onSkip()
          }}
        >
          Skip
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            void patchSettings({ budgetMode: mode })
            void onNext()
          }}
        >
          Continue with {mode}
        </button>
      </div>
    </div>
  )
}
