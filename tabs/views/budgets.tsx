/** Budgets: weekly hours per category, spent so far, and what happens on YouTube when one runs over. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, settingsOf } from "../lib/data"
import { refreshBudgetStatusClient } from "../lib/budgetclient"
import { computeBudgetStatus } from "../../core/budget"
import { weeklyAveragesByCategory } from "../../core/signals"
import { ledgerHref } from "../lib/router"
import { fmtDur, fmtDate, BudgetModeControl, budgetModeDetail, plural } from "../lib/ui"

/** round seconds up to a friendly weekly hours value (≥ 0.5h, steps of 0.5h) */
function suggestHours(secondsPerWeek: number): number {
  return Math.max(0.5, Math.ceil(secondsPerWeek / 3600 / 0.5) * 0.5)
}

export function BudgetsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const settings = settingsOf(data)
  // Show hours rounded for reading; an untouched field keeps its exact stored value on save.
  const [initial] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of data.categories) {
      const sec = settings.budgetsWeekly[c.id] ?? 0
      init[c.id] = sec > 0 ? String(Number((sec / 3600).toFixed(2))) : ""
    }
    return init
  })
  const [draft, setDraft] = useState<Record<string, string>>(initial)
  const [saved, setSaved] = useState(false)
  const [filled, setFilled] = useState(0)

  const status = useMemo(() => {
    if (data.budgetStatus) return data.budgetStatus
    return computeBudgetStatus({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      budgetsWeekly: settings.budgetsWeekly,
      now: new Date()
    })
  }, [data, settings.budgetsWeekly])
  const liveCats = useMemo(
    () => [...data.categories].filter((c) => !c.archivedAt).sort((a, b) => a.order - b.order),
    [data.categories]
  )
  const avgByCat = useMemo(
    () =>
      new Map(
        weeklyAveragesByCategory({
          videos: data.videos,
          events: data.events,
          categories: data.categories,
          subcategories: data.subcategories,
          rules: data.rules
        }, 4).map((a) => [a.categoryId, a.secondsPerWeek] as const)
      ),
    [data]
  )
  const daysLeft = useMemo(() => {
    if (!status) return null
    const [y, m, d] = status.weekEnd.split("-").map(Number)
    const end = new Date(y, m - 1, d)
    return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000))
  }, [status])

  const save = async () => {
    const budgetsWeekly: Record<string, number> = {}
    for (const [catId, hoursStr] of Object.entries(draft)) {
      const stored = settings.budgetsWeekly[catId] ?? 0
      if (hoursStr === initial[catId] && stored > 0) { budgetsWeekly[catId] = stored; continue }
      const hours = parseFloat(hoursStr)
      if (Number.isFinite(hours) && hours > 0) budgetsWeekly[catId] = Math.round(hours * 3600)
    }
    await patchSettings({ budgetsWeekly })
    await refreshBudgetStatusClient()
    await reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const fillFromHistory = () => {
    const next = { ...draft }
    let count = 0
    for (const c of liveCats) {
      const avg = avgByCat.get(c.id) ?? 0
      if (avg < 1800 || (next[c.id] ?? "").trim() !== "") continue
      next[c.id] = String(suggestHours(avg))
      count++
    }
    setDraft(next)
    setFilled(count)
  }

  return (
    <div>
      <div className="page-head">
        <h1>Budgets</h1>
      </div>
      <p className="lede">
        Set weekly hours for any category; time in its subcategories counts toward it. Weeks start
        on Monday{status ? `, and this one has ${daysLeft === 1 ? "1 day" : `${daysLeft} days`} left` : ""}.
      </p>

      <section className="card" aria-labelledby="weekly-title">
        <div className="section-head">
          <h2 id="weekly-title">This week</h2>
          {status ? <span className="muted">From {fmtDate(status.weekStart)}</span> : null}
        </div>
        <div className="queueitem budget-row budget-head" aria-hidden="true">
          <span /><span>Hours per week</span><span /><span>Spent</span><span>Remaining</span>
        </div>
        {liveCats.map((c) => {
          const entry = status?.entries.find((e) => e.categoryId === c.id)
          const spent = entry?.spentSec ?? status?.spentByCategory[c.id] ?? 0
          const budgetSec = entry?.budgetSec ?? 0
          const ratio = budgetSec > 0 ? spent / budgetSec : 0
          const over = entry?.over ?? false
          const near = !over && ratio >= 0.8
          const state = over ? "over" : near ? "near" : ""
          const avg = avgByCat.get(c.id) ?? 0
          return (
            <div key={c.id} className="queueitem budget-row">
              <span className="budget-name">
                <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
                <a
                  className="truncate rowlink"
                  href={ledgerHref({ cat: c.id })}
                  title={`Open ${c.name} watches in the Ledger`}
                >
                  {c.name}
                </a>
                <span className="budget-avg muted small">
                  {avg >= 600 ? `${fmtDur(avg)}/wk lately` : ""}
                </span>
              </span>
              <input
                type="number"
                min={0}
                step={0.25}
                placeholder={avg >= 1800 ? `≈ ${suggestHours(avg)}h` : "No budget"}
                aria-label={`${c.name} hours per week`}
                value={draft[c.id] ?? ""}
                onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
              />
              {budgetSec > 0 ? (
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </span>
              ) : <span />}
              <span className="budget-spent money">
                {budgetSec > 0 ? `${fmtDur(spent)} of ${fmtDur(budgetSec)}` : spent > 0 ? fmtDur(spent) : <span className="muted">—</span>}
              </span>
              <span className={"budget-left " + state}>
                {over ? `${fmtDur(entry!.deltaSec)} over` : budgetSec > 0 ? `${fmtDur(-entry!.deltaSec)} left${near ? ", nearly used" : ""}` : ""}
              </span>
            </div>
          )
        })}
        <div className="actions">
          <span className="status" role="status" aria-live="polite">
            {saved ? "Budgets saved." : filled > 0 ? `Filled ${plural(filled, "empty field")} from your averages — check them, then save.` : ""}
          </span>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={fillFromHistory}
            title="Fill empty budgets with your recent weekly averages, rounded up"
          >
            Fill from history
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>Save budgets</button>
        </div>
      </section>

      <section className="card" aria-labelledby="mode-title">
        <div className="section-head">
          <div>
            <h2 id="mode-title">On YouTube</h2>
            <p className="section-note">What happens to videos from a category that’s over its budget. Videos YT Ledger can’t categorize are never touched.</p>
          </div>
        </div>
        <BudgetModeControl value={settings.budgetMode} onChange={(mode) => void patchSettings({ budgetMode: mode })} />
        <p className="muted" style={{ margin: "12px 0 0", maxWidth: "40em" }}>{budgetModeDetail(settings.budgetMode)}</p>
      </section>
    </div>
  )
}
