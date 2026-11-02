/** Budgets: weekly per-category time budgets, spent-vs-budget, enforcement mode. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, settingsOf } from "../lib/data"
import { refreshBudgetStatusClient } from "../lib/budgetclient"
import { computeBudgetStatus } from "../../core/budget"
import { fmtDur, fmtDate } from "../lib/ui"

export function BudgetsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const settings = settingsOf(data)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of data.categories) {
      const sec = settings.budgetsWeekly[c.id] ?? 0
      init[c.id] = sec > 0 ? String(sec / 3600) : ""
    }
    return init
  })
  const [saved, setSaved] = useState(false)

  const status = useMemo(() => {
    if (data.budgetStatus) return data.budgetStatus
    return computeBudgetStatus({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      budgetsWeekly: settings.budgetsWeekly,
      now: new Date()
    })
  }, [data, settings.budgetsWeekly])
  const liveCats = useMemo(
    () => [...data.categories].filter((c) => !c.archivedAt).sort((a, b) => a.order - b.order),
    [data.categories]
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
      const hours = parseFloat(hoursStr)
      if (Number.isFinite(hours) && hours > 0) budgetsWeekly[catId] = Math.round(hours * 3600)
    }
    await patchSettings({ budgetsWeekly })
    await refreshBudgetStatusClient()
    await reload()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <h1>Budgets</h1>
      <p className="hint">
        Weekly seconds-per-category budgets; the week runs Monday 00:00 local
        {status ? ` (current week: ${fmtDate(status.weekStart)}, ${daysLeft} day(s) left)` : ""}.
        Spent = estimated watch time this week. Nothing is enforced until you pick a mode below.
      </p>

      <div className="card">
        <h2>Enforcement on YouTube</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <select
            value={settings.budgetMode}
            onChange={(e) => void patchSettings({ budgetMode: e.target.value as "off" | "gentle" | "strict" })}
          >
            <option value="off">Off — track only</option>
            <option value="gentle">Gentle — highlight over-budget videos</option>
            <option value="strict">Strict — blur/hide over-budget videos</option>
          </select>
        </div>
        <div className="muted small">
          Gentle adds a red border + “over budget” chip on over-budget videos in feeds; Strict
          blurs thumbnails/titles with a reveal-on-click, and shows a dismissible interstitial on
          watch pages. Unknown videos are never touched (fail-open).
        </div>
      </div>

      <div className="card">
        <h2>
          Weekly budgets {saved ? <span className="small" style={{ color: "var(--ok)" }}>saved ✓</span> : null}
        </h2>
        {liveCats.map((c) => {
          const entry = status?.entries.find((e) => e.categoryId === c.id)
          const spent = entry?.spentSec ?? status?.spentByCategory[c.id] ?? 0
          const budgetSec = entry?.budgetSec ?? 0
          const pct = budgetSec > 0 ? Math.min(100, (spent / budgetSec) * 100) : 0
          const over = entry?.over ?? false
          return (
            <div key={c.id} className="queueitem" style={{ flexWrap: "wrap" }}>
              <span style={{ width: 190 }}>
                {c.emoji} {c.name}
              </span>
              <label className="small">
                h/week
                <input
                  type="number"
                  min={0}
                  step={0.25}
                  placeholder="—"
                  style={{ width: 76 }}
                  value={draft[c.id] ?? ""}
                  onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                />
              </label>
              <div className="sharebar" style={{ maxWidth: 220 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    background: over ? "var(--danger)" : pct > 80 ? "var(--warn)" : "var(--accent)"
                  }}
                />
              </div>
              <span className="small" style={{ width: 150 }}>
                {fmtDur(spent)} spent{budgetSec > 0 ? ` / ${fmtDur(budgetSec)}` : ""}
              </span>
              {over ? (
                <span className="small" style={{ color: "var(--danger)" }}>
                  {fmtDur(entry!.deltaSec)} over
                </span>
              ) : budgetSec > 0 ? (
                <span className="small" style={{ color: "var(--ok)" }}>
                  {fmtDur(-entry!.deltaSec)} left
                </span>
              ) : null}
            </div>
          )
        })}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
          <button className="btn btn-primary" onClick={() => void save()}>
            Save budgets
          </button>
        </div>
      </div>
    </div>
  )
}
