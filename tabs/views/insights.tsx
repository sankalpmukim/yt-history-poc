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
import { CategoryModal, RangeBar, fmtDur, RANGE_OPTIONS, rangeFromDate } from "../lib/ui"

export function InsightsView({ data, reload }: { data: LedgerData; reload: () => Promise<void> }) {
  const [range, setRange] = useState<string>("90d")
  const [pickerChannel, setPickerChannel] = useState<string | null>(null)
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
        from
      }),
    [data, from]
  )
  const weekdays = useMemo(() => weekdayAverages(agg.byDay), [agg])
  const suggestions = useMemo(
    () => suggestChannelRules({ videos: data.videos, events: data.events, categories: data.categories, from }),
    [data, from]
  )
  const maxWeekday = Math.max(...weekdays.map((w) => w.secondsPerOccurrence), 1)

  const applySuggestion = async (s: RuleSuggestion, categoryId: string) => {
    await ensureChannelRule(new ChromeKV(), s.channel, categoryId, new Date())
    await reload()
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <h1>Insights</h1>
        <RangeBar value={range} onChange={setRange} options={RANGE_OPTIONS.filter((o) => o.id !== "today") as unknown as Array<{ id: string; label: string }>} />
      </div>

      <div className="card">
        <h2>Worst offenders — most time in low-value categories (score ≤ 1)</h2>
        {worst.length === 0 ? (
          <div className="empty">No low-value time recorded. Either you're very wise, or rules need tuning 🙂</div>
        ) : (
          worst.map((c) => (
            <div key={c.channel} className="queueitem">
              <span style={{ flex: 1 }}>{c.channel}</span>
              <span className="muted small">{c.watchCount} watch(es)</span>
              <b style={{ width: 80, textAlign: "right" }}>{fmtDur(c.seconds)}</b>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Best value — most time learning (score ≥ 4)</h2>
        {best.length === 0 ? (
          <div className="empty">Nothing in the high-value band yet this range.</div>
        ) : (
          best.map((c) => (
            <div key={c.channel} className="queueitem">
              <span style={{ flex: 1 }}>{c.channel}</span>
              <span className="muted small">{c.watchCount} watch(es)</span>
              <b style={{ width: 80, textAlign: "right" }}>{fmtDur(c.seconds)}</b>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Weekly pattern — avg watch time per weekday</h2>
        {weekdays.length === 0 ? (
          <div className="empty">No data yet.</div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 120, padding: "0 4px" }}>
            {weekdays.map((w) => (
              <div key={w.label} style={{ flex: 1, textAlign: "center" }} title={`${fmtDur(w.secondsPerOccurrence)} avg`}>
                <div
                  style={{
                    height: Math.max(4, (w.secondsPerOccurrence / maxWeekday) * 90),
                    background: "linear-gradient(180deg,#3ea6ff,#1d5fbf)",
                    borderRadius: 4
                  }}
                />
                <div className="muted small" style={{ marginTop: 4 }}>{w.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Rule suggestions</h2>
        {suggestions.length === 0 ? (
          <div className="empty">
            No suggestions — categorize a few videos in the Ledger and patterns will show up here.
          </div>
        ) : (
          suggestions.map((s, i) => (
            <div key={i} className="queueitem">
              <span style={{ flex: 1 }}>
                <b>{s.channel}</b>
                <span className="muted small"> — {s.evidence}</span>
              </span>
              {s.kind === "manual-consistency" && s.categoryId ? (
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void applySuggestion(s, s.categoryId!)}
                >
                  Always → {catById.get(s.categoryId)?.name ?? s.categoryId}
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => setPickerChannel(s.channel)}>
                  Categorize…
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {pickerChannel ? (
        <CategoryModal
          title={`Always categorize “${pickerChannel}” as…`}
          categories={data.categories}
          current={null}
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
    </div>
  )
}
