/**
 * Isolated-world content script (the thin client).
 *
 * On every YouTube page open (and on SPA navigations, throttled):
 *   1. injects the MAIN-world fetcher/observer via a <script src> tag
 *   2. asks it for the history inside the configured lookback window
 *      (on /feed/history this reads ytInitialData + the fetch observer's
 *      captured continuations)
 *   3. when this tab is HIDDEN and on /feed/history (the service worker's
 *      hidden sync tab), auto-scrolls first so the page itself loads enough
 *      history to cover the lookback window
 *   4. forwards the RAW sections to the service worker — the single writer
 *      that merges them into chrome.storage.local (multi-tab safe)
 *   5. on pages that can't read history themselves (Brave strips auth from
 *      extension-initiated innertube calls), asks the SW coordinator to run
 *      the sync elsewhere ("yl.visitNeedHelp")
 *
 * A small overlay exists only when the debugOverlay setting is on.
 */

import type { PlasmoCSConfig } from "plasmo"
import mainWorldUrl from "url:./history-main"
import { APP_VERSION } from "../core/version"
import type { FetchResult, HistorySection } from "../utils/history-types"
import { dayLabelToDate } from "../utils/day"
import { dateKeyOf } from "../core/types"
import type { Settings } from "../core/types"

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

const SCROLL_MAX_MS = 20_000
const SCROLL_STEP_MS = 400
const SCROLL_MAX_STALLS = 6

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let lastSyncStartedAt = 0
let inFlight = false
let settingsCache: Settings | null = null

/* ------------------------------------------------------------------ */
/* legacy POC overlay cleanup                                          */
/* ------------------------------------------------------------------ */

/**
 * The old POC extension rendered a bottom-right overlay
 * (#yt-history-poc-overlay). Content scripts from a previous install keep
 * running in already-open tabs after an extension reload (their chrome.*
 * APIs die with "Cannot read properties of undefined"), and can re-add
 * their overlay on SPA navigations. Remove the element and keep removing
 * it for a while if an orphaned script re-adds it. The observer watches
 * only documentElement's direct children (where that overlay was appended)
 * so the cost is negligible.
 */
function armLegacyOverlayCleanup(): void {
  const legacyId = "yt-history-poc-overlay"
  const removeIt = () => {
    try {
      document.getElementById(legacyId)?.remove()
    } catch {}
  }
  removeIt()
  try {
    const observer = new MutationObserver(() => removeIt())
    observer.observe(document.documentElement, { childList: true })
    // orphaned scripts die with their tab; 5 minutes is generous
    setTimeout(() => observer.disconnect(), 300_000)
  } catch {}
}

/* ------------------------------------------------------------------ */
/* settings (read-only mirror of yl.v2.meta)                           */
/* ------------------------------------------------------------------ */

async function readSettings(): Promise<Settings | null> {
  if (settingsCache) return settingsCache
  try {
    const bag = await chrome.storage?.local?.get("yl.v2.meta")
    const s = bag?.["yl.v2.meta"]?.settings
    if (s) {
      settingsCache = s as Settings
      return settingsCache
    }
  } catch {}
  return null
}

// guarded: in a degraded/orphaned context chrome.storage may be undefined —
// a top-level throw here would kill the whole content script
try {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return
    const meta = changes["yl.v2.meta"]
    if (meta) settingsCache = meta.newValue?.settings ?? null
  })
} catch {}

/* ------------------------------------------------------------------ */
/* page state                                                          */
/* ------------------------------------------------------------------ */

function onHistoryPage(): boolean {
  return location.pathname.startsWith("/feed/history")
}

async function announcePageState(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: "yl.pageState",
      onHistoryPage: onHistoryPage()
    })
  } catch {}
}

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
/* auto-scroll (hidden history tab only)                               */
/* ------------------------------------------------------------------ */

/** Count rendered history days + items from the DOM (defensive selectors). */
function renderedDayCounts(): { days: number; items: number } {
  const days = new Set<string>()
  let items = 0
  try {
    const sections = document.querySelectorAll("ytd-item-section-renderer")
    for (const sec of sections) {
      const header = sec.querySelector("#header")
      const label = (header?.textContent ?? "").trim().replace(/\s+/g, " ")
      if (label) {
        const d = dayLabelToDate(label, new Date())
        if (d) days.add(dateKeyOf(d))
      }
      items += sec.querySelectorAll("ytd-video-renderer, ytd-lockup-view-model, [data-content-id]")
        .length
    }
  } catch {}
  return { days: days.size, items }
}

function coveredDays(sections: HistorySection[]): number {
  const days = new Set<string>()
  for (const s of sections) {
    const d = dayLabelToDate(s.dayLabel, new Date())
    if (d) days.add(dateKeyOf(d))
  }
  return days.size
}

