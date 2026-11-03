import { test, expect } from "./fixtures"
import { mkdirSync } from "node:fs"
import { join } from "node:path"

async function acceptYouTubeConsent(page: import("@playwright/test").Page) {
  if (!/consent\.youtube\.com/.test(page.url())) return
  const accept = page.getByRole("button", { name: /accept all|i agree/i }).first()
  if (await accept.isVisible().catch(() => false)) await accept.click()
  await page.waitForURL(/youtube\.com/, { timeout: 30_000 }).catch(() => {})
}

async function setMode(ledger: import("./fixtures").LedgerSession, mode: "off" | "gentle" | "strict") {
  await ledger.page.evaluate(async (budgetMode) => {
    const bag = await chrome.storage.local.get("yl.v2.meta")
    const meta = bag["yl.v2.meta"] as { settings: Record<string, unknown> }
    await chrome.storage.local.set({ "yl.v2.meta": { ...meta, settings: { ...meta.settings, budgetMode } } })
  }, mode)
}

test("Live Gentle/Strict/Off overlays on Search and watch page", async ({ ledger }, testInfo) => {
  const { context, page, seed } = ledger
  await seed("qa-seed-live.json")
  const youtube = await context.newPage()
  ledger.screenshotPage = youtube
  const screenshotDir = "qa/e2e/overlays"
  mkdirSync(screenshotDir, { recursive: true })
  const theme = String(testInfo.project.use.colorScheme ?? "light")
  const capture = (name: string) => youtube.screenshot({ path: join(screenshotDir, `${name}-${theme}.png`) })
  await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)

  await setMode(ledger, "gentle")
  await youtube.reload({ waitUntil: "domcontentloaded" })
  const gentleCard = youtube.locator("[data-yl-budget]").first()
  await expect(gentleCard).toHaveAttribute("data-yl-budget", /gentle/ , { timeout: 60_000 })
  await expect(gentleCard).toHaveClass(/yl-budget-guard-gentle/)
  await expect(gentleCard.locator(".yl-budget-guard-chip")).toContainText("over budget")
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

  await setMode(ledger, "strict")
  await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)
  const strictCard = youtube.locator("[data-yl-budget]").first()
  await expect(strictCard).toHaveAttribute("data-yl-budget", /strict/, { timeout: 60_000 })
  const revealedCard = await strictCard.elementHandle()
  const veil = strictCard.locator(".yl-budget-guard-veil")
  await expect(veil).toContainText("hidden —")
  await capture("03-strict-search")
  await veil.click()
  await expect.poll(() => revealedCard!.getAttribute("data-yl-budget")).toBeNull()

  await youtube.goto(new URL(videoHref!, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" })
  await acceptYouTubeConsent(youtube)
  const strictInterstitial = youtube.locator("#yl-budget-watch-ui")
  await expect(strictInterstitial).toContainText("Over budget", { timeout: 60_000 })
  await expect(strictInterstitial).toContainText(/\d+ min over budget/)
  await capture("04-strict-watch")
  await strictInterstitial.getByRole("button", { name: "Watch anyway" }).click()
  await expect(strictInterstitial).toHaveCount(0)

  await setMode(ledger, "off")
  await youtube.reload({ waitUntil: "domcontentloaded" })
  await expect(youtube.locator(".yl-budget-guard")).toHaveCount(0, { timeout: 60_000 })
  await expect(youtube.locator("[data-yl-budget]")).toHaveCount(0)
  await capture("05-off")
  await page.bringToFront()
})
