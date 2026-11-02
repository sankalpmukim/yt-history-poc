/** Ledger: the transactions view — watch events by day, inline categorize, bulk assign. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, type LedgerRow } from "../../core/aggregate"
import { setVideoCategory, bulkAssign, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import {
  CategoryChip,
  CategoryModal,
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

  const catById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c] as const)),
    [data.categories]
  )

  const rows = useMemo(() => {
    const agg = aggregateRange({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      from: rangeFromDate(range)
    })
    const q = query.trim().toLowerCase()
    return agg.rows.filter((r) => {
      if (onlyUncategorized && r.categoryId != null) return false
      if (catFilter !== "all" && (catFilter === "none" ? r.categoryId != null : r.categoryId !== catFilter))
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
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
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
          <select id="bulkcat" defaultValue="">
            <option value="" disabled>
              choose category…
            </option>
            {data.categories.filter((c) => !c.archivedAt).map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              const el = document.getElementById("bulkcat") as HTMLSelectElement | null
              const catId = el?.value
              if (!catId) return
              await bulkAssign(new ChromeKV(), [...selected], catId, new Date())
              setSelected(new Set())
              await reload()
            }}
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
                      category={r.categoryId ? catById.get(r.categoryId) : undefined}
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
        <CategoryModal
          title="Categorize video"
          contextLine={
            <span>
              {pickerVideo.title} — <b>{pickerVideo.channel || "unknown channel"}</b>
            </span>
          }
          categories={data.categories}
          current={pickerVideo.categoryOverride}
          channel={pickerVideo.channel || undefined}
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
    </div>
  )
}

function LedgerRowView({
  row,
  category,
  checked,
  onToggle,
  onPickCategory
}: {
  row: LedgerRow
  category: ReturnType<Map<string, import("../../core/types").Category>["get"]>
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
        <CategoryChip category={category} onClick={onPickCategory} />
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
