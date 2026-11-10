#!/usr/bin/env node
// Query a dumped YT Ledger store with the repo's own core modules: the
// reports bundle scripts/reports-entry.ts against <repo>/core/* via esbuild,
// so every number matches the dashboard exactly.
//
// Usage:
//   node scripts/query-store.mjs <store.json> <report> [args...]
//   reports: summary | signals | channels [n] | day YYYY-MM-DD | videos [n] [--cat id] | rules | health | key <storage-key>
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../../../")

const storePath = resolve(process.argv[2] ?? "")
const report = process.argv[3] ?? "summary"
const args = process.argv.slice(4)
if (!existsSync(storePath)) {
  console.error(`Store dump not found: ${storePath}`)
  console.error("Run locate-brave-install.sh + dump-store.mjs first.")
  process.exit(1)
}
if (!existsSync(resolve(repoRoot, "node_modules/.bin/esbuild"))) {
  console.error(`esbuild not installed in ${repoRoot} — run pnpm install there.`)
  process.exit(1)
}

const store = JSON.parse(readFileSync(storePath, "utf8"))

const tmp = mkdtempSync(join(tmpdir(), "yt-ledger-query-"))
const out = join(tmp, "reports.mjs")
execFileSync(
  resolve(repoRoot, "node_modules/.bin/esbuild"),
  [
    join(here, "reports-entry.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${out}`
  ],
  { cwd: repoRoot, stdio: "inherit" }
)

const { runReport } = await import(pathToFileURL(out).href)
console.log(runReport(report, args, store))
