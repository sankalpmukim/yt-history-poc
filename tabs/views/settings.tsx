/** Settings: sync (manual w/ lookback), retention, fetch window, toggles, data export/import/wipe. */

import { useRef, useState } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, settingsOf } from "../lib/data"
import { loadLedgerData } from "../lib/data"
import { ChromeKV } from "../../core/storage"
import { ensureInitialized } from "../../core/ledger"
import { buildBackup, buildCsv, parseBackupJson, backupToShards, isLedgerKey } from "../../core/exports"
import { KEYS, eventsKey, isEventsKey } from "../../core/types"
import { APP_VERSION } from "../../core/version"
import { BudgetModeControl } from "../lib/ui"
import { DEFAULT_SUBCATEGORIES } from "../../core/defaults"

const LOOKBACKS = [7, 14, 30, 60, 90]

export function SettingsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const settings = settingsOf(data)
  const [syncStatus, setSyncStatus] = useState<string>("")
  const [syncing, setSyncing] = useState(false)
  const [lookback, setLookback] = useState<number>(settings.fetchWindowDays || 14)
  const [customLookback, setCustomLookback] = useState<string>("")
  const [importMsg, setImportMsg] = useState<string>("")
  const [pastedJson, setPastedJson] = useState<string>("")
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  const manualSync = async (days: number) => {
    setSyncing(true)
    setSyncStatus(`requesting ${days}d sync…`)
    try {
      const res = await chrome.runtime.sendMessage({ type: "yl.manualSync", daysBack: days })
      setSyncStatus(String(res?.status ?? "no response from service worker"))
    } catch (e: any) {
      setSyncStatus(`failed: ${e?.message ?? String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

  const exportJsonText = async (): Promise<string> => {
    const fresh = await loadLedgerData()
    const backup = buildBackup({
      meta: fresh.meta,
      categories: fresh.categories,
      subcategories: fresh.subcategories,
      rules: fresh.rules,
      videos: fresh.videos,
      events: fresh.events,
      now: new Date()
    })
    return JSON.stringify(backup, null, 2)
  }

  const exportJson = async () => {
    const json = await exportJsonText()
    download(
      `yt-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      "application/json"
    )
  }

  const copyExportJson = async () => {
    try {
      const json = await exportJsonText()
      await navigator.clipboard.writeText(json)
      setImportMsg(`Copied JSON backup to clipboard (${json.length.toLocaleString()} characters).`)
    } catch (e: any) {
      setImportMsg(`clipboard copy failed: ${e?.message ?? String(e)}`)
    }
  }

  const exportCsv = async () => {
    const fresh = await loadLedgerData()
    const csv = buildCsv({
      videos: fresh.videos,
      events: fresh.events,
      categories: fresh.categories,
      subcategories: fresh.subcategories
    })
    download(
      `yt-ledger-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv"
    )
  }

  const importJsonText = async (text: string) => {
    setImportMsg("reading…")
    try {
      const backup = parseBackupJson(text)
      const shards = backupToShards(backup)
      const confirmation = window.confirm(
        "Import replaces the current YT Ledger videos, events, categories, subcategories, rules, and settings. Export a backup first if you want to keep them. Continue?"
      )
      if (!confirmation) {
        setImportMsg("import cancelled")
        return
      }
      const current = await chrome.storage.local.get(null)
      const oldEventKeys = Object.keys(current).filter(isEventsKey)
      if (oldEventKeys.length) await chrome.storage.local.remove(oldEventKeys)
      const writes: Record<string, unknown> = {
        [KEYS.meta]: backup.data.meta,
        [KEYS.categories]: backup.data.categories,
        [KEYS.subcategories]: backup.data.subcategories ?? DEFAULT_SUBCATEGORIES,
        [KEYS.rules]: backup.data.rules,
        [KEYS.videos]: backup.data.videos
      }
      for (const [month, shard] of Object.entries(shards)) writes[eventsKey(month)] = shard
      await chrome.storage.local.set(writes)
      setImportMsg(
        `restored ${Object.keys(backup.data.videos).length} video(s), ${Object.keys(backup.data.events).length} event(s), ${backup.data.rules.length} rule(s)`
      )
      await reload()
    } catch (e: any) {
      setImportMsg(`import failed: ${e?.message ?? String(e)}`)
    }
  }

  const importJsonFile = async (file: File) => {
    try {
      await importJsonText(await file.text())
    } catch (e: any) {
      setImportMsg(`import failed: ${e?.message ?? String(e)}`)
    }
  }

  const wipe = async () => {
    const all = await chrome.storage.local.get(null)
    const keys = Object.keys(all ?? {}).filter(isLedgerKey)
    await chrome.storage.local.remove(keys)
    await ensureInitialized(new ChromeKV(), new Date())
    setConfirmWipe(false)
    await reload()
  }

  return (
    <div>
      <h1>Settings</h1>
      <p className="hint">Everything is stored locally in your browser profile. Nothing ever leaves this machine.</p>

      <div className="card">
        <h2>Sync</h2>
        <div className="muted small" style={{ marginBottom: 10 }}>
          last sync: {data.meta?.lastSyncedAt ? new Date(data.meta.lastSyncedAt).toLocaleString() : "never"} —{" "}
          {data.meta?.lastSyncStatus}
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={syncing} onClick={() => void manualSync(lookback)}>
            ⟳ Refresh / Sync now
          </button>
          <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))} title="lookback for this manual sync">
            {LOOKBACKS.map((d) => (
              <option key={d} value={d}>
                last {d} days
              </option>
            ))}
          </select>
          <span className="muted small">more options:</span>
          <input
            type="number" min={1} max={90} placeholder="custom days" style={{ width: 110 }}
            value={customLookback}
            onChange={(e) => setCustomLookback(e.target.value)}
          />
          <button
            className="btn"
            disabled={!customLookback || Number(customLookback) < 1 || Number(customLookback) > 90}
            onClick={() => void manualSync(Number(customLookback))}
          >
            Sync custom
          </button>
        </div>
        {syncStatus ? <div className="small" style={{ marginTop: 8 }}>{syncStatus}</div> : null}
        <div className="muted small" style={{ marginTop: 8 }}>
          Automatic syncs run on every YouTube visit (throttled) with the fetch window below.
        </div>
      </div>

      <div className="card">
        <h2>Windows &amp; retention</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="small">
            Automatic fetch window
            <select
              value={settings.fetchWindowDays}
              onChange={(e) => void patchSettings({ fetchWindowDays: Number(e.target.value) })}
            >
              {[7, 14, 21, 30].map((d) => (
                <option key={d} value={d}>last {d} days</option>
              ))}
            </select>
          </label>
          <label className="small">
            Keep history for
            <select
              value={settings.retentionDays == null ? "forever" : String(settings.retentionDays)}
              onChange={(e) =>
                void patchSettings({
                  retentionDays: e.target.value === "forever" ? null : Number(e.target.value)
                })
              }
            >
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="forever">forever</option>
            </select>
          </label>
        </div>
        <div className="muted small">
          Older watch events are pruned on browser startup. Export first if you want a copy.
        </div>
      </div>

      <div className="card">
        <h2>YouTube integration</h2>
        <div className="row" style={{ marginBottom: 8, alignItems: "flex-start" }}>
          <div>
            <div className="small" style={{ marginBottom: 6 }}>Budget enforcement</div>
            <BudgetModeControl
              value={settings.budgetMode}
              onChange={(mode) => void patchSettings({ budgetMode: mode })}
              compact
            />
          </div>
          <span className="small" role="status" aria-live="polite" style={{ alignSelf: "center" }}>
            Current mode: <b>{settings.budgetMode}</b>
          </span>
        </div>
        <div className="muted small">Configure hours/week in the Budgets tab. Off (default) never touches YouTube; Gentle highlights; Strict blurs/hides. Unknown videos are never blocked.</div>
      </div>

      <div className="card">
        <h2>Debug</h2>
        <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <input type="checkbox" checked={settings.debugOverlay} onChange={(e) => void patchSettings({ debugOverlay: e.target.checked })} />
          on-YouTube debug overlay
        </label>
        {process.env.NODE_ENV !== "production" && (
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={settings.devRelay} onChange={(e) => void patchSettings({ devRelay: e.target.checked })} />
            dev relay to local capture server
          </label>
        )}
      </div>

      <div className="card">
        <h2>Data</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <button className="btn" onClick={() => void exportJson()}>⬇ Export JSON backup</button>
          <button className="btn" onClick={() => void copyExportJson()}>Copy export JSON to clipboard</button>
          <button className="btn" onClick={() => void exportCsv()}>⬇ Export CSV ledger</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import JSON</button>
          <button
            className="btn"
            onClick={() => {
              void patchSettings({ onboardedAt: null })
              location.hash = "#/onboarding"
            }}
          >
            ↺ Rerun onboarding
          </button>
          <input
            ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJsonFile(f)
              e.target.value = ""
            }}
          />
        </div>
        <div className="muted small" style={{ marginBottom: 8 }}>
          Import replaces the current ledger, including existing event shards. Export a backup first.
          A deterministic QA seed is available at <code>fixtures/qa-seed.json</code>.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          <label htmlFor="pasted-backup-json" className="small">Import from pasted JSON</label>
          <textarea
            id="pasted-backup-json"
            aria-label="Import from pasted JSON"
            rows={8}
            value={pastedJson}
            onChange={(e) => setPastedJson(e.target.value)}
            placeholder="Paste a YT Ledger JSON backup or QA seed here…"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", resize: "vertical" }}
          />
          <button
            className="btn btn-primary"
            disabled={!pastedJson.trim()}
            aria-label="Import pasted JSON"
            onClick={() => void importJsonText(pastedJson)}
            style={{ alignSelf: "flex-start" }}
          >
            Import pasted JSON
          </button>
        </div>
        {importMsg ? <div className="small" role="status" aria-live="polite" style={{ marginBottom: 8 }}>{importMsg}</div> : null}
        <div className="row">
          {confirmWipe ? (
            <>
              <span className="small" style={{ color: "var(--danger)" }}>
                Delete ALL YT Ledger data (videos, events, rules, categories, settings)?
              </span>
              <button className="btn btn-danger" onClick={() => void wipe()}>Yes, wipe everything</button>
              <button className="btn" onClick={() => setConfirmWipe(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmWipe(true)}>
              Wipe all data
            </button>
          )}
        </div>
      </div>

      <div className="muted small">
        YT Ledger v{APP_VERSION} · {Object.keys(data.videos).length} videos · {data.events.length} events stored
      </div>
    </div>
  )
}

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
