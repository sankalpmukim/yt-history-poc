import { test as base, expect, chromium, firefox, type BrowserContext, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { mkdtemp } from "node:fs/promises"
import { createServer } from "node:net"
import { randomUUID } from "node:crypto"
import { evaluateInTab, installTemporaryAddon } from "./firefox-rdp"

type SeedName = "qa-seed.json" | "qa-seed-live.json"
export type Engine = "chromium" | "firefox"

export type LedgerSession = {
  engine: Engine
  context: BrowserContext
  /**
   * The dashboard tab. On Firefox, Playwright can see this tab but can't
   * evaluate in it or query its DOM: WebDriver BiDi skips extension contexts.
   * Use `evaluate` for anything that needs the extension page.
   */
  page: Page
  screenshotPage?: Page
  /** chrome-extension:// or moz-extension:// origin, with a trailing slash */
  extensionOrigin: string
  /** run a function in the dashboard page (extension context, chrome.* available) */
  evaluate: <R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A) => Promise<R>
  seed: (name?: SeedName) => Promise<void>
  setBudgetMode: (mode: "off" | "gentle" | "strict") => Promise<void>
}

const FIREFOX_EXECUTABLE = "/Applications/Firefox.app/Contents/MacOS/firefox"

export function engineOf(project: { use: { browserName?: string } }): Engine {
  return project.use.browserName === "firefox" ? "firefox" : "chromium"
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolvePort(port))
    })
  })
}

/** Runs inside the extension page: replace storage with a backup fixture. */
async function seedStorage(backup: any): Promise<void> {
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
}

async function writeBudgetMode(budgetMode: string): Promise<void> {
  const bag = await chrome.storage.local.get("yl.v2.meta")
  const meta = bag["yl.v2.meta"] as { settings: Record<string, unknown> }
  await chrome.storage.local.set({ "yl.v2.meta": { ...meta, settings: { ...meta.settings, budgetMode } } })
}

