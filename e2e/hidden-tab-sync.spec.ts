/**
 * The coordinator's hidden history tab, against live, logged-out youtube.com
 * (needs network). Firefox only: Playwright can't route a tab the extension
 * opens itself, and headless Chromium under Playwright reports every tab as
 * visible (focus emulation), so the tab never sees itself as hidden there.
 */
import { test, expect } from "./fixtures"

test("A non-history visit syncs through a hidden history tab that closes itself", async ({ ledger }) => {
  const opened: string[] = []
  ledger.context.on("page", (p) => {
    p.on("framenavigated", (f) => { if (f === p.mainFrame()) opened.push(f.url()) })
  })
  const youtube = await ledger.context.newPage()
  ledger.screenshotPage = youtube
  const hiddenTab = ledger.context.waitForEvent("page")
  await youtube.goto("https://www.youtube.com/results?search_query=ledger", { waitUntil: "domcontentloaded" })

  const hidden = await hiddenTab
  await expect.poll(() => opened.some((u) => u.startsWith("https://www.youtube.com/feed/history")), { timeout: 30_000 }).toBe(true)
  // the hidden tab's content script acks and the background closes it, well
  // inside the 45s safety timeout
  await expect.poll(() => hidden.isClosed(), { timeout: 30_000 }).toBe(true)
  const state = await ledger.evaluate(async () => {
    const bag = await chrome.storage.local.get(["yl.v2.syncState", "yl.v2.meta"])
    return { syncState: bag["yl.v2.syncState"], status: (bag["yl.v2.meta"] as { lastSyncStatus?: string }).lastSyncStatus ?? "" }
  })
  expect(state.syncState).toEqual({})
  expect(state.status).toMatch(/^ok · /)
})
