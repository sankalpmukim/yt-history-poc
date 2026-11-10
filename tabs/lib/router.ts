/**
 * Hash router query support: views are "#/route?param=value&…". The shell
 * keeps its plain route id; deep-linkable views (Ledger) read params to
 * arrive pre-filtered from charts and signal cards elsewhere.
 */

import { useEffect, useState } from "react"

export interface HashQuery {
  [key: string]: string
}

export function parseHashQuery(hash: string): HashQuery {
  const qIndex = hash.indexOf("?")
  if (qIndex < 0) return {}
  const out: HashQuery = {}
  for (const part of hash.slice(qIndex + 1).split("&")) {
    if (!part) continue
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const key = decodeURIComponent(part.slice(0, eq))
    const value = decodeURIComponent(part.slice(eq + 1))
    if (key) out[key] = value
  }
  return out
}

/** Reactive query params of the current hash; updates on hashchange. */
export function useHashQuery(): HashQuery {
  const [query, setQuery] = useState<HashQuery>(() => parseHashQuery(location.hash))
  useEffect(() => {
    const onHash = () => setQuery(parseHashQuery(location.hash))
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])
  return query
}

export interface LedgerFilters {
  /** exact yyyy-mm-dd */
  day?: string
  /** 0=Sun … 6=Sat */
  weekday?: number
  /** top-level or subcategory id */
  cat?: string
  from?: string
  to?: string
}

/** "#/ledger?day=2026-11-04&cat=deep" — a deep link that opens the Ledger pre-filtered. */
export function ledgerHref(filters: LedgerFilters): string {
  const params = new URLSearchParams()
  if (filters.day) params.set("day", filters.day)
  if (filters.weekday != null) params.set("weekday", String(filters.weekday))
  if (filters.cat) params.set("cat", filters.cat)
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  const qs = params.toString()
  return qs ? `#/ledger?${qs}` : "#/ledger"
}

/** Local weekday (0=Sun…6=Sat) of a yyyy-mm-dd key. */
export function weekdayOf(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay()
}
