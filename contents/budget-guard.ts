/**
 * On-YouTube budget enforcement (M8). Isolated-world content script.
 *
 * Modes (settings.budgetMode):
 *  - off    — no DOM changes
 *  - gentle — red border + chip on over-budget videos; banner on watch pages
 *  - strict — blur/hide over-budget thumbnails & titles with a reveal-once
 *             placeholder; dismissible interstitial on watch pages
 *
 * Fail-open: unknown videos, missing snapshot, thrown errors → page as-is.
 * All injected UI uses class `yl-budget-guard` so it can be stripped in one go.
 */

import type { PlasmoCSConfig } from "plasmo"
import type { Category, Rule, Settings, Subcategory, VideoRecord } from "../core/types"
import { KEYS } from "../core/types"
import { defaultSettings } from "../core/defaults"
import { compileRules } from "../core/rules"
import type { CompiledRule } from "../core/rules"
import { classifyForBudget, isTargetOverBudget } from "../core/classify"
import { validTargetIds, topLevelCategoryId } from "../core/taxonomy"
import { parseDurationText } from "../core/duration"
import type { BudgetStatus } from "../core/budget"
import { overBudgetCategories } from "../core/budget"

export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  run_at: "document_idle"
}

const ROOT_CLASS = "yl-budget-guard"
const STYLE_ID = "yl-budget-guard-style"
const SCAN_DEBOUNCE_MS = 200
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

const CARD_SELECTORS = [
  "ytd-rich-item-renderer",
  "ytd-video-renderer",
  "ytd-compact-video-renderer",
  "ytd-grid-video-renderer",
  "ytd-reel-item-renderer",
  "ytd-reel-video-renderer",
  "ytd-movie-renderer",
  "ytd-rich-grid-media",
  "ytd-lockup-view-model",
  "yt-lockup-view-model",
  "ytd-shorts-lockup-view-model-v2",
  "ytm-shorts-lockup-view-model-v2"
].join(",")

interface GuardState {
  mode: Settings["budgetMode"]
  videos: Record<string, VideoRecord>
  compiled: CompiledRule[]
  categories: Category[]
  subcategories: Subcategory[]
  categoryById: Map<string, Category>
  over: Set<string>
  overDelta: Map<string, number>
  /** videoId → last classification */
  cache: Map<string, string | null>
  revealed: Set<string>
  watchDismissed: Set<string>
}

const state: GuardState = {
  mode: "off",
  videos: {},
  compiled: [],
  categories: [],
  subcategories: [],
  categoryById: new Map(),
  over: new Set(),
  overDelta: new Map(),
  cache: new Map(),
  revealed: new Set(),
  watchDismissed: new Set()
}

let scanTimer: ReturnType<typeof setTimeout> | null = null
let observer: MutationObserver | null = null

function failOpen(err: unknown): void {
  try {
    console.warn("[yt-ledger] budget-guard fail-open:", err)
  } catch {}
  try {
    stripAll()
  } catch {}
}

/* ------------------------------------------------------------------ */
/* storage snapshot                                                    */
/* ------------------------------------------------------------------ */

async function loadState(): Promise<void> {
  const bag = (await chrome.storage.local.get([
    KEYS.meta,
    KEYS.videos,
    KEYS.rules,
    KEYS.categories,
    KEYS.subcategories,
    KEYS.budgetStatus
  ])) as Record<string, unknown>
  const settings = ((bag[KEYS.meta] as { settings?: Settings } | undefined)?.settings ??
    defaultSettings()) as Settings
  state.mode = settings.budgetMode ?? "off"
  state.videos = (bag[KEYS.videos] as Record<string, VideoRecord>) ?? {}
  const categories = Array.isArray(bag[KEYS.categories])
    ? (bag[KEYS.categories] as Category[])
    : []
  const subcategories = Array.isArray(bag[KEYS.subcategories])
    ? (bag[KEYS.subcategories] as Subcategory[])
    : []
  state.categories = categories
  state.subcategories = subcategories
  state.categoryById = new Map(categories.map((c) => [c.id, c]))
  const rules = Array.isArray(bag[KEYS.rules]) ? (bag[KEYS.rules] as Rule[]) : []
  state.compiled = compileRules(rules, validTargetIds(categories, subcategories))
  const status = bag[KEYS.budgetStatus] as BudgetStatus | undefined
  state.over = overBudgetCategories(status)
  state.overDelta = new Map((status?.entries ?? []).map((e) => [e.categoryId, e.deltaSec]))
  state.cache.clear()
}

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

