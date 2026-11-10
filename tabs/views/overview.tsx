/** Overview: the statement (time by category, ordered by value), daily chart, and videos that need a category. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange, uncategorizedVideos, type CategoryAgg } from "../../core/aggregate"
import { setVideoCategory, ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import { periodCompare, valueMix, heavyDays, shiftDayKey } from "../../core/signals"
import { ledgerHref } from "../lib/router"
import {
  CategoryChip,
  TaxonomyPicker,
  RangeBar,
  RANGE_OPTIONS,
  NEUTRAL_COLOR,
  fmtDur,
  fmtDate,
  fmtPct,
  plural,
  rangeFromDate,
  channelRuleTarget
} from "../lib/ui"
import { StackedDailyBars, DonutChart } from "../lib/charts"

const RANGE_CAPTION: Record<string, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time"
}

/** muted "+38%" / "−12%" / "new" marker comparing a category to the previous period */
function DeltaChip({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return current > 0 ? <span className="delta new">new</span> : null
  }
  const ratio = (current - previous) / previous
  if (Math.abs(ratio) < 0.005) return null
  const up = ratio > 0
  const pct = Math.min(999, Math.round(Math.abs(ratio) * 100))
  return (
    <span className={`delta ${up ? "up" : "down"}`} title="Change vs the previous period of the same length">
      {up ? "+" : "−"}{pct}{pct === 999 ? "%+" : "%"}
    </span>
  )
}

