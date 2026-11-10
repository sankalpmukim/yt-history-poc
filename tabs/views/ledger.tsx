/** Ledger: every watch, grouped by day, with inline and bulk categorization.
 *  Also the drill-down target for every chart elsewhere: opens pre-filtered
 *  via hash params (#/ledger?day=…&cat=…&weekday=…&from=…&to=…). */

import { useEffect, useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, type LedgerRow } from "../../core/aggregate"
import { setVideoCategory, bulkAssign, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import type { Category, Subcategory } from "../../core/types"
import { ledgerHref, useHashQuery, weekdayOf } from "../lib/router"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  fmtDur,
  fmtDate,
  plural,
  rangeFromDate,
  channelRuleTarget
} from "../lib/ui"

const sumSeconds = (rows: LedgerRow[]) => rows.reduce((a, r) => a + (r.estimatedSeconds ?? 0), 0)

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/** Drop one query param from the current hash (chip × buttons). */
function clearHashParam(key: string) {
  const base = (location.hash || "#/ledger").split("?")[0]
  const params = new URLSearchParams(location.hash.split("?")[1] ?? "")
  params.delete(key)
  const qs = params.toString()
  location.hash = qs ? `${base}?${qs}` : base
}

export function LedgerView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("7d")
  const [query, setQuery] = useState("")
  const [catFilterLocal, setCatFilter] = useState<string>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [bulkPicker, setBulkPicker] = useState(false)
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c] as const)), [data.categories])

  // Deep-link filters from the hash (charts and signal cards link here).
  const hashQuery = useHashQuery()
  const dayParam = hashQuery.day
  const weekdayParam = hashQuery.weekday != null && /^\d$/.test(hashQuery.weekday) ? Number(hashQuery.weekday) : null
  const catParam = hashQuery.cat ?? null
  const fromParam = hashQuery.from ?? null
  const toParam = hashQuery.to ?? null
  useEffect(() => {
    if (catParam != null && catParam !== catFilterLocal) setCatFilter(catParam)
  }, [catParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const allRows = useMemo(
    () =>
      aggregateRange({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from: rangeFromDate(range)
      }).rows,
    [data, range]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRows.filter((r) => {
      if (dayParam && r.event.watchedOn !== dayParam) return false
      if (weekdayParam != null && weekdayOf(r.event.watchedOn) !== weekdayParam) return false
      if (fromParam && r.event.watchedOn < fromParam) return false
      if (toParam && r.event.watchedOn > toParam) return false
      if (
        catFilterLocal !== "all" &&
        (catFilterLocal === "none"
          ? r.categoryId != null
          : catById.has(catFilterLocal)
            ? r.categoryId !== catFilterLocal
            : r.targetId !== catFilterLocal)
      )
        return false
      if (q) {
        const hay = `${r.video.title} ${r.video.channel}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allRows, query, catFilterLocal, catById, dayParam, weekdayParam, fromParam, toParam])

  const byDay = useMemo(() => {
    const m = new Map<string, LedgerRow[]>()
    for (const r of rows) {
      const list = m.get(r.event.watchedOn) ?? []
      list.push(r)
      m.set(r.event.watchedOn, list)
    }
    return [...m.entries()]
  }, [rows])

  const filtered =
    query.trim() !== "" ||
    catFilterLocal !== "all" ||
    dayParam != null ||
    weekdayParam != null ||
    fromParam != null ||
    toParam != null
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  // Active deep-link chips (day / weekday / window arrived at from a chart).
  const chips: Array<{ key: string; label: string }> = []
  if (dayParam) chips.push({ key: "day", label: `Day: ${fmtDate(dayParam)}` })
  if (weekdayParam != null) chips.push({ key: "weekday", label: WEEKDAY_NAMES[weekdayParam] ?? "Weekday" })
  if (fromParam || toParam) chips.push({ key: "window", label: `${fromParam ? fmtDate(fromParam) : "start"} – ${toParam ? fmtDate(toParam) : "today"}` })
  const chipCat = catParam != null && (catById.has(catParam) || catParam === "none") ? catParam : null

  const clearWindowParams = () => {
    clearHashParam("from")
    clearHashParam("to")
  }

  return (
    <div>
      <div className="page-head">
        <h1>Ledger</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS} />
      </div>
      <p className="lede">
        Every video you watched, by day. YouTube records only the day, so times are estimates:
        length × how much you watched × replays. A ≈ means we assumed you watched to the end.
      </p>

      {chips.length > 0 ? (
        <div className="chips" aria-label="Drill-down filters">
          {chips.map((chip) => (
            <span className="chipbox" key={chip.key}>
              {chip.label}
              <button
                type="button"
                className="chipbox-x"
                aria-label={`Remove filter ${chip.label}`}
                onClick={() => (chip.key === "window" ? clearWindowParams() : clearHashParam(chip.key))}
              >
                ×
              </button>
            </span>
          ))}
          <a
            className="chipbox chipbox-clear"
            href={ledgerHref({})}
            onClick={() => { setQuery(""); setCatFilter("all") }}
          >
            Clear all
          </a>
        </div>
      ) : null}

      <div className="card filters">
        <input
          type="text"
          aria-label="Search title or channel"
          placeholder="Search title or channel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Filter by category" value={catFilterLocal} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {data.categories.filter((c) => !c.archivedAt).map((c) => (
            <optgroup key={c.id} label={`${c.emoji} ${c.name}`}>
              <option value={c.id}>{c.name}, everything</option>
              {data.subcategories
                .filter((s) => s.parentId === c.id && !s.archivedAt)
                .sort((a, b) => a.order - b.order)
                .map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="filters-summary" role="status">
          <strong>{fmtDur(sumSeconds(rows))}</strong> in {plural(rows.length, "watch", "watches")}
          {chipCat && rows.length > 0 ? (
            <> · <a className="qlink" href={ledgerHref({ cat: chipCat })}>link to this view</a></>
          ) : null}
        </span>
      </div>

      {selected.size > 0 ? (
        <div className="bulkbar" role="region" aria-label="Selected videos">
          <span className="bulkbar-count">{plural(selected.size, "video")} selected</span>
          <button type="button" className="btn btn-sm" onClick={() => setBulkPicker(true)}>Choose category…</button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              await bulkAssign(new ChromeKV(), [...selected], null, new Date())
              setSelected(new Set())
              await reload()
            }}
          >
            Reset to automatic
          </button>
          <button type="button" className="btn btn-sm btn-quiet" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      ) : null}

      {byDay.length === 0 ? (
        filtered ? (
          <div className="empty">
            <p style={{ margin: "0 0 12px" }}>No watches match these filters.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery("")
                setCatFilter("all")
                if (dayParam != null || weekdayParam != null || fromParam != null || toParam != null) {
                  clearHashParam("day")
                  clearHashParam("weekday")
                  clearHashParam("from")
                  clearHashParam("to")
                }
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <p className="empty">No watches in this range yet. Open YouTube while signed in, or pick a longer range.</p>
        )
      ) : (
        byDay.map(([day, dayRows], dayIndex) => (
          <section key={day} className="day" aria-labelledby={`day-${day}`}>
            <h2 className="dayhead" id={`day-${day}`}>{fmtDate(day)}</h2>
            <div className="tablewrap">
              <table className="ledger">
                <thead className={dayIndex === 0 ? undefined : "sr-only"}>
                  <tr>
                    <th className="col-check"><span className="sr-only">Select</span></th>
                    <th className="col-cat">Category</th>
                    <th>Video</th>
                    <th className="col-len">Length</th>
                    <th className="money">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((r) => (
                    <LedgerRowView
                      key={r.event.key}
                      row={r}
                      categories={data.categories}
                      subcategories={data.subcategories}
                      checked={selected.has(r.video.videoId)}
                      onToggle={() => toggle(r.video.videoId)}
                      onPickCategory={() => setPickerFor(r.video.videoId)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="total-label">{plural(dayRows.length, "watch", "watches")}</td>
                    <td className="money"><span className="amount total-rule" style={{ display: "inline-block", padding: "2px 0" }}>{fmtDur(sumSeconds(dayRows))}</span></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ))
      )}

      {pickerVideo ? (
        <TaxonomyPicker
          title="Choose a category"
          contextLine={<>{pickerVideo.title}<br />{pickerVideo.channel || "Unknown channel"}</>}
          categories={data.categories}
          subcategories={data.subcategories}
          current={pickerVideo.categoryOverride ?? pickerVideo.autoCategoryId}
          canClear={pickerVideo.categoryOverride != null}
          channel={pickerVideo.channel || undefined}
          channelRuleCategoryId={channelRuleTarget(data.rules, pickerVideo.channel)}
          reload={reload}
          onChoose={async (choice) => {
            const kv = new ChromeKV()
            await setVideoCategory(kv, pickerVideo.videoId, choice.categoryId, new Date())
            if (choice.categoryId && choice.alsoChannelRule && pickerVideo.channel) {
              await ensureChannelRule(kv, pickerVideo.channel, choice.categoryId, new Date())
            }
            setPickerFor(null)
            await reload()
          }}
          onClose={() => setPickerFor(null)}
        />
      ) : null}
      {bulkPicker ? (
        <TaxonomyPicker
          title={`Choose a category for ${plural(selected.size, "video")}`}
          categories={data.categories}
          subcategories={data.subcategories}
          current={null}
          canClear={false}
          onChoose={async ({ categoryId }) => {
            if (categoryId) await bulkAssign(new ChromeKV(), [...selected], categoryId, new Date())
            setBulkPicker(false)
            setSelected(new Set())
            await reload()
          }}
          onClose={() => setBulkPicker(false)}
          reload={reload}
        />
      ) : null}
    </div>
  )
}

function LedgerRowView({
  row,
  categories,
  subcategories,
  checked,
  onToggle,
  onPickCategory
}: {
  row: LedgerRow
  categories: Category[]
  subcategories: Subcategory[]
  checked: boolean
  onToggle: () => void
  onPickCategory: () => void
}) {
  const v = row.video
  const title = v.title || v.videoId
  const repeats = row.event.occurrences > 1 ? `watched ${row.event.occurrences} times` : null
  const stoppedAt =
    row.event.progressPct != null && row.event.progressPct < 95 ? `stopped at ${Math.round(row.event.progressPct)}%` : null
  return (
    <tr>
      <td className="col-check">
        <input type="checkbox" aria-label={`Select ${title}`} checked={checked} onChange={onToggle} />
      </td>
      <td className="col-cat">
        <CategoryChip targetId={row.targetId} categories={categories} subcategories={subcategories} onClick={onPickCategory} />
      </td>
      <td className="title-cell">
        <a href={v.url} target="_blank" rel="noreferrer" title={title}>{title}</a>
        <div className="item-sub">{[v.channel, repeats, stoppedAt].filter(Boolean).join(", ")}</div>
      </td>
      <td className="col-len">{fmtDur(v.durationSec)}</td>
      <td className="money amount">
        {row.confidence === "low" ? (
          <span title="Length unknown, so this can't be estimated yet">—<span className="sr-only">length unknown</span></span>
        ) : (
          <>
            {row.confidence === "medium" ? <span className="est" title="Assumed watched to the end" aria-hidden="true">≈</span> : null}
            {fmtDur(row.estimatedSeconds)}
            {row.confidence === "medium" ? <span className="sr-only">, assumed watched to the end</span> : null}
          </>
        )}
      </td>
    </tr>
  )
}
