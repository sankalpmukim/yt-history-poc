#!/usr/bin/env node

/**
 * Answer "has the release reached the stores?" for a browser extension.
 *
 *   node scripts/store-status.mjs --item <chrome-item-id> --slug <amo-slug> [--keys keys.json] [--version x.y.z]
 *
 * Chrome: reads the Developer API when credentials are available (live,
 * submitted and draft versions), otherwise scrapes the public listing page for
 * its published version. Firefox: reads AMO's public add-on API, which answers
 * 401 with is_disabled_by_mozilla for a force-disabled add-on.
 *
 * Exit code is 0 when every store is on the expected version, 1 otherwise —
 * a pending review counts as not-yet-live.
 */
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://chromewebstore.googleapis.com/v2"

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) flags[a.slice(2)] = argv[++i]
  }
  return flags
}

function expectedVersion(flags) {
  if (flags.version) return flags.version
  if (existsSync("package.json")) return JSON.parse(readFileSync("package.json", "utf8")).version
  return null
}

function chromeCreds(flags) {
  const path = flags.keys ?? process.env.CWS_KEYS_JSON
  let keys = {}
  if (path) {
    const abs = resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~"))
    if (existsSync(abs)) keys = JSON.parse(readFileSync(abs, "utf8")).chrome ?? {}
  }
  const c = {
    clientId: process.env.CWS_CLIENT_ID ?? keys.clientId,
    clientSecret: process.env.CWS_CLIENT_SECRET ?? keys.clientSecret,
    refreshToken: process.env.CWS_REFRESH_TOKEN ?? keys.refreshToken,
    publisherId: flags.publisher ?? process.env.CWS_PUBLISHER_ID ?? keys.publisherId,
    itemId: flags.item ?? process.env.CWS_ITEM_ID ?? keys.itemId ?? keys.extId
  }
  return c.clientId && c.clientSecret && c.refreshToken && c.publisherId && c.itemId ? c : null
}

async function chromeApi(c) {
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: "refresh_token"
    })
  })
  const tj = await tok.json()
  if (!tj.access_token) throw new Error(`token refresh failed: ${JSON.stringify(tj).slice(0, 200)}`)
  const res = await fetch(`${API}/publishers/${c.publisherId}/items/${c.itemId}:fetchStatus`, {
    headers: { Authorization: `Bearer ${tj.access_token}` }
  })
  if (!res.ok) throw new Error(`fetchStatus ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const s = await res.json()
  const ver = (rev) => rev?.distributionChannels?.[0]?.crxVersion ?? rev?.crxVersion ?? null
  return {
    live: ver(s.publishedItemRevisionStatus),
    submitted: ver(s.submittedItemRevisionStatus),
    submittedState: s.submittedItemRevisionStatus?.state ?? null,
    draft: s.crxVersion ?? null
  }
}

async function chromePublic(itemId) {
  const res = await fetch(`https://chromewebstore.google.com/detail/${itemId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }
  })
  const html = await res.text()
  // The listing renders the version as <div>Version</div><div>1.2.3</div>.
  const version =
    html.match(/Version<\/div>\s*<div[^>]*>\s*([0-9]+(?:\.[0-9]+)*)/i)?.[1] ??
    html.match(/"version"\s*:\s*"([0-9]+(?:\.[0-9]+)*)"/)?.[1] ??
    null
  return { live: version, submitted: null, submittedState: null, draft: null, source: "public page" }
}

async function amoStatus(slug) {
  const res = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${slug}/`, {
    headers: { "User-Agent": "store-status" }
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (res.ok) return { live: data?.current_version?.version ?? null, state: data?.status ?? "listed" }
  return {
    live: null,
    state: data?.is_disabled_by_mozilla ? "disabled by Mozilla" : `unavailable (${res.status})`
  }
}

const flags = parseArgs(process.argv.slice(2))
const expected = expectedVersion(flags)
let ok = true

try {
  const itemId = flags.item ?? process.env.CWS_ITEM_ID
  const slug = flags.slug ?? process.env.AMO_SLUG
  if (!itemId && !slug) {
    console.error("Usage: node scripts/store-status.mjs --item <chrome-item-id> --slug <amo-slug> [--keys keys.json] [--version x.y.z]")
    process.exit(2)
  }

  if (itemId) {
    let cws = null
    const c = chromeCreds(flags)
    try {
      cws = c ? await chromeApi(c) : await chromePublic(itemId)
    } catch (e) {
      cws = { error: e.message }
    }
    console.log("Chrome Web Store")
    if (cws.error) console.log(`  error: ${cws.error}`)
    else {
      console.log(`  live:      ${cws.live ?? "unknown"}${cws.source ? ` (${cws.source})` : ""}`)
      if (cws.submitted) console.log(`  submitted: ${cws.submitted} (${cws.submittedState ?? "in review"})`)
      if (cws.draft && cws.draft !== cws.live) console.log(`  draft:     ${cws.draft}`)
      const live = cws.live === expected
      if (!live) ok = false
      console.log(`  expected:  ${expected ?? "(unknown)"} → ${live ? "live" : cws.submitted === expected ? "in review" : "not published"}`)
    }
  }

  if (slug) {
    const amo = await amoStatus(slug)
    console.log("Firefox Add-ons (AMO)")
    console.log(`  status:    ${amo.state}`)
    console.log(`  live:      ${amo.live ?? "not available"}`)
    if (amo.live !== expected) ok = false
    console.log(`  expected:  ${expected ?? "(unknown)"} → ${amo.live === expected ? "live" : "not live"}`)
    if (amo.state === "disabled by Mozilla") {
      console.log("  note: a force-disabled add-on cannot take new versions; resolve it in the Developer Hub first.")
    }
  }
  process.exit(ok ? 0 : 1)
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(1)
}
