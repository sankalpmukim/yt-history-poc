/**
 * MAIN-world content script: fetches watch history via YouTube's own
 * innertube API (/youtubei/v1/browse, browseId=FEhistory) using the page's
 * session (cookies ride along automatically — we never read them directly).
 *
 * Pagination stops as soon as a day-section older than the 2-day window
 * (Today + Yesterday) is detected, so we never fetch more than needed.
 *
 * Communicates with the isolated-world sync script via window.postMessage.
 */

import type { PlasmoCSConfig } from "plasmo"
import type {
  FetchResult,
  HistoryItem,
  HistorySection
} from "../utils/history-types"
import { dayLabelToDate, startOfDay } from "../utils/day"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  world: "MAIN",
  run_at: "document_idle"
}

const MSG_SOURCE = "yt-history-poc"
const REQ_TYPE = "YT_HISTORY_POC_FETCH_REQUEST"
const RES_TYPE = "YT_HISTORY_POC_FETCH_RESPONSE"
const READY_TYPE = "YT_HISTORY_POC_MAIN_READY"

const MAX_PAGES = 8
const PAGE_DELAY_MS = 200

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Recursively collect every value stored under `key` in a nested object. */
function collect(root: any, key: string, out: any[] = []): any[] {
  if (!root || typeof root !== "object") return out
  if (Array.isArray(root)) {
    for (const v of root) collect(v, key, out)
    return out
  }
  for (const [k, v] of Object.entries(root)) {
    if (k === key) out.push(v)
    collect(v, key, out)
  }
  return out
}

/** Best-effort text extraction from YouTube's text nodes. */
function textOf(node: any): string {
  if (!node) return ""
  if (typeof node === "string") return node
  if (typeof node.simpleText === "string") return node.simpleText
  if (typeof node.content === "string") return node.content
  if (Array.isArray(node.runs)) {
    return node.runs.map((r: any) => r?.text ?? "").join("")
  }
  return ""
}

