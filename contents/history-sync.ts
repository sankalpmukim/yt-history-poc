/**
 * Isolated-world content script (the thin client).
 *
 * On every YouTube page open (and on SPA navigations, throttled):
 *   1. injects the MAIN-world fetcher/observer via a <script src> tag
 *   2. asks it for the history inside the configured lookback window
 *   3. forwards the RAW sections to the service worker, which is the single
 *      writer that merges them into chrome.storage.local (multi-tab safe)
 *   4. console logs the outcome; a small overlay exists only when the
 *      debugOverlay setting is on (default off — sync must not disrupt)
 */

import type { PlasmoCSConfig } from "plasmo"
import mainWorldUrl from "url:./history-main"
import type { FetchResult } from "../utils/history-types"
import type { Settings } from "../core/types"
import { KEYS } from "../core/types"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  run_at: "document_idle"
}

const MSG_SOURCE = "yt-ledger"
const REQ_TYPE = "YT_LEDGER_FETCH_REQUEST"
const RES_TYPE = "YT_LEDGER_FETCH_RESPONSE"
const READY_TYPE = "YT_LEDGER_MAIN_READY"

const SYNC_THROTTLE_MS = 60_000
const FETCH_TIMEOUT_MS = 30_000
const DEFAULT_DAYS_BACK = 14

let lastSyncStartedAt = 0
let inFlight = false
let settingsCache: Settings | null = null

/* ------------------------------------------------------------------ */
/* settings (read-only mirror of yl.v2.meta)                           */
/* ------------------------------------------------------------------ */

async function readSettings(): Promise<Settings | null> {
  if (settingsCache) return settingsCache
  try {
    const bag = await chrome.storage.local.get(KEYS.meta)
    const s = bag?.[KEYS.meta]?.settings
    if (s) {
      settingsCache = s as Settings
      return settingsCache
    }
  } catch {}
  return null
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  const meta = changes[KEYS.meta]
  if (meta) settingsCache = meta.newValue?.settings ?? null
})

/* ------------------------------------------------------------------ */
/* inject the MAIN-world script (classic <script src> pattern)         */
/* ------------------------------------------------------------------ */

function injectMainWorldScript(): void {
  const w = window as any
  if (w.__YT_LEDGER_MAIN_INJECTED__) return
  w.__YT_LEDGER_MAIN_INJECTED__ = true
  try {
    const s = document.createElement("script")
    s.src = mainWorldUrl
    s.async = false
    s.onerror = () => console.error("[yt-ledger] main-world script tag failed to load", mainWorldUrl)
    ;(document.head || document.documentElement).appendChild(s)
  } catch (e) {
    console.error("[yt-ledger] main-world injection failed:", e)
  }
}

/* ------------------------------------------------------------------ */
/* talk to the MAIN-world fetcher                                      */
/* ------------------------------------------------------------------ */

function requestHistory(daysBack: number): Promise<FetchResult> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)

    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return
      const data: any = ev.data
      if (data?.source !== MSG_SOURCE || data?.type !== RES_TYPE) return
      if (data.id !== id) return
      cleanup()
      resolve(data.payload as FetchResult)
    }

    const timer = setTimeout(() => {
      cleanup()
      resolve({
        ok: false,
        sections: [],
        meta: {
          pagesFetched: 0,
          stoppedBecause: "error",
          error: "timed out waiting for MAIN-world fetcher"
        },
        fetchedAt: new Date().toISOString()
      })
    }, FETCH_TIMEOUT_MS)

    function cleanup() {
      window.removeEventListener("message", onMessage)
      clearTimeout(timer)
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ source: MSG_SOURCE, type: REQ_TYPE, id, daysBack }, window.location.origin)
  })
}

/* ------------------------------------------------------------------ */
/* debug overlay (off by default; setting-controlled)                  */
/* ------------------------------------------------------------------ */

async function renderDebugOverlay(status: string): Promise<void> {
  const settings = await readSettings()
  let el = document.getElementById("yt-ledger-debug-overlay")
  if (!settings?.debugOverlay) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement("div")
    el.id = "yt-ledger-debug-overlay"
    Object.assign(el.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      maxWidth: "360px",
      background: "#0f0f0f",
      color: "#f1f1f1",
      border: "1px solid #3d3d3d",
      borderRadius: "12px",
      padding: "10px 12px",
      font: "12px/1.5 Roboto, Arial, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,.5)",
      pointerEvents: "auto"
    } satisfies Partial<CSSStyleDeclaration>)
    document.documentElement.appendChild(el)
  }
  el.textContent = `📊 YT Ledger — ${status}`
}

/* ------------------------------------------------------------------ */
/* sync                                                                */
/* ------------------------------------------------------------------ */

async function sync(reason: string, daysBackOverride?: number): Promise<void> {
  if (inFlight) return
  const since = Date.now() - lastSyncStartedAt
  if (since < SYNC_THROTTLE_MS && reason !== "force") return

  inFlight = true
  lastSyncStartedAt = Date.now()
  try {
    const settings = await readSettings()
    const raw = daysBackOverride ?? settings?.fetchWindowDays ?? DEFAULT_DAYS_BACK
    const daysBack = Math.min(90, Math.max(1, Math.round(raw) || DEFAULT_DAYS_BACK))
    console.info(`[yt-ledger] sync('${reason}') starting — daysBack=${daysBack}`)

    const result = await requestHistory(daysBack)
    const sectionSummary =
      result.sections.map((s) => `${s.dayLabel}(${s.items.length})`).join(", ") || "(none)"
    console.info(
      `[yt-ledger] fetch ok=${result.ok} meta=${JSON.stringify(result.meta)} — sections: ${sectionSummary}`
    )

    if (!result.ok) {
      console.warn(`[yt-ledger] fetch failed: ${result.meta.error ?? "unknown"}`)
      await renderDebugOverlay(`sync failed: ${result.meta.error ?? "unknown"}`)
      return
    }

    let response: any = null
    try {
      response = await chrome.runtime.sendMessage({
        type: "yl.syncResult",
        sections: result.sections,
        fetchMeta: result.meta,
        fetchedAt: result.fetchedAt
      })
    } catch (e) {
      console.warn("[yt-ledger] forwarding sections to service worker failed:", e)
    }
    const status = response?.status ?? "sent (no response)"
    console.info(`[yt-ledger] ${status}`)
    await renderDebugOverlay(status)
  } catch (e: any) {
    console.error("[yt-ledger] sync failed:", e)
    await renderDebugOverlay(`error: ${e?.message ?? String(e)}`)
  } finally {
    inFlight = false
  }
}

/* ------------------------------------------------------------------ */
/* triggers                                                            */
/* ------------------------------------------------------------------ */

// MAIN-world script may still be initializing; a short delay before the first
// sync avoids a wasted timeout round-trip.
let mainReady = false
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return
  if (ev.data?.source === MSG_SOURCE && ev.data?.type === READY_TYPE) {
    mainReady = true
  }
})

setTimeout(() => {
  injectMainWorldScript()
  // give the injected script a moment to attach its listener before asking
  setTimeout(() => void sync("initial"), 600)
}, 200)

// YouTube is an SPA — re-sync on internal navigation, throttled.
window.addEventListener("yt-navigate-finish", () => void sync("spa-navigate"))

// manual trigger for devtools: window.__YT_LEDGER_SYNC() or __YT_LEDGER_SYNC(30)
;(window as any).__YT_LEDGER_SYNC = (daysBack?: number) => sync("force", daysBack)

export {}
