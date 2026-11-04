/** Settings: sync, history retention, backup and restore, and advanced options. */

import { useRef, useState } from "react"
import type { LedgerData } from "../lib/data"
import { patchSettings, settingsOf } from "../lib/data"
import { loadLedgerData } from "../lib/data"
import { ChromeKV } from "../../core/storage"
import { ensureInitialized } from "../../core/ledger"
import { buildBackup, buildCsv, parseBackupJson, backupToShards, isLedgerKey } from "../../core/exports"
import { KEYS, eventsKey, isEventsKey } from "../../core/types"
import { APP_VERSION } from "../../core/version"
import { plural, relativeTime } from "../lib/ui"
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
    setSyncStatus(`Syncing the last ${days} days…`)
    try {
      const res = await chrome.runtime.sendMessage({ type: "yl.manualSync", daysBack: days })
      setSyncStatus(String(res?.status ?? "YT Ledger didn’t respond. Reload the extension from chrome://extensions and try again."))
    } catch (e: any) {
      setSyncStatus(`Sync didn’t start: ${e?.message ?? String(e)}. Reload the extension and try again.`)
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
      setImportMsg("Backup copied to the clipboard.")
    } catch (e: any) {
      setImportMsg(`Couldn’t copy the backup: ${e?.message ?? String(e)}. Use Export JSON backup instead.`)
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
    setImportMsg("Reading the backup…")
    try {
      const backup = parseBackupJson(text)
      const shards = backupToShards(backup)
      const confirmation = window.confirm(
        "Importing replaces all your current videos, watches, categories, rules and settings with the ones in this backup. Export a backup first if you want to keep what you have. Import now?"
      )
      if (!confirmation) {
        setImportMsg("Import cancelled. Nothing changed.")
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
      const videos = Object.keys(backup.data.videos).length
      const watches = Object.keys(backup.data.events).length
      setImportMsg(`Imported ${plural(videos, "video")}, ${plural(watches, "watch", "watches")} and ${plural(backup.data.rules.length, "rule")}.`)
      await reload()
    } catch (e: any) {
      setImportMsg(`Import failed: ${e?.message ?? String(e)}. Check that this is a YT Ledger backup file.`)
    }
  }

  const importJsonFile = async (file: File) => {
    try {
      await importJsonText(await file.text())
    } catch (e: any) {
      setImportMsg(`Import failed: ${e?.message ?? String(e)}. Check that this is a YT Ledger backup file.`)
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

  const lastSync = data.meta?.lastSyncedAt ? new Date(data.meta.lastSyncedAt).toLocaleString() : null
  const customDays = Number(customLookback)
  const customValid = customLookback !== "" && customDays >= 1 && customDays <= 90

  return (
    <div>
      <div className="page-head">
        <h1>Settings</h1>
      </div>
      <p className="lede">Everything YT Ledger knows is stored in this browser profile. Nothing is sent anywhere.</p>

      <section className="card" aria-labelledby="sync-title">
        <div className="section-head">
          <div>
            <h2 id="sync-title">Sync</h2>
            <p className="section-note">
              {lastSync ? `Last synced ${relativeTime(data.meta?.lastSyncedAt)} (${lastSync}).` : "Not synced yet."}{" "}
              YT Ledger also syncs on its own whenever you open YouTube.
            </p>
          </div>
        </div>
        <div className="setting-group">
          <label className="field">
            Sync how far back
            <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
              {LOOKBACKS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" disabled={syncing} onClick={() => void manualSync(lookback)}>
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <span className="field-row" style={{ gap: 8, marginLeft: 16 }}>
            <label className="field">
              Or any number of days, up to 90
              <input type="number" min={1} max={90} placeholder="custom days" value={customLookback} onChange={(e) => setCustomLookback(e.target.value)} />
            </label>
            <button type="button" className="btn" disabled={!customValid || syncing} onClick={() => void manualSync(customDays)}>Sync custom</button>
          </span>
        </div>
        <div className="status" role="status" aria-live="polite">{syncStatus}</div>
      </section>

      <section className="card" aria-labelledby="history-title">
        <div className="section-head">
          <div>
            <h2 id="history-title">History</h2>
            <p className="section-note">Watches older than this are deleted when the browser starts. Export a backup first if you want to keep them.</p>
          </div>
        </div>
        <div className="setting-group">
          <label className="field">
            Automatic syncs look back
            <select value={settings.fetchWindowDays} onChange={(e) => void patchSettings({ fetchWindowDays: Number(e.target.value) })}>
              {[7, 14, 21, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <label className="field">
            Keep history for
            <select
              value={settings.retentionDays == null ? "forever" : String(settings.retentionDays)}
              onChange={(e) => void patchSettings({ retentionDays: e.target.value === "forever" ? null : Number(e.target.value) })}
            >
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="forever">Forever</option>
            </select>
          </label>
        </div>
        <p className="muted" style={{ margin: "16px 0 0" }}>
          Budgets and what happens on YouTube are set on the <a href="#/budgets">Budgets</a> page.
        </p>
      </section>

      <section className="card" aria-labelledby="backup-title">
        <div className="section-head">
          <div>
            <h2 id="backup-title">Export and import</h2>
            <p className="section-note">Importing a backup replaces everything currently in YT Ledger.</p>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={() => void exportJson()}>Export JSON backup</button>
          <button type="button" className="btn" onClick={() => void copyExportJson()}>Copy backup</button>
          <button type="button" className="btn" onClick={() => void exportCsv()}>Export CSV ledger</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import backup file…</button>
          <input
            ref={fileRef} type="file" accept="application/json" style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJsonFile(f)
              e.target.value = ""
            }}
          />
        </div>
        <div className="field" style={{ marginTop: 24 }}>
          <label htmlFor="pasted-backup-json">Import from pasted JSON</label>
          <textarea
            id="pasted-backup-json"
            rows={6}
            value={pastedJson}
            onChange={(e) => setPastedJson(e.target.value)}
            placeholder="Paste a YT Ledger backup here"
          />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn" disabled={!pastedJson.trim()} onClick={() => void importJsonText(pastedJson)}>
            Import pasted JSON
          </button>
        </div>
        <div className="status" role="status" aria-live="polite">{importMsg}</div>
      </section>

      <section className="card" aria-labelledby="advanced-title">
        <div className="section-head">
          <h2 id="advanced-title">Advanced</h2>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <label className="check">
            <input type="checkbox" checked={settings.debugOverlay} onChange={(e) => void patchSettings({ debugOverlay: e.target.checked })} />
            Show a debug overlay on YouTube
          </label>
          {process.env.NODE_ENV !== "production" && (
            <label className="check">
              <input type="checkbox" checked={settings.devRelay} onChange={(e) => void patchSettings({ devRelay: e.target.checked })} />
              Send sync data to the local capture server (development only)
            </label>
          )}
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void patchSettings({ onboardedAt: null })
                location.hash = "#/onboarding"
              }}
            >
              Run setup again
            </button>
          </div>
        </div>

        <div className="danger-zone" style={{ marginTop: 32 }}>
          {confirmWipe ? (
            <div className="confirm">
              <span className="confirm-text">Delete every video, watch, rule, category and setting? This can’t be undone.</span>
              <button type="button" className="btn btn-danger" onClick={() => void wipe()}>Delete everything</button>
              <button type="button" className="btn btn-quiet" autoFocus onClick={() => setConfirmWipe(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn btn-quiet text-danger" onClick={() => setConfirmWipe(true)}>Delete all data…</button>
          )}
        </div>
      </section>

      <p className="app-footer">
        YT Ledger {APP_VERSION}. {plural(Object.keys(data.videos).length, "video")} and {plural(data.events.length, "watch", "watches")} stored.
      </p>
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
