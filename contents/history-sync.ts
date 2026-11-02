/**
 * Isolated-world content script (the orchestrator).
 *
 * On every YouTube page open (and on SPA navigations, throttled):
 *   1. asks the MAIN-world fetcher for the last 2 days of watch history
 *   2. merges the result into chrome.storage.local (dedupe by videoId,
 *      keep firstSeenAt, refresh dayLabel/lastSeenAt)
 *   3. prunes anything not seen in the latest fetch AND first seen > 48h ago
 *      (so storage never holds anything older than the 2-day window)
 *   4. renders a small overlay with the count + recent entries for easy POC
 *      verification, and logs details to the console.
 */

import type { PlasmoCSConfig } from "plasmo"
import mainWorldUrl from "url:./history-main"
import type {
  FetchResult,
  StoreShape,
  StoredEntry
} from "../utils/history-types"
import { STORAGE_KEY, RETENTION_MS, emptyStore } from "../utils/history-types"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  run_at: "document_idle"
}

const MSG_SOURCE = "yt-history-poc"
const REQ_TYPE = "YT_HISTORY_POC_FETCH_REQUEST"
const RES_TYPE = "YT_HISTORY_POC_FETCH_RESPONSE"
const READY_TYPE = "YT_HISTORY_POC_MAIN_READY"

const SYNC_THROTTLE_MS = 60_000
const FETCH_TIMEOUT_MS = 30_000

let lastSyncStartedAt = 0
let inFlight = false

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

async function readStore(): Promise<StoreShape> {
  try {
    const bag = await chrome.storage.local.get(STORAGE_KEY)
    const store = bag?.[STORAGE_KEY]
    if (store && store.version === 1 && store.entries) return store as StoreShape
  } catch {}
  return emptyStore()
}

async function writeStore(store: StoreShape): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: store })
}

/* ------------------------------------------------------------------ */
/* inject the MAIN-world script (classic <script src> pattern)         */
/* ------------------------------------------------------------------ */

/**
 * The service-worker `registerContentScripts(world: "MAIN")` route proved
 * unreliable in this browser, so the isolated script injects the MAIN-world
 * fetcher itself via a script tag. The `url:` import makes Plasmo expose
 * the file through web_accessible_resources automatically.
 */
function injectMainWorldScript(): void {
  const w = window as any
  if (w.__YT_HISTORY_POC_MAIN_INJECTED__) return
  w.__YT_HISTORY_POC_MAIN_INJECTED__ = true
  try {
    const s = document.createElement("script")
    s.src = mainWorldUrl
    s.async = false
    s.onerror = () => console.error("[yt-history-poc] main-world script tag failed to load", mainWorldUrl)
    ;(document.head || document.documentElement).appendChild(s)
    console.info("[yt-history-poc] main-world script injected:", mainWorldUrl)
  } catch (e) {
    console.error("[yt-history-poc] main-world injection failed:", e)
  }
}

/* ------------------------------------------------------------------ */
/* talk to the MAIN-world fetcher                                      */
/* ------------------------------------------------------------------ */

function requestHistory(): Promise<FetchResult> {
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
    window.postMessage({ source: MSG_SOURCE, type: REQ_TYPE, id }, window.location.origin)
  })
}

/* ------------------------------------------------------------------ */
/* merge + prune                                                       */
/* ------------------------------------------------------------------ */

function mergeIntoStore(store: StoreShape, result: FetchResult): StoreShape {
  const nowIso = new Date().toISOString()
  const entries: Record<string, StoredEntry> = { ...store.entries }
  const freshIds = new Set<string>()

  if (result.ok) {
    for (const section of result.sections) {
      for (const item of section.items) {
        freshIds.add(item.videoId)
        const prev = entries[item.videoId]
        entries[item.videoId] = {
          ...item,
          dayLabel: section.dayLabel,
          firstSeenAt: prev?.firstSeenAt ?? nowIso,
          lastSeenAt: nowIso
        }
      }
    }
  }

  // Prune: drop entries that were not in the latest fetch and were first
  // seen more than RETENTION_MS ago — nothing older than the 2-day window
  // is ever retained.
  for (const id of Object.keys(entries)) {
    const e = entries[id]
    const age = Date.now() - new Date(e.firstSeenAt).getTime()
    if (!freshIds.has(id) && age > RETENTION_MS) {
      delete entries[id]
    }
  }

  const status = result.ok
    ? `ok · ${result.meta.pagesFetched} page(s) · stopped: ${result.meta.stoppedBecause} · ${Object.keys(entries).length} cached`
    : `error: ${result.meta.error ?? "unknown"}`

  return {
    version: 1,
    lastSyncedAt: nowIso,
    lastSyncStatus: status,
    entries
  }
}

/* ------------------------------------------------------------------ */
/* overlay (POC visualization)                                         */
/* ------------------------------------------------------------------ */

