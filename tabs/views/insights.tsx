/** Insights: the signal cards — trends, value, rhythm, attention, patterns, setup. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange } from "../../core/aggregate"
import {
  channelTimeByCategoryIds,
  weekdayAverages,
  suggestChannelRules,
  type RuleSuggestion
} from "../../core/insights"
import {
  periodCompare,
  ladderThirds,
  valueMix,
  heavyDays,
  completionByCategory,
  duplicateOverrides,
  channelConcentration,
  rewatchLeaders
} from "../../core/signals"
import { ensureChannelRule, clearDuplicateOverrides } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import { ledgerHref } from "../lib/router"
import { PairedCompareBars } from "../lib/charts"
import { TaxonomyPicker, RangeBar, fmtDur, fmtDate, fmtPct, plural, RANGE_OPTIONS, rangeFromDate } from "../lib/ui"

const PERIOD_LABEL: Record<string, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  all: "period"
}

export function InsightsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("7d")
  const [pickerChannel, setPickerChannel] = useState<string | null>(null)
  const [clearedCount, setClearedCount] = useState<number | null>(null)
  const [drill, setDrill] = useState<{ channel: string; label: string; ids: Set<string>; aria: string } | null>(null)
  const from = rangeFromDate(range)

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

  const thirds = useMemo(() => ladderThirds(signalCtx), [signalCtx])

  const worst = useMemo(
    () =>
      channelTimeByCategoryIds({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from,
        categoryIds: thirds.bottom
      }),
    [data, from, thirds]
  )
  const best = useMemo(
    () =>
      channelTimeByCategoryIds({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from,
        categoryIds: thirds.top
      }),
    [data, from, thirds]
  )
  const agg = useMemo(
    () =>
      aggregateRange({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from
      }),
    [data, from]
  )
  const weekdays = useMemo(() => weekdayAverages(agg.byDay), [agg])
  const suggestions = useMemo(
    () =>
      suggestChannelRules({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        from
      }),
    [data, from]
  )

  const compareDays = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0
  const compare = useMemo(
    () => (compareDays > 0 ? periodCompare(signalCtx, compareDays) : null),
    [signalCtx, compareDays]
  )
  const mix = useMemo(() => valueMix(signalCtx, from), [signalCtx, from])
  const heavy = useMemo(() => heavyDays(signalCtx, 1.5, from), [signalCtx, from])
  const completion = useMemo(() => completionByCategory(signalCtx, from), [signalCtx, from])
  const completionVolume = completion.reduce((a, c) => a + c.started, 0)
  const finishedTotal = completion.reduce((a, c) => a + c.finished, 0)
  const concentration = useMemo(() => channelConcentration(signalCtx, from), [signalCtx, from])
  const rewatches = useMemo(() => rewatchLeaders(signalCtx, from, 5), [signalCtx, from])
  const dupes = useMemo(() => duplicateOverrides(signalCtx), [signalCtx])

  const catById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c] as const)),
    [data.categories]
  )
  const catName = (id: string | null) => (id == null ? "Uncategorized" : catById.get(id)?.name ?? id)
  const catColor = (id: string | null) =>
    id == null ? "var(--pencil)" : catById.get(id)?.color ?? "var(--pencil)"
  const [hoverWeekday, setHoverWeekday] = useState<number | null>(null)

  const maxWeekday = Math.max(...weekdays.map((w) => w.secondsPerOccurrence), 1)
  const drillRows = drill
    ? agg.rows.filter((row) => {
        if (row.video.channel !== drill.channel || row.categoryId == null) return false
        return drill.ids.has(row.categoryId)
      })
    : []

  const applySuggestion = async (s: RuleSuggestion, categoryId: string) => {
    await ensureChannelRule(new ChromeKV(), s.channel, categoryId, new Date())
    await reload()
  }

  const clearDupes = async () => {
    const cleared = await clearDuplicateOverrides(new ChromeKV(), new Date())
    setClearedCount(cleared)
    await reload()
  }

  const channelList = (rows: typeof worst, band: { label: string; ids: Set<string>; aria: string }) => (
    <ul className="list">
      {rows.map((c) => (
        <li key={c.channel}>
          <button
            type="button"
            className="queueitem insight-channel"
            aria-label={`Drill into ${c.channel} ${band.aria} watch time`}
            onClick={() => setDrill({ channel: c.channel, ...band })}
          >
            <span className="item-main item-title truncate">{c.channel}</span>
            <span className="item-meta">{plural(c.watchCount, "watch", "watches")}</span>
            <span className="amount money">{fmtDur(c.seconds)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
  const drillTotal = drillRows.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0)

  const worstBottomName = mix.worstBottom ? catName(mix.worstBottom.categoryId) : null
  const periodLabel = PERIOD_LABEL[range] ?? "period"

  return (
    <div>
      <div className="page-head">
        <h1>Insights</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS.filter((o) => o.id !== "today")} />
      </div>
      <p className="lede">Where your watch time goes, how it’s changing, and whether it matches the ladder you set.</p>

      {drill ? (
        <section className="card" aria-labelledby="drill-title">
          <div className="section-head">
            <div>
              <h2 id="drill-title">{drill.channel}</h2>
              <p className="section-note">{plural(drillRows.length, "watch", "watches")} in {drill.label}</p>
            </div>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setDrill(null)}>All insights</button>
          </div>
          {drillRows.length ? (
            <div className="tablewrap">
              <table className="ledger">
                <thead>
                  <tr><th style={{ width: 128 }}>Day</th><th>Video</th><th className="col-cat">Category</th><th className="money">Time</th></tr>
                </thead>
                <tbody>
                  {drillRows.map((row) => (
                    <tr key={row.event.key}>
                      <td className="muted">{fmtDate(row.event.watchedOn)}</td>
                      <td className="title-cell"><a href={row.video.url} target="_blank" rel="noreferrer" title={row.video.title}>{row.video.title}</a></td>
                      <td>{catById.get(row.categoryId!)?.name ?? "Uncategorized"}</td>
                      <td className="money amount">{fmtDur(row.estimatedSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="total-label">Total</td>
                    <td className="money"><b className="amount total-rule" style={{ display: "inline-block", padding: "2px 0" }}>{fmtDur(drillTotal)}</b></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <p className="empty">No matching watches in this range.</p>}
        </section>
      ) : <>
      {compare && compare.previousSec > 0 ? (
        <section className="card" aria-labelledby="trend-title">
          <div className="section-head">
            <div>
              <h2 id="trend-title">Two periods, compared</h2>
              <p className="section-note">
                The last {periodLabel} against the {periodLabel} before it. Hover a category to trace it; click to open its watches.
              </p>
            </div>
            <span className="trend-total">
              <b className="amount">{fmtDur(compare.currentSec)}</b>
              <span className={"delta " + (compare.deltaSec > 0 ? "up" : compare.deltaSec < 0 ? "down" : "flat")}>
                {compare.deltaSec === 0
                  ? "level"
                  : `${compare.deltaSec > 0 ? "+" : "−"}${fmtDur(Math.abs(compare.deltaSec))}`}
                {compare.deltaPct != null ? ` (${compare.deltaSec >= 0 ? "+" : "−"}${Math.abs(Math.round(compare.deltaPct * 100))}%)` : ""}
              </span>
            </span>
          </div>
          {compare.byCategory.some((d) => d.deltaSec !== 0) ? (
            <PairedCompareBars
              prevLabel="before"
              currLabel="now"
              rows={compare.byCategory
                .filter((d) => d.deltaSec !== 0)
                .sort((a, b) => Math.abs(b.deltaSec) - Math.abs(a.deltaSec))
                .slice(0, 8)
                .map((d) => ({
                  id: d.categoryId ?? "none",
                  label: catName(d.categoryId),
                  prevSeconds: d.previousSec,
                  currSeconds: d.currentSec,
                  color: catColor(d.categoryId),
                  href: ledgerHref({
                    cat: d.categoryId ?? "none",
                    from: compare.from,
                    to: compare.to
                  })
                }))}
            />
          ) : <p className="empty">Watch time was the same in both periods.</p>}
        </section>
      ) : null}

      <section className="card" aria-labelledby="worst-title">
        <div className="section-head">
          <div>
            <h2 id="worst-title">Top low-value channels</h2>
            <p className="section-note">
              {worstBottomName
                ? `Most time in the bottom of your ladder (${thirds.ordered.slice(-thirds.bottom.size).map((c) => c.name).join(", ")}).`
                : "Channels with the most time in the bottom of your ladder."}
            </p>
          </div>
        </div>
        {worst.length === 0
          ? <p className="empty">No time in the bottom of your ladder in this range.</p>
          : channelList(worst, { label: "low-value categories", ids: thirds.bottom, aria: "low-value" })}
      </section>

      <section className="card" aria-labelledby="best-title">
        <div className="section-head">
          <div>
            <h2 id="best-title">Top high-value channels</h2>
            <p className="section-note">
              {mix.topShare != null && mix.categorizedSec > 0
                ? `${fmtPct(mix.topShare)} of categorized time went to the top of your ladder.`
                : "Channels with the most time in the top of your ladder."}
            </p>
          </div>
        </div>
        {best.length === 0
          ? <p className="empty">No time in the top of your ladder in this range.</p>
          : channelList(best, { label: "high-value categories", ids: thirds.top, aria: "high-value" })}
      </section>

      <section className="card" aria-labelledby="weekday-title">
        <div className="section-head">
          <div>
            <h2 id="weekday-title">Average watch time by weekday</h2>
            {heavy.heavy.length > 0 && heavy.heaviest ? (
              <p className="section-note">
                Your usual day is {fmtDur(heavy.normSec)}. The heaviest was {fmtDate(heavy.heaviest.date)} at {fmtDur(heavy.heaviest.seconds)} — {heavy.heavy[0].multiple.toFixed(1)}× your usual.
              </p>
            ) : null}
          </div>
        </div>
        {weekdays.length === 0 ? (
          <p className="empty">Not enough history yet. Come back after a week of watching.</p>
        ) : (
          <div className="weekdays" role="list" onMouseLeave={() => setHoverWeekday(null)}>
            {weekdays.map((w) => (
              <button
                key={w.label}
                type="button"
                className={
                  "weekday weekday-btn" +
                  (hoverWeekday != null && hoverWeekday !== w.weekday ? " dim" : "") +
                  (hoverWeekday === w.weekday ? " hot" : "")
                }
                role="listitem"
                aria-label={`${w.label}: ${fmtDur(w.secondsPerOccurrence)} on average. Open ${w.label} watches in the Ledger.`}
                title={`Average ${fmtDur(w.secondsPerOccurrence)} · click to open ${w.label} watches`}
                onMouseEnter={() => setHoverWeekday(w.weekday)}
                onClick={() => { location.hash = ledgerHref({ weekday: w.weekday }) }}
              >
                <span className="weekday-value" aria-hidden="true">{w.secondsPerOccurrence > 0 ? fmtDur(w.secondsPerOccurrence) : ""}</span>
                <span className={"weekday-bar" + (w.secondsPerOccurrence > 0 && w.secondsPerOccurrence === maxWeekday ? " peak" : "")} aria-hidden="true" style={{ height: `${Math.max(1, (w.secondsPerOccurrence / maxWeekday) * 100)}%` }} />
                <span className="weekday-label" aria-hidden="true">{w.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {completionVolume >= 15 ? (
        <section className="card" aria-labelledby="finish-title">
          <div className="section-head">
            <div>
              <h2 id="finish-title">What you finish</h2>
              <p className="section-note">
                You finish {fmtPct(finishedTotal / completionVolume)} of what you start. Abandoned means YouTube’s
                progress bar stopped in the first quarter.
              </p>
            </div>
          </div>
          <div className="tablewrap">
            <table className="ledger">
              <thead>
                <tr><th>Category</th><th className="col-len">Started</th><th className="col-len">Finished</th><th className="col-len">Abandoned</th></tr>
              </thead>
              <tbody>
                {completion.filter((c) => c.started >= 3).map((c) => (
                  <tr key={c.categoryId}>
                    <td>
                      <a
                        className="rowlink"
                        href={ledgerHref({ cat: c.categoryId })}
                        title={`Open ${catName(c.categoryId)} watches in the Ledger`}
                      >
                        {catName(c.categoryId)}
                      </a>
                    </td>
                    <td className="num muted">{plural(c.started, "watch", "watches")}</td>
                    <td className={"num" + (c.finishRate != null && c.finishRate < 0.66 ? " text-warn" : "")}>
                      {fmtPct(c.finishRate)}
                    </td>
                    <td className={"num" + (c.abandonRate != null && c.abandonRate >= 0.2 ? " text-warn" : " muted")}>
                      {fmtPct(c.abandonRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {concentration.distinctChannels >= 8 || rewatches.length > 0 ? (
        <section className="card" aria-labelledby="patterns-title">
          <div className="section-head">
            <div>
              <h2 id="patterns-title">Watch patterns</h2>
              {concentration.top10Share != null && concentration.distinctChannels >= 8 ? (
                <p className="section-note">
                  Your top 10 of {concentration.distinctChannels} channels carry {fmtPct(concentration.top10Share)} of watch time.
                </p>
              ) : null}
            </div>
          </div>
          {rewatches.length > 0 ? (
            <>
              <h3 className="minor-head">Videos that pulled you back</h3>
              <ul className="list">
                {rewatches.map((r) => {
                  const v = data.videos[r.videoId]
                  return (
                    <li key={r.videoId} className="queueitem">
                      <span className="item-main">
                        <a className="item-title qlink" href={v?.url} target="_blank" rel="noreferrer" title={v?.title}>
                          {v?.title || r.videoId}
                        </a>
                        <span className="item-sub">{v?.channel}</span>
                      </span>
                      <span className="item-meta">{plural(r.days.length, "day")}</span>
                      <span className="amount money">{fmtDur(r.seconds)}</span>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}

      {dupes.redundant.length + dupes.conflicting.length >= 3 ? (
        <section className="card" aria-labelledby="dupes-title">
          <div className="section-head">
            <div>
              <h2 id="dupes-title">Redone work</h2>
              <p className="section-note">
                {plural(dupes.redundant.length, "manual pick")} repeat a channel rule that already does the same
                thing{dupes.conflicting.length > 0 ? `, and ${plural(dupes.conflicting.length, "pick")} ${dupes.conflicting.length === 1 ? "fights" : "fight"} one` : ""}.
                Clearing the duplicates changes nothing — the rules take over.
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => void clearDupes()}>
              Clear {plural(dupes.redundant.length, "duplicate")}
            </button>
          </div>
          {clearedCount != null ? (
            <p className="muted small" role="status">Cleared {plural(clearedCount, "manual pick")}. Those videos now follow their channel rules.</p>
          ) : null}
        </section>
      ) : null}

      <section className="card" aria-labelledby="suggestions-title">
        <div className="section-head">
          <div>
            <h2 id="suggestions-title">Rule suggestions</h2>
            <p className="section-note">Channels you keep categorizing by hand, or that often have no category.</p>
          </div>
        </div>
        {suggestions.length === 0 ? (
          <p className="empty">No suggestions yet. Categorize a few videos in the Ledger and patterns will show up here.</p>
        ) : (
          <ul className="list">
            {suggestions.map((s, i) => (
              <li key={i} className="queueitem">
                <div className="item-main">
                  <div className="item-title">{s.channel}</div>
                  <div className="item-sub">{s.evidence}</div>
                </div>
                {s.kind === "manual-consistency" && s.categoryId ? (
                  <button type="button" className="btn btn-sm" onClick={() => void applySuggestion(s, s.categoryId!)}>
                    Always use {catById.get(s.categoryId)?.name ?? s.categoryId}
                  </button>
                ) : (
                  <button type="button" className="btn btn-sm" onClick={() => setPickerChannel(s.channel)}>
                    Choose category…
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {pickerChannel ? (
        <TaxonomyPicker
          title={`Category for every video from ${pickerChannel}`}
          categories={data.categories}
          subcategories={data.subcategories}
          current={null}
          canClear={false}
          reload={reload}
          onChoose={async (choice) => {
            if (choice.categoryId) {
              await ensureChannelRule(new ChromeKV(), pickerChannel, choice.categoryId, new Date())
            }
            setPickerChannel(null)
            await reload()
          }}
          onClose={() => setPickerChannel(null)}
        />
      ) : null}
      </>}
    </div>
  )
}
