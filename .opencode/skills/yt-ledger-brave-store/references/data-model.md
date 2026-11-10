# YT Ledger storage schema (yl.v2)

Everything lives in `chrome.storage.local` as JSON under `yl.v2.*` keys. A dump
is a flat object keyed exactly like storage. Read `core/types.ts` for the
authoritative shapes; this is the query cheat-sheet.

## Keys

| Key | Shape |
|---|---|
| `yl.v2.meta` | `{ version: 2, settings, installedAt, lastSyncedAt, lastSyncStatus, lastSyncDiagnostics }` |
| `yl.v2.videos` | `Record<videoId, VideoRecord>` |
| `yl.v2.categories` | `Category[]` (ladder, highest value first by `order`) |
| `yl.v2.subcategories` | `Subcategory[]` (`parentId` → category) |
| `yl.v2.rules` | `Rule[]` (`priority` asc, first match wins) |
| `yl.v2.events.YYYY-MM` | `Record<"videoId\|date", WatchEvent>` per-month shard |
| `yl.v2.budgetStatus` | cached weekly snapshot computed by the background worker |
| `yl.v2.durationQueue` / `yl.v2.durationAttempts` / `yl.v2.syncState` | background worker bookkeeping |

Legacy keys (`ytHistoryPoc.v1`, `yt-history-poc:*`) are from pre-v2 versions;
ignore them for analysis.

## Shapes that matter when querying

- **VideoRecord**: `videoId, title, channel, url, durationSec (nullable),
  durationSource, isShort, categoryOverride (manual, wins), autoCategoryId
  (last rule result), appliedRuleId, firstSeenAt, lastSeenAt`.
- **Effective category** of a video = `categoryOverride ?? autoCategoryId`
  (`null` = uncategorized). Resolve to a subcategory or top-level category with
  `resolveTarget` / `topLevelCategoryId` from `core/taxonomy`.
- **WatchEvent**: `key = "videoId|yyyy-mm-dd"`, `watchedOn` (day, local),
  `progressPct` (YouTube's latest resume point; `null` = no bar, assume watched
  through), `progressAvgPct`, `occurrences` (rewatches that day).
- **Estimated watch time** = `durationSec × progressAvgPct/100 × occurrences`
  (`core/estimate.ts`). `progressPct >= 96` counts as finished; `< 25` as
  abandoned. Confidence: high (progress known), medium (assumed end), low
  (duration unknown — excluded from totals).
- **Settings**: `retentionDays, fetchWindowDays, budgetMode ("off"|"gentle"|
  "strict"), budgetsWeekly (categoryId → seconds), debugOverlay, devRelay,
  onboardedAt`.
- **Value scores** are derived from ladder position (`scoreAtPosition`), never
  edited. "High/low value" for analysis = thirds of the **live** ladder
  (`ladderThirds` in `core/signals`) — archived rows at the bottom would
  otherwise distort the bands.

## Time semantics

YouTube history records only the **day** of a watch. `firstSeenAt` /
`lastSeenAt` are sync timestamps (UTC), not watch times. Weekly windows start
Monday (`computeBudgetStatus` / `weeklyAveragesByCategory`).

## Built-in reports

`query-store.mjs` covers: `summary`, `signals` (the dashboard's
`computeSignals` cards), `channels [n]`, `day YYYY-MM-DD`, `videos [n]
[--cat id]`, `rules`, `health`, `key <key>`. For anything else, write a
throwaway `.ts` importing from `core/*` and bundle it the same way
(esbuild → node); keep queries pure and read-only against the dump.
