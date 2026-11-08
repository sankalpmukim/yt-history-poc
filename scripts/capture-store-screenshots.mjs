#!/usr/bin/env node

/**
 * Store-listing screenshots: dashboard pages and live YouTube overlays,
 * all at exactly 1280x800 (the Chrome Web Store requirement; AMO's
 * recommendation). Dashboard pages reuse the mock-chrome harness from
 * capture-dashboard-screenshots.mjs; overlay shots load the real
 * production build into Playwright Chromium against live, logged-out
 * youtube.com and seed fixtures/qa-seed-live.json.
 *
 * Usage:
 *   node scripts/capture-store-screenshots.mjs dashboard
 *   node scripts/capture-store-screenshots.mjs youtube [gentle|strict]
 */
import { createServer } from "node:http"
import { createReadStream, existsSync, readFileSync, mkdirSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { chromium } from "@playwright/test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"

const what = process.argv[2] ?? "all"
const outDir = resolve("store-assets/screenshots")
mkdirSync(outDir, { recursive: true })
const WIDTH = 1280
const HEIGHT = 800

/* ------------------------------------------------------------------ */
/* dashboard pages, served with a mocked chrome.storage                */
/* ------------------------------------------------------------------ */

async function captureDashboard() {
  const buildDir = resolve("build/chrome-mv3-prod")
  const fixture = JSON.parse(readFileSync(resolve("fixtures/qa-seed.json"), "utf8"))
  const chromeBin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if (!existsSync(join(buildDir, "tabs/dashboard.html"))) throw new Error("Run pnpm build first")
  if (!existsSync(chromeBin)) throw new Error(`Chrome executable not found: ${chromeBin}`)

  const routes = [
    ["store-01-overview", "#/overview"],
    ["store-03-ledger", "#/ledger"],
    ["store-05-budgets", "#/budgets"],
    ["store-06-categories", "#/categories"]
  ]

  const events = Object.values(fixture.data.events)
  const shards = {}
  for (const event of events) {
    const month = event.watchedOn.slice(0, 7)
    ;(shards[`yl.v2.events.${month}`] ??= {})[event.key] = event
  }
  const data = {
    "yl.v2.meta": fixture.data.meta,
    "yl.v2.categories": fixture.data.categories,
    "yl.v2.subcategories": fixture.data.subcategories ?? [],
    "yl.v2.rules": fixture.data.rules,
    "yl.v2.videos": fixture.data.videos,
    ...shards
  }

  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2"
  }
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname
    if (pathname === "/__mock-chrome.js") {
      const script = `
        (() => {
          document.documentElement.dataset.theme = "light";
          const data = ${JSON.stringify(data)};
          const listeners = new Set();
          const local = {
            async get(keys) {
              if (keys == null) return structuredClone(data);
              const wanted = Array.isArray(keys) ? keys : [keys];
              return Object.fromEntries(wanted.filter(k => k in data).map(k => [k, [k, structuredClone(data[k])]][1] !== undefined ? [k, structuredClone(data[k])] : [k, undefined]).filter(([k]) => k in data));
            },
            async set(entries) {
              for (const [key, value] of Object.entries(entries)) data[key] = structuredClone(value);
              for (const listener of listeners) listener(Object.fromEntries(Object.keys(entries).map(k => [k, { newValue: data[k] }])), "local");
            },
            async remove(keys) { for (const key of (Array.isArray(keys) ? keys : [keys])) delete data[key]; }
          };
          window.chrome = {
            storage: { local, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } },
            runtime: {
              sendMessage: async () => ({ status: "Mock sync complete" }),
              getURL: path => location.origin + "/" + path.replace(/^\\//, "")
            }
          };
        })();
      `
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" })
      res.end(script)
      return
    }
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.(?:[/\\]|$))+/g, "")
    const file = resolve(buildDir, relative)
    if (!file.startsWith(buildDir) || !existsSync(file)) {
      res.writeHead(404).end("Not found")
      return
    }
    if (pathname === "/tabs/dashboard.html") {
      const html = readFileSync(file, "utf8").replace(
        "<script src=",
        '<script src="/__mock-chrome.js"></script><script src='
      )
      res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" })
      res.end(html)
      return
    }
    res.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" })
    createReadStream(file).pipe(res)
  })

  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const { port } = server.address()
  try {
    for (const [name, hash] of routes) {
      const output = join(outDir, `${name}.png`)
      const args = [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--disable-background-networking",
        "--hide-scrollbars",
        "--force-light-mode",
        "--blink-settings=preferredColorScheme=light",
        `--window-size=${WIDTH},${HEIGHT}`,
        "--virtual-time-budget=2500",
        `--screenshot=${output}`,
        `http://127.0.0.1:${port}/tabs/dashboard.html${hash}`
      ]
      const child = spawn(chromeBin, args, { stdio: "ignore" })
      const [code] = await once(child, "exit")
      if (!existsSync(output)) throw new Error(`Chrome screenshot failed for ${name} (exit ${code})`)
      console.log(output)
    }
  } finally {
    server.close()
  }
}

