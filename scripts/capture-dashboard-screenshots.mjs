#!/usr/bin/env node

/**
 * Headless dashboard screenshot harness. It serves the production Plasmo
 * bundle with chrome.storage.local stubbed from fixtures/qa-seed.json.
 * Usage: node scripts/capture-dashboard-screenshots.mjs before|after [system|light|dark] [page]
 */
import { createServer } from "node:http"
import { createReadStream, existsSync, readFileSync, mkdirSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"

const phase = process.argv[2]
const theme = process.argv[3] ?? "system"
const onlyPage = process.argv[4]
if (!new Set(["before", "after"]).has(phase)) {
  throw new Error("Usage: node scripts/capture-dashboard-screenshots.mjs before|after [system|light|dark]")
}
if (!new Set(["system", "light", "dark"]).has(theme)) throw new Error("Theme must be system, light, or dark")
const root = process.cwd()
const buildDir = resolve(root, "build/chrome-mv3-prod")
const fixture = JSON.parse(readFileSync(resolve(root, "fixtures/qa-seed.json"), "utf8"))
const outDir = resolve(root, "docs/screenshots", theme === "light" ? `${phase}-light` : phase)
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if (!existsSync(join(buildDir, "tabs/dashboard.html"))) throw new Error("Run pnpm build first")
if (!existsSync(chrome)) throw new Error(`Chrome executable not found: ${chrome}`)
mkdirSync(outDir, { recursive: true })

const routes = [
  ["overview", "#/overview"],
  ["overview-drilldown", "#/overview?drill=1"],
  ["ledger", "#/ledger"],
  ["insights", "#/insights"],
  ["budgets", "#/budgets"],
  ["rules", "#/rules"],
  ["categories", "#/categories"],
  ["settings", "#/settings"],
  ["onboarding", "#/onboarding"]
]
const selectedRoutes = onlyPage ? routes.filter(([name]) => name === onlyPage) : routes
if (onlyPage && selectedRoutes.length === 0) throw new Error(`Unknown page: ${onlyPage}`)

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
    const script = `
      (() => {
        ${theme === "system" ? "" : `document.documentElement.dataset.theme = "${theme}";`}
        const data = ${JSON.stringify(data)};
        if (location.hash.includes("/onboarding")) data["yl.v2.meta"] = null;
        const listeners = new Set();
        const local = {
          async get(keys) {
            if (keys == null) return structuredClone(data);
            const wanted = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(wanted.filter(k => k in data).map(k => [k, structuredClone(data[k])]));
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
        if (location.hash.includes("drill=1")) {
          const timer = setInterval(() => {
            const row = [...document.querySelectorAll(".value-trigger")].find(el => el.textContent.includes("News & updates"));
            if (row) { clearInterval(timer); row.click(); }
          }, 100);
          setTimeout(() => clearInterval(timer), 5000);
        }
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
  for (const [name, hash] of selectedRoutes) {
    const output = join(outDir, `${name}.png`)
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--disable-background-networking",
      "--hide-scrollbars",
      ...(theme === "system" ? [] : theme === "light"
        ? ["--force-light-mode", "--blink-settings=preferredColorScheme=light"]
        : ["--force-dark-mode", "--blink-settings=preferredColorScheme=dark"]),
      "--window-size=1440,1100",
      "--virtual-time-budget=2500",
      `--screenshot=${output}`,
      `http://127.0.0.1:${port}/tabs/dashboard.html${hash}`
    ]
    const child = spawn(chrome, args, { stdio: "ignore" })
    const [code] = await once(child, "exit")
    // On this macOS headless build Chrome can write a valid PNG and then exit
    // 2 during its display-link teardown; the image itself is the assertion.
    if (!existsSync(output)) throw new Error(`Chrome screenshot failed for ${name} (exit ${code})`)
    console.log(output)
  }
} finally {
  server.close()
}