/** Read the innertube API key + client context from the page's ytcfg global. */
function getInnertubeCfg(): { apiKey: string; context: any } | null {
  try {
    // Accessing ytcfg.get would be cleaner but data_ is the raw backing store.
    const cfg = (window as any).ytcfg?.data_
    const apiKey: string | undefined = cfg?.INNERTUBE_API_KEY
    const context = cfg?.INNERTUBE_CONTEXT
    if (apiKey && context) return { apiKey, context }
  } catch {}
  return null
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

function parseWatchState(container: any): string {
  const pct =
    collect(container, "thumbnailOverlayResumePlaybackRenderer")[0]
      ?.percentDurationWatched ??
    collect(container, "thumbnailOverlayProgressBarViewModel")[0]?.startPercent
  return typeof pct === "number" ? `Watched ${pct}%` : ""
}

function parseItem(node: any): HistoryItem | null {
  // Classic desktop shape
  const vr = node?.videoRenderer
  if (vr?.videoId) {
    return {
      videoId: vr.videoId,
      title: textOf(vr.title),
      channel:
        textOf(vr.ownerText) ||
        textOf(vr.longBylineText) ||
        textOf(vr.shortBylineText),
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
      watchState: parseWatchState(vr.thumbnailOverlays)
    }
  }

  // Newer view-model shape (2024+ churn)
  const lock = node?.lockupViewModel
  if (lock?.contentId) {
    const meta = lock?.metadata?.lockupMetadataViewModel
    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []
    const parts: string[] = []
    for (const row of rows) {
      for (const part of row?.metadataParts ?? []) {
        if (typeof part?.text?.content === "string") parts.push(part.text.content)
      }
    }
    return {
      videoId: lock.contentId,
      title: meta?.title?.content ?? "",
      channel: parts.find((p) => !/^(watched|[\d.,]+[KM]?)$/i.test(p)) ?? "",
      url: `https://www.youtube.com/watch?v=${lock.contentId}`,
      watchState: parseWatchState(lock)
    }
  }

  // Mobile-web shape seen in some experiments
  const vw = node?.videoWithContextRenderer
  if (vw?.videoId) {
    return {
      videoId: vw.videoId,
      title: textOf(vw.headline) || textOf(vw.title),
      channel: textOf(vw.shortBylineText) || textOf(vw.shortViewCountText),
      url: `https://www.youtube.com/watch?v=${vw.videoId}`,
      watchState: ""
    }
  }

  return null // playlists, ads, unknown shapes
}

function parseSection(sec: any): HistorySection | null {
  const headerNode =
    sec?.header?.itemSectionHeaderRenderer?.title ??
    sec?.header?.submenuHeaderRenderer?.title
  const dayLabel = textOf(headerNode)
  const items: HistoryItem[] = []
  for (const c of Array.isArray(sec?.contents) ? sec.contents : []) {
    const it = parseItem(c)
    if (it && it.title) items.push(it)
  }
  if (!dayLabel || items.length === 0) return null
  return { dayLabel, items }
}

/** Scope parsing to the history list container to avoid sidebar noise. */
function scopeHistoryContainer(json: any): any {
  const slc = collect(json, "sectionListContinuation")[0]
  if (slc) return slc
  return json?.contents?.twoColumnBrowseResultsRenderer ?? json
}

function extractContinuation(scope: any): string | null {
  const cir = collect(scope, "continuationItemRenderer")[0]
  const tok =
    cir?.continuationEndpoint?.continuationCommand?.token ??
    collect(scope, "continuationCommand")[0]?.token
  return typeof tok === "string" && tok.length > 0 ? tok : null
}

/* ------------------------------------------------------------------ */
/* fetch loop                                                          */
/* ------------------------------------------------------------------ */

function errorResult(error: string): FetchResult {
  return {
    ok: false,
    sections: [],
    meta: { pagesFetched: 0, stoppedBecause: "error", error },
    fetchedAt: new Date().toISOString()
  }
}

/** start of Yesterday = the 2-day window [yesterday, today] */
function cutoffOf(now: Date): Date {
  const cutoff = startOfDay(now)
  cutoff.setDate(cutoff.getDate() - 1)
  return cutoff
}

/**
 * Parse history sections from a browse/ytInitialData-shaped object, keeping
 * only sections inside the 2-day window. Returns sections and whether a
 * section older than the window was seen (pagination stop signal).
 */
function parseSectionsFromResponse(
  scope: any,
  now: Date
): { sections: HistorySection[]; hitOlder: boolean } {
  const cutoff = cutoffOf(now)
  const sections: HistorySection[] = []
  const seen = new Set<string>()
  let hitOlder = false
  for (const raw of collect(scope, "itemSectionRenderer")) {
    const sec = parseSection(raw)
    if (!sec) continue
    const d = dayLabelToDate(sec.dayLabel, now)
    if (d && d.getTime() >= cutoff.getTime()) {
      if (!seen.has(sec.dayLabel)) {
        seen.add(sec.dayLabel)
        sections.push(sec)
      } else {
        const existing = sections.find((s) => s.dayLabel === sec.dayLabel)
        existing?.items.push(...sec.items)
      }
    } else {
      hitOlder = true
      break
    }
  }
  return { sections, hitOlder }
}

async function fetchHistory(): Promise<FetchResult> {
  // ytcfg can appear slightly after document_idle on slow loads.
  let cfg = getInnertubeCfg()
  for (let i = 0; i < 10 && !cfg; i++) {
    await sleep(500)
    cfg = getInnertubeCfg()
  }

  const now = new Date()

  // Preferred path: on /feed/history the page itself already fetched (fully
  // authenticated) and embedded the data in window.ytInitialData.
  if (location.pathname.startsWith("/feed/history")) {
    const initial: any = (window as any).ytInitialData
    if (initial) {
      const parsed = parseSectionsFromResponse(initial, now)
      // TEMP POC debug: structural summary (compact, complete).
      return {
        ok: true,
        sections: parsed.sections,
        meta: {
          pagesFetched: 0,
          stoppedBecause: parsed.sections.length ? "cutoff" : "empty"
        },
        fetchedAt: new Date().toISOString(),
        debugRaw: `ytInitialData sections=${JSON.stringify(collect(initial, "itemSectionRenderer").length)}`
      }
    }
    return errorResult("on /feed/history but ytInitialData missing")
  }

  if (!cfg) {
    return errorResult(
      "ytcfg/INNERTUBE_CONTEXT not found on this page (not signed in, or YouTube served a non-standard page)"
    )
  }

  const cutoff = cutoffOf(now)

  const sections: HistorySection[] = []
  const seen = new Set<string>()
  let pagesFetched = 0
  let token: string | null = null
  let stoppedBecause: FetchResult["meta"]["stoppedBecause"] = "no-more"
  let rawHead = ""

  while (pagesFetched < MAX_PAGES) {
    const body: Record<string, any> = token
      ? { context: cfg.context, continuation: token }
      : { context: cfg.context, browseId: "FEhistory" }

    let res: Response
    try {
      res = await fetch(`/youtubei/v1/browse?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body)
      })
    } catch (e: any) {
      return errorResult(`network error: ${e?.message ?? e}`)
    }
    if (!res.ok) return errorResult(`browse HTTP ${res.status}`)

    let json: any
    try {
      json = await res.json()
    } catch {
      return errorResult("browse returned invalid JSON")
    }
    pagesFetched++
    try {
      document.title = `${document.title} M:p${pagesFetched}`.slice(0, 180)
    } catch {}

    const scope = scopeHistoryContainer(json)
    if (pagesFetched === 1 && !rawHead) {
      rawHead = JSON.stringify(json).slice(0, 4000)
    }
    let hitOlder = false
    {
      const parsed = parseSectionsFromResponse(scope, now)
      for (const s of parsed.sections) {
        if (!seen.has(s.dayLabel)) {
          seen.add(s.dayLabel)
          sections.push(s)
        } else {
          const existing = sections.find((x) => x.dayLabel === s.dayLabel)
          existing?.items.push(...s.items)
        }
      }
      hitOlder = parsed.hitOlder
    }

    if (hitOlder) {
      stoppedBecause = "cutoff"
      break
    }
    token = extractContinuation(scope)
    if (!token) {
      stoppedBecause = "no-more"
      break
    }
    if (pagesFetched >= MAX_PAGES) {
      stoppedBecause = "page-cap"
      break
    }
    await sleep(PAGE_DELAY_MS)
  }

  if (sections.length === 0 && stoppedBecause === "no-more") {
    stoppedBecause = "empty"
  }

  return {
    ok: true,
    sections,
    meta: { pagesFetched, stoppedBecause },
    fetchedAt: new Date().toISOString(),
    debugRaw: `PROBES: ${probes}\nRAW: ${rawHead}`
  }
}

/* ------------------------------------------------------------------ */
/* messaging                                                           */
/* ------------------------------------------------------------------ */

// TEMP POC debug: title markers (readable via accessibility from the tab title).
try {
  const mark = (t: string) => {
    if (!document.title.includes(t)) document.title = `${document.title} ${t}`
  }
  mark("|M+")
  window.addEventListener("message", async (ev: MessageEvent) => {
    if (ev.source !== window) return
    const data: any = ev.data
    if (data?.source === MSG_SOURCE && data?.type === REQ_TYPE) mark("M:req")
  })
  const cfg0 = getInnertubeCfg()
  mark(cfg0 ? "M:cfg" : "M:nocfg")
} catch {}

// Guard against double-loading (script tag + possible SW registration).
const w0 = window as any
if (!w0.__YT_HISTORY_POC_MAIN_LOADED__) {
  w0.__YT_HISTORY_POC_MAIN_LOADED__ = true

  window.addEventListener("message", async (ev: MessageEvent) => {
    if (ev.source !== window) return
    const data: any = ev.data
    if (data?.source !== MSG_SOURCE || data?.type !== REQ_TYPE) return

    let payload: FetchResult
    try {
      payload = await fetchHistory()
    } catch (e: any) {
      payload = {
        ok: false,
        sections: [],
        meta: {
          pagesFetched: 0,
          stoppedBecause: "error",
          error: `MAIN threw: ${String(e)} | ${e?.message ?? ""} | ${String(e?.stack ?? "").slice(0, 300)}`
        },
        fetchedAt: new Date().toISOString()
      }
    }
    window.postMessage(
      { source: MSG_SOURCE, type: RES_TYPE, id: data.id, payload },
      window.location.origin
    )
  })

  // Announce readiness so the isolated script knows it can request immediately.
  window.postMessage({ source: MSG_SOURCE, type: READY_TYPE }, window.location.origin)
}

export {}