function ensureOverlay(): HTMLDivElement {
  let el = document.getElementById("yt-history-poc-overlay") as HTMLDivElement | null
  if (!el) {
    el = document.createElement("div")
    el.id = "yt-history-poc-overlay"
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
  return el
}

function renderOverlay(store: StoreShape, busy: boolean) {
  const el = ensureOverlay()

  // wipe
  while (el.firstChild) el.removeChild(el.firstChild)

  const details = document.createElement("details")
  details.open = true

  const summary = document.createElement("summary")
  summary.style.cursor = "pointer"
  summary.style.fontWeight = "700"
  summary.textContent = `📺 YT History POC — ${Object.keys(store.entries).length} videos (last 2 days)`
  details.appendChild(summary)

  const meta = document.createElement("div")
  meta.style.color = "#aaa"
  meta.style.margin = "4px 0 6px"
  const last = store.lastSyncedAt ? new Date(store.lastSyncedAt).toLocaleTimeString() : "—"
  meta.textContent = `${busy ? "⏳ syncing…" : "✓"} last sync ${last} · ${store.lastSyncStatus}`
  details.appendChild(meta)

  const list = document.createElement("div")
  list.style.maxHeight = "220px"
  list.style.overflowY = "auto"

  const sorted = Object.values(store.entries).sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt)
  )
  for (const e of sorted.slice(0, 10)) {
    const row = document.createElement("div")
    row.style.marginBottom = "4px"

    const day = document.createElement("span")
    day.style.color = "#fc0"
    day.style.marginRight = "6px"
    day.textContent = `[${e.dayLabel}]`
    row.appendChild(day)

    const title = document.createElement("a")
    title.href = e.url
    title.target = "_blank"
    title.rel = "noreferrer"
    title.style.color = "#3ea6ff"
    title.style.textDecoration = "none"
    title.textContent = e.title || e.videoId
    row.appendChild(title)

    if (e.channel) {
      const ch = document.createElement("span")
      ch.style.color = "#aaa"
      ch.textContent = ` — ${e.channel}`
      row.appendChild(ch)
    }
    if (e.watchState) {
      const ws = document.createElement("span")
      ws.style.color = "#2ba640"
      ws.textContent = ` (${e.watchState})`
      row.appendChild(ws)
    }
    list.appendChild(row)
  }

  if (sorted.length > 10) {
    const more = document.createElement("div")
    more.style.color = "#aaa"
    more.textContent = `…and ${sorted.length - 10} more`
    list.appendChild(more)
  }
  if (sorted.length === 0) {
    const none = document.createElement("div")
    none.style.color = "#aaa"
    none.textContent = busy ? "fetching…" : "no entries in the last 2 days"
    list.appendChild(none)
  }

  details.appendChild(list)
  el.appendChild(details)
}

/* ------------------------------------------------------------------ */
/* sync                                                                */
/* ------------------------------------------------------------------ */

async function sync(reason: string) {
  if (inFlight) return
  const since = Date.now() - lastSyncStartedAt
  if (since < SYNC_THROTTLE_MS && reason !== "force") return

  inFlight = true
  lastSyncStartedAt = Date.now()
  try {
    console.info(`[yt-history-poc] sync('${reason}') starting v3-lockupfix`)
    const before = await readStore()
    renderOverlay(before, true)
    console.info(`[yt-history-poc] sync (${reason}) — merging into ${Object.keys(before.entries).length} cached entries`)

    const result = await requestHistory()
    console.info(`[yt-history-poc] requestHistory done: ok=${result.ok} meta=${JSON.stringify(result.meta)}`)
    const merged = mergeIntoStore(before, result)
    await writeStore(merged)
    console.info(`[yt-history-poc] store written (${Object.keys(merged.entries).length} entries)`)
    renderOverlay(merged, false)

    // TEMP POC debug: meta only (raw-dump chunks removed).
    try {
      chrome.storage.local.set({
        "yt-history-poc:meta": JSON.stringify(result.meta)
      })
    } catch {}

    // TEMP POC debug: surface the outcome in the tab title.
    try {
      const tag = `|S:${result.ok ? "ok" : "err"}:${result.meta.stoppedBecause}:${Object.keys(merged.entries).length}e`
      document.title = `${document.title} ${tag}`.slice(0, 180)
    } catch {}

    console.info(
      `[yt-history-poc] fetch meta: ${JSON.stringify(result.meta)} result.ok=${result.ok}`
    )
    console.info(
      `[yt-history-poc] sections: ` +
        (result.sections.map((s) => `${s.dayLabel}(${s.items.length})`).join(", ") || "(none)")
    )
    console.info(
      `[yt-history-poc] stored ${Object.keys(merged.entries).length} entries (last 2 days)`
    )
  } catch (e: any) {
    console.error(
      `[yt-history-poc] sync failed:`,
      String(e),
      "|msg:",
      e?.message ?? "",
      "|stack:",
      String(e?.stack ?? "").slice(0, 500)
    )
    const store = await readStore()
    store.lastSyncStatus = `error: ${String(e?.message ?? e)}`
    renderOverlay(store, false)
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

// expose a manual trigger for devtools: window.__YT_HISTORY_POC_SYNC()
;(window as any).__YT_HISTORY_POC_SYNC = () => sync("force")

export {}
