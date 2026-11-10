#!/usr/bin/env node

/**
 * Chrome Web Store publisher (v2 API).
 *
 *   node scripts/cws.mjs status
 *   node scripts/cws.mjs upload  build/chrome-mv3-prod.zip
 *   node scripts/cws.mjs publish
 *   node scripts/cws.mjs release build/chrome-mv3-prod.zip   # upload + wait + submit for review
 *
 * Targets and credentials resolve in this order: flags, then environment,
 * then the keys file:
 *   --keys <keys.json>   or CWS_KEYS_JSON   {chrome: {clientId, clientSecret, refreshToken, publisherId, itemId}}
 *   --publisher <id>     or CWS_PUBLISHER_ID
 *   --item <id>          or CWS_ITEM_ID     (also read from keys.chrome.extId)
 *   --client-id / --client-secret / --refresh-token  or CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN
 *
 * The v1.1 endpoints are deliberately not used: their upload route answers
 * 404 ("Could not find handler for this request") and only v2 still works.
 * v2 needs the publisher id in the path — it is shown in the Developer
 * Dashboard under Publisher > Settings.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://chromewebstore.googleapis.com/v2"

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i]
    else positional.push(a)
  }
  return { flags, positional }
}

function loadKeys(flags) {
  const path = flags.keys ?? process.env.CWS_KEYS_JSON
  if (!path) return {}
  const abs = resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~"))
  if (!existsSync(abs)) throw new Error(`Keys file not found: ${abs}`)
  return JSON.parse(readFileSync(abs, "utf8")).chrome ?? {}
}

function creds(flags) {
  const keys = loadKeys(flags)
  const c = {
    clientId: flags["client-id"] ?? process.env.CWS_CLIENT_ID ?? keys.clientId,
    clientSecret: flags["client-secret"] ?? process.env.CWS_CLIENT_SECRET ?? keys.clientSecret,
    refreshToken: flags["refresh-token"] ?? process.env.CWS_REFRESH_TOKEN ?? keys.refreshToken,
    publisherId: flags.publisher ?? process.env.CWS_PUBLISHER_ID ?? keys.publisherId,
    itemId: flags.item ?? process.env.CWS_ITEM_ID ?? keys.itemId ?? keys.extId
  }
  const missing = ["clientId", "clientSecret", "refreshToken", "publisherId", "itemId"].filter((k) => !c[k])
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Pass --keys <keys.json> with {chrome:{clientId,clientSecret,refreshToken,publisherId,itemId}} ` +
        "or export the matching CWS_* variables."
    )
  }
  return c
}

async function accessToken(c) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token"
    })
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`)
  }
  return data.access_token
}

function itemPath(c, method) {
  return `${API}/publishers/${c.publisherId}/items/${c.itemId}:${method}`
}

async function call(token, method, url, { body, headers = {} } = {}) {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, body })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    const shown = typeof data === "string" ? data.slice(0, 600) : JSON.stringify(data).slice(0, 600)
    throw new Error(`${method} ${url.replace(API, "")} → ${res.status}: ${shown}`)
  }
  return data
}

function zipVersion(zipPath) {
  const r = spawnSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`Could not read manifest.json from ${zipPath}: ${r.stderr?.slice(0, 200)}`)
  return JSON.parse(r.stdout).version
}

async function status(c, token) {
  return call(token, "GET", itemPath(c, "fetchStatus"))
}

async function upload(c, token, zipPath) {
  if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`)
  const version = zipVersion(zipPath)
  const pkgPath = resolve("package.json")
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    if (pkg.version && pkg.version !== version) {
      throw new Error(`Manifest version ${version} does not match package.json ${pkg.version} — rebuild first.`)
    }
  }
  console.log(`uploading ${zipPath} (v${version})…`)
  const res = await call(
    token,
    "POST",
    `https://chromewebstore.googleapis.com/upload/v2/publishers/${c.publisherId}/items/${c.itemId}:upload`,
    { body: readFileSync(zipPath), headers: { "Content-Type": "application/zip" } }
  )
  console.log("upload:", res.uploadState ?? JSON.stringify(res))

  // The store parses the package asynchronously; publish fails until it settles.
  for (let i = 0; i < 60; i++) {
    const s = await status(c, token)
    if (s.uploadState !== "IN_PROGRESS") {
      console.log("upload settled:", s.uploadState ?? "ok")
      return s
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error("Upload still IN_PROGRESS after 5 minutes — check the Developer Dashboard.")
}

async function publish(c, token) {
  const res = await call(token, "POST", itemPath(c, "publish"))
  console.log("submitted for review:", JSON.stringify(res))
  return res
}

function summarize(s) {
  const ver = (rev) => rev?.distributionChannels?.[0]?.crxVersion ?? rev?.crxVersion ?? null
  return {
    item: s.itemId ?? null,
    draft: s.crxVersion ?? null,
    uploadState: s.uploadState ?? null,
    live: ver(s.publishedItemRevisionStatus),
    liveState: s.publishedItemRevisionStatus?.state ?? null,
    submitted: ver(s.submittedItemRevisionStatus),
    submittedState: s.submittedItemRevisionStatus?.state ?? null,
    warnings: s.warningInfo?.warnings?.map((w) => w.description ?? w.code) ?? []
  }
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const [command, arg] = positional

try {
  if (!command || !["status", "upload", "publish", "release"].includes(command)) {
    console.error("Usage: node scripts/cws.mjs status | upload <zip> | publish | release <zip> [--keys f] [--publisher id] [--item id]")
    process.exit(2)
  }
  const c = creds(flags)
  const token = await accessToken(c)
  if (command === "status") {
    console.log(JSON.stringify(summarize(await status(c, token)), null, 2))
  } else if (command === "upload") {
    if (!arg) throw new Error("upload needs a zip path")
    await upload(c, token, resolve(arg))
  } else if (command === "publish") {
    await publish(c, token)
  } else {
    if (!arg) throw new Error("release needs a zip path")
    await upload(c, token, resolve(arg))
    await publish(c, token)
    console.log("done — review status: https://chrome.google.com/webstore/devconsole")
  }
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(1)
}
