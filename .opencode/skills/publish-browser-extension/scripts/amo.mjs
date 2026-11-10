#!/usr/bin/env node

/**
 * Firefox add-on publisher for addons.mozilla.org (v5 submission API).
 *
 *   node scripts/amo.mjs build/firefox-mv3-prod.zip [source.zip] --slug my-addon
 *   node scripts/amo.mjs build/firefox-mv3-prod.zip [source.zip] --slug my-addon --create
 *
 * Uploads the package, waits for AMO's validation, then adds a version to the
 * existing add-on (or creates the add-on when --create is given). With a
 * source zip it also attaches the source AMO needs for a minified bundle.
 *
 *   --keys <keys.json>   or AMO_KEYS_JSON   {firefox: {apiKey, apiSecret}}
 *   --api-key / --api-secret  or AMO_API_KEY / AMO_API_SECRET
 *   --slug <slug>        or AMO_SLUG
 *   --summary "<text>"   one-line summary used on --create
 *   --description-file <path>  HTML description used on --create
 *   --license <id>       SPDX id, default MIT
 *
 * The JWT is minted locally; nothing secret is printed.
 */
import { createHmac, randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const API = "https://addons.mozilla.org/api/v5"

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--")) {
      const next = argv[i + 1]
      if (next && !next.startsWith("--")) {
        flags[a.slice(2)] = next
        i++
      } else flags[a.slice(2)] = true
    } else positional.push(a)
  }
  return { flags, positional }
}

function loadKeys(flags) {
  const path = flags.keys ?? process.env.AMO_KEYS_JSON
  if (!path) return {}
  const abs = resolve(path.replace(/^~(?=\/)/, process.env.HOME ?? "~"))
  if (!existsSync(abs)) throw new Error(`Keys file not found: ${abs}`)
  return JSON.parse(readFileSync(abs, "utf8")).firefox ?? {}
}