function videoIdFromHref(href: string | null): string | null {
  if (!href) return null
  try {
    const u = new URL(href, location.origin)
    const v = u.searchParams.get("v")
    if (v && VIDEO_ID_RE.test(v)) return v
    const shorts = u.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)
    if (shorts) return shorts[1]
    const embed = u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})/)
    if (embed) return embed[1]
  } catch {}
  return null
}

function currentWatchId(): string | null {
  return (
    videoIdFromHref(location.href) ??
    location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1] ??
    null
  )
}

function findVideoId(el: Element): string | null {
  const attr =
    el.getAttribute("data-video-id") ||
    el.getAttribute("data-content-id") ||
    el.getAttribute("video-id")
  if (attr && VIDEO_ID_RE.test(attr)) return attr
  const links = el.querySelectorAll("a[href]")
  for (const a of links) {
    const id = videoIdFromHref(a.getAttribute("href"))
    if (id) return id
  }
  return null
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim()
}

function extractTitle(el: Element): string {
  return (
    textOf(el.querySelector("#video-title")) ||
    textOf(el.querySelector("#video-title-link")) ||
    textOf(el.querySelector("a#video-title")) ||
    textOf(el.querySelector("h3 a")) ||
    textOf(el.querySelector(".yt-lockup-metadata-view-model-wiz__title")) ||
    textOf(el.querySelector(".yt-lockup-metadata-view-model__title")) ||
    ""
  )
}

function extractChannel(el: Element): string {
  return (
    textOf(el.querySelector("ytd-channel-name a")) ||
    textOf(el.querySelector("#channel-name a")) ||
    textOf(el.querySelector("#channel-name")) ||
    textOf(el.querySelector(".yt-lockup-metadata-view-model-wiz__byline")) ||
    textOf(el.querySelector(".yt-content-metadata-view-model__metadata-row")) ||
    ""
  )
}

function extractDuration(el: Element): number | null {
  const badge =
    el.querySelector("ytd-thumbnail-overlay-time-status-renderer") ||
    el.querySelector("badge-shape") ||
    el.querySelector(".ytp-time-duration")
  return parseDurationText(textOf(badge))
}

function extractIsShort(el: Element, videoId: string, durationSec: number | null): boolean | null {
  if (el.querySelector("a[href*='/shorts/']")) return true
  if (location.pathname.startsWith("/shorts")) return true
  if (durationSec != null && durationSec <= 60) return true
  if (durationSec != null && durationSec > 180) return false
  const stored = state.videos[videoId]
  return stored?.isShort ?? null
}

function classifyCard(el: Element, videoId: string): string | null {
  if (state.cache.has(videoId)) return state.cache.get(videoId) ?? null
  const durationSec = extractDuration(el)
  const cat = classifyForBudget(
    {
      stored: state.videos[videoId],
      title: extractTitle(el),
      channel: extractChannel(el),
      durationSec,
      isShort: extractIsShort(el, videoId, durationSec)
    },
    state.compiled
  )
  state.cache.set(videoId, cat)
  return cat
}

function catName(id: string): string {
  const top = topLevelCategoryId(id, state.categories, state.subcategories) ?? id
  return state.categoryById.get(top)?.name ?? top
}

function overageMinutes(id: string): number {
  const top = topLevelCategoryId(id, state.categories, state.subcategories) ?? id
  const delta = state.overDelta.get(top) ?? 0
  return Math.max(1, Math.round(delta / 60))
}

