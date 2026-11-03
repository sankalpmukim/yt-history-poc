import { test as base, expect, chromium, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"

type SeedName = "qa-seed.json" | "qa-seed-live.json"

export type LedgerSession = {
  context: BrowserContext
  page: Page
  screenshotPage?: Page
  extensionId: string
  seed: (name?: SeedName) => Promise<void>
  setBudgetMode: (mode: "off" | "gentle" | "strict") => Promise<void>
}

const extensionPath = resolve("build/chrome-mv3-prod")

export const test = base.extend<{ ledger: LedgerSession }>({
  ledger: async ({}, use, testInfo) => {
    if (!existsSync(join(extensionPath, "manifest.json"))) {
      throw new Error("Extension build missing; run pnpm build first")
    }
    const profileDir = await mkdtemp(join(tmpdir(), "yt-ledger-playwright-profile-"))
    const context = await chromium.launchPersistentContext(profileDir, {
      channel: "chromium",
      headless: process.env.HEADED !== "1",
      viewport: { width: 1440, height: 1050 },
      colorScheme: testInfo.project.use.colorScheme ?? "light",
      acceptDownloads: true,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--no-default-browser-check"
      ]
    })

    try {
      const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
      const extensionId = new URL(worker.url()).host
      const page = await context.newPage()
      await page.goto(`chrome-extension://${extensionId}/tabs/dashboard.html`)
      // A fresh temporary profile shows the first-run wizard before the test
      // seeds its import fixture; wait for the React dashboard shell, not a
      // particular route.
      await page.locator("h1, h2").first().waitFor()

      const seed = async (name: SeedName = "qa-seed.json") => {
        const fixture = JSON.parse(readFileSync(resolve("fixtures", name), "utf8"))
        await page.evaluate(async (backup) => {
          const d = backup.data
          const shards: Record<string, Record<string, unknown>> = {}
          for (const event of Object.values(d.events) as Array<{ watchedOn: string; key: string }>) {
            const month = event.watchedOn.slice(0, 7)
            shards[month] ??= {}
            shards[month][event.key] = event
          }
          await chrome.storage.local.clear()
          const values: Record<string, unknown> = {
            "yl.v2.meta": d.meta,
            "yl.v2.categories": d.categories,
            "yl.v2.subcategories": d.subcategories ?? [],
            "yl.v2.rules": d.rules,
            "yl.v2.videos": d.videos,
            "yl.v2.durationQueue": [],
            "yl.v2.durationAttempts": {},
            "yl.v2.syncState": {}
          }
          for (const [month, events] of Object.entries(shards)) values[`yl.v2.events.${month}`] = events
          await chrome.storage.local.set(values)
          await chrome.runtime.sendMessage({ type: "yl.refreshBudget" })
        }, fixture)
        await page.waitForFunction(async () => {
          const state = await chrome.storage.local.get("yl.v2.budgetStatus")
          return Boolean(state["yl.v2.budgetStatus"])
        })
        await page.reload()
        await page.getByRole("heading", { name: "Overview" }).waitFor()
      }

      const setBudgetMode = async (mode: "off" | "gentle" | "strict") => {
        await page.evaluate(async (budgetMode) => {
          const bag = await chrome.storage.local.get("yl.v2.meta")
          const meta = bag["yl.v2.meta"] as { settings: Record<string, unknown> }
          await chrome.storage.local.set({
            "yl.v2.meta": { ...meta, settings: { ...meta.settings, budgetMode } }
          })
        }, mode)
      }

      await use({ context, page, extensionId, seed, setBudgetMode })
    } finally {
      await context.close()
      rmSync(profileDir, { recursive: true, force: true })
    }
  }
})

test.afterEach(async ({ ledger }, testInfo) => {
  const session = ledger as LedgerSession | undefined
  if (!session) return
  const spec = basename(testInfo.file).replace(/\.spec\.ts$/, "")
  const directory = resolve("qa/e2e", spec)
  mkdirSync(directory, { recursive: true })
  const project = testInfo.project.name.replace(/[^a-z0-9-]/gi, "-")
  await (session.screenshotPage ?? session.page).screenshot({
    path: join(directory, `${project}.png`),
    fullPage: true,
    animations: "disabled"
  }).catch(() => {})
})

export { expect }