function creds(flags) {
  const keys = loadKeys(flags)
  const c = {
    apiKey: flags["api-key"] ?? process.env.AMO_API_KEY ?? keys.apiKey,
    apiSecret: flags["api-secret"] ?? process.env.AMO_API_SECRET ?? keys.apiSecret,
    slug: flags.slug ?? process.env.AMO_SLUG ?? keys.slug
  }
  const missing = ["apiKey", "apiSecret", "slug"].filter((k) => !c[k])
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(", ")}. Pass --keys <keys.json> with {firefox:{apiKey,apiSecret,slug}} ` +
        "or export AMO_API_KEY / AMO_API_SECRET / AMO_SLUG. Create the key pair at https://addons.mozilla.org/developers/addon/api/key/"
    )
  }
  return c
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

function mintJwt(c) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify({ iss: c.apiKey, jti: randomUUID(), iat: now, exp: now + 240 }))
  const sig = b64url(createHmac("sha256", c.apiSecret).update(`${header}.${payload}`).digest())
  return `${header}.${payload}.${sig}`
}

async function call(c, method, path, { json, form } = {}) {
  // AMO's DRF JSONWebTokenAuthentication expects the "JWT <token>" scheme.
  const headers = { Authorization: `JWT ${mintJwt(c)}` }
  let body
  if (json != null) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(json)
  } else if (form != null) body = form
  const res = await fetch(`${API}${path}`, { method, headers, body })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok) {
    const err = new Error(
      `${method} ${path} → ${res.status}: ${typeof data === "string" ? data.slice(0, 800) : JSON.stringify(data).slice(0, 800)}`
    )
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

/**
 * Run a call, waiting out AMO's per-account throttle. The submission endpoints
 * have a small daily quota; a 429 says exactly when a slot frees up.
 */
async function callWithThrottleWait(c, method, path, opts, maxWaitMs = 12 * 3600_000) {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    try {
      return await call(c, method, path, opts)
    } catch (e) {
      const wait = e.status === 429 && typeof e.data?.detail === "string" ? e.data.detail.match(/available in (\d+) seconds/i) : null
      if (!wait || Date.now() + (Number(wait[1]) + 30) * 1000 > deadline) throw e
      const waitSec = Math.min(Number(wait[1]) + 30, 3500)
      console.log(`throttled; waiting ${Math.round(waitSec / 60)} min for the quota window…`)
      await new Promise((r) => setTimeout(r, waitSec * 1000))
    }
  }
}

const { flags, positional } = parseArgs(process.argv.slice(2))
const [zipArg, sourceArg] = positional

try {
  if (!zipArg) {
    console.error("Usage: node scripts/amo.mjs <zip> [source.zip] --slug <slug> [--create] [--keys <keys.json>]")
    process.exit(2)
  }
  const zipPath = resolve(zipArg)
  const sourcePath = sourceArg ? resolve(sourceArg) : null
  if (!existsSync(zipPath)) throw new Error(`Zip not found: ${zipPath}`)

  const c = creds(flags)
  const license = flags.license ?? "MIT"

  // 1. upload the package for validation
  const form = new FormData()
  form.append("upload", new Blob([readFileSync(zipPath)], { type: "application/zip" }), zipPath.split("/").pop())
  form.append("channel", flags.channel ?? "listed")
  const upload = await call(c, "POST", "/addons/upload/", { form })
  console.log("uploaded", upload.uuid, "valid:", upload.valid)

  // 2. wait for validation
  let processed = upload
  for (let i = 0; i < 60 && !processed.processed; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    processed = await call(c, "GET", `/addons/upload/${upload.uuid}/`)
    console.log("validation…", processed.processed ? "done" : "pending")
  }
  if (!processed.valid) {
    console.error(JSON.stringify(processed.validation, null, 2).slice(0, 4000))
    throw new Error("Package failed AMO validation")
  }

  // 3. create the add-on (--create) or add a version to the existing one
  let slug = c.slug
  let addon = null
  try {
    addon = await call(c, "GET", `/addons/addon/${slug}/`)
  } catch (e) {
    if (e.status !== 401 && e.status !== 404) throw e
  }

  if (!addon) {
    if (!flags.create) {
      throw new Error(
        `No add-on "${slug}" for these credentials. AMO returns 401 for a disabled add-on — check the Developer Hub; ` +
          "if it does not exist, pass --create."
      )
    }
    const summary = flags.summary
    if (!summary) throw new Error("--create needs --summary")
    const description = flags["description-file"] ? readFileSync(resolve(flags["description-file"]), "utf8") : summary
    addon = await callWithThrottleWait(c, "POST", "/addons/addon/", {
      json: {
        categories: { firefox: [flags.category ?? "other"] },
        summary: { "en-US": summary },
        description: { "en-US": description },
        version: { upload: upload.uuid, license }
      }
    })
    slug = addon.slug
    console.log("created add-on", addon.slug, addon.id, "status:", addon.status)
  } else {
    const version = await callWithThrottleWait(c, "POST", `/addons/addon/${slug}/versions/`, {
      json: { upload: upload.uuid }
    })
    console.log("new version", version.version, version.id)
  }

  // 4. attach source for review (the production bundle is minified)
  if (sourcePath && existsSync(sourcePath)) {
    const current = await call(c, "GET", `/addons/addon/${slug}/?show_unlisted=true`)
    const versionId = current.current_version?.id
    if (versionId) {
      const srcForm = new FormData()
      srcForm.append("source", new Blob([readFileSync(sourcePath)], { type: "application/zip" }), sourcePath.split("/").pop())
      srcForm.append("license", license)
      const v = await callWithThrottleWait(c, "PATCH", `/addons/addon/${slug}/versions/${versionId}/`, { form: srcForm })
      console.log("source attached to version", v.version)
    }
  }
  console.log(`done: https://addons.mozilla.org/developers/addon/${slug}/`)
} catch (e) {
  console.error(`error: ${e.message}`)
  process.exit(1)
}
