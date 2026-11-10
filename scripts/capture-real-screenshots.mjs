#!/usr/bin/env node
// Screenshot the dashboard seeded with a real chrome.storage.local dump.
// Extract a store first (Chromium reads the extension's LevelDB for you):
//   1. copy  "<profile>/Default/Local Extension Settings/<ext-id>"  somewhere
//   2. node scripts/dump-extension-store.mjs <leveldb-dir> <ext-id> store.json
// Usage: node scripts/capture-real-screenshots.mjs <store.json> <outDir> [light|dark|system] [page]
import { createServer } from "node:http"
import { createReadStream, existsSync, readFileSync, mkdirSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"

const storePath = process.argv[2]
const outDir = process.argv[3] ?? "docs/screenshots/real"
const theme = process.argv[4] ?? "light"
const onlyPage = process.argv[5]
if (!storePath || !existsSync(storePath)) throw new Error("Pass the path to a store dump JSON")
const root = process.cwd()
const buildDir = resolve(root, "build/chrome-mv3-prod")
const store = JSON.parse(readFileSync(resolve(storePath), "utf8"))
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if (!existsSync(join(buildDir, "tabs/dashboard.html"))) throw new Error("Run pnpm build first")
mkdirSync(outDir, { recursive: true })

const routes = [
  ["overview", "#/overview"],
  ["ledger", "#/ledger"],
  ["insights", "#/insights"],
  ["budgets", "#/budgets"],
  ["rules", "#/rules"],
  ["categories", "#/categories"],
  ["settings", "#/settings"]
]
const selectedRoutes = onlyPage ? routes.filter(([name]) => name === onlyPage) : routes

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
    const events = {}
    for (const [key, shard] of Object.entries(store)) {
      if (key.startsWith("yl.v2.events.") && shard && typeof shard === "object") Object.assign(events, shard)
    }
    const shards = {}
    for (const event of Object.values(events)) {
      const month = event.watchedOn.slice(0, 7)
      ;(shards[`yl.v2.events.${month}`] ??= {})[event.key] = event
    }
    const data = {
      ...store,
      "yl.v2.categories": Object.values(store["yl.v2.categories"] ?? {}),
      "yl.v2.subcategories": Object.values(store["yl.v2.subcategories"] ?? []),
      ...shards
    }
    const script = `
      (() => {
        ${theme === "system" ? "" : `document.documentElement.dataset.theme = "${theme}";`}
        const data = ${JSON.stringify(data)};
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
      "--window-size=1440,2400",
      "--virtual-time-budget=2500",
      `--screenshot=${output}`,
      `http://127.0.0.1:${port}/tabs/dashboard.html${hash}`
    ]
    const child = spawn(chrome, args, { stdio: "ignore" })
    const [code] = await once(child, "exit")
    if (!existsSync(output)) throw new Error(`Chrome screenshot failed for ${name} (exit ${code})`)
    console.log(output)
  }
} finally {
  server.close()
}
