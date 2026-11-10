#!/usr/bin/env node
// Dump the YT Ledger extension's chrome.storage.local from a copied LevelDB
// directory. Thin wrapper around the repo's dump-extension-store.mjs, which
// launches Playwright's Chromium with the copied folder and reads storage
// through the extension itself (no LevelDB parsing).
//
// Usage: node scripts/dump-store.mjs <ldb-copy> <ext-id> [out.json]
// Prints the path it wrote and a per-key size table.
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "../../../../")

const ldbDir = resolve(process.argv[2] ?? "")
const extId = process.argv[3]
const out = process.argv[4] ?? resolve(process.env.TMPDIR || "/tmp", "yt-ledger-store.json")
if (!existsSync(ldbDir)) {
  console.error(`LevelDB copy not found: ${ldbDir}`)
  console.error("Run locate-brave-install.sh first and use its LDB_COPY.")
  process.exit(1)
}
if (!extId) {
  console.error("Usage: node scripts/dump-store.mjs <ldb-copy> <ext-id> [out.json]")
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [resolve(repoRoot, "scripts/dump-extension-store.mjs"), ldbDir, extId, out],
  { stdio: "inherit" }
)
process.exit(result.status ?? 1)
