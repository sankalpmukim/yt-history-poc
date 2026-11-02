/** Overview: stat cards, daily trend, category breakdown, review queue. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, uncategorizedVideos } from "../../core/aggregate"
import { setVideoCategory, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import {
  CategoryChip,
  CategoryModal,
  RangeBar,
  RANGE_OPTIONS,
  StatCard,
  fmtDur,
  fmtPct,
  rangeFromDate
} from "../lib/ui"
import { StackedDailyBars, Donut } from "../lib/charts"

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
        drilldownParentId: drill,
        from: rangeFromDate(range)
      }),
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
    return (sub && catById.get(sub.parentId)?.color) || "#6b7280"
  }
  const labelOf = (id: string | null) => {
    if (id == null) return "Uncategorized"
    const sub = subById.get(id)
    if (sub) return sub.name
    const cat = catById.get(id)
    if (cat) return drill === id ? `${cat.name} (no sub)` : cat.name
    return id
  }

  const queue = useMemo(
    () => uncategorizedVideos({ videos: data.videos, events: data.events, limit: 12 }),
    [data]
  )
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const daysCount = agg.byDay.length || 1

  return (
    <div>
      <div className="spread" style={{ marginBottom: 16 }}>
        <h1>Overview</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS as unknown as Array<{ id: string; label: string }>} />
      </div>

      <div className="statgrid">
        <StatCard value={fmtDur(agg.totalSeconds)} label="watch time (est.)" />
        <StatCard value={fmtDur(Math.round(agg.totalSeconds / daysCount))} label="avg / active day" />
        <StatCard
          value={agg.valueIndex == null ? "—" : agg.valueIndex.toFixed(1)}
          label="time value index"
          sub="0–5, categorized only"
        />
        <StatCard value={fmtPct(agg.lowValueShare)} label="low-value share" sub="score ≤ 1" />
        <StatCard
          value={`${agg.totalEvents}`}
          label="watch events"
          sub={`${agg.distinctVideos} videos`}
        />
        <StatCard
          value={fmtDur(agg.uncategorizedSeconds)}
          label="uncategorized time"
          sub={`${agg.uncategorizedVideoCount} videos`}
        />
      </div>

      <div className="card">
        <div className="spread">
          <h2>
            {drill
              ? `Daily watch time · ${catById.get(drill)?.name ?? drill}`
              : "Daily watch time by category"}
          </h2>
          {drill ? (
            <button className="btn btn-sm" onClick={() => setDrill(null)}>
              ← All categories
            </button>
          ) : null}
        </div>
        <StackedDailyBars days={agg.byDay} colorOf={colorOf} labelOf={labelOf} />
      </div>

      <div className="card">
        <div className="spread">
          <h2>{drill ? `Breakdown · ${catById.get(drill)?.name ?? drill}` : "Where the time went"}</h2>
          {drill ? (
            <button className="btn btn-sm" onClick={() => setDrill(null)}>
              ← All categories
            </button>
          ) : (
            <span className="muted small">click a category to see subcategories</span>
          )}
        </div>
        <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <Donut
            slices={agg.byCategory.map((c) => ({ categoryId: c.categoryId, seconds: c.seconds }))}
            colorOf={colorOf}
            labelOf={labelOf}
            total={agg.totalSeconds}
          />
          <div className="legend">
            {agg.byCategory.map((c) => (
              <div
                key={c.categoryId ?? "none"}
                className="legrow"
                style={{ cursor: !drill && c.categoryId ? "pointer" : undefined }}
                onClick={() => {
                  if (!drill && c.categoryId && catById.has(c.categoryId)) setDrill(c.categoryId)
                }}
                title={!drill && c.categoryId ? "Click to see subcategories" : undefined}
              >
                <span className="swatch" style={{ background: colorOf(c.categoryId) }} />
                <span style={{ width: 150 }}>{labelOf(c.categoryId)}</span>
                <span style={{ width: 64, textAlign: "right" }}>{fmtDur(c.seconds)}</span>
                <div className="sharebar">
                  <div style={{ width: `${Math.round(c.share * 100)}%`, background: colorOf(c.categoryId) }} />
                </div>
                <span className="muted small" style={{ width: 44, textAlign: "right" }}>
                  {fmtPct(c.share)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="muted small" style={{ marginTop: 10 }}>
          Top channels per category:{" "}
          {agg.byCategory
            .map((c) => `${labelOf(c.categoryId)} — ${(c.topChannels[0]?.channel ?? "—")} (${fmtDur(c.topChannels[0]?.seconds ?? null)})`)
            .slice(0, 4)
            .join(" · ") || "—"}
        </div>
      </div>

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
        <CategoryModal
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
