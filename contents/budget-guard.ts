/**
 * On-YouTube budget enforcement (M8). Isolated-world content script.
 *
 * Modes (settings.budgetMode):
 *  - off    — no DOM changes
 *  - gentle — outline + "over budget" label on over-budget videos; a note on watch pages
 *  - strict — cover over-budget thumbnails & titles with a click-to-reveal
 *             slip; an interstitial on watch pages ("Go back" / "Watch anyway")
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
  const R = ROOT_CLASS
  // Ledger-slip materials on top of YouTube. YouTube's own theme setting (html[dark])
  // decides light or dark, not the OS. Red ink is kept out of the chrome so it
  // never competes with YouTube's brand red.
  s.textContent = `
@font-face { font-family: "YT Ledger Sans"; src: url("${chrome.runtime.getURL("assets/fonts/PublicSans-Variable.woff2")}") format("woff2"); font-weight: 100 900; font-display: swap; }
@font-face { font-family: "YT Ledger Serif"; src: url("${chrome.runtime.getURL("assets/fonts/SourceSerif4-Variable.woff2")}") format("woff2"); font-weight: 200 900; font-display: swap; }
.${R}-chip, .${R}-veil, .${R}-banner, .${R}-interstitial {
  --yl-paper: #eef1e2; --yl-ink: #1e2b45; --yl-pencil: #4f574a; --yl-rule: #c9d4b4; --yl-red: #b42318; --yl-on-ink: #f7f9ef;
  font-family: "YT Ledger Sans", Roboto, Arial, sans-serif; color: var(--yl-ink); -webkit-font-smoothing: antialiased;
}
html[dark] .${R}-chip, html[dark] .${R}-veil, html[dark] .${R}-banner, html[dark] .${R}-interstitial {
  --yl-paper: #1c2a23; --yl-ink: #e6ebda; --yl-pencil: #a3ad98; --yl-rule: #33463a; --yl-red: #f2937f; --yl-on-ink: #1c2a23;
}
.${R}-chip {
  position: absolute; z-index: 4; left: 8px; top: 8px; pointer-events: none;
  padding: 4px 8px; border-radius: 4px; background: var(--yl-paper); border: 1px solid var(--yl-ink);
  font-size: clamp(12px, 1.2vw, 14px); font-weight: 600; line-height: 1.3;
}
.${R}-gentle { outline: 2px solid #1e2b45; outline-offset: 2px; border-radius: 12px; }
html[dark] .${R}-gentle { outline-color: #e6ebda; }
.${R}-strict-blur { filter: blur(16px); user-select: none; }
.${R}-veil {
  all: unset; box-sizing: border-box; position: absolute; inset: 0; z-index: 3;
  display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px;
  padding: 12px 16px; border-radius: 12px; background: var(--yl-paper);
  border: 1px solid var(--yl-rule); cursor: pointer; text-align: left;
  font-family: "YT Ledger Sans", Roboto, Arial, sans-serif; color: var(--yl-ink);
  font-size: clamp(13px, 1.4vw, 16px); font-weight: 600; line-height: 1.35;
}
.${R}-veil:focus-visible { outline: 3px solid #2b4c9b; outline-offset: -3px; }
html[dark] .${R}-veil:focus-visible { outline-color: #9db3f0; }
.${R}-veil-copy { display: flex; flex-direction: column; gap: 4px; }
.${R}-veil-action { font-size: 13px; font-weight: 500; color: var(--yl-pencil); }
.${R}-veil:hover .${R}-veil-action { text-decoration: underline; text-underline-offset: 3px; }
/* a hover preview that started before the veil existed must not cover it */
html.${R}-veil-hover #video-preview { visibility: hidden !important; pointer-events: none !important; }
.${R}-banner, .${R}-interstitial {
  position: fixed; z-index: 2147483646; left: 50%; transform: translateX(-50%);
  background: var(--yl-paper); border: 1px solid var(--yl-rule); border-left: 3px double var(--yl-red);
  border-radius: 4px; box-shadow: 0 15px 35px rgba(0, 0, 0, .35);
  font-size: 14px; line-height: 1.5;
}
.${R}-banner { top: 72px; display: flex; align-items: center; gap: 16px; padding: 12px 12px 12px 16px; max-width: min(560px, calc(100vw - 32px)); }
.${R}-interstitial { top: 25%; width: min(440px, calc(100vw - 32px)); padding: 24px; }
.${R}-title { margin: 0 0 8px; font: 600 24px/1.2 "YT Ledger Serif", Georgia, serif; }
.${R}-text { margin: 0; }
.${R}-figure { font-family: "YT Ledger Serif", Georgia, serif; font-weight: 600; }
.${R}-actions { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
.${R}-banner button, .${R}-interstitial button {
  all: unset; box-sizing: border-box; display: inline-flex; align-items: center; min-height: 32px; padding: 6px 12px;
  border-radius: 4px; border: 1px solid var(--yl-ink); background: transparent; color: var(--yl-ink);
  font: 500 14px/1.2 "YT Ledger Sans", Roboto, Arial, sans-serif; cursor: pointer; white-space: nowrap;
}
.${R}-banner button { margin-left: auto; }
.${R}-banner button:hover, .${R}-interstitial button:hover { text-decoration: underline; text-underline-offset: 3px; }
.${R}-interstitial .${R}-primary { background: var(--yl-ink); color: var(--yl-on-ink); font-weight: 600; }
.${R}-banner button:focus-visible, .${R}-interstitial button:focus-visible { outline: 3px solid #2b4c9b; outline-offset: 2px; }
html[dark] .${R}-banner button:focus-visible, html[dark] .${R}-interstitial button:focus-visible { outline-color: #9db3f0; }
.${R}-thumbwrap { position: relative; }
`
  ;(document.head || document.documentElement).appendChild(s)
}

function stripAll(): void {
  for (const n of document.querySelectorAll("." + ROOT_CLASS)) n.remove()
  releasePlayer?.()
  for (const n of document.querySelectorAll("[data-yl-budget]")) {
    setLinksFocusable(n, true)
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

/** Covered links leave the tab order while a veil hides them, and come back after. */
function setLinksFocusable(card: Element, focusable: boolean): void {
  for (const link of card.querySelectorAll<HTMLElement>("a[href]")) {
    if (focusable) {
      if (!link.hasAttribute("data-yl-tabindex")) continue
      const original = link.getAttribute("data-yl-tabindex")
      if (original) link.setAttribute("tabindex", original)
      else link.removeAttribute("tabindex")
      link.removeAttribute("data-yl-tabindex")
    } else if (!link.hasAttribute("data-yl-tabindex")) {
      link.setAttribute("data-yl-tabindex", link.getAttribute("tabindex") ?? "")
      link.setAttribute("tabindex", "-1")
    }
  }
}

function unapplyCard(card: Element): void {
  setLinksFocusable(card, true)
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
  const label = chip(`${catName(categoryId)} over budget`)
  if (host) {
    const wrap = host as HTMLElement
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative"
    wrap.appendChild(label)
  } else {
    card.appendChild(label)
  }
}

function applyStrict(card: Element, videoId: string, categoryId: string): void {
  const host = thumbnailHost(card)
  const title =
    (card.querySelector("#video-title") as HTMLElement | null) ||
    (card.querySelector("h3") as HTMLElement | null)
  const veilHost = (host || card) as HTMLElement
  if (getComputedStyle(veilHost).position === "static") veilHost.style.position = "relative"

  // Blur the thumbnail media, not its host. Applying filter to the host also
  // blurs every descendant, including the placeholder veil (the M8-012 bug).
  // Prefer image/video nodes; for YouTube's newer wrappers, blur their direct
  // visual children as a fallback while keeping the veil itself crisp.
  const mediaRoot = host || card
  const media = Array.from(mediaRoot.querySelectorAll<HTMLElement>(
    "img, video, canvas, [id='img'], .ytCoreImageHost"
  ))
  const targets = media.length
    ? media
    : Array.from(mediaRoot.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.classList.contains(`${ROOT_CLASS}-veil`)
      )
  for (const target of targets) target.classList.add(`${ROOT_CLASS}-strict-blur`)

  const veil = document.createElement("button")
  veil.type = "button"
  veil.className = `${ROOT_CLASS} ${ROOT_CLASS}-veil`
  const copy = document.createElement("span")
  copy.className = `${ROOT_CLASS}-veil-copy`
  const categoryLine = document.createElement("span")
  categoryLine.textContent = `Hidden because ${catName(categoryId)} is over budget`
  const actionLine = document.createElement("span")
  actionLine.className = `${ROOT_CLASS}-veil-action`
  actionLine.textContent = "Click to reveal"
  copy.append(categoryLine, actionLine)
  veil.appendChild(copy)
  veil.addEventListener("click", (e) => {
    e.preventDefault()
    e.stopPropagation()
    state.revealed.add(videoId)
    unapplyCard(card)
  })
  veil.addEventListener("keydown", (e) => e.stopPropagation())
  setLinksFocusable(card, false)
  veilHost.appendChild(veil)
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
  releasePlayer?.()
}

/* Strict interstitial: the video must not play (with sound) behind the gate. */
let releasePlayer: (() => void) | null = null

function mainPlayerVideos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll<HTMLVideoElement>("#movie_player video"))
}

/** Keep the main player paused while the interstitial is up (YouTube autoplays). */
function holdPlayer(): void {
  if (releasePlayer) return
  const onPlay = (e: Event) => {
    if (!document.getElementById("yl-budget-watch-ui")) {
      releasePlayer?.()
      return
    }
    const v = e.target
    if (v instanceof HTMLVideoElement && v.closest("#movie_player")) v.pause()
  }
  // "play" doesn't bubble, but it does go through the capture phase
  document.addEventListener("play", onPlay, true)
  releasePlayer = () => {
    document.removeEventListener("play", onPlay, true)
    releasePlayer = null
  }
  for (const v of mainPlayerVideos()) v.pause()
}

function overText(categoryId: string): HTMLElement {
  const p = document.createElement("p")
  p.className = `${ROOT_CLASS}-text`
  const figure = document.createElement("span")
  figure.className = `${ROOT_CLASS}-figure`
  figure.textContent = `${overageMinutes(categoryId)} min`
  const name = document.createElement("b")
  name.textContent = catName(categoryId)
  p.append("You’re ", figure, " over budget in ", name, " this week.")
  return p
}

function watchButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.textContent = label
  if (primary) btn.className = `${ROOT_CLASS}-primary`
  btn.addEventListener("click", onClick)
  return btn
}

function showWatchUi(videoId: string, categoryId: string): void {
  if (document.hidden) return
  if (state.watchDismissed.has(videoId)) return
  if (document.getElementById("yl-budget-watch-ui")) return
  const wrap = document.createElement("div")
  wrap.id = "yl-budget-watch-ui"
  wrap.className = ROOT_CLASS
  // Keep YouTube's single-key shortcuts from firing while focus is in our UI.
  wrap.addEventListener("keydown", (e) => {
    e.stopPropagation()
    if (e.key === "Escape") dismiss()
  })
  const dismiss = () => {
    state.watchDismissed.add(videoId)
    wrap.remove()
    if (releasePlayer) {
      releasePlayer()
      // "Watch anyway" picks up where autoplay would have
      for (const v of mainPlayerVideos()) void v.play().catch(() => {})
    }
  }
  if (state.mode === "gentle") {
    wrap.classList.add(ROOT_CLASS + "-banner")
    wrap.setAttribute("role", "status")
    // Mount the live region first, then fill it, so screen readers announce it.
    document.documentElement.appendChild(wrap)
    setTimeout(() => wrap.append(overText(categoryId), watchButton("Dismiss", dismiss)), 50)
    return
  }
  wrap.classList.add(ROOT_CLASS + "-interstitial")
  wrap.setAttribute("role", "alertdialog")
  wrap.setAttribute("aria-modal", "true")
  wrap.setAttribute("aria-labelledby", "yl-budget-watch-title")
  wrap.setAttribute("aria-describedby", "yl-budget-watch-text")
  const title = document.createElement("h2")
  title.id = "yl-budget-watch-title"
  title.className = `${ROOT_CLASS}-title`
  title.textContent = "Over budget"
  const text = overText(categoryId)
  text.id = "yl-budget-watch-text"
  const actions = document.createElement("div")
  actions.className = `${ROOT_CLASS}-actions`
  const back = watchButton("Go back", () => {
    if (history.length > 1) history.back()
    else location.assign("https://www.youtube.com/")
  }, true)
  actions.append(back, watchButton("Watch anyway", dismiss))
  wrap.append(title, text, actions)
  document.documentElement.appendChild(wrap)
  holdPlayer()
  back.focus()
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
      syncPreviewCover()
      return
    }
    ensureStyle()
    scanFeed()
    scanWatch()
    // veils come and go under a resting pointer
    syncPreviewCover()
  } catch (e) {
    failOpen(e)
  }
}

/* ------------------------------------------------------------------ */
/* hover previews                                                      */
/* ------------------------------------------------------------------ */

const HOVER_EVENTS = ["mouseover", "mouseenter", "mousemove", "pointerover", "pointerenter", "pointermove"]
const VEIL_HOVER_CLASS = `${ROOT_CLASS}-veil-hover`
let hoverGuardInstalled = false
let pointer: { x: number; y: number } | null = null
let pointerFrame: number | null = null

function veilUnder(x: number, y: number): boolean {
  for (const veil of document.querySelectorAll(`.${ROOT_CLASS}-veil`)) {
    const r = veil.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

/** A preview that started under a resting pointer, before its card was veiled. */
function previewOverVeil(): boolean {
  const player = document.querySelector("#video-preview video")
  if (!player) return false
  const r = player.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && veilUnder(r.left + r.width / 2, r.top + r.height / 2)
}

/**
 * Hide (and pause) YouTube's inline preview while it would sit on a veil.
 * Geometry, not hit-testing: once the preview covers the veil it is the
 * element under the pointer.
 */
function syncPreviewCover(): void {
  const covered =
    state.mode === "strict" &&
    ((pointer != null && veilUnder(pointer.x, pointer.y)) || previewOverVeil())
  const root = document.documentElement
  if (root.classList.contains(VEIL_HOVER_CLASS) === covered) return
  root.classList.toggle(VEIL_HOVER_CLASS, covered)
  if (covered) {
    try {
      document.querySelector<HTMLVideoElement>("#video-preview video")?.pause()
    } catch {}
  }
}

/**
 * YouTube starts an inline preview (#video-preview) when the pointer rests
 * on a thumbnail. Over a Strict veil that plays the hidden video on top of
 * the veil and swallows its "Click to reveal" click. Stop hover events over
 * a veil before they reach YouTube's listeners (clicks are untouched), and
 * keep any preview that started before the veil appeared off it.
 */
function installHoverPreviewGuard(): void {
  if (hoverGuardInstalled) return
  hoverGuardInstalled = true
  const guard = (e: Event) => {
    try {
      const m = e as MouseEvent
      pointer = { x: m.clientX, y: m.clientY }
      if (pointerFrame == null) {
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = null
          syncPreviewCover()
        })
      }
      if (state.mode === "strict" && veilUnder(m.clientX, m.clientY)) e.stopImmediatePropagation()
    } catch {}
  }
  for (const type of HOVER_EVENTS) window.addEventListener(type, guard, { capture: true })
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
    if (state.mode === "strict") installHoverPreviewGuard()
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