/**
 * Scroll the (hidden) history page until the rendered DOM covers the
 * lookback window, content stops growing, or the time budget runs out.
 * Scrolling makes YouTube's own code fetch continuations, which the MAIN
 * world fetch observer captures. Never runs in a visible tab — the user's
 * own scrolling is never fought.
 */
async function autoScrollForWindow(daysBack: number): Promise<void> {
  const start = Date.now()
  let lastItems = -1
  let stalls = 0
  while (Date.now() - start < SCROLL_MAX_MS) {
    window.scrollTo(0, document.documentElement.scrollHeight)
    await sleep(SCROLL_STEP_MS)
    const { days, items } = renderedDayCounts()
    if (days >= daysBack) break
    if (items === lastItems) {
      if (++stalls >= SCROLL_MAX_STALLS) break
    } else {
      stalls = 0
      lastItems = items
    }
  }
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
  if (since < SYNC_THROTTLE_MS && reason !== "force" && reason !== "sw-runSync") return

  inFlight = true
  lastSyncStartedAt = Date.now()
  try {
    const settings = await readSettings()
    const raw = daysBackOverride ?? settings?.fetchWindowDays ?? DEFAULT_DAYS_BACK
    const daysBack = Math.min(90, Math.max(1, Math.round(raw) || DEFAULT_DAYS_BACK))
    console.info(`[yt-ledger] sync('${reason}') starting — daysBack=${daysBack} on=${location.pathname}`)

    let result = await requestHistory(daysBack)

    // Hidden tab on the history page: auto-scroll so the page itself loads
    // the full window, then re-request (the observer now has the depth).
    if (onHistoryPage() && document.hidden && coveredDays(result.sections) < daysBack) {
      console.info(`[yt-ledger] hidden tab: auto-scrolling to cover ${daysBack} day(s)…`)
      await autoScrollForWindow(daysBack)
      result = await requestHistory(daysBack)
    }

    const sectionSummary =
      result.sections.map((s) => `${s.dayLabel}(${s.items.length})`).join(", ") || "(none)"
    console.info(
      `[yt-ledger] fetch ok=${result.ok} meta=${JSON.stringify(result.meta)} — sections: ${sectionSummary}`
    )

    if (result.ok && (result.sections.length > 0 || onHistoryPage())) {
      // authoritative result → forward for the merge
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
    } else if (result.ok) {
      // Non-history page that couldn't read history itself (Brave strips
      // auth from extension-initiated innertube calls). Ask the coordinator
      // to sync via an existing history tab or a hidden one.
      try {
        const r = await chrome.runtime.sendMessage({
          type: "yl.visitNeedHelp",
          daysBack,
          force: reason === "force",
          url: location.href
        })
        const status = r?.status ?? "no coordinator response"
        console.info(`[yt-ledger] coordinator: ${status}`)
        await renderDebugOverlay(`coordinator: ${status}`)
      } catch (e) {
        console.warn("[yt-ledger] coordinator unreachable:", e)
      }
    } else {
      console.warn(`[yt-ledger] fetch failed: ${result.meta.error ?? "unknown"}`)
      await renderDebugOverlay(`sync failed: ${result.meta.error ?? "unknown"}`)
    }

    // ack for the coordinator so the hidden tab can be closed promptly
    if (onHistoryPage() && document.hidden) {
      try {
        await chrome.runtime.sendMessage({ type: "yl.hiddenTabDone", ok: result.ok })
      } catch {}
    }
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
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return
  if (ev.data?.source === MSG_SOURCE && ev.data?.type === READY_TYPE) {
    // main world ready — nothing to do; sync is already scheduled
  }
})

setTimeout(() => {
  armLegacyOverlayCleanup()
  console.info(
    `[yt-ledger] content script v${APP_VERSION} loaded on ${location.host}${location.pathname}`
  )
  ;(window as any).__YT_LEDGER_VERSION = APP_VERSION
  injectMainWorldScript()
  void announcePageState()
  // give the injected script a moment to attach its listener before asking
  setTimeout(() => void sync("initial"), 600)
}, 200)

// YouTube is an SPA — re-sync on internal navigation, throttled.
window.addEventListener("yt-navigate-finish", () => {
  void announcePageState()
  void sync("spa-navigate")
})

// the service worker pokes existing history tabs this way (guarded — see above)
try {
  chrome.runtime?.onMessage?.addListener((msg: any, _sender, sendResponse) => {
    if (msg?.type === "yl.runSync") {
      void sync("sw-runSync", typeof msg.daysBack === "number" ? msg.daysBack : undefined)
      sendResponse({ ok: true })
    }
    return false
  })
} catch {}

// manual trigger for devtools: window.__YT_LEDGER_SYNC() or __YT_LEDGER_SYNC(30)
;(window as any).__YT_LEDGER_SYNC = (daysBack?: number) => sync("force", daysBack)

export {}