/* ------------------------------------------------------------------ */
/* inject / strip                                                      */
/* ------------------------------------------------------------------ */

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement("style")
  s.id = STYLE_ID
  s.textContent = `
.${ROOT_CLASS}-chip {
  position: absolute; z-index: 4; left: 6px; top: 6px;
  background: #7f1d1d; color: #fecaca; font: 11px/1.2 Roboto, Arial, sans-serif;
  padding: 3px 7px; border-radius: 999px; pointer-events: none;
  box-shadow: 0 1px 4px rgba(0,0,0,.45);
}
.${ROOT_CLASS}-gentle { outline: 2px solid #e11d48; outline-offset: -2px; border-radius: 8px; }
.${ROOT_CLASS}-strict-blur { filter: blur(14px); user-select: none; }
.${ROOT_CLASS}-veil {
  position: absolute; inset: 0; z-index: 3; display: flex; align-items: center;
  justify-content: center; text-align: center; padding: 10px;
  background: rgba(15,15,15,.72); color: #f1f1f1; font: 12px/1.4 Roboto, Arial, sans-serif;
  cursor: pointer; border-radius: 8px;
}
.${ROOT_CLASS}-banner, .${ROOT_CLASS}-interstitial {
  position: fixed; z-index: 2147483646; left: 50%; transform: translateX(-50%);
  background: #1c1012; color: #f1f1f1; border: 1px solid #7f1d1d;
  border-radius: 12px; padding: 12px 16px; font: 13px/1.5 Roboto, Arial, sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); max-width: 480px;
}
.${ROOT_CLASS}-banner { top: 64px; }
.${ROOT_CLASS}-interstitial {
  top: 30%; width: min(440px, 90vw);
}
.${ROOT_CLASS}-interstitial button, .${ROOT_CLASS}-banner button {
  margin-top: 8px; margin-right: 8px; background: #3d1418; color: #fecaca;
  border: 1px solid #7f1d1d; border-radius: 8px; padding: 6px 12px; cursor: pointer;
}
.${ROOT_CLASS}-thumbwrap { position: relative; }
`
  ;(document.head || document.documentElement).appendChild(s)
}

function stripAll(): void {
  for (const n of document.querySelectorAll("." + ROOT_CLASS)) n.remove()
  for (const n of document.querySelectorAll("[data-yl-budget]")) {
    n.removeAttribute("data-yl-budget")
    n.classList.remove(ROOT_CLASS + "-gentle")
  }
}

function chip(text: string): HTMLElement {
  const el = document.createElement("div")
  el.className = `${ROOT_CLASS} ${ROOT_CLASS}-chip`
  el.textContent = text
  return el
}

function thumbnailHost(card: Element): HTMLElement | null {
  return (
    (card.querySelector("ytd-thumbnail") as HTMLElement | null) ||
    (card.querySelector("#thumbnail") as HTMLElement | null) ||
    (card.querySelector("a.yt-lockup-view-model-wiz__content-image") as HTMLElement | null) ||
    (card.querySelector("a[href*='/watch']") as HTMLElement | null)
  )
}

function unapplyCard(card: Element): void {
  card.removeAttribute("data-yl-budget")
  card.classList.remove(ROOT_CLASS + "-gentle")
  for (const n of card.querySelectorAll("." + ROOT_CLASS)) n.remove()
  for (const n of card.querySelectorAll("." + ROOT_CLASS + "-strict-blur")) {
    n.classList.remove(ROOT_CLASS + "-strict-blur")
  }
}

function applyGentle(card: Element, categoryId: string): void {
  card.classList.add(ROOT_CLASS + "-gentle")
  const host = thumbnailHost(card)
  if (host) {
    const wrap = host as HTMLElement
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative"
    wrap.appendChild(chip(`over budget · ${catName(categoryId)}`))
  } else {
    card.appendChild(chip(`over budget · ${catName(categoryId)}`))
  }
}

function applyStrict(card: Element, videoId: string, categoryId: string): void {
  const host = thumbnailHost(card)
  const title =
    (card.querySelector("#video-title") as HTMLElement | null) ||
    (card.querySelector("h3") as HTMLElement | null)
  if (host) {
    if (getComputedStyle(host).position === "static") host.style.position = "relative"
    host.classList.add(ROOT_CLASS + "-strict-blur")
    const veil = document.createElement("div")
    veil.className = `${ROOT_CLASS} ${ROOT_CLASS}-veil`
    veil.textContent = `hidden — ${catName(categoryId)} over budget (click to reveal)`
    veil.addEventListener("click", (e) => {
      e.preventDefault()
      e.stopPropagation()
      state.revealed.add(videoId)
      unapplyCard(card)
    })
    host.appendChild(veil)
  }
  if (title) title.classList.add(ROOT_CLASS + "-strict-blur")
}

function applyCard(card: Element): void {
  const videoId = findVideoId(card)
  if (!videoId) {
    if (card.hasAttribute("data-yl-budget")) unapplyCard(card)
    return
  }
  if (state.revealed.has(videoId)) {
    unapplyCard(card)
    return
  }
  const cat = classifyCard(card, videoId)
  const over = isTargetOverBudget(cat, state.over, state.categories, state.subcategories)
  const prev = card.getAttribute("data-yl-budget")
  if (!over) {
    if (prev) unapplyCard(card)
    return
  }
  if (prev === `${state.mode}:${videoId}:${cat}`) return
  unapplyCard(card)
  card.setAttribute("data-yl-budget", `${state.mode}:${videoId}:${cat}`)
  if (state.mode === "gentle") applyGentle(card, cat!)
  else if (state.mode === "strict") applyStrict(card, videoId, cat!)
}