/** Poll an extension-context function until it returns a truthy value. */
export async function waitForExtension(
  evaluate: LedgerSession["evaluate"],
  fn: () => unknown,
  timeout = 15_000
): Promise<void> {
  const deadline = Date.now() + timeout
  let last: unknown = null
  for (;;) {
    try {
      if (await evaluate(fn)) return
    } catch (e) {
      last = e // the page may be mid-reload
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${fn.toString()}${last ? ` (last error: ${last})` : ""}`)
    await new Promise((r) => setTimeout(r, 200))
  }
}

type Launched = Omit<LedgerSession, "seed" | "setBudgetMode" | "screenshotPage"> & {
  reloadDashboard: () => Promise<void>
}

async function launchChromium(profileDir: string, headless: boolean, colorScheme: "light" | "dark"): Promise<Launched> {
  const extensionPath = resolve("build/chrome-mv3-prod")
  if (!existsSync(join(extensionPath, "manifest.json"))) {
    throw new Error("Chrome extension build missing; run pnpm build first")
  }
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    headless,
    viewport: { width: 1440, height: 1050 },
    colorScheme,
    acceptDownloads: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      // headless still plays sound; the live specs autoplay YouTube
      "--mute-audio"
    ]
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const extensionOrigin = `chrome-extension://${new URL(worker.url()).host}/`
  const page = await context.newPage()
  await page.goto(`${extensionOrigin}tabs/dashboard.html`)
  // A fresh temporary profile shows the first-run wizard before the test
  // seeds its import fixture; wait for the React dashboard shell, not a
  // particular route.
  await page.locator("h1, h2").first().waitFor()
  return {
    engine: "chromium",
    context,
    page,
    extensionOrigin,
    evaluate: (fn, arg) => page.evaluate(fn as any, arg) as any,
    reloadDashboard: async () => {
      await page.reload()
      await page.getByRole("heading", { name: "Overview" }).waitFor()
    }
  }
}

async function launchFirefox(profileDir: string, headless: boolean, colorScheme: "light" | "dark"): Promise<Launched> {
  const extensionPath = resolve("build/firefox-mv3-prod")
  const manifestPath = join(extensionPath, "manifest.json")
  if (!existsSync(manifestPath)) {
    throw new Error("Firefox extension build missing; run pnpm build:firefox first")
  }
  const addonId = JSON.parse(readFileSync(manifestPath, "utf8")).browser_specific_settings?.gecko?.id as string
  // A known moz-extension:// UUID, so the test knows the dashboard's origin.
  const uuid = randomUUID()
  const port = await freePort()
  const context = await firefox.launchPersistentContext(profileDir, {
    channel: "moz-firefox",
    headless,
    viewport: { width: 1440, height: 1050 },
    colorScheme,
    acceptDownloads: true,
    args: ["-start-debugger-server"],
    // lets WebDriver BiDi navigate a tab to moz-extension:// (test-only)
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    firefoxUserPrefs: {
      "devtools.debugger.remote-enabled": true,
      "devtools.debugger.remote-port": port,
      "devtools.debugger.prompt-connection": false,
      "devtools.chrome.enabled": true,
      // headless still plays sound; the live specs autoplay YouTube. Scaling
      // output volume to zero mutes every tab without changing autoplay.
      "media.volume_scale": "0.0",
      "extensions.webextensions.uuids": JSON.stringify({ [addonId]: uuid }),
      // 0 = dark, 1 = light: pages (and YouTube) follow this
      "layout.css.prefers-color-scheme.content-override": colorScheme === "dark" ? 0 : 1,
      "ui.systemUsesDarkTheme": colorScheme === "dark" ? 1 : 0
    }
  })
  const installed = await installTemporaryAddon(port, extensionPath)
  if (installed !== addonId) throw new Error(`installed ${installed}, expected ${addonId}`)

  const extensionOrigin = `moz-extension://${uuid}/`
  const evaluate: LedgerSession["evaluate"] = (fn, arg) =>
    evaluateInTab(port, extensionOrigin, `(${fn.toString()})(${JSON.stringify(arg)})`)

  const page = context.pages()[0] ?? await context.newPage()
  // BiDi never reports "load" for extension pages; "commit" is the last signal.
  await page.goto(`${extensionOrigin}tabs/dashboard.html`, { waitUntil: "commit" })
  await waitForExtension(evaluate, () => document.querySelector("h1, h2") != null)
  return {
    engine: "firefox",
    context,
    page,
    extensionOrigin,
    evaluate,
    reloadDashboard: async () => {
      await evaluate(() => { setTimeout(() => location.reload(), 0); return true })
      await new Promise((r) => setTimeout(r, 300))
      await waitForExtension(evaluate, () => document.querySelector("h1")?.textContent === "Overview")
    }
  }
}

export const test = base.extend<{ ledger: LedgerSession }>({
  ledger: async ({}, use, testInfo) => {
    const engine = engineOf(testInfo.project)
    if (engine === "firefox" && !existsSync(FIREFOX_EXECUTABLE)) {
      testInfo.skip(true, `Firefox not installed at ${FIREFOX_EXECUTABLE}`)
    }
    const profileDir = await mkdtemp(join(tmpdir(), `yt-ledger-playwright-${engine}-`))
    const headless = process.env.HEADED !== "1"
    const colorScheme = (testInfo.project.use.colorScheme ?? "light") as "light" | "dark"
    const launched = engine === "firefox"
      ? await launchFirefox(profileDir, headless, colorScheme)
      : await launchChromium(profileDir, headless, colorScheme)
    const { reloadDashboard, ...session } = launched

    try {
      const seed = async (name: SeedName = "qa-seed.json") => {
        const fixture = JSON.parse(readFileSync(resolve("fixtures", name), "utf8"))
        await session.evaluate(seedStorage, fixture)
        await waitForExtension(session.evaluate, async () => {
          const state = await chrome.storage.local.get("yl.v2.budgetStatus")
          return Boolean(state["yl.v2.budgetStatus"])
        })
        await reloadDashboard()
      }
      const setBudgetMode = (mode: "off" | "gentle" | "strict") => session.evaluate(writeBudgetMode, mode)

      await use({ ...session, seed, setBudgetMode })
    } finally {
      await session.context.close()
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
  // Firefox can't capture extension pages over BiDi; only screenshot web pages there
  const target = session.screenshotPage ?? (session.engine === "chromium" ? session.page : null)
  await target?.screenshot({
    path: join(directory, `${project}.png`),
    fullPage: true,
    animations: "disabled",
    timeout: 15_000
  }).catch(() => {})
})

export { expect }
