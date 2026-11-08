import { test, expect } from "./fixtures"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

async function acceptYouTubeConsent(page: import("@playwright/test").Page) {
  if (!/consent\.youtube\.com/.test(page.url())) return
  const accept = page.getByRole("button", { name: /accept all|i agree/i }).first()
  if (await accept.isVisible().catch(() => false)) await accept.click()
  await page.waitForURL(/youtube\.com/, { timeout: 30_000 }).catch(() => {})
}

/**
 * On a first visit YouTube can reload itself (e.g. to apply the dark theme
 * from prefers-color-scheme), which aborts a reload started at the same time.
 */
async function reloadYouTube(page: import("@playwright/test").Page) {
  await page.waitForLoadState("load").catch(() => {})
  try {
    await page.reload({ waitUntil: "domcontentloaded" })
  } catch {
    await page.waitForLoadState("load").catch(() => {})
    await page.reload({ waitUntil: "domcontentloaded" })
  }
}

test("Live Gentle/Strict/Off overlays on Search and watch page", async ({ ledger }, testInfo) => {
  const { context, page, seed } = ledger
  await seed("qa-seed-live.json")
  const youtube = await context.newPage()
  ledger.screenshotPage = youtube
  const screenshotDir = "qa/e2e/overlays"
  mkdirSync(screenshotDir, { recursive: true })
  const theme = String(testInfo.project.use.colorScheme ?? "light")
  const prefix = ledger.engine === "firefox" ? "firefox-" : ""
  const capture = (name: string) => youtube.screenshot({ path: join(screenshotDir, `${prefix}${name}-${theme}.png`) })
  await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)

  await ledger.setBudgetMode("gentle")
  await reloadYouTube(youtube)
  const gentleCard = youtube.locator("[data-yl-budget]").first()
  await expect(gentleCard).toHaveAttribute("data-yl-budget", /gentle/ , { timeout: 60_000 })
  await expect(gentleCard).toHaveClass(/yl-budget-guard-gentle/)
  await expect(gentleCard.locator(".yl-budget-guard-chip")).toContainText("over budget")
  await expect.poll(() => gentleCard.locator(".yl-budget-guard-chip").evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
  await capture("01-gentle-search")
  const videoHref = await gentleCard.locator("a[href*='/watch?v=']").first().getAttribute("href")
  expect(videoHref).toBeTruthy()

  await youtube.goto(new URL(videoHref!, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)
  const gentleBanner = youtube.locator("#yl-budget-watch-ui")
  await expect(gentleBanner).toContainText(/\d+ min over budget/ , { timeout: 60_000 })
  await expect(gentleBanner).toContainText("this week")
  await capture("02-gentle-watch")
  await gentleBanner.getByRole("button", { name: "Dismiss" }).click()
  await expect(gentleBanner).toHaveCount(0)

  await ledger.setBudgetMode("strict")
  await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)
  const strictCard = youtube.locator("[data-yl-budget]").first()
  await expect(strictCard).toHaveAttribute("data-yl-budget", /strict/, { timeout: 60_000 })
  const revealedCard = await strictCard.elementHandle()
  const veil = strictCard.locator(".yl-budget-guard-veil")
  await expect(veil.locator(".yl-budget-guard-veil-copy > span").first()).toContainText("Hidden because")
  await expect(veil.locator(".yl-budget-guard-veil-action")).toHaveText("Click to reveal")
  await expect.poll(() => veil.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(13)
  await capture("03-strict-search")
  await veil.click()
  await expect.poll(() => revealedCard!.getAttribute("data-yl-budget")).toBeNull()

  await youtube.goto(new URL(videoHref!, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)
  const strictInterstitial = youtube.locator("#yl-budget-watch-ui")
  await expect(strictInterstitial).toContainText("Over budget", { timeout: 60_000 })
  await expect(strictInterstitial).toContainText(/\d+ min over budget/)
  await capture("04-strict-watch")
  // the gate holds the player: nothing plays (or is heard) behind it, even
  // after YouTube's autoplay kicks in
  const allPaused = () => youtube.evaluate(() => Array.from(document.querySelectorAll<HTMLVideoElement>("#movie_player video")).every((v) => v.paused))
  await expect.poll(allPaused).toBe(true)
  await youtube.waitForTimeout(2_000)
  expect(await allPaused()).toBe(true)
  await strictInterstitial.getByRole("button", { name: "Watch anyway" }).click()
  await expect(strictInterstitial).toHaveCount(0)

  await ledger.setBudgetMode("off")
  await reloadYouTube(youtube)
  await expect(youtube.locator(".yl-budget-guard")).toHaveCount(0, { timeout: 60_000 })
  await expect(youtube.locator("[data-yl-budget]")).toHaveCount(0)
  await capture("05-off")
  await page.bringToFront().catch(() => {})
})
