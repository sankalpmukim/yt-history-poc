#!/usr/bin/env node

/**
 * Publish the Chrome Web Store item via the v2 API. Reusable release tooling:
 *
 *   node scripts/cws-publish.mjs status
 *   node scripts/cws-publish.mjs upload  build/chrome-mv3-prod.zip
 *   node scripts/cws-publish.mjs publish
 *   node scripts/cws-publish.mjs release build/chrome-mv3-prod.zip   # upload + wait + publish
 *
 * Credentials come from the shared key file pointed at by CWS_KEYS_JSON
 * (a keys.json with {chrome: {clientId, clientSecret, refreshToken}}), or from
 * CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN. The publisher and item
 * ids default to this project's listing and can be overridden with
 * CWS_PUBLISHER_ID / CWS_ITEM_ID. Tokens are minted locally; nothing secret is
 * printed.
 *
 * The retired v1.1 endpoints are not used: their upload route now returns 404,
 * so everything goes through v2, which needs the publisher id in the path.
 * The API cannot create items or edit the listing, including "What's new" —
 * that stays in the Developer Dashboard.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const DEFAULT_PUBLISHER_ID = "12887c7f-cb4e-4f77-9928-830ee8fc1510"
const DEFAULT_ITEM_ID = "ebijfodalkiphkomfjnonjpdfjdfihfo" // YT Ledger on the Chrome Web Store
const API = "https://chromewebstore.googleapis.com/v2"

function creds() {
  const keysPath = process.env.CWS_KEYS_JSON
  let fromFile = {}
  if (keysPath) {
    if (!existsSync(keysPath)) throw new Error(`CWS_KEYS_JSON points at a missing file: ${keysPath}`)
    fromFile = JSON.parse(readFileSync(keysPath, "utf8")).chrome ?? {}
  }
  const merged = {
    clientId: process.env.CWS_CLIENT_ID ?? fromFile.clientId,
    clientSecret: process.env.CWS_CLIENT_SECRET ?? fromFile.clientSecret,
    refreshToken: process.env.CWS_REFRESH_TOKEN ?? fromFile.refreshToken,
    publisherId: process.env.CWS_PUBLISHER_ID ?? DEFAULT_PUBLISHER_ID,
    itemId: process.env.CWS_ITEM_ID ?? DEFAULT_ITEM_ID
  }
  const missing = ["clientId", "clientSecret", "refreshToken"].filter((k) => !merged[k])
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Set CWS_KEYS_JSON to a keys.json with {chrome:{clientId,clientSecret,refreshToken}}, ` +
        "or export CWS_CLIENT_ID / CWS_CLIENT_SECRET / CWS_REFRESH_TOKEN."
    )
  }
  return merged
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
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${url.replace(API, "").replace("https://chromewebstore.googleapis.com", "")} → ${res.status}: ` +
        (typeof data === "string" ? data.slice(0, 600) : JSON.stringify(data).slice(0, 600))
    )
  }
  return data
}

function manifestVersion(zipPath) {
  const r = spawnSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`Could not read manifest.json from ${zipPath}: ${r.stderr?.slice(0, 200)}`)
  return JSON.parse(r.stdout).version
}

async function status(c, token) {
  return call(token, "GET", itemPath(c, "fetchStatus"))
}

async function upload(c, token, zipPath) {
  if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`)
  const version = manifestVersion(zipPath)
  const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"))
  if (pkg.version && pkg.version !== version) {
    throw new Error(`Manifest version ${version} does not match package.json ${pkg.version} — rebuild first.`)
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
      console.log("upload settled:", s.uploadState ?? "ok", "| draft version:", s.crxVersion ?? "?")
      return s
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error("Upload still IN_PROGRESS after 5 minutes — check the dashboard.")
}

async function publish(c, token) {
  const res = await call(token, "POST", itemPath(c, "publish"))
  console.log("submitted for review:", JSON.stringify(res))
  return res
}

const [command, arg] = process.argv.slice(2)
try {
  if (!command || !["status", "upload", "publish", "release"].includes(command)) {
    console.error("Usage: node scripts/cws-publish.mjs status | upload <zip> | publish | release <zip>")
    process.exit(2)
  }
  const c = creds()
  const token = await accessToken(c)
  if (command === "status") {
    const s = await status(c, token)
    console.log(
      JSON.stringify(
        {
          id: s.itemId ?? c.itemId,
          draftVersion: s.crxVersion ?? null,
          uploadState: s.uploadState ?? null,
          publishedVersion: s.publishedItemRevisionStatus?.distributionChannels?.[0]?.crxVersion ?? null,
          submittedVersion: s.submittedItemRevisionStatus?.crxVersion ?? null,
          submittedState: s.submittedItemRevisionStatus?.state ?? null,
          warnings: s.warningInfo?.warnings?.map((w) => w.description ?? w.code) ?? []
        },
        null,
        2
      )
    )
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
