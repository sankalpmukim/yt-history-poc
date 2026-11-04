/** Ledger: every watch, grouped by day, with inline and bulk categorization. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, type LedgerRow } from "../../core/aggregate"
import { setVideoCategory, bulkAssign, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import type { Category, Subcategory } from "../../core/types"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  fmtDur,
  fmtDate,
  plural,
  rangeFromDate
} from "../lib/ui"

const sumSeconds = (rows: LedgerRow[]) => rows.reduce((a, r) => a + (r.estimatedSeconds ?? 0), 0)

export function LedgerView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("30d")
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState<string>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [bulkPicker, setBulkPicker] = useState(false)
  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c] as const)), [data.categories])

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
      if (
        catFilter !== "all" &&
        (catFilter === "none"
          ? r.categoryId != null
          : catById.has(catFilter)
            ? r.categoryId !== catFilter
            : r.targetId !== catFilter)
      )
        return false
      if (q) {
        const hay = `${r.video.title} ${r.video.channel}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allRows, query, catFilter, catById])

  const byDay = useMemo(() => {
    const m = new Map<string, LedgerRow[]>()
    for (const r of rows) {
      const list = m.get(r.event.watchedOn) ?? []
      list.push(r)
      m.set(r.event.watchedOn, list)
    }
    return [...m.entries()]
  }, [rows])

  const filtered = query.trim() !== "" || catFilter !== "all"
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
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

      <div className="card filters">
        <input
          type="text"
          aria-label="Search title or channel"
          placeholder="Search title or channel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select aria-label="Filter by category" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
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
            <button type="button" className="btn" onClick={() => { setQuery(""); setCatFilter("all") }}>Clear filters</button>
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
        <div className="item-sub">{[v.channel, repeats].filter(Boolean).join(", ")}</div>
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