export function OverviewView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("30d")
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [drill, setDrill] = useState<string | null>(null)

  const signalCtx = useMemo(
    () => ({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      rules: data.rules
    }),
    [data]
  )

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

  // The week at a glance: 7-day comparison, value mix and the heaviest day.
  const verdict = useMemo(() => {
    const compare = periodCompare(signalCtx, 7)
    const mix = valueMix(signalCtx, compare.from)
    const heavy = heavyDays(signalCtx)
    return { compare, mix, heavy }
  }, [signalCtx])

  // Previous period of the same length as the selected range → per-category deltas.
  const prev = useMemo(() => {
    const opt = RANGE_OPTIONS.find((o) => o.id === range)
    const from = rangeFromDate(range)
    if (!opt || opt.days === 0 || !from) return null
    const prevTo = shiftDayKey(from, -1)
    const prevFrom = shiftDayKey(from, -opt.days)
    const prevAgg = aggregateRange({
      videos: data.videos,
      events: data.events,
      categories: data.categories,
      subcategories: data.subcategories,
      from: prevFrom,
      to: prevTo
    })
    return {
      total: prevAgg.totalSeconds,
      byCat: new Map(prevAgg.byCategory.map((c) => [c.categoryId ?? "none", c.seconds] as const))
    }
  }, [data, range])

  const showDeltas = prev != null && prev.total > 0
  const prevSecOf = (id: string | null) => (showDeltas ? prev?.byCat.get(id ?? "none") ?? 0 : null)

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
  const mixForRange = useMemo(
    () => valueMix(signalCtx, rangeFromDate(range)),
    [signalCtx, range]
  )
  const pickerVideo = pickerFor ? data.videos[pickerFor] : null
  const daysCount = agg.byDay.length || 1
  const legend = statementRows.filter((row) => row.seconds > 0)

  // Cross-highlighting: one focused category across donut, statement rows,
  // the daily bars and the legend. Hovering any of them sets it.
  const [focusCat, setFocusCat] = useState<string | null>(null)
  const [pinnedCat, setPinnedCat] = useState<string | null>(null)
  const shownCat = focusCat ?? pinnedCat
  const [videosFor, setVideosFor] = useState<string | null>(null)

  const donutSlices = statementRows
    .filter((r) => r.seconds > 0 && r.categoryId != null)
    .map((r) => ({
      id: r.categoryId as string,
      label: labelOf(r.categoryId),
      value: r.seconds,
      color: colorOf(r.categoryId)
    }))

  // Drill: subcategory row → its recent videos in this range.
  const videosOf = (targetId: string, isParentRow: boolean) => {
    const parent = catById.get(targetId)?.id ?? subById.get(targetId)?.parentId
    return agg.rows
      .filter((row) =>
        isParentRow
          ? row.categoryId === parent && row.subcategoryId == null
          : row.targetId === targetId || (subById.get(targetId) && row.subcategoryId === targetId)
      )
      .slice(0, 6)
  }

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

      {verdict.compare.previousSec > 0 ? (
        <section className="card verdict" aria-labelledby="verdict-title">
          <div className="section-head">
            <h2 id="verdict-title">The last seven days</h2>
          </div>
          <div className="verdict-grid">
            <a className="verdict-stat" href="#/insights" title="See the full comparison on Insights">
              <span className="verdict-label">Watched</span>
              <span className="verdict-value">{fmtDur(verdict.compare.currentSec)}</span>
              <span className="verdict-sub">
                {verdict.compare.deltaSec === 0
                  ? "level with the week before"
                  : `${verdict.compare.deltaSec > 0 ? "up" : "down"} ${fmtDur(Math.abs(verdict.compare.deltaSec))} on the week before`}
              </span>
            </a>
            {verdict.mix.categorizedSec > 0 && verdict.mix.topShare != null && verdict.mix.bottomShare != null ? (
              <a className="verdict-stat" href="#/insights" title="See the value bands on Insights">
                <span className="verdict-label">Value mix</span>
                <span className="verdict-value">{fmtPct(verdict.mix.topShare)}<span className="verdict-sub-inline"> top</span></span>
                <span className="verdict-sub">{fmtPct(verdict.mix.bottomShare)} of categorized time in the bottom third of your ladder</span>
              </a>
            ) : null}
            {verdict.heavy.heaviest && verdict.heavy.activeDays >= 4 ? (
              <a
                className="verdict-stat"
                href={ledgerHref({ day: verdict.heavy.heaviest.date })}
                title="Open that day in the Ledger"
              >
                <span className="verdict-label">Heaviest day</span>
                <span className="verdict-value">{fmtDur(verdict.heavy.heaviest.seconds)}</span>
                <span className="verdict-sub">
                  {fmtDate(verdict.heavy.heaviest.date)} · {verdict.heavy.heavy.length > 0
                    ? `${verdict.heavy.heavy[0].multiple.toFixed(1)}× your ${fmtDur(verdict.heavy.normSec)} usual`
                    : `your usual is ${fmtDur(verdict.heavy.normSec)}`}
                </span>
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

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

        <div className={donutSlices.length > 0 ? "stmt-body has-donut" : "stmt-body"}>
          <div className="stmt-ladder">
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
          const prevSec = prevSecOf(c.categoryId)
          const main = (
            <span className="value-main">
              <span className="value-name">
                <span className="swatch" style={{ background: colorOf(c.categoryId) }} aria-hidden="true" />
                <span className={`value-name-text ${tier}`}>{labelOf(c.categoryId)}</span>
                {top && category ? <span className="value-top">mostly {top.channel}</span> : null}
              </span>
              <span className="value-share">
                {prevSec != null && c.seconds > 0 ? <DeltaChip current={c.seconds} previous={prevSec} /> : null}
                {fmtPct(c.share)}
              </span>
            </span>
          )
          return (
            <div className="ladder-row" key={c.categoryId ?? "none"}>
              {category ? (
                <button
                  type="button"
                  className={"value-trigger" + (shownCat === c.categoryId ? " focused" : "")}
                  aria-label={`Drill into ${labelOf(c.categoryId)}`}
                  aria-describedby={`time-${c.categoryId}`}
                  aria-expanded={expanded}
                  onClick={() => { setDrill(expanded ? null : category.id); setPinnedCat(expanded ? null : category.id) }}
                  onMouseEnter={() => setFocusCat(c.categoryId)}
                  onMouseLeave={() => setFocusCat(null)}
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
                    const isParentRow = sub.categoryId === category?.id
                    const subVideos = videosFor === (sub.categoryId ?? "none") ? videosOf(sub.categoryId ?? "", isParentRow) : null
                    return (
                    <div className={"value-subrow-wrap" + (subVideos ? " open" : "")} key={sub.categoryId ?? "none"}>
                      <button
                        type="button"
                        className="value-subrow"
                        aria-expanded={subVideos != null}
                        aria-label={`Show videos in ${sub.categoryId === category?.id ? `${category.name}, no subcategory` : labelOf(sub.categoryId)}`}
                        onClick={() => setVideosFor(subVideos ? null : sub.categoryId ?? "none")}
                      >
                        <span className="value-main">
                          <span className="value-name">
                            <span className="value-name-text" style={{ fontWeight: 400 }}>
                              {isParentRow ? `${labelOf(sub.categoryId)}, no subcategory` : labelOf(sub.categoryId)}
                            </span>
                            {sub.topChannels[0] ? <span className="value-top">mostly {sub.topChannels[0].channel}</span> : null}
                          </span>
                          <span className="value-share">{fmtPct(ofTotal)}</span>
                        </span>
                        <span className="money value-time amount">{fmtDur(sub.seconds)}</span>
                        <span className="subrow-caret" aria-hidden="true">{subVideos ? "▾" : "▸"}</span>
                      </button>
                      {subVideos ? (
                        <div className="subrow-videos" aria-label={`Videos in ${labelOf(sub.categoryId)}`}>
                          {subVideos.length === 0 ? (
                            <p className="muted small" style={{ margin: "4px 0 8px 24px" }}>No watches in this range.</p>
                          ) : (
                            <ul className="list">
                              {subVideos.map((row) => (
                                <li key={row.event.key} className="queueitem subvideo">
                                  <span className="item-main">
                                    <a className="qlink item-title truncate" href={row.video.url} target="_blank" rel="noreferrer" title={row.video.title}>
                                      {row.video.title || row.video.videoId}
                                    </a>
                                    <span className="item-sub">{row.video.channel} · {fmtDate(row.event.watchedOn)}</span>
                                  </span>
                                  <span className="item-meta">
                                    {row.event.progressPct != null && row.event.progressPct < 95
                                      ? `stopped at ${Math.round(row.event.progressPct)}% · `
                                      : ""}
                                    {fmtDur(row.estimatedSeconds)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <a
                            className="btn btn-link btn-sm subrow-all"
                            href={ledgerHref({ cat: sub.categoryId ?? undefined })}
                          >
                            All of these in the Ledger →
                          </a>
                        </div>
                      ) : null}
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
          </div>
          {donutSlices.length > 0 ? (
            <div className="stmt-donut">
              <DonutChart
                slices={donutSlices}
                size={196}
                activeId={focusCat}
                pinnedId={pinnedCat}
                onHover={setFocusCat}
                onSelect={(id) => { setPinnedCat(id); setDrill(id); }}
                totalLabel={`Total · ${RANGE_CAPTION[range] ?? "range"}`}
              />
              <p className="muted small stmt-donut-note">Hover to trace a category through the ladder and the daily chart; click to open it.</p>
            </div>
          ) : null}
        </div>

        <div className="stmt-total">
          <span className="stmt-total-label">Total watched</span>
          <span className="stmt-total-amount money">
            <span className="reading-number total-rule">{fmtDur(agg.totalSeconds)}</span>
          </span>
        </div>

        <p className="stmt-notes">
          {agg.byDay.length > 1 ? `That’s ${fmtDur(Math.round(agg.totalSeconds / daysCount))} on each day you watched. ` : ""}
          {mixForRange != null && mixForRange.categorizedSec > 0 && mixForRange.bottomShare != null
            ? `${fmtPct(mixForRange.bottomShare)} of categorized time went to the bottom third of your ladder. `
            : ""}
          {`${plural(agg.totalEvents, "watch", "watches")} of ${plural(agg.distinctVideos, "video")}.`}
          {queue.length === 0 && agg.totalEvents > 0 ? " Every video has a category." : ""}
        </p>
      </section>

      {queue.length > 0 ? queueSection : null}

      <section className="card" aria-labelledby="daily-title">
        <div className="section-head">
          <div>
            <h2 id="daily-title">Day by day</h2>
            <p className="section-note">Hover a day for its breakdown; click it to open that day in the Ledger.</p>
          </div>
        </div>
        <StackedDailyBars
          days={agg.byDay}
          colorOf={colorOf}
          labelOf={labelOf}
          focusCategoryId={shownCat}
          onCategoryHover={setFocusCat}
          onDaySelect={(date) => { location.hash = ledgerHref({ day: date }) }}
        />
        {legend.length > 0 && agg.byDay.length > 0 ? (
          <ul className="legend" aria-label="Chart colors">
            {legend.map((row) => (
              <li key={row.categoryId ?? "none"}>
                <button
                  type="button"
                  className={"legend-item" + (shownCat === row.categoryId ? " focused" : "")}
                  aria-label={`Highlight ${labelOf(row.categoryId)} in the charts`}
                  aria-pressed={pinnedCat === row.categoryId}
                  onMouseEnter={() => setFocusCat(row.categoryId)}
                  onMouseLeave={() => setFocusCat(null)}
                  onClick={() => setPinnedCat(pinnedCat === row.categoryId ? null : row.categoryId)}
                >
                  <span className="swatch" style={{ background: colorOf(row.categoryId) }} aria-hidden="true" />
                  {labelOf(row.categoryId)}
                </button>
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
    </div>
  )
}
