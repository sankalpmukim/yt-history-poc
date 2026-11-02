/**
 * Custom background service worker.
 * Plasmo merges its own content-script registration into this file; we add
 * explicit lifecycle pings + our own registration attempt with error capture
 * so the POC can be debugged from a local capture server.
 */

import mainWorldUrl from "url:./contents/history-main"

const PING = "http://127.0.0.1:8742"

function ping(path: string, body: string) {
  try {
    fetch(`${PING}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body
    }).catch(() => {})
  } catch {}
}

ping("sw-started", `top-level alive @ ${new Date().toISOString()} url=${mainWorldUrl}`)

async function registerMainWorld() {
  const file = mainWorldUrl.split("/").pop().split("?")[0]
  try {
    // Remove stale registration (from previous update) if any
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ["yt-history-main"] })
    } catch {}
    await chrome.scripting.registerContentScripts([
      {
        id: "yt-history-main",
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

chrome.runtime.onInstalled.addListener(() => {
  ping("sw-oninstalled", "installed/updated")
  void registerMainWorld()
})

chrome.runtime.onStartup.addListener(() => {
  void registerMainWorld()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  // TEMP POC debug: relay CS liveness + sync results to the capture server.
  for (const key of Object.keys(changes)) {
    if (key.startsWith("yt-history-poc") || key.startsWith("ytHistoryPoc")) {
      ping("storage-relay", `key=${key} -> ${JSON.stringify(changes[key].newValue).slice(0, 15500)}`)
    }
  }
})

void (async () => {
  try {
    const regs = await chrome.scripting.getRegisteredContentScripts()
    const ids = regs.map((r) => r.id).join(",")
    ping("sw-regs", ids || "(none)")
    if (!regs.some((r) => r.id === "yt-history-main")) {
      await registerMainWorld()
    }
  } catch (e: any) {
    ping("sw-regs", `err=${e?.message ?? String(e)}`)
  }
})()

export {}
