/**
 * MAIN-world content script (YT Ledger).
 *
 * Two data sources, both "read what the page itself fetched":
 *  1. window.ytInitialData on /feed/history (the server-rendered first page)
 *  2. a READ-ONLY fetch observer that captures the page's own
 *     /youtubei/v1/browse continuation responses as the user scrolls through
 *     history — this is what makes a lookback deeper than the first page
 *     possible without making any new authenticated requests ourselves.
 *
 * Additionally attempts the direct innertube browse POST on non-history pages
 * (known to come back logged_in:0 in Brave; kept because it may work in other
 * Chromium builds).
 *
 * Communication with the isolated-world sync script: window.postMessage.
 */

import type { PlasmoCSConfig } from "plasmo"
import type {
  FetchResult,
  HistoryItem,
  HistorySection
} from "../utils/history-types"
import { dayLabelToDate, startOfDay } from "../utils/day"
import { parseDurationText } from "../core/duration"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  world: "MAIN",
  run_at: "document_idle"
}

const MSG_SOURCE = "yt-ledger"
const REQ_TYPE = "YT_LEDGER_FETCH_REQUEST"
const RES_TYPE = "YT_LEDGER_FETCH_RESPONSE"
const READY_TYPE = "YT_LEDGER_MAIN_READY"

const DEFAULT_DAYS_BACK = 14
const MAX_PAGES = 30
const PAGE_DELAY_MS = 200
const MAX_OBSERVED_ITEMS = 4000

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
    const cfg = (window as any).ytcfg?.data_
    const apiKey: string | undefined = cfg?.INNERTUBE_API_KEY
    const context = cfg?.INNERTUBE_CONTEXT
    if (apiKey && context) return { apiKey, context }
  } catch {}
  return null
}

function clampDaysBack(v: any): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10)
  if (!Number.isFinite(n)) return DEFAULT_DAYS_BACK
  return Math.min(90, Math.max(1, Math.round(n)))
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

/** Duration badge on the thumbnail overlay: "12:34" → 754s. */
function parseDurationFromOverlay(container: any): { sec: number; source: "overlay" } | null {
  const badge = collect(container, "thumbnailOverlayTimeStatusRenderer")[0]
  const sec = parseDurationText(textOf(badge?.text))
  return sec != null ? { sec, source: "overlay" } : null
}

