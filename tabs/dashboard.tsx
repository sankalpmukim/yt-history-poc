/**
 * YT Ledger dashboard (extension tab page).
 * Hash-routed views over a live snapshot of the whole ledger.
 */

import { useCallback, useEffect, useState } from "react"
import { loadLedgerData, subscribeLedger, settingsOf, type LedgerData } from "./lib/data"
import { CSS } from "./lib/styles"
import { APP_VERSION } from "../core/version"
import { OverviewView } from "./views/overview"
import { LedgerView } from "./views/ledger"
import { RulesView } from "./views/rules"
import { CategoriesView } from "./views/categories"
import { SettingsView } from "./views/settings"
import { InsightsView } from "./views/insights"
import { OnboardingView } from "./views/onboarding"
import { BudgetsView } from "./views/budgets"

interface RouteDef {
  id: string
  label: string
  el: (props: { data: LedgerData; reload: () => Promise<void> }) => JSX.Element
}

const ROUTES: RouteDef[] = [
  { id: "overview", label: "📊 Overview", el: (p) => <OverviewView {...p} /> },
  { id: "ledger", label: "🧾 Ledger", el: (p) => <LedgerView {...p} /> },
  { id: "rules", label: "⚖️ Rules", el: (p) => <RulesView {...p} /> },
  { id: "categories", label: "🏷️ Categories", el: (p) => <CategoriesView {...p} /> },
  { id: "insights", label: "🔍 Insights", el: (p) => <InsightsView {...p} /> },
  { id: "budgets", label: "⏱️ Budgets", el: (p) => <BudgetsView {...p} /> },
  { id: "settings", label: "⚙️ Settings", el: (p) => <SettingsView {...p} /> }
]

function useHashRoute(): [string, (id: string) => void] {
  const [hash, setHash] = useState(() => (location.hash || "#/overview").slice(2))
  useEffect(() => {
    const onHash = () => setHash((location.hash || "#/overview").slice(2))
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return [hash, (id) => {
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

  if (data == null) {
    return (
      <div style={{ padding: 40 }} className="muted">
        Loading ledger…
      </div>
    )
  }

  if (route === "onboarding") {
    return (
      <>
        <style>{CSS}</style>
        <OnboardingView
          data={data}
          reload={reload}
          onFinish={() => navigate("overview")}
        />
      </>
    )
  }

  const active = ROUTES.find((r) => r.id === route) ?? ROUTES[0]
  const settings = settingsOf(data)
  const lastSync = data.meta?.lastSyncedAt
    ? new Date(data.meta.lastSyncedAt).toLocaleString()
    : "never"

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="sidebar">
          <div className="brand">
            📊 YT Ledger <span className="sub">v{APP_VERSION}</span>
          </div>
          <nav className="nav">
            {ROUTES.map((r) => (
              <a
                key={r.id}
                href={"#/" + r.id}
                className={r.id === active.id ? "active" : ""}
                onClick={() => navigate(r.id)}
              >
                {r.label}
              </a>
            ))}
          </nav>
          <div className="sidefoot">
            {Object.keys(data.videos).length} videos · {data.events.length} events
            <br />
            last sync: {lastSync}
            <br />
            <span className="muted">{data.meta?.lastSyncStatus}</span>
          </div>
        </div>
        <div className="main">
          <active.el data={data} reload={reload} />
        </div>
      </div>
    </>
  )
}
