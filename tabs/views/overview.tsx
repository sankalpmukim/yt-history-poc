/** Overview: the statement (time by category, ordered by value), daily chart, and videos that need a category. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, uncategorizedVideos, type CategoryAgg } from "../../core/aggregate"
import { setVideoCategory, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  NEUTRAL_COLOR,
  fmtDur,
  fmtPct,
  plural,
  rangeFromDate
} from "../lib/ui"
import { StackedDailyBars } from "../lib/charts"

const RANGE_CAPTION: Record<string, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time"
}

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

  const catById = useMemo(() => new Map(data.categories.map((c) => [c.id, c] as const)), [data.categories])
  const subById = useMemo(() => new Map(data.subcategories.map((s) => [s.id, s] as const)), [data.subcategories])
  const colorOf = (id: string | null) => {
    if (id == null) return NEUTRAL_COLOR
    const cat = catById.get(id)
    if (cat) return cat.color
    const sub = subById.get(id)
    return (sub?.color ?? (sub && catById.get(sub.parentId)?.color)) || NEUTRAL_COLOR
  }
  const labelOf = (id: string | null) => {
    if (id == null) return "Uncategorized"
    return subById.get(id)?.name ?? catById.get(id)?.name ?? id
  }

  // The statement reads like the ladder: higher value at the top.
  const statementRows = useMemo(() => {
    const order = (row: CategoryAgg) => (row.categoryId == null ? Number.MAX_SAFE_INTEGER : catById.get(row.categoryId)?.order ?? Number.MAX_SAFE_INTEGER - 1)
    return [...agg.byCategory].sort((a, b) => order(a) - order(b))
  }, [agg.byCategory, catById])

  const queue = useMemo(
    () => uncategorizedVideos({ videos: data.videos, events: data.events, limit: 12 }),
    [data]
  )
  const queueTotal = useMemo(
    () => uncategorizedVideos({ videos: data.videos, events: data.events, limit: 100000 }).length,
    [data]
  )
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const daysCount = agg.byDay.length || 1
  const legend = statementRows.filter((row) => row.seconds > 0)

  const queueSection = (
    <section className="card" id="needs-category" aria-labelledby="needs-category-title">
      <div className="section-head">
        <div>
          <h2 id="needs-category-title">Needs a category</h2>
          <p className="section-note">Pick a category for each video. You can apply it to the whole channel from the same dialog.</p>
        </div>
        {queueTotal > queue.length ? <span className="muted">Showing {queue.length} of {queueTotal}</span> : null}
      </div>
      <ul className="list">
          {queue.map((v) => (
            <li key={v.videoId} className="queueitem">
              <CategoryChip category={undefined} onClick={() => setPickerFor(v.videoId)} />
              <a className="qlink" href={v.url} target="_blank" rel="noreferrer" title={v.title}>
                {v.title || v.videoId}
              </a>
              <span className="item-meta truncate" style={{ maxWidth: 200 }}>{v.channel}</span>
            </li>
          ))}
      </ul>
    </section>
  )

  return (
    <div className="overview-view">
      <div className="page-head">
        <h1>Overview</h1>
        <RangeBar value={range} onChange={(next) => { setRange(next); setDrill(null) }} options={RANGE_OPTIONS} />
      </div>

      <section className="card statement" aria-labelledby="statement-title">
        <div className="section-head" style={{ marginBottom: 8 }}>
          <h2 id="statement-title">Where the time went</h2>
          {drill ? (
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setDrill(null)}>All categories</button>
          ) : null}
        </div>

        <div className="stmt-caption" aria-hidden="true">
          <span>{RANGE_CAPTION[range] ?? "This range"}, from higher to lower value</span>
          <span />
        </div>

        {statementRows.length === 0 ? (
          <div className="ladder-row">
            <div className="value-trigger static">
              <div className="value-main"><span className="muted">Nothing watched in this range.</span></div>
              <div className="money" />
            </div>
          </div>
        ) : statementRows.map((c) => {
          const category = c.categoryId ? catById.get(c.categoryId) : undefined
          const tier = category ? `tier-${category.valueScore}` : "tier-0"
          const expanded = drill === c.categoryId && !!category
          const details = expanded ? drillAgg?.byCategory ?? [] : []
          const top = c.topChannels[0]
          const main = (
            <span className="value-main">
              <span className="value-name">
                <span className="swatch" style={{ background: colorOf(c.categoryId) }} aria-hidden="true" />
                <span className={`value-name-text ${tier}`}>{labelOf(c.categoryId)}</span>
                {top && category ? <span className="value-top">mostly {top.channel}</span> : null}
              </span>
              <span className="value-share">{fmtPct(c.share)}</span>
            </span>
          )
          return (
            <div className="ladder-row" key={c.categoryId ?? "none"}>
              {category ? (
                <button
                  type="button"
                  className="value-trigger"
                  aria-label={`Drill into ${labelOf(c.categoryId)}`}
                  aria-describedby={`time-${c.categoryId}`}
                  aria-expanded={expanded}
                  onClick={() => setDrill(expanded ? null : category.id)}
                >
                  {main}
                  <span className={`money value-time amount ${tier}`} id={`time-${c.categoryId}`}>{fmtDur(c.seconds)}</span>
                </button>
              ) : (
                <div className="value-trigger static">
                  <span className="value-main">
                    <span className="value-name">
                      <span className="swatch" style={{ background: NEUTRAL_COLOR }} aria-hidden="true" />
                      <span className="value-name-text muted">Uncategorized</span>
                      <button
                        type="button"
                        className="btn btn-link btn-sm"
                        onClick={() => document.getElementById("needs-category")?.scrollIntoView({ block: "start" })}
                      >
                        Categorize {plural(agg.uncategorizedVideoCount, "video")}
                      </button>
                    </span>
                    <span className="value-share">{fmtPct(c.share)}</span>
                  </span>
                  <span className="money value-time amount">{fmtDur(c.seconds)}</span>
                </div>
              )}
              {expanded ? (
                <div className="value-details" aria-label={`${category?.name ?? "Category"} subcategories`}>
                  {details.length ? details.map((sub) => {
                    const ofTotal = agg.totalSeconds > 0 ? sub.seconds / agg.totalSeconds : 0
                    return (
                    <div className="value-subrow" key={sub.categoryId ?? "none"}>
                      <span className="value-main">
                        <span className="value-name">
                          <span className="value-name-text" style={{ fontWeight: 400 }}>
                            {sub.categoryId === category?.id ? `${labelOf(sub.categoryId)}, no subcategory` : labelOf(sub.categoryId)}
                          </span>
                          {sub.topChannels[0] ? <span className="value-top">mostly {sub.topChannels[0].channel}</span> : null}
                        </span>
                        <span className="value-share">{fmtPct(ofTotal)}</span>
                      </span>
                      <span className="money value-time amount">{fmtDur(sub.seconds)}</span>
                    </div>
                    )
                  }) : (
                    <div className="value-subrow">
                      <span className="value-subrow-note">No subcategory time in this range.</span>
                      <span className="money" />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )
        })}

        <div className="stmt-total">
          <span className="stmt-total-label">Total watched</span>
          <span className="stmt-total-amount money">
            <span className="reading-number total-rule">{fmtDur(agg.totalSeconds)}</span>
          </span>
        </div>

        <p className="stmt-notes">
          {agg.byDay.length > 1 ? `That’s ${fmtDur(Math.round(agg.totalSeconds / daysCount))} on each day you watched. ` : ""}
          {agg.lowValueShare != null ? `${fmtPct(agg.lowValueShare)} of categorized time went to lower-value categories. ` : ""}
          {`${plural(agg.totalEvents, "watch", "watches")} of ${plural(agg.distinctVideos, "video")}.`}
          {queue.length === 0 && agg.totalEvents > 0 ? " Every video has a category." : ""}
        </p>
      </section>

      {queue.length > 0 ? queueSection : null}

      <section className="card" aria-labelledby="daily-title">
        <div className="section-head">
          <h2 id="daily-title">Day by day</h2>
        </div>
        <StackedDailyBars days={agg.byDay} colorOf={colorOf} labelOf={labelOf} />
        {legend.length > 0 && agg.byDay.length > 0 ? (
          <ul className="legend" aria-label="Chart colors">
            {legend.map((row) => (
              <li key={row.categoryId ?? "none"}>
                <span className="swatch" style={{ background: colorOf(row.categoryId) }} aria-hidden="true" />
                {labelOf(row.categoryId)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>


      {pickerVideo ? (
        <TaxonomyPicker
          title="Choose a category"
          contextLine={<>{pickerVideo.title}<br />{pickerVideo.channel || "Unknown channel"}</>}
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