/* ------------------------------------------------------------------ */
/* live YouTube overlays with the real extension                       */
/* ------------------------------------------------------------------ */

async function seedStorage(backup) {
  const d = backup.data
  const shards = {}
  for (const event of Object.values(d.events)) {
    const month = event.watchedOn.slice(0, 7)
    shards[month] ??= {}
    shards[month][event.key] = event
  }
  await chrome.storage.local.clear()
  const values = {
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

async function writeBudgetMode(budgetMode) {
  const bag = await chrome.storage.local.get("yl.v2.meta")
  const meta = bag["yl.v2.meta"]
  await chrome.storage.local.set({ "yl.v2.meta": { ...meta, settings: { ...meta.settings, budgetMode } } })
}

async function captureYoutube() {
  const extensionPath = resolve("build/chrome-mv3-prod")
  if (!existsSync(join(extensionPath, "manifest.json"))) throw new Error("Run pnpm build first")
  const fixture = JSON.parse(readFileSync(resolve("fixtures/qa-seed-live.json"), "utf8"))
  const profileDir = await mkdtemp(join(tmpdir(), "yl-store-"))
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "chromium",
    headless: true,
    viewport: { width: WIDTH, height: HEIGHT },
    colorScheme: "light",
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--mute-audio"
    ]
  })
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    const origin = `chrome-extension://${new URL(worker.url()).host}/`
    const dash = await context.newPage()
    await dash.goto(`${origin}tabs/dashboard.html`)
    await dash.locator("h1, h2").first().waitFor()
    await dash.evaluate(seedStorage, fixture)

    const youtube = await context.newPage()
    const acceptConsent = async () => {
      if (!/consent\.youtube\.com/.test(youtube.url())) return
      const accept = youtube.getByRole("button", { name: /accept all|i agree/i }).first()
      if (await accept.isVisible().catch(() => false)) await accept.click()
      await youtube.waitForURL(/youtube\.com/, { timeout: 30_000 }).catch(() => {})
    }

    // gentle: chips + watch-page banner
    await dash.evaluate(writeBudgetMode, "gentle")
    await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
    await acceptConsent()
    const gentleCard = youtube.locator("[data-yl-budget]").first()
    await gentleCard.waitFor({ timeout: 60_000 })
    await youtube.screenshot({ path: join(outDir, "store-02-gentle-search.png") })
    console.log(join(outDir, "store-02-gentle-search.png"))

    const videoHref = await gentleCard.locator("a[href*='/watch?v=']").first().getAttribute("href")
    if (videoHref) {
      await youtube.goto(new URL(videoHref, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" })
      await acceptConsent()
      const banner = youtube.locator("#yl-budget-watch-ui")
      await banner.waitFor({ timeout: 60_000 })
      await youtube.screenshot({ path: join(outDir, "store-04-gentle-watch.png") })
      console.log(join(outDir, "store-04-gentle-watch.png"))
    }

    // strict: veils
    await dash.evaluate(writeBudgetMode, "strict")
    await youtube.goto("https://www.youtube.com/results?search_query=news", { waitUntil: "domcontentloaded" })
    await acceptConsent()
    const strictCard = youtube.locator("[data-yl-budget]").first()
    await strictCard.waitFor({ timeout: 60_000 })
    await youtube.locator(".yl-budget-guard-veil").first().waitFor({ timeout: 30_000 })
    await youtube.screenshot({ path: join(outDir, "store-07-strict-search.png") })
    console.log(join(outDir, "store-07-strict-search.png"))
  } finally {
    await context.close()
  }
}

if (what === "dashboard" || what === "all") await captureDashboard()
if (what === "youtube" || what === "all") await captureYoutube()
