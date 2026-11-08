#!/usr/bin/env node

/**
 * Submit (or create) the Firefox add-on on addons.mozilla.org via the
 * v5 submission API. Reusable release tooling:
 *
 *   node scripts/amo-submit.mjs <zip> <source-zip>
 *
 * Credentials come from the shared AMO API key pair pointed at by
 * AMO_KEYS_JSON (a keys.json with {firefox: {apiKey, apiSecret}}).
 * The JWT is minted locally; nothing is printed.
 */
import { createHmac } from "node:crypto"
import { randomUUID } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const zipPath = resolve(process.argv[2] ?? "build/firefox-mv3-prod.zip")
const sourcePath = process.argv[3] ? resolve(process.argv[3]) : null
const keysPath = process.env.AMO_KEYS_JSON
if (!keysPath || !existsSync(keysPath)) throw new Error("Set AMO_KEYS_JSON to a keys.json with firefox.apiKey/apiSecret")
if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`)

const { firefox: { apiKey, apiSecret } } = JSON.parse(readFileSync(keysPath, "utf8"))
const API = "https://addons.mozilla.org/api/v5"

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function mintJwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iss: apiKey, jti: randomUUID(), iat: now, exp: now + 240 }))
  const sig = b64url(createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${sig}`
}

async function call(method, path, { json, form } = {}) {
  // AMO's DRF JSONWebTokenAuthentication expects the "JWT <token>" scheme
  const headers = { Authorization: `JWT ${mintJwt()}` }
  let body
  if (json != null) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(json)
  } else if (form != null) {
    body = form
  }
  const res = await fetch(`${API}${path}`, { method, headers, body })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === "string" ? data.slice(0, 800) : JSON.stringify(data).slice(0, 800)}`)
  }
  return data
}

const SUMMARY =
  "An expense manager for YouTube watch time: every video becomes a ledger entry, categories sit on a value ladder, and weekly budgets are enforced on youtube.com."
const DESCRIPTION = `<p>YT Ledger is an expense manager for your YouTube watch time. Every video you watch becomes an entry in a local ledger, entries are organized on a value ladder from &quot;brain rot&quot; to &quot;courses &amp; lectures&quot;, and weekly budgets can be enforced right on youtube.com — gently or strictly.</p>
<p>Expense trackers work because they make spending visible: every transaction lands in a category, and the totals tell you something you didn't want to hear. YT Ledger does the same for time. It's not about watching less. It's about knowing what the time actually went to.</p>
<p><b>How it works</b></p>
<ul>
<li><b>Sync</b> — YouTube has no history API, so the extension reads the history page itself, locally in your browser. Rewatches are counted as separate entries.</li>
<li><b>Ledger</b> — every video becomes an entry with estimated watch time (duration × progress), a category and a spot on your value ladder. Search, filter, and assign entries individually or in bulk.</li>
<li><b>Rules</b> — auto-categorize by title (including regex), channel or duration. The first matching rule wins, and manual assignments always beat rules.</li>
<li><b>Budgets</b> — weekly budgets per category, enforced on youtube.com in two modes: <i>Gentle</i> marks over-budget videos with a chip and a banner on watch pages; <i>Strict</i> hides over-budget videos behind a veil and gates watch pages behind &quot;Watch anyway&quot;, with playback paused until you choose to continue.</li>
<li><b>Insights</b> — where the time actually went, week by week, with drill-downs, trends and a category ladder you can reorder to match what you consider valuable.</li>
</ul>
<p><b>Privacy</b></p>
<p>Everything stays in your browser. No server, no account, no analytics, no tracking. Durations for videos you watched are looked up from public YouTube watch pages; nothing is ever sent anywhere else. Export your full ledger as CSV or JSON at any time. Works in Firefox 128+ and in Chrome, Brave and Edge.</p>`

// 1. upload the package for validation
const form = new FormData()
form.append("upload", new Blob([readFileSync(zipPath)], { type: "application/zip" }), zipPath.split("/").pop())
form.append("channel", "listed")
const upload = await call("POST", "/addons/upload/", { form })
console.log("uploaded", upload.uuid, "valid:", upload.valid)

// 2. wait for validation
let processed = upload
for (let i = 0; i < 60 && !processed.processed; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  processed = await call("GET", `/addons/upload/${upload.uuid}/`)
  console.log("validation…", processed.processed ? "done" : "pending")
}
if (!processed.valid) {
  console.error(JSON.stringify(processed.validation, null, 2).slice(0, 4000))
  throw new Error("Package failed AMO validation")
}

// 3. create the add-on (first submission) or add a version (existing)
const slug = "yt-ledger"
let addon
try {
  addon = await call("GET", `/addons/addon/${slug}/`)
} catch {
  addon = null
}
if (!addon) {
  addon = await call("POST", "/addons/addon/", {
    json: {
      categories: { firefox: ["photos-music-videos"] },
      summary: { "en-US": SUMMARY },
      homepage: { "en-US": "https://github.com/sankalpmukim/yt-history-poc" },
      description: { "en-US": DESCRIPTION },
      version: { upload: upload.uuid, license: "MIT" }
    }
  })
  console.log("created add-on", addon.slug, addon.id, "status:", addon.status)
} else {
  const version = await call("POST", `/addons/addon/${slug}/versions/`, {
    json: { upload: upload.uuid }
  })
  console.log("new version", version.version, version.id)
}

// 4. polish listing metadata (idempotent)
const patched = await call("PATCH", `/addons/addon/${slug}/`, {
  json: {
    summary: { "en-US": SUMMARY },
    description: { "en-US": DESCRIPTION },
    homepage: { "en-US": "https://github.com/sankalpmukim/yt-history-poc" },
    support_url: { "en-US": "https://github.com/sankalpmukim/yt-history-poc/issues" }
  }
})
console.log("listing updated:", patched.slug, "status:", patched.status)

// 5. attach source for review (the bundle is minified)
if (sourcePath && existsSync(sourcePath)) {
  const current = await call("GET", `/addons/addon/${slug}/?show_unlisted=true`)
  const versionId = current.current_version?.id
  if (versionId) {
    const srcForm = new FormData()
    srcForm.append("source", new Blob([readFileSync(sourcePath)], { type: "application/zip" }), sourcePath.split("/").pop())
    srcForm.append("license", "MIT")
    const v = await call("PATCH", `/addons/addon/${slug}/versions/${versionId}/`, { form: srcForm })
    console.log("source attached to version", v.version)
  }
}
console.log("done: https://addons.mozilla.org/developers/addon/yt-ledger/edit")
