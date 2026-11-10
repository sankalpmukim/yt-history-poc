#!/usr/bin/env node
// Dump an extension's chrome.storage.local out of a Chromium-family profile
// (Chrome, Brave, Edge…). Chromium itself reads the LevelDB, so this needs no
// LevelDB parser: we launch Playwright's Chromium with a scratch profile that
// contains a copy of the extension's "Local Extension Settings" folder, load
// the same unpacked build (--load-extension derives the same extension id from
// the path), and read storage from inside the extension.
//
//   node scripts/dump-extension-store.mjs <leveldb-dir> <extension-id> [out.json] [build-dir]
//
// <leveldb-dir>  a COPY of "<profile>/<Default|Profile X>/Local Extension Settings/<ext-id>"
//                (copy it first: the running browser holds a lock)
// <extension-id> the id the unpacked build hashes to (find it in the profile's
//                Preferences/Secure Preferences "extensions.settings")
// [build-dir]    the unpacked build to load; defaults to build/chrome-mv3-prod
//
// Example (Brave):
//   cp -R "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Default/Local Extension Settings/<id>" /tmp/ldb
//   node scripts/dump-extension-store.mjs /tmp/ldb <id> store.json
import { chromium } from "playwright"
import { mkdirSync, cpSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

const ldbDir = process.argv[2]
const extId = process.argv[3]
const out = process.argv[4] ?? "extension-store.json"
const buildDir = resolve(process.argv[5] ?? "build/chrome-mv3-prod")
if (!ldbDir || !extId) {
  console.error("Usage: node scripts/dump-extension-store.mjs <leveldb-dir> <extension-id> [out.json] [build-dir]")
  process.exit(1)
}

const profile = resolve(tmpdir(), `yt-ledger-store-dump-${Date.now()}`)
rmSync(profile, { recursive: true, force: true })
mkdirSync(`${profile}/Default/Local Extension Settings`, { recursive: true })
cpSync(ldbDir, `${profile}/Default/Local Extension Settings/${extId}`, { recursive: true })

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false, // extensions need a headed context on some builds
  args: [`--load-extension=${buildDir}`, `--disable-extensions-except=${buildDir}`, "--mute-audio"]
})
try {
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${extId}/tabs/dashboard.html`)
  await page.waitForTimeout(1500)
  const store = await page.evaluate(
    () => new Promise((res, rej) => chrome.storage.local.get(null, (r) => chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)))
  )
  writeFileSync(out, JSON.stringify(store, null, 1))
  const keys = Object.keys(store).sort()
  console.log(`Wrote ${out}: ${keys.length} keys`)
  for (const k of keys) console.log(" ", k, "->", JSON.stringify(store[k]).length, "bytes")
} finally {
  await ctx.close()
  rmSync(profile, { recursive: true, force: true })
}