function parseItem(node: any): HistoryItem | null {
  // Classic desktop shape
  const vr = node?.videoRenderer
  if (vr?.videoId) {
    const legacy = parseDurationText(textOf(vr.lengthText))
    return {
      videoId: vr.videoId,
      title: textOf(vr.title),
      channel:
        textOf(vr.ownerText) ||
        textOf(vr.longBylineText) ||
        textOf(vr.shortBylineText),
      url: `https://www.youtube.com/watch?v=${vr.videoId}`,
      watchState: parseWatchState(vr.thumbnailOverlays),
      durationSec: legacy,
      durationSource: legacy != null ? "legacy" : null
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
    const overlay = parseDurationFromOverlay(lock.contentImage ?? lock)
    return {
      videoId: lock.contentId,
      title: meta?.title?.content ?? "",
      channel: parts.find((p) => !/^(watched|[\d.,]+[KM]?)$/i.test(p)) ?? "",
      url: `https://www.youtube.com/watch?v=${lock.contentId}`,
      watchState: parseWatchState(lock),
      durationSec: overlay?.sec ?? null,
      durationSource: overlay ? overlay.source : null
    }
  }

  // Mobile-web shape seen in some experiments
  const vw = node?.videoWithContextRenderer
  if (vw?.videoId) {
    const legacy = parseDurationText(textOf(vw.lengthText))
    return {
      videoId: vw.videoId,
      title: textOf(vw.headline) || textOf(vw.title),
      channel: textOf(vw.shortBylineText) || textOf(vw.shortViewCountText),
      url: `https://www.youtube.com/watch?v=${vw.videoId}`,
      watchState: "",
      durationSec: legacy,
      durationSource: legacy != null ? "legacy" : null
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
/* day window                                                          */
/* ------------------------------------------------------------------ */

/** start of the oldest day still inside the lookback window */
function cutoffOf(now: Date, daysBack: number): Date {
  const cutoff = startOfDay(now)
  cutoff.setDate(cutoff.getDate() - (daysBack - 1))
  return cutoff
}

/**
 * Parse history sections from a browse/ytInitialData-shaped object, keeping
 * only sections inside the lookback window. `hitOlder` is the pagination
 * stop signal (a section older than the window was seen).
 */
function parseSectionsFromResponse(
  scope: any,
  now: Date,
  daysBack: number
): { sections: HistorySection[]; hitOlder: boolean } {
  const cutoff = cutoffOf(now, daysBack)
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

/* ------------------------------------------------------------------ */
/* observed sections (the page's own continuation fetches)             */
/* ------------------------------------------------------------------ */

/**
 * dayLabel -> section. Filled by the fetch observer below. YouTube's
 * continuations are disjoint chunks, but we still guard against re-delivery
 * of already-seen occurrences (per videoId counts) so repeats are never
 * double-counted.
 */
const observed = new Map<string, HistorySection>()
let observedItems = 0
let observedCappedLogged = false

/**
 * Given an existing (newer, authoritative) item list and an incoming list for
 * the same day, return only incoming items that represent watches not already
 * counted. If the incoming snapshot for a videoId holds FEWER occurrences
 * than we already have, it is an older snapshot → skip that videoId.
 */
function newOccurrences(existing: HistoryItem[], incoming: HistoryItem[]): HistoryItem[] {
  const existingCount = new Map<string, number>()
  for (const it of existing) existingCount.set(it.videoId, (existingCount.get(it.videoId) ?? 0) + 1)
  const incomingCount = new Map<string, number>()
  for (const it of incoming) incomingCount.set(it.videoId, (incomingCount.get(it.videoId) ?? 0) + 1)
  const seenIncoming = new Map<string, number>()
  const out: HistoryItem[] = []
  for (const it of incoming) {
    const n = seenIncoming.get(it.videoId) ?? 0
    seenIncoming.set(it.videoId, n + 1)
    if ((incomingCount.get(it.videoId) ?? 0) < (existingCount.get(it.videoId) ?? 0)) continue
    if (n >= (existingCount.get(it.videoId) ?? 0)) out.push(it)
  }
  return out
}

function recordObservedSections(scope: any, now: Date): void {
  if (observedItems >= MAX_OBSERVED_ITEMS) {
    if (!observedCappedLogged) {
      observedCappedLogged = true
      console.info(`[yt-ledger] observed-section cap (${MAX_OBSERVED_ITEMS}) reached; ignoring further continuations`)
    }
    return
  }
  for (const raw of collect(scope, "itemSectionRenderer")) {
    const sec = parseSection(raw)
    if (!sec) continue
    const d = dayLabelToDate(sec.dayLabel, now)
    if (!d) continue
    const prev = observed.get(sec.dayLabel)
    if (!prev) {
      observed.set(sec.dayLabel, sec)
      observedItems += sec.items.length
    } else {
      const fresh = newOccurrences(prev.items, sec.items)
      prev.items.push(...fresh)
      observedItems += fresh.length
    }
  }
}

function installFetchObserver(): void {
  try {
    const origFetch = window.fetch.bind(window)
    ;(window as any).fetch = async function (input: any, init?: any) {
      const res = await origFetch(input, init)
      try {
        const url = typeof input === "string" ? input : String(input?.url ?? "")
        if (url.includes("/youtubei/v1/browse")) {
          res
            .clone()
            .json()
            .then((j: any) => {
              try {
                recordObservedSections(scopeHistoryContainer(j), new Date())
              } catch {}
            })
            .catch(() => {})
        }
      } catch {}
      return res
    }
  } catch (e) {
    console.warn("[yt-ledger] fetch observer install failed:", e)
  }
}

function combineSections(base: HistorySection[], extra: HistorySection[]): HistorySection[] {
  const out: HistorySection[] = base.map((s) => ({ dayLabel: s.dayLabel, items: [...s.items] }))
  for (const ex of extra) {
    const existing = out.find((s) => s.dayLabel === ex.dayLabel)
    if (!existing) {
      out.push({ dayLabel: ex.dayLabel, items: [...ex.items] })
    } else {
      existing.items.push(...newOccurrences(existing.items, ex.items))
    }
  }
  return out
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

async function fetchHistory(daysBack: number): Promise<FetchResult> {
  // ytcfg can appear slightly after document_idle on slow loads.
  let cfg = getInnertubeCfg()
  for (let i = 0; i < 10 && !cfg; i++) {
    await sleep(500)
    cfg = getInnertubeCfg()
  }

  const now = new Date()

  // Preferred path: on /feed/history the page already fetched (fully
  // authenticated) the first page into window.ytInitialData; deeper history
  // arrives via the page's own continuation fetches, captured by the observer.
  if (location.pathname.startsWith("/feed/history")) {
    const initial: any = (window as any).ytInitialData
    if (initial) {
      const cutoff = cutoffOf(now, daysBack)
      const initialSections = parseSectionsFromResponse(initial, now, daysBack).sections
      const observedSections = [...observed.values()].filter((s) => {
        const d = dayLabelToDate(s.dayLabel, now)
        return d != null && d.getTime() >= cutoff.getTime()
      })
      const combined = combineSections(initialSections, observedSections)
      return {
        ok: true,
        sections: combined,
        meta: {
          pagesFetched: 0,
          stoppedBecause: combined.length ? "cutoff" : "empty"
        },
        fetchedAt: new Date().toISOString()
      }
    }
    return errorResult("on /feed/history but ytInitialData missing")
  }

  if (!cfg) {
    return errorResult(
      "not on /feed/history and ytcfg/INNERTUBE_CONTEXT unavailable (direct browse would be unauthenticated)"
    )
  }

  const sections: HistorySection[] = []
  const seen = new Set<string>()
  let pagesFetched = 0
  let token: string | null = null
  let stoppedBecause: FetchResult["meta"]["stoppedBecause"] = "no-more"

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

    const scope = scopeHistoryContainer(json)
    let hitOlder = false
    {
      const parsed = parseSectionsFromResponse(scope, now, daysBack)
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
    fetchedAt: new Date().toISOString()
  }
}

/* ------------------------------------------------------------------ */
/* messaging                                                           */
/* ------------------------------------------------------------------ */

// Guard against double-loading (script tag + possible SW registration).
const w0 = window as any
if (!w0.__YT_LEDGER_MAIN_LOADED__) {
  w0.__YT_LEDGER_MAIN_LOADED__ = true

  installFetchObserver()
  console.info("[yt-ledger] MAIN-world fetcher+observer loaded")

  window.addEventListener("message", async (ev: MessageEvent) => {
    if (ev.source !== window) return
    const data: any = ev.data
    if (data?.source !== MSG_SOURCE || data?.type !== REQ_TYPE) return

    let payload: FetchResult
    try {
      payload = await fetchHistory(clampDaysBack(data.daysBack))
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
