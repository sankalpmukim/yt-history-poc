/**
 * Cross-browser extension behaviour. Runs in the Chromium "dashboard" project
 * and in the "firefox" project against the real built extension, with
 * YouTube replaced by synthetic pages (no network, no account needed):
 *  - a visible /feed/history tab syncs straight into the ledger
 *  - a non-history visit makes the coordinator re-sync an open history tab
 *    (the hidden-tab path needs live YouTube: hidden-tab-sync.spec.ts)
 *  - background messaging, permissions, MAIN-world registration, fonts
 *  - every dashboard view renders
 */
import type { BrowserContext, Route } from "@playwright/test"
import { test, expect, waitForExtension, type LedgerSession } from "./fixtures"

type FakeVideo = { id: string; title: string; channel: string; length: string }

const YTCFG = `window.ytcfg = { data_: { INNERTUBE_API_KEY: "test-key", INNERTUBE_CONTEXT: { client: { clientName: "WEB", clientVersion: "2.0" } } } };`

function htmlPage(script: string, title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><script>${script}</script></head><body><div id="content">${title}</div></body></html>`
}

/** /feed/history in the classic videoRenderer shape history-main parses */
function historyHtml(videos: FakeVideo[]): string {
  const ytInitialData = {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{
          tabRenderer: {
            content: {
              sectionListRenderer: {
                contents: [{
                  itemSectionRenderer: {
                    header: { itemSectionHeaderRenderer: { title: { simpleText: "Today" } } },
                    contents: videos.map((v) => ({
                      videoRenderer: {
                        videoId: v.id,
                        title: { runs: [{ text: v.title }] },
                        ownerText: { runs: [{ text: v.channel }] },
                        lengthText: { simpleText: v.length }
                      }
                    }))
                  }
                }]
              }
            }
          }
        }]
      }
    }
  }
  return htmlPage(`${YTCFG}\nvar ytInitialData = ${JSON.stringify(ytInitialData)};`, "History")
}

async function fakeYouTube(context: BrowserContext, history: FakeVideo[]): Promise<void> {
  const html = (body: string) => (route: Route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body })
  // the most recently added route wins, so the offline catch-all goes first:
  // anything else (watch-page duration lookups etc.) never hits the network
  await context.route(/^https:\/\/[^/]*youtube\.com\//, (route) => route.fulfill({ status: 404, body: "" }))
  await context.route(/^https:\/\/www\.youtube\.com\/feed\/history/, html(historyHtml(history)))
  await context.route(/^https:\/\/www\.youtube\.com\/results/, html(htmlPage(YTCFG, "Search")))
  // the direct innertube browse from a non-history page comes back empty,
  // as it does logged-out or in Brave, so the content script asks for help
  await context.route(/^https:\/\/www\.youtube\.com\/youtubei\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }))
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

async function readLedger(ledger: LedgerSession, videoId: string, day: string) {
  return ledger.evaluate(async ([id, watchedOn]) => {
    const key = `yl.v2.events.${watchedOn.slice(0, 7)}`
    const bag = await chrome.storage.local.get(["yl.v2.videos", key])
    const videos = (bag["yl.v2.videos"] ?? {}) as Record<string, { title: string; channel: string; durationSec: number | null }>
    const events = (bag[key] ?? {}) as Record<string, { occurrences: number }>
    return { video: videos[id] ?? null, event: events[`${id}|${watchedOn}`] ?? null }
  }, [videoId, day] as [string, string])
}

test("A visible YouTube history page syncs straight into the ledger", async ({ ledger }) => {
  const videos = [
    { id: "ylXbrowse01", title: "Cross-browser sync check", channel: "Ledger QA", length: "12:34" },
    { id: "ylXbrowse02", title: "Second history entry", channel: "Ledger QA", length: "3:05" }
  ]
  await fakeYouTube(ledger.context, videos)
  const youtube = await ledger.context.newPage()
  ledger.screenshotPage = youtube
  await youtube.goto("https://www.youtube.com/feed/history")

  // both injection paths (script tag + registered MAIN-world script) reach the page world
  await expect.poll(() => youtube.evaluate(() => Boolean((window as any).__YT_LEDGER_MAIN_LOADED__))).toBe(true)

  await expect.poll(async () => (await readLedger(ledger, videos[0].id, todayKey())).event, { timeout: 30_000 }).not.toBeNull()
  const first = await readLedger(ledger, videos[0].id, todayKey())
  expect(first.video).toMatchObject({ title: "Cross-browser sync check", channel: "Ledger QA", durationSec: 754 })
  expect(first.event).toMatchObject({ occurrences: 1 })
  expect((await readLedger(ledger, videos[1].id, todayKey())).video).toMatchObject({ durationSec: 185 })
})

test("A non-history visit asks the coordinator, which re-syncs the open history tab", async ({ ledger }) => {
  const first = { id: "ylXpoke0001", title: "Already on the history page", channel: "Ledger QA", length: "4:00" }
  const later = { id: "ylXpoke0002", title: "Watched after the page loaded", channel: "Ledger QA", length: "6:30" }
  await fakeYouTube(ledger.context, [first])
  const history = await ledger.context.newPage()
  await history.goto("https://www.youtube.com/feed/history")
  await expect.poll(async () => (await readLedger(ledger, first.id, todayKey())).video, { timeout: 30_000 }).not.toBeNull()

  // the history page "loads more" without the extension being involved
  await history.evaluate((v) => {
    const section = (window as any).ytInitialData.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer
    section.contents.unshift({ videoRenderer: { videoId: v.id, title: { runs: [{ text: v.title }] }, ownerText: { runs: [{ text: v.channel }] }, lengthText: { simpleText: v.length } } })
  }, later)

  // a search page can't read history itself → yl.visitNeedHelp → the
  // background pokes the announced history tab (tabs.sendMessage → yl.runSync)
  const search = await ledger.context.newPage()
  ledger.screenshotPage = search
  await search.goto("https://www.youtube.com/results?search_query=ledger")
  await expect.poll(async () => (await readLedger(ledger, later.id, todayKey())).video, { timeout: 30_000 }).toMatchObject({ title: later.title, durationSec: 390 })
  // the open tab was reused: no hidden tab
  expect(ledger.context.pages().filter((p) => p.url().includes("/feed/history"))).toHaveLength(1)
})

test("Background messaging, permissions, fonts and every dashboard view work", async ({ ledger }) => {
  const runtime = await ledger.evaluate(async () => {
    const registered = await chrome.scripting.getRegisteredContentScripts()
    return {
      youtubeAccess: await chrome.permissions.contains({ origins: ["*://*.youtube.com/*"] }),
      mainWorld: registered.some((s) => s.id === "yt-ledger-main" && s.world === "MAIN"),
      refresh: await chrome.runtime.sendMessage({ type: "yl.refreshBudget" }),
      initialized: Boolean((await chrome.storage.local.get("yl.v2.meta"))["yl.v2.meta"])
    }
  })
  expect(runtime).toEqual({ youtubeAccess: true, mainWorld: true, refresh: { ok: true }, initialized: true })

  // first run lands on the wizard
  await waitForExtension(ledger.evaluate, () => document.querySelector("h1")?.textContent === "YT Ledger setup")

  await ledger.seed()
  const views: Array<[string, string]> = [
    ["overview", "Overview"], ["ledger", "Ledger"], ["rules", "Rules"], ["categories", "Categories"],
    ["insights", "Insights"], ["budgets", "Budgets"], ["settings", "Settings"]
  ]
  for (const [route, heading] of views) {
    await ledger.evaluate((hash) => { location.hash = hash; return true }, `#/${route}`)
    await waitForExtension(ledger.evaluate, new Function(`return document.querySelector("h1")?.textContent === ${JSON.stringify(heading)}`) as () => boolean)
  }

  await ledger.evaluate(() => { location.hash = "#/ledger"; return true })
  await waitForExtension(ledger.evaluate, () => document.querySelectorAll("table.ledger tbody tr").length > 0)

  // bundled fonts load from the extension package in both browsers
  const fonts = await ledger.evaluate(async () => {
    await document.fonts.load('16px "Ledger Serif"')
    await document.fonts.load('16px "Ledger Sans"')
    return { serif: document.fonts.check('16px "Ledger Serif"'), sans: document.fonts.check('16px "Ledger Sans"') }
  })
  expect(fonts).toEqual({ serif: true, sans: true })
  expect(await ledger.evaluate(() => document.querySelector(".access-notice") == null)).toBe(true)
})

test("Dashboard asks for YouTube access when the user has turned it off", async ({ ledger }) => {
  // Chrome can't revoke a required host permission programmatically; Firefox
  // treats MV3 host permissions as user-revocable, which is what this covers.
  test.skip(ledger.engine !== "firefox", "host permissions are only revocable from script in Firefox")
  await ledger.seed()
  expect(await ledger.evaluate(() => chrome.permissions.remove({ origins: ["*://*.youtube.com/*"] }))).toBe(true)
  await waitForExtension(ledger.evaluate, () => document.querySelector(".access-notice")?.textContent?.includes("YouTube access is turned off") ?? false)
  expect(await ledger.evaluate(() => document.querySelector(".access-notice button")?.textContent)).toBe("Allow YouTube access")
})
