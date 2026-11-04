/** Insights: worst offenders, best-value channels, weekday pattern, rule suggestions. */

import { useMemo, useState } from "react"
import type { LedgerData } from "../lib/data"
import { aggregateRange } from "../../core/aggregate"
import {
  channelTimeByScoreBand,
  weekdayAverages,
  suggestChannelRules,
  type RuleSuggestion
} from "../../core/insights"
import { ensureChannelRule } from "../../core/assign"
import { ChromeKV } from "../../core/storage"
import { TaxonomyPicker, RangeBar, fmtDur, fmtDate, plural, RANGE_OPTIONS, rangeFromDate } from "../lib/ui"

export function InsightsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("90d")
  const [pickerChannel, setPickerChannel] = useState<string | null>(null)
  const [drill, setDrill] = useState<{ channel: string; label: string; minScore: number; maxScore: number; aria: string } | null>(null)
  const from = rangeFromDate(range)

  const catById = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c] as const)),
    [data.categories]
  )

  const worst = useMemo(
    () =>
      channelTimeByScoreBand({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from,
        minScore: 0,
        maxScore: 1
      }),
    [data, from]
  )
  const best = useMemo(
    () =>
      channelTimeByScoreBand({
        videos: data.videos,
        events: data.events,
        categories: data.categories,
        subcategories: data.subcategories,
        from,
        minScore: 4,
        maxScore: 5
      }),
    [data, from]
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
  const maxWeekday = Math.max(...weekdays.map((w) => w.secondsPerOccurrence), 1)
  const drillRows = drill
    ? agg.rows.filter((row) => {
        if (row.video.channel !== drill.channel || row.categoryId == null) return false
        const score = catById.get(row.categoryId)?.valueScore
        return score != null && score >= drill.minScore && score <= drill.maxScore
      })
    : []

  const applySuggestion = async (s: RuleSuggestion, categoryId: string) => {
    await ensureChannelRule(new ChromeKV(), s.channel, categoryId, new Date())
    await reload()
  }

  const channelList = (rows: typeof worst, band: { label: string; minScore: number; maxScore: number; aria: string }) => (
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

  return (
    <div>
      <div className="page-head">
        <h1>Insights</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS.filter((o) => o.id !== "today")} />
      </div>
      <p className="lede">Which channels your time goes to, when you watch, and rules worth adding.</p>

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
      <section className="card" aria-labelledby="worst-title">
        <div className="section-head">
          <div>
            <h2 id="worst-title">Top low-value channels</h2>
            <p className="section-note">Channels with the most time in your lowest-value categories.</p>
          </div>
        </div>
        {worst.length === 0
          ? <p className="empty">No time in low-value categories in this range.</p>
          : channelList(worst, { label: "low-value categories", minScore: 0, maxScore: 1, aria: "low-value" })}
      </section>

      <section className="card" aria-labelledby="best-title">
        <div className="section-head">
          <div>
            <h2 id="best-title">Top high-value channels</h2>
            <p className="section-note">Channels with the most time in your highest-value categories.</p>
          </div>
        </div>
        {best.length === 0
          ? <p className="empty">No time in high-value categories in this range.</p>
          : channelList(best, { label: "high-value categories", minScore: 4, maxScore: 5, aria: "high-value" })}
      </section>

      <section className="card" aria-labelledby="weekday-title">
        <div className="section-head">
          <h2 id="weekday-title">Average watch time by weekday</h2>
        </div>
        {weekdays.length === 0 ? (
          <p className="empty">Not enough history yet. Come back after a week of watching.</p>
        ) : (
          <div className="weekdays" role="list">
            {weekdays.map((w) => (
              <div key={w.label} className="weekday" role="listitem" aria-label={`${w.label}: ${fmtDur(w.secondsPerOccurrence)} on average`}>
                <span className="weekday-value" aria-hidden="true">{w.secondsPerOccurrence > 0 ? fmtDur(w.secondsPerOccurrence) : ""}</span>
                <span className={"weekday-bar" + (w.secondsPerOccurrence > 0 && w.secondsPerOccurrence === maxWeekday ? " peak" : "")} aria-hidden="true" style={{ height: `${Math.max(1, (w.secondsPerOccurrence / maxWeekday) * 100)}%` }} />
                <span className="weekday-label" aria-hidden="true">{w.label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

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
