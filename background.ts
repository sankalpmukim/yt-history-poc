/**
 * YT Ledger background service worker.
 *
 * The single writer for the v2 store:
 *  - receives raw history sections from any content script ("yl.syncResult")
 *    and merges them (in-flight lock ⇒ multi-tab safe)
 *  - initializes defaults + runs the one-time v1→v2 migration (idempotent)
 *  - prunes retention on lifecycle events
 *  - keeps a redundant MAIN-world script registration (the sync script's
 *    <script src> injection is the primary path; the MAIN script guards
 *    against double-loading itself)
 *
 * The debug relay to the local capture server is kept for development but is
 * OFF unless settings.devRelay is enabled in yl.v2.meta.
 */

import mainWorldUrl from "url:./contents/history-main"
import { chromeKV } from "./core/storage"
import { ensureInitialized, applySyncResult } from "./core/ledger"
import { pruneNow } from "./core/retention"
import { KEYS } from "./core/types"

const RELAY = "http://127.0.0.1:8742"

let devRelay = false

async function refreshDevRelay(): Promise<void> {
  try {
    const bag = await chrome.storage.local.get(KEYS.meta)
    devRelay = bag?.[KEYS.meta]?.settings?.devRelay === true
  } catch {}
}

function ping(path: string, body: string) {
  if (!devRelay) return
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

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg?.type !== "yl.syncResult") return false
  ;(async () => {
    if (syncBusy) {
      sendResponse({ ok: false, status: "skipped: another sync is being merged" })
      return
    }
    syncBusy = true
    try {
      const summary = await applySyncResult(chromeKV(), {
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
    }
  })()
  return true // async sendResponse
})

/* ------------------------------------------------------------------ */
/* lifecycle                                                           */
/* ------------------------------------------------------------------ */

async function onLifecycle(event: string): Promise<void> {
  try {
    await ensureInitialized(chromeKV(), new Date())
    const pruned = await pruneNow(chromeKV(), new Date())
    await refreshDevRelay()
    ping("sw-lifecycle", `${event} pruned=${pruned.removedEvents}`)
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
  if (!devRelay) return
  for (const key of Object.keys(changes)) {
    if (key.startsWith("yl.") || key.startsWith("ytHistoryPoc")) {
      ping("storage-relay", `key=${key} -> ${JSON.stringify(changes[key].newValue).slice(0, 15500)}`)
    }
  }
})

export {}