function scanFeed(): void {
  const cards = document.querySelectorAll(CARD_SELECTORS)
  for (const card of cards) applyCard(card)
}

function removeWatchUi(): void {
  document.getElementById("yl-budget-watch-ui")?.remove()
}

function showWatchUi(videoId: string, categoryId: string): void {
  if (document.hidden) return
  if (state.watchDismissed.has(videoId)) return
  if (document.getElementById("yl-budget-watch-ui")) return
  const wrap = document.createElement("div")
  wrap.id = "yl-budget-watch-ui"
  wrap.className = ROOT_CLASS
  const n = overageMinutes(categoryId)
  if (state.mode === "gentle") {
    wrap.classList.add(ROOT_CLASS + "-banner")
    wrap.innerHTML = `<div>You're ${n} min over budget in <b>${catName(categoryId)}</b> this week.</div>`
    const btn = document.createElement("button")
    btn.textContent = "Dismiss"
    btn.onclick = () => {
      state.watchDismissed.add(videoId)
      wrap.remove()
    }
    wrap.appendChild(btn)
  } else {
    wrap.classList.add(ROOT_CLASS + "-interstitial")
    wrap.innerHTML = `<div><b>Over budget</b><p>You're ${n} min over budget in <b>${catName(categoryId)}</b> this week.</p></div>`
    const btn = document.createElement("button")
    btn.textContent = "Watch anyway"
    btn.onclick = () => {
      state.watchDismissed.add(videoId)
      wrap.remove()
    }
    wrap.appendChild(btn)
  }
  document.documentElement.appendChild(wrap)
}

function scanWatch(): void {
  const id = currentWatchId()
  if (!id) {
    removeWatchUi()
    return
  }
  const durationSec = parseDurationText(textOf(document.querySelector(".ytp-time-duration")))
  const title =
    textOf(document.querySelector("h1.ytd-watch-metadata yt-formatted-string")) ||
    textOf(document.querySelector("h1.ytd-watch-metadata")) ||
    textOf(document.querySelector("#title h1"))
  const channel =
    textOf(document.querySelector("ytd-video-owner-renderer #channel-name a")) ||
    textOf(document.querySelector("ytd-channel-name a"))
  const cat = classifyForBudget(
    {
      stored: state.videos[id],
      title,
      channel,
      durationSec,
      isShort: location.pathname.startsWith("/shorts") ? true : extractIsShort(document.body, id, durationSec)
    },
    state.compiled
  )
  state.cache.set(id, cat)
  if (isTargetOverBudget(cat, state.over, state.categories, state.subcategories) && cat)
    showWatchUi(id, cat)
  else removeWatchUi()
}

function scan(): void {
  try {
    if (state.mode === "off" || state.over.size === 0) {
      stripAll()
      removeWatchUi()
      return
    }
    ensureStyle()
    scanFeed()
    scanWatch()
  } catch (e) {
    failOpen(e)
  }
}

function scheduleScan(): void {
  if (scanTimer != null) clearTimeout(scanTimer)
  scanTimer = setTimeout(() => scan(), SCAN_DEBOUNCE_MS)
}

function startObserver(): void {
  if (observer) return
  try {
    observer = new MutationObserver(() => scheduleScan())
    observer.observe(document.documentElement, { childList: true, subtree: true })
  } catch (e) {
    failOpen(e)
  }
}

function stopObserver(): void {
  observer?.disconnect()
  observer = null
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot(): Promise<void> {
  try {
    await loadState()
    if (state.mode === "off") {
      stripAll()
      stopObserver()
      return
    }
    startObserver()
    scan()
  } catch (e) {
    failOpen(e)
  }
}

try {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return
    const keys = Object.keys(changes)
    if (
      keys.some(
        (k) =>
          k === KEYS.meta ||
          k === KEYS.videos ||
          k === KEYS.rules ||
          k === KEYS.categories ||
          k === KEYS.subcategories ||
          k === KEYS.budgetStatus
      )
    ) {
      void boot()
    }
  })
} catch {}

window.addEventListener("yt-navigate-finish", () => scheduleScan())

void boot()

export {}
