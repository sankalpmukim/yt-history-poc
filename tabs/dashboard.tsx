/**
 * YT Ledger dashboard (extension tab page).
 * Hash-routed views over a live snapshot of the whole ledger.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { loadLedgerData, subscribeLedger, type LedgerData } from "./lib/data"
import { CSS } from "./lib/styles"
import { OverviewView } from "./views/overview"
import { LedgerView } from "./views/ledger"
import { RulesView } from "./views/rules"
import { CategoriesView } from "./views/categories"
import { SettingsView } from "./views/settings"
import { InsightsView } from "./views/insights"
import { OnboardingView } from "./views/onboarding"
import { BudgetsView } from "./views/budgets"
import { uncategorizedVideos } from "../core/aggregate"
import { relativeTime } from "./lib/ui"
import { YouTubeAccessNotice } from "./lib/access"

interface RouteDef {
  id: string
  label: string
  el: (props: { data: LedgerData; reload: () => Promise<void> }) => JSX.Element
}

const ROUTES: RouteDef[] = [
  { id: "overview", label: "Overview", el: (p) => <OverviewView {...p} /> },
  { id: "ledger", label: "Ledger", el: (p) => <LedgerView {...p} /> },
  { id: "rules", label: "Rules", el: (p) => <RulesView {...p} /> },
  { id: "categories", label: "Categories", el: (p) => <CategoriesView {...p} /> },
  { id: "insights", label: "Insights", el: (p) => <InsightsView {...p} /> },
  { id: "budgets", label: "Budgets", el: (p) => <BudgetsView {...p} /> },
  { id: "settings", label: "Settings", el: (p) => <SettingsView {...p} /> }
]

function useHashRoute(): [string, (id: string) => void] {
  const routeOf = (hash: string) => {
    const raw = (hash || "#/overview").slice(2)
    return raw.split("?")[0]
  }
  const [hash, setHash] = useState(() => location.hash || "#/overview")
  useEffect(() => {
    const onHash = () => setHash(location.hash)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return [routeOf(hash), (id) => {
    location.hash = "#/" + id
  }]
}

export default function Dashboard() {
  const [data, setData] = useState<LedgerData | null>(null)
  const [route, navigate] = useHashRoute()

  const reload = useCallback(async () => {
    setData(await loadLedgerData())
  }, [])

  useEffect(() => {
    void reload()
    return subscribeLedger(() => void reload())
  }, [reload])

  const onboarded = data?.meta?.settings?.onboardedAt != null

  // first run: force the wizard; once done: never show it again
  useEffect(() => {
    if (data == null) return
    if (!onboarded && route !== "onboarding") navigate("onboarding")
    if (onboarded && route === "onboarding") navigate("overview")
  }, [data, onboarded, route])

  const uncategorizedCount = useMemo(
    () => (data ? uncategorizedVideos({ videos: data.videos, events: data.events, limit: 100000 }).length : 0),
    [data]
  )

  if (data == null) {
    return (
      <>
        <style>{CSS}</style>
        <div className="loading" role="status">Loading your ledger…</div>
      </>
    )
  }

  if (route === "onboarding") {
    return (
      <>
        <style>{CSS}</style>
        <div className="access-notice-wrap"><YouTubeAccessNotice /></div>
        <OnboardingView
          data={data}
          reload={reload}
          onFinish={() => navigate("overview")}
        />
      </>
    )
  }

  const active = ROUTES.find((r) => r.id === route) ?? ROUTES[0]
  const overCount = data.budgetStatus?.entries.filter((e) => e.over).length ?? 0
  const status = data.meta?.lastSyncStatus ?? ""
  const counts: Record<string, { text: string; label: string; over?: boolean } | undefined> = {
    ledger: uncategorizedCount > 0 ? { text: String(uncategorizedCount), label: `${uncategorizedCount} without a category` } : undefined,
    budgets: overCount > 0 ? { text: `${overCount} over`, label: `${overCount} over budget`, over: true } : undefined
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <aside className="sidebar">
          <p className="brand">YT Ledger</p>
          <nav className="nav" aria-label="Dashboard">
            {ROUTES.map((r) => {
              const count = counts[r.id]
              return (
                <a
                  key={r.id}
                  href={"#/" + r.id}
                  className={r.id === active.id ? "active" : ""}
                  aria-current={r.id === active.id ? "page" : undefined}
                  onClick={() => navigate(r.id)}
                >
                  <span>{r.label}</span>
                  {count ? (
                    <span className={"nav-count" + (count.over ? " over" : "")}>
                      <span aria-hidden="true">{count.text}</span>
                      <span className="sr-only">, {count.label}</span>
                    </span>
                  ) : null}
                </a>
              )
            })}
          </nav>
          <div className="sidefoot">
            {data.meta?.lastSyncedAt ? `Synced ${relativeTime(data.meta.lastSyncedAt)}` : "Not synced yet. Open YouTube to sync."}
            {status && !status.startsWith("ok") ? <div>{status}</div> : null}
          </div>
        </aside>
        <main className="main" id="main" tabIndex={-1}>
          <YouTubeAccessNotice />
          <active.el data={data} reload={reload} />
        </main>
      </div>
    </>
  )
}
