/** Ledger: the transactions view — watch events by day, inline categorize, bulk assign. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, type LedgerRow } from "../../core/aggregate"
import { setVideoCategory, bulkAssign, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  fmtDur,
  fmtDate,
  rangeFromDate
} from "../lib/ui"

export function LedgerView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("30d")
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState<string>("all")
  const [onlyUncategorized, setOnlyUncategorized] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [bulkPicker, setBulkPicker] = useState(false)
  const [bulkTarget, setBulkTarget] = useState<string | null>(null)
  const catById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c] as const)),
    [data.categories]
  )

  const rows = useMemo(() => {
    const agg = aggregateRange({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      from: rangeFromDate(range)
    })
    const q = query.trim().toLowerCase()
    return agg.rows.filter((r) => {
      if (onlyUncategorized && r.categoryId != null) return false
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
  }, [data, range, query, catFilter, onlyUncategorized])

  const byDay = useMemo(() => {
    const m = new Map<string, LedgerRow[]>()
    for (const r of rows) {
      const list = m.get(r.event.watchedOn) ?? []
      list.push(r)
      m.set(r.event.watchedOn, list)
    }
    return [...m.entries()]
  }, [rows])

  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 12 }}>
        <h1>Ledger</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS as unknown as Array<{ id: string; label: string }>} />
      </div>
      <p className="hint">
        Watch events grouped by day (YouTube history is day-granular — rows sort by sync recency
        within a day). Estimated time = duration × progress × repeats.
      </p>

      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search title or channel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">All categories</option>
          <option value="none">Uncategorized</option>
          {data.categories.filter((c) => !c.archivedAt).map((c) => (
            <optgroup key={c.id} label={`${c.emoji} ${c.name}`}>
              <option value={c.id}>{c.name} (all)</option>
              {data.subcategories
                .filter((s) => s.parentId === c.id && !s.archivedAt)
                .sort((a, b) => a.order - b.order)
                .map((s) => <option key={s.id} value={s.id}>{c.name} › {s.name}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={onlyUncategorized}
            onChange={(e) => setOnlyUncategorized(e.target.checked)}
          />
          only uncategorized
        </label>
        <span className="muted small" style={{ marginLeft: "auto" }}>
          {rows.length} event(s) · {fmtDur(rows.reduce((a, r) => a + (r.estimatedSeconds ?? 0), 0))}
        </span>
      </div>

      {selected.size > 0 ? (
        <div className="bulkbar">
          <b>{selected.size}</b> selected
          <button className="btn btn-sm" onClick={() => setBulkPicker(true)}>
            {bulkTarget ? `Chosen: ${data.categories.find((c) => c.id === bulkTarget)?.name ?? data.subcategories.find((s) => s.id === bulkTarget)?.name}` : "Choose category…"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (!bulkTarget) return
              await bulkAssign(new ChromeKV(), [...selected], bulkTarget, new Date())
              setSelected(new Set())
              setBulkTarget(null)
              await reload()
            }}
            disabled={!bulkTarget}
          >
            Assign
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              await bulkAssign(new ChromeKV(), [...selected], null, new Date())
              setSelected(new Set())
              await reload()
            }}
          >
            Clear overrides
          </button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
            Deselect
          </button>
        </div>
      ) : null}

      {byDay.length === 0 ? (
        <div className="card empty">No events match. Sync some history first, or loosen the filters.</div>
      ) : (
        byDay.map(([day, dayRows]) => (
          <div key={day} className="card">
            <div className="dayhead">
              {fmtDate(day)}
              <span className="muted">
                {dayRows.length} event(s) ·{" "}
                {fmtDur(dayRows.reduce((a, r) => a + (r.estimatedSeconds ?? 0), 0))}
              </span>
            </div>
            <div className="tablewrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th style={{ width: 24 }}></th>
                    <th>Category</th>
                    <th>Title</th>
                    <th>Channel</th>
                    <th style={{ width: 70 }}>Duration</th>
                    <th style={{ width: 70 }}>Est. watched</th>
                    <th style={{ width: 34 }}></th>
                    <th style={{ width: 20 }}></th>
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
              </table>
            </div>
          </div>
        ))
      )}

      {pickerVideo ? (
        <TaxonomyPicker
          title="Categorize video"
          contextLine={
            <span>
              {pickerVideo.title} — <b>{pickerVideo.channel || "unknown channel"}</b>
            </span>
          }
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
          title={`Categorize ${selected.size} selected videos`}
          categories={data.categories}
          subcategories={data.subcategories}
          current={bulkTarget}
          onChoose={async ({ categoryId }) => {
            if (categoryId) await bulkAssign(new ChromeKV(), [...selected], categoryId, new Date())
            setBulkTarget(null)
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
  categories: import("../../core/types").Category[]
  subcategories: import("../../core/types").Subcategory[]
  checked: boolean
  onToggle: () => void
  onPickCategory: () => void
}) {
  const v = row.video
  return (
    <tr>
      <td>
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td>
        <CategoryChip
          targetId={row.targetId}
          categories={categories}
          subcategories={subcategories}
          onClick={onPickCategory}
        />
      </td>
      <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <a href={v.url} target="_blank" rel="noreferrer" title={v.title}>
          {v.title || v.videoId}
        </a>
      </td>
      <td className="muted" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {v.channel}
      </td>
      <td className="muted">{fmtDur(v.durationSec)}</td>
      <td>{fmtDur(row.estimatedSeconds)}</td>
      <td className="muted" title={`estimate confidence: ${row.confidence}`}>
        <span className={"dot " + row.confidence}></span>
      </td>
      <td className="muted small" title={`${row.event.occurrences} occurrence(s) this day`}>
        {row.event.occurrences > 1 ? `×${row.event.occurrences}` : ""}
      </td>
    </tr>
  )
}
