/**
 * YT Ledger background service worker.
 *
 * The single writer for the v2 store, plus (M2) the sync coordinator:
 *  - content scripts forward raw history sections ("yl.syncResult") → merge
 *  - a YouTube visit on a page that can't read history itself
 *    ("yl.visitNeedHelp") → coordinate a sync by either poking an existing
 *    /feed/history tab or opening one hidden tab (active:false) whose content
 *    script auto-scrolls to load the lookback window, syncs, acks, and is
 *    closed — one at a time, throttled (manual force bypasses the throttle)
 *  - the duration resolver backfills missing durations from public watch
 *    pages (throttled queue, ≤3 attempts per video)
 *  - lifecycle: defaults init, one-time v1→v2 migration, retention prune,
 *    leftover hidden-tab cleanup
 *
 * Dev relay to the local capture server is OFF unless settings.devRelay.
 */

import mainWorldUrl from "url:./contents/history-main"
import { APP_VERSION } from "./core/version"
import { chromeKV, readVideos, readDurationQueue, readCategories, readSubcategories, readEventShards } from "./core/storage"
import type { KV } from "./core/storage"
import { ensureInitialized, applySyncResult, noteStatus, runRulesPass } from "./core/ledger"
import { pruneNow } from "./core/retention"
import { resolveDurations } from "./core/resolve"
import { computeBudgetStatus } from "./core/budget"
import { KEYS, isEventsKey } from "./core/types"
import type { MetaState } from "./core/types"

const kv: KV = chromeKV()

// Dev-only: compiled out of production builds (no localhost host permission ships).
const DEV_BUILD = process.env.NODE_ENV !== "production"
const RELAY = DEV_BUILD ? "http://127.0.0.1:8742" : ""
const HISTORY_URL = "https://www.youtube.com/feed/history"
const COORDINATOR_MIN_INTERVAL_MS = 120_000
const HIDDEN_TAB_TIMEOUT_MS = 45_000
const RESOLVER_MAX_FETCHES = 15
const RESOLVER_DELAY_MS = 600
const QUEUE_CAP = 500

let devRelay = false

async function refreshDevRelay(): Promise<void> {
  try {
    const bag = await chrome.storage.local.get(KEYS.meta)
    devRelay = DEV_BUILD && bag?.[KEYS.meta]?.settings?.devRelay === true
  } catch {}
}

