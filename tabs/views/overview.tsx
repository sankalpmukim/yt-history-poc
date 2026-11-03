/** Overview: stat cards, daily trend, category breakdown, review queue. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, uncategorizedVideos } from "../../core/aggregate"
import { setVideoCategory, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  fmtDur,
  fmtPct,
  rangeFromDate
} from "../lib/ui"
import { StackedDailyBars } from "../lib/charts"

export function OverviewView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("30d")
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)

  const agg = useMemo(
    () =>
      aggregateRange({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from: rangeFromDate(range)
      }),
    [data, range]
  )
  const drillAgg = useMemo(
    () => drill ? aggregateRange({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      drilldownParentId: drill,
      from: rangeFromDate(range)
    }) : null,
    [data, range, drill]
  )

  const catById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c] as const)),
    [data.categories]
  )
  const subById = useMemo(
    () => new Map(data.subcategories.map((s) => [s.id, s] as const)),
    [data.subcategories]
  )
  const colorOf = (id: string | null) => {
    if (id == null) return "#6b7280"
    const cat = catById.get(id)
    if (cat) return cat.color
    const sub = subById.get(id)
    return (sub?.color ?? (sub && catById.get(sub.parentId)?.color)) || "#6b7280"
  }
  const labelOf = (id: string | null) => {
    if (id == null) return "Uncategorized"
    const sub = subById.get(id)
    if (sub) return sub.name
    const cat = catById.get(id)
    if (cat) return cat.name
    return id
  }

  const queue = useMemo(
    () => uncategorizedVideos({ videos: data.videos, events: data.events, limit: 12 }),
    [data]
  )
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const daysCount = agg.byDay.length || 1

  return (
    <div className="overview-view">
      <div className="spread overview-heading">
        <h1>Overview</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS as unknown as Array<{ id: string; label: string }>} />
      </div>

      <section className="reading-panel" aria-label="Estimated watch time summary">
        <div className="reading-copy">
          <div className="reading-number">{fmtDur(agg.totalSeconds)}</div>
          <div className="reading-caption"><strong>estimated watch time</strong> in this range</div>
        </div>
        <div className="reading-notes">
          <div className="reading-note">
            <strong>{fmtDur(Math.round(agg.totalSeconds / daysCount))}</strong>
            <span>avg / active day</span>
          </div>
          <div className="reading-note">
            <strong>{agg.valueIndex == null ? "—" : agg.valueIndex.toFixed(1)}</strong>
            <span>time value index</span>
          </div>
          <div className="reading-note">
            <strong>{fmtPct(agg.lowValueShare)}</strong>
            <span>time in lower-value categories</span>
          </div>
          <div className="reading-note">
            <strong>{agg.totalEvents}</strong>
            <span>watch events · {agg.distinctVideos} videos</span>
          </div>
          <div className="reading-note">
            <strong>{fmtDur(agg.uncategorizedSeconds)}</strong>
            <span>uncategorized · {agg.uncategorizedVideoCount} videos</span>
          </div>
        </div>
      </section>

      <section className="card trace-card">
        <div className="spread">
          <h2>Daily watch time by category</h2>
          <span className="muted small">estimated time, by day</span>
        </div>
        <div className="trace-frame">
          <StackedDailyBars days={agg.byDay} colorOf={colorOf} labelOf={labelOf} height={260} barW={18} gap={8} />
        </div>
      </section>

      <section className="card ladder-card">
        <div className="spread">
          <div>
            <h2>Where the time went</h2>
            <div className="muted small">Position on the ladder reflects value. Select a category to open its subcategories.</div>
          </div>
          {drill ? (
            <button className="btn btn-sm" onClick={() => setDrill(null)}>← All categories</button>
          ) : null}
        </div>
        <div className="ladder-head" aria-hidden="true">
          <span>Category</span>
          <div className="ladder-direction"><span>Lower value</span><span>Higher value</span></div>
          <span style={{ textAlign: "right" }}>Time</span>
        </div>
        {agg.byCategory.map((c) => {
          const category = c.categoryId ? catById.get(c.categoryId) : undefined
          const score = category?.valueScore
          const expanded = drill === c.categoryId
          const details = expanded ? drillAgg?.byCategory ?? [] : []
          return (
            <div className="ladder-row" key={c.categoryId ?? "none"}>
              <button
                className="value-trigger"
                disabled={!category}
                aria-label={`Drill into ${labelOf(c.categoryId)}`}
                aria-expanded={expanded}
                onClick={() => category && setDrill(expanded ? null : category.id)}
              >
                <span className="value-name">
                  <span className="swatch" style={{ background: colorOf(c.categoryId) }} />
                  <span className="value-name-text">{labelOf(c.categoryId)}</span>
                </span>
                <span className="ladder-rail" aria-hidden="true">
                  {score != null ? <span className="ladder-progress" style={{ width: `${score * 20}%`, background: colorOf(c.categoryId) }} /> : null}
                  {score != null ? <span className="ladder-marker" style={{ left: `${score * 20}%`, color: colorOf(c.categoryId), background: colorOf(c.categoryId) }} /> : null}
                </span>
                <span className="value-time">{fmtDur(c.seconds)} <span className="muted">{fmtPct(c.share)}</span></span>
              </button>
              {expanded ? (
                <div className="value-details" aria-label={`${category?.name ?? "Category"} subcategories`}>
                  {details.length ? details.map((sub) => (
                    <div className="value-subrow" key={sub.categoryId ?? "none"}>
                      <span>{labelOf(sub.categoryId)}</span>
                      <span className="value-subbar"><span style={{ width: `${Math.round(sub.share * 100)}%`, background: colorOf(sub.categoryId) }} /></span>
                      <span style={{ textAlign: "right" }}>{fmtDur(sub.seconds)}</span>
                    </div>
                  )) : <div className="muted small">No subcategory time in this range.</div>}
                </div>
              ) : null}
            </div>
          )
        })}
        <div className="muted small" style={{ marginTop: 16 }}>
          Top channels per category:{" "}
          {agg.byCategory
            .map((c) => `${labelOf(c.categoryId)} — ${(c.topChannels[0]?.channel ?? "—")} (${fmtDur(c.topChannels[0]?.seconds ?? null)})`)
            .slice(0, 4)
            .join(" · ") || "—"}
        </div>
      </section>

      <div className="card">
        <h2>Review queue — uncategorized ({queue.length} shown)</h2>
        {queue.length === 0 ? (
          <div className="empty">Everything is categorized. Nice.</div>
        ) : (
          queue.map((v) => (
            <div key={v.videoId} className="queueitem">
              <CategoryChip category={undefined} onClick={() => setPickerFor(v.videoId)} />
              <a className="qlink" href={v.url} target="_blank" rel="noreferrer" title={v.title}>
                {v.title || v.videoId}
              </a>
              <span className="muted small">{v.channel}</span>
            </div>
          ))
        )}
        {queue.length > 0 ? (
          <div className="muted small" style={{ marginTop: 8 }}>
            Click a chip to categorize — you can also make it a channel rule from there.
          </div>
        ) : null}
      </div>

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
          current={pickerVideo.categoryOverride}
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
    </div>
  )
}