function ping(path: string, body: string) {
  if (!DEV_BUILD || !devRelay) return
  try {
    fetch(`${RELAY}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body
    }).catch(() => {})
  } catch {}
}

/* ------------------------------------------------------------------ */
/* sync merge (single writer)                                          */
/* ------------------------------------------------------------------ */

let syncBusy = false

/* ------------------------------------------------------------------ */
/* sync coordinator (M2)                                               */
/* ------------------------------------------------------------------ */

/** tabs whose content script announced they're on /feed/history */
const historyTabs = new Set<number>()
let hiddenTabId: number | null = null
let hiddenTabTimer: ReturnType<typeof setTimeout> | null = null
let lastCoordinatorRunAt = 0

function clampDaysBack(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(90, Math.max(1, Math.round(n)))
}

async function defaultFetchWindowDays(): Promise<number> {
  try {
    const bag = await chrome.storage.local.get(KEYS.meta)
    const d = bag?.[KEYS.meta]?.settings?.fetchWindowDays
    if (typeof d === "number" && d >= 1) return Math.min(90, Math.round(d))
  } catch {}
  return 14
}

async function coordinateSync(daysBack: number, force: boolean): Promise<string> {
  if (hiddenTabId != null) return "a coordinator sync is already running"
  if (!force && Date.now() - lastCoordinatorRunAt < COORDINATOR_MIN_INTERVAL_MS) {
    return "throttled (recent coordinator sync)"
  }
  lastCoordinatorRunAt = Date.now()

  // 1. poke an existing /feed/history tab (most recently announced first)
  for (const tabId of [...historyTabs].reverse()) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "yl.runSync", daysBack })
      return `asked history tab ${tabId} to re-sync (${daysBack}d)`
    } catch {
      historyTabs.delete(tabId) // stale announcement
    }
  }

  // 2. open one hidden history tab; its content script auto-scrolls, syncs,
  //    sends "yl.hiddenTabDone" and we close it (timeout as safety net)
  try {
    const tab = await chrome.tabs.create({ url: HISTORY_URL, active: false })
    if (tab.id == null) return "failed to create hidden tab"
    hiddenTabId = tab.id
    await kv.set({ [KEYS.syncState]: { hiddenTabId } })
    await noteStatus(kv, `syncing via hidden tab (lookback ${daysBack}d)`)
    hiddenTabTimer = setTimeout(() => {
      void noteStatus(kv, "hidden tab timed out; closed")
      closeHiddenTab("timeout")
    }, HIDDEN_TAB_TIMEOUT_MS)
    return `hidden tab ${hiddenTabId} opened (${daysBack}d lookback)`
  } catch (e: any) {
    return `failed to open hidden tab: ${e?.message ?? String(e)}`
  }
}

function closeHiddenTab(reason: string): void {
  if (hiddenTabTimer != null) {
    clearTimeout(hiddenTabTimer)
    hiddenTabTimer = null
  }
  const id = hiddenTabId
  hiddenTabId = null
  void kv.set({ [KEYS.syncState]: {} })
  if (id != null) {
    try {
      chrome.tabs.remove(id).catch(() => {})
    } catch {}
  }
  ping("hidden-tab", `closed reason=${reason}`)
}

/** Close a hidden tab left over from a previous service-worker lifetime. */
async function cleanupSyncState(): Promise<void> {
  try {
    const st = (await kv.get(KEYS.syncState)) as { hiddenTabId?: number } | undefined
    await kv.set({ [KEYS.syncState]: {} })
    const id = st?.hiddenTabId
    if (typeof id !== "number") return
    const t = await chrome.tabs.get(id)
    if (t && !t.active) await chrome.tabs.remove(id) // keep it if the user adopted it
  } catch {}
}

chrome.tabs.onRemoved.addListener((tabId) => {
  historyTabs.delete(tabId)
  if (tabId === hiddenTabId) closeHiddenTab("removed")
})

/* ------------------------------------------------------------------ */
/* toolbar click → dashboard tab                                       */
/* ------------------------------------------------------------------ */

async function openDashboard(): Promise<void> {
  const url = chrome.runtime.getURL("tabs/dashboard.html")
  try {
    const tabs = await chrome.tabs.query({ url })
    if (tabs.length > 0 && tabs[0].id != null) {
      await chrome.tabs.update(tabs[0].id, { active: true })
      if (tabs[0].windowId != null) {
        try {
          await chrome.windows.update(tabs[0].windowId, { focused: true })
        } catch {}
      }
      return
    }
  } catch {}
  try {
    await chrome.tabs.create({ url })
  } catch (e) {
    console.error("[yt-ledger] failed to open dashboard:", e)
  }
}

chrome.action.onClicked.addListener(() => void openDashboard())

/* ------------------------------------------------------------------ */
/* duration resolver glue (M2)                                         */
/* ------------------------------------------------------------------ */

let resolverBusy = false

async function fetchWatchPage(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      credentials: "include"
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function runDurationResolver(): Promise<void> {
  if (resolverBusy) return
  resolverBusy = true
  try {
    const videos = await readVideos(kv)
    const queue = await readDurationQueue(kv)
    if (queue.length === 0) return
    const attempts = ((await kv.get(KEYS.durationAttempts)) as Record<string, number>) ?? {}

    const out = await resolveDurations({
      videos,
      queue,
      attempts,
      fetchPage: fetchWatchPage,
      now: new Date(),
      maxFetches: RESOLVER_MAX_FETCHES,
      delayMs: RESOLVER_DELAY_MS
    })

    const writes: Record<string, unknown> = {
      [KEYS.durationQueue]: out.remainingQueue.slice(0, QUEUE_CAP),
      [KEYS.durationAttempts]: out.attempts
    }
    if (out.resolvedCount > 0) writes[KEYS.videos] = out.videos
    await kv.set(writes)
    // durations/isShort facts arrived → retry rule assignment for videos
    // that were previously unmatchable for lack of evidence
    if (out.resolvedCount > 0) await runRulesPass(kv, new Date())
    ping(
      "duration-resolver",
      `resolved=${out.resolvedCount} failed=${out.failedCount} remaining=${out.remainingQueue.length}`
    )
    if (out.resolvedCount > 0 || out.failedCount > 0) {
      console.info(
        `[yt-ledger] duration resolver: +${out.resolvedCount} resolved, ${out.failedCount} failed, ${out.remainingQueue.length} queued`
      )
    }
  } catch (e) {
    console.error("[yt-ledger] duration resolver failed:", e)
  } finally {
    resolverBusy = false
  }
}

/* ------------------------------------------------------------------ */
/* budget status snapshot (M7)                                         */
/* ------------------------------------------------------------------ */

let budgetTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Materialize yl.v2.budgetStatus so the on-YouTube guard (M8) reads one
 * small key instead of aggregating events. Recomputed (debounced) whenever
 * any of the underlying keys change — but never triggered by its own
 * writes, and skipped entirely when nothing actually changed.
 */
async function refreshBudgetStatus(): Promise<void> {
  try {
    const meta = (await kv.get(KEYS.meta)) as MetaState | null
    const budgets = meta?.settings?.budgetsWeekly ?? {}
    const [videos, shards, categories, subcategories] = await Promise.all([
      readVideos(kv),
      readEventShards(kv),
      readCategories(kv),
      readSubcategories(kv)
    ])
    const events = Object.values(shards).flatMap((shard) => Object.values(shard))
    const status = computeBudgetStatus({
      videos,
      events,
      categories,
      subcategories,
      budgetsWeekly: budgets,
      now: new Date()
    })
    const next = JSON.stringify(status)
    const prev = await kv.get(KEYS.budgetStatus)
    if (JSON.stringify(prev ?? null) !== next) {
      await kv.set({ [KEYS.budgetStatus]: status })
    }
  } catch (e) {
    console.error("[yt-ledger] budget status refresh failed:", e)
  }
}

function scheduleBudgetRefresh(): void {
  if (budgetTimer != null) clearTimeout(budgetTimer)
  budgetTimer = setTimeout(() => void refreshBudgetStatus(), 1500)
}

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg: any, sender, sendResponse) => {
  const tabId = sender?.tab?.id ?? null

  if (msg?.type === "yl.pageState") {
    if (tabId != null) {
      if (msg.onHistoryPage) historyTabs.add(tabId)
      else historyTabs.delete(tabId)
    }
    sendResponse({ ok: true })
    return false
  }

  if (msg?.type === "yl.visitNeedHelp") {
    ;(async () => {
      const fallback = await defaultFetchWindowDays()
      const daysBack = clampDaysBack(msg.daysBack, fallback)
      const status = await coordinateSync(daysBack, msg.force === true)
      sendResponse({ ok: true, status })
    })()
    return true
  }

  if (msg?.type === "yl.hiddenTabDone") {
    if (tabId != null && tabId === hiddenTabId) closeHiddenTab("done")
    sendResponse({ ok: true })
    return false
  }

  if (msg?.type === "yl.refreshBudget") {
    void refreshBudgetStatus()
    sendResponse({ ok: true })
    return false
  }

  if (msg?.type === "yl.manualSync") {
    ;(async () => {
      const fallback = await defaultFetchWindowDays()
      const daysBack = clampDaysBack(msg.daysBack, fallback)
      const status = await coordinateSync(daysBack, true) // manual = force
      sendResponse({ ok: true, status: `manual sync (${daysBack}d): ${status}` })
    })()
    return true
  }

  if (msg?.type === "yl.syncResult") {
    ;(async () => {
      if (syncBusy) {
        sendResponse({ ok: false, status: "skipped: another sync is being merged" })
        return
      }
      syncBusy = true
      try {
        const summary = await applySyncResult(kv, {
          sections: Array.isArray(msg.sections) ? msg.sections : [],
          now: new Date()
        })
        ping("sync-merged", summary.status)
        sendResponse(summary)
      } catch (e: any) {
        console.error("[yt-ledger] merge failed:", e)
        sendResponse({ ok: false, status: `merge error: ${e?.message ?? String(e)}` })
      } finally {
        syncBusy = false
        // durations for newly-seen videos (bounded, best-effort)
        void runDurationResolver()
      }
    })()
    return true // async sendResponse
  }

  return false
})

/* ------------------------------------------------------------------ */
/* lifecycle                                                           */
/* ------------------------------------------------------------------ */

async function onLifecycle(event: string): Promise<void> {
  try {
    console.info(`[yt-ledger] service worker v${APP_VERSION} lifecycle: ${event}`)
    await ensureInitialized(kv, new Date())
    await cleanupSyncState()
    const pruned = await pruneNow(kv, new Date())
    await refreshDevRelay()
    ping("sw-lifecycle", `${event} pruned=${pruned.removedEvents}`)
    void runDurationResolver()
    void refreshBudgetStatus()
  } catch (e) {
    console.error("[yt-ledger] lifecycle init failed:", e)
  }
}

chrome.runtime.onInstalled.addListener(() => void onLifecycle("installed"))
chrome.runtime.onStartup.addListener(() => void onLifecycle("startup"))
void onLifecycle("cold-start")

/* ------------------------------------------------------------------ */
/* redundant MAIN-world registration (backup injection path)           */
/* ------------------------------------------------------------------ */

async function registerMainWorld() {
  const file = mainWorldUrl.split("/").pop().split("?")[0]
  try {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ["yt-ledger-main"] })
    } catch {}
    await chrome.scripting.registerContentScripts([
      {
        id: "yt-ledger-main",
        js: [file],
        matches: ["*://*.youtube.com/*"],
        world: "MAIN" as chrome.scripting.RegisteredContentScript["world"],
        runAt: "document_idle"
      }
    ])
    ping("sw-register", `OK file=${file}`)
  } catch (e: any) {
    ping("sw-register", `FAIL file=${file} err=${e?.message ?? String(e)}`)
  }
}

void (async () => {
  try {
    const regs = await chrome.scripting.getRegisteredContentScripts()
    if (!regs.some((r) => r.id === "yt-ledger-main")) {
      await registerMainWorld()
    }
  } catch (e: any) {
    ping("sw-regs", `err=${e?.message ?? String(e)}`)
  }
})()

/* ------------------------------------------------------------------ */
/* storage change relay (dev only)                                     */
/* ------------------------------------------------------------------ */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (changes[KEYS.meta]) void refreshDevRelay()
  if (!devRelay) {
    // budget status still needs refreshing even when the relay is off
    for (const key of Object.keys(changes)) {
      if (key === KEYS.meta || key === KEYS.videos || key === KEYS.rules || key === KEYS.categories || key === KEYS.subcategories || isEventsKey(key)) {
        scheduleBudgetRefresh()
        break
      }
    }
    return
  }
  for (const key of Object.keys(changes)) {
    if (key === KEYS.meta || key === KEYS.videos || key === KEYS.rules || key === KEYS.categories || isEventsKey(key)) {
      scheduleBudgetRefresh()
    }
    if (key.startsWith("yl.") || key.startsWith("ytHistoryPoc")) {
      ping("storage-relay", `key=${key} -> ${JSON.stringify(changes[key].newValue).slice(0, 15500)}`)
    }
  }
})

export {}
