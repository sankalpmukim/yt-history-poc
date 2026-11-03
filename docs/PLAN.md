# YT Ledger — an "expense manager" for YouTube watch history

Plan for evolving the yt-history-poc into a personal watch-time expense manager.
Decisions marked ✅ were confirmed 2026-11-02; implementation proceeds phase by
phase (see Milestones).

Mental model: **watch events = transactions · categories = spending categories ·
value score = the inverse of cost · budgets = time budgets.**

---

## 1. What we have today (POC facts that shape the design)

| Fact | Consequence |
|---|---|
| Reliable data path is `ytInitialData` on `/feed/history` (innertube POSTs initiated by the extension come back `logged_in: 0` in Brave) | Sync must read what the page itself fetched: initial payload + the page's own continuation responses |
| `ytInitialData` holds only the **first page** (~25–50 items) | Deeper lookback (14d) needs a read-only **fetch observer** in the MAIN world that captures the page's own `/youtubei/v1/browse` continuation responses (triggered by the user scrolling, or later by auto-scroll in a hidden tab) |
| Per item: `videoId`, `title`, `channel`, progress % (`Watched 16%`), day label; duration is NOT in the captured 2026 lockup shape | Duration needs overlay parsing (`thumbnailOverlayTimeStatusRenderer` / legacy `lengthText`) + a background resolver fallback |
| Day-granular labels (`Today`, `Friday`, `Oct 31`) | Watch time is attributed to a resolved **day** via `dayLabelToDate` |
| Progress bar = resume point; **absent when fully watched** | No bar ⇒ assume 100%, with a confidence label |
| Store dedupes by `videoId`, prunes at 48h | Repeat watches are lost; retention must change for trends |
| Per-tab content-script sync | Concurrent tabs ⇒ merge must be single-writer (service worker) |
| Plasmo popup build broken on Node 26 (parcel shim bug) | v1 ships a **full-page dashboard**; toolbar click opens it |

---

## 2. Product definition

**YT Ledger (YouTube Ledger)** — an expense manager where the spent resource is
**time**:

- **Categorize** every video watched (auto via rules, manual overrides always win).
- **See where the time goes**: today / 7d / 30d / all-time dashboards, per-category time, share, trends, top channels.
- **Value spectrum**: every category has a value score 0–5; the product surfaces "time value index" and low-value share (the "how much did I waste" number).
- **Insights**: worst offenders, best-value channels, weekday patterns. ✅ in scope (phase M6).
- **Budgets**: weekly time budgets per category ✅ in scope (phase M7) **with enforcement on YouTube itself** ✅ (phase M8):
  - **Off** (default until configured), **Gentle**, **Strict** — see §4.5.
- All data stays local (`chrome.storage.local`, `unlimitedStorage`); nothing leaves the machine.

---

## 3. Default categories (editable, reorderable, extendable)

| # | id | Emoji | Name | Score | Examples |
|---|---|---|---|---|---|
| 0 | `brain-rot` | 🧟 | Brain rot | 0 | Shorts binges, memes, drama, reaction clips |
| 1 | `junk-fun` | 🍿 | Mindless entertainment | 1 | Compilations, fails, background noise TV |
| 2 | `fun` | 🎬 | Intentional entertainment | 2 | Films, series, music, chosen gaming sessions |
| 3 | `talk-fun` | 🎙️ | Recreational talk | 3 | Podcasts, interviews, commentary for fun |
| 4 | `news` | 📰 | News & updates | 3 | News clips, current events, sports highlights |
| 5 | `informative` | 🧠 | Informative talk | 4 | Intellectual podcasts, video essays, explainers |
| 6 | `practical` | 🛠️ | Practical how-tos | 4 | Tutorials, cooking, DIY, purchase research |
| 7 | `deep` | 🎓 | Courses & lectures | 5 | Lectures, courses, conference talks, documentaries |

- Users can rename, re-score, re-color, add, archive, and reorder categories. New categories can slot anywhere on the 0–5 ladder.
- **Subcategories** (expense-manager style, ✅ 2026-11-02): each top-level category has editable, reorderable, archivable subcategories (same customizability as categories). Videos and rules assign to a **subcategory or the parent** (when no sub fits). Charts show **top-level by default**; click a category to drill into its subs (with a back control). Pickers, Ledger chips, and rule targets show `Parent › Sub` (e.g. `Practical how-tos › Coding`). Budgets stay **top-level** (sub time rolls up). Stored as `yl.v2.subcategories`; existing category-level assignments keep working. Default subs ship with the 8 parents; onboarding can tweak names.
- "Uncategorized" is a first-class bucket surfaced as a review queue (never silently assigned).
- ✅ **Onboarding (first install)** walks the user through categories + starter
  rules so the starting set is *theirs*; if onboarding is skipped or fails, fall
  back to a small set of basic, non-irritating defaults (see §4.6). Starter
  rules matter only at the beginning — the priority is a great UX for creating
  and managing one's own rules.

---

## 4. Screens & UX

### 4.1 Toolbar action → Dashboard tab (primary surface)
No popup in v1 (known Plasmo/Node-26 popup build bug). The background listens to
`chrome.action.onClicked` and opens/focuses `tabs/dashboard.html`. A thin popup
can be added later once the build issue is resolved or Node ≤22 is used.

### 4.2 Dashboard page (single Plasmo page, internal tabs / hash routes)

**A. Overview**
- Range switcher: Today · 7d · 30d · 90d · All.
- Stat cards: total est. watch time, avg/day, # videos watched, **time value index** (0–5), % time in score ≤1 categories ("brain-rot share"), uncategorized count.
- **Trend**: stacked daily bars by category (the expense-manager "spending over time" chart).
- **Breakdown**: donut + ranked list per category — hours, % share, top channels in each.
- **Review queue** card: latest uncategorized videos with inline category chips + "assign all from this channel" shortcut.

**B. Ledger** (the transactions view)
- Chronological watch events grouped by day; columns: title (link), channel, duration, est. watched, category chip (click to change), value tier, confidence.
- Search; filter by category / channel / value tier; multi-select bulk categorize ("select 12 → Practical how-tos").
- Manual assignment offers "always categorize this channel as …" → creates a rule in one click.

**C. Rules**
- Ordered rule list (priority = order; first match wins): IF `channel is/contains` · `title matches (substring/regex)` · `is Short` · `duration < Ns` THEN `category`. Enable/disable, edit, delete, reorder.
- Rule editor with **test-run**: shows how many stored videos currently match before saving.
- The heart of the product (per ✅ decision 4): fast, obvious rule creation/management.

**D. Categories** (manager: create/edit/archive/reorder, color + emoji + score).

**E. Settings**
- ✅ **Sync**: automatic syncs look back **14 days**; a **"Refresh / Sync now"** button usable anytime, with a **"more options"** control to pick a shorter or longer lookback for that manual sync (7 / 14 / 30 / 60 / 90 days).
- Retention: user-configurable, **default 1 year (365d)**; also 90d / forever ✅.
- Budget mode selector: **Off / Gentle / Strict** ✅ (per §4.5), per-category weekly budgets (M7).
- Data export (JSON backup, CSV), import, danger zone (wipe).
- Sync status panel: last sync time/result, diagnostics, link to "Sync now".
- Debug overlay toggle (off by default; replaces the always-on POC overlay); dev relay toggle.

**F. Insights (M6)**
- Top channels by low-value time ("worst offenders"), best-value channels.
- Weekday × hour heatmap is impossible (day granularity only) → weekday averages instead.
- Rule suggestions: frequently re-categorized channel → "always categorize …?"

**G. Budgets (M7)** — weekly per-category budgets, spent vs budget bars, over/under status, week rollover moment (Monday 00:00 local), enforcement-mode picker (off/gentle/strict) mirroring §4.5.

### 4.3 On YouTube pages themselves
- Sync stays invisible (requirement: don't disrupt) — except the optional
  budget-enforcement UI of §4.5, which is explicitly user-chosen.
- The POC overlay becomes a debug-only feature, off by default.

### 4.4 Categorization flow (summary)
1. New events land from a sync → rules run once per new **video** (channel/title/short/duration known at that point).
2. `video.categoryOverride` (manual) beats any rule. Unclassified → review queue.
3. Manual fixes can spawn channel rules via the one-click prompt; rule learning stays explicit, never silent.
4. Estimation confidence is shown wherever estimates appear (tool-tips + a footnote legend).

### 4.5 Budget enforcement on YouTube (M8) — Gentle / Strict / Off ✅

A dedicated content script (`contents/budget-guard.ts`, isolated world) runs on
YouTube pages and knows (a) each visible video's category and (b) current budget
status:

- **Category of a visible video** = stored `categoryOverride` / stored
  auto-category for that `videoId` if known, else rules evaluated on-page
  against channel + title (the pure rules engine runs in the content script);
  unknown → treated as not-over-budget (fail-open, never blocks unknowns).
- **Budget status** = `yl.v2.budgetStatus` snapshot computed by the SW (spent
  seconds so far this week per category vs budget; refreshed on every sync /
  storage change), so the content script never recomputes aggregates.
- **Gentle mode**: videos in over-budget categories get a subtle red border on
  the thumbnail + a small "over budget · <category>" chip — informational.
- **Strict mode**: those videos' thumbnails and titles are blurred/hidden in
  feeds, search, and recommendations, with a placeholder "hidden — <category>
  over budget"; an optional "reveal once" click (per settings). On a *watch*
  page for an over-budget video: Gentle shows a dismissible banner; Strict shows
  a dismissible interstitial ("You're N min over budget in <category>") with
  "Watch anyway".
- **Off** (default until the user chooses): no changes to YouTube at all.
- Engineering guardrails: classify per `videoId` with an in-memory Map cache;
  MutationObserver debounced; never blocks unknown videos; all UI removable via
  one class; if anything throws → show the page normally (fail-open).

### 4.6 Onboarding (M6, ✅ decision 4)
Runs on first dashboard open after install (dashboard exists from M4; until
then the fallback defaults of §3/§5 apply silently):
1. Welcome + "this is local-only" privacy note.
2. Category ladder walkthrough: rename/reorder/remove, see the 0–5 spectrum.
3. Starter rules: pick from suggested keyword rules (shown with live match
   counts against existing history), or start clean.
4. Budget mode choice (off/gentle/strict) — skippable.
5. Done → recorded in `settings.onboardedAt`.
If the wizard is dismissed early, **fallback defaults** apply: the 8 categories
as named above + two gentle enabled keyword rules (title ~ `tutorial|how to|guide`
→ Practical how-tos; title ~ `lecture|course|crash course` → Courses & lectures)
+ a pre-made but disabled "Shorts → Brain rot" rule. Non-irritating: keyword
rules are visible, editable, and few.

---

## 5. Watch-time estimation

Per watch event:

```
progressFraction = progressAvgPct != null ? progressAvgPct/100 : 1.0  // no bar ⇒ watched fully
watchedSec       = durationSec × progressFraction × occurrences
```

- **Duration sources** (recorded): ① `thumbnailOverlayTimeStatusRenderer` on the history thumbnail (free, same fetch) → ② legacy `lengthText` → ③ background **duration resolver** (M2): throttled fetch of `youtube.com/watch?v=ID`, regex `"lengthSeconds":"(\d+)"`, cached forever (host permission already granted).
- **Confidence**: high = progress + duration known; medium = duration known, progress assumed; low = duration unknown (resolver pending/failed) — time hidden from totals until resolved, count still shown.
- **Occurrences**: history lists repeat watches; stored per `videoId|watchedOn` with the latest fetched count authoritative. With multiple occurrences in a day, the *average* progress across occurrences is used for estimation; the *latest* progress is kept for display.
- **Day attribution**: `watchedOn` = date resolved from the day label at fetch time; stable thereafter.
- Sanity guard: estimated day total > 20h ⇒ flagged "suspicious day" (TV left running / autoplay), surfaced, not silently clamped.

---

## 6. Retention & sync windows (✅ decisions 2 & 3)

| | POC | Product |
|---|---|---|
| Automatic fetch window | Today + Yesterday (2d) | **Rolling 14 days** (configurable 7–30). MAX_PAGES 8 → 30 (cutoff still stops pagination early) |
| Manual sync | — | **"Refresh / Sync now" anytime**, with a "more options" lookback picker for that run: 7 / 14 / 30 / 60 / 90 days |
| Stored retention | 48h prune | **User-configurable, default 365 days**; also 90d / forever. Prune runs on SW startup. JSON/CSV export for portability |
| Rationale | Privacy-minimal POC cache | An expense manager *is* the history; trends need months. Still local-only, own data |

Also: the old `ytHistoryPoc.v1` cache is migrated once (entries → v2 events/videos) then left untouched.

---

## 7. Data model (chrome.storage.local, versioned v2)

Split keys keep writes small (a sync rewrites only the shards it touched) and
let the dashboard read categories/rules without pulling events.

```ts
interface Category {
  id: string; name: string; emoji: string; color: string;
  valueScore: 0|1|2|3|4|5; order: number; archivedAt?: string
}

interface Rule {
  id: string; name: string; enabled: boolean; priority: number; // lower = first
  match: {
    channelEquals?: string;      // case-insensitive
    channelContains?: string;
    titleContains?: string[];    // any-of, case-insensitive
    titleRegex?: string;         // with flags
    isShort?: boolean;
    maxDurationSec?: number;
  };
  categoryId: string;
  createdAt: string; updatedAt: string; hitCount: number; lastHitAt?: string
}

interface VideoRecord {                    // per-video facts & manual choices
  videoId: string; title: string; channel: string; url: string;
  durationSec: number | null; durationSource: 'overlay' | 'legacy' | 'watch-page' | null;
  isShort: boolean | null;
  categoryOverride: string | null;         // manual — always wins
  autoCategoryId: string | null;           // last rule result
  appliedRuleId: string | null;
  firstSeenAt: string; lastSeenAt: string
}

interface WatchEvent {                     // one video on one day
  key: string;                             // `${videoId}|${watchedOn}`
  videoId: string; watchedOn: string;      // yyyy-mm-dd from dayLabelToDate
  progressPct: number | null;              // latest resume point; null = none
  progressAvgPct: number | null;           // avg across occurrences (estimation)
  occurrences: number;                     // repeats within that day
  firstSeenAt: string; lastSeenAt: string
}

interface Settings {
  retentionDays: number | null;            // default 365 ✅; null = forever
  fetchWindowDays: number;                 // default 14 (automatic syncs)
  budgetMode: 'off' | 'gentle' | 'strict'; // default 'off' ✅
  budgetsWeekly: Record<categoryId, secondsPerWeek>;  // M7/M8
  debugOverlay: boolean;                   // default false
  devRelay: boolean;                       // default false (capture-server pings)
  onboardedAt: string | null
}

// keys
"yl.v2.meta"                       → { version, settings, lastSyncedAt, lastSyncStatus, lastSyncDiagnostics, installedAt }
"yl.v2.videos"                     → Record<videoId, VideoRecord>
"yl.v2.events.<YYYY-MM>"           → Record<eventKey, WatchEvent>   // monthly shards
"yl.v2.categories"                 → Category[]
"yl.v2.rules"                      → Rule[]
"yl.v2.durationQueue"              → string[] (videoIds pending resolution)
"yl.v2.budgetStatus"               → per-category weekly spend vs budget snapshot (M7+, read by budget-guard)
```

Category resolution for display: `categoryOverride ?? autoCategoryId ?? uncategorized`.
Events inherit their video's category (v1 has no per-event overrides — intent rarely changes per rewatch; revisit if needed).

Size math: ~250 B/video + ~150 B/event; a heavy year ≈ 20k events ≈ 4–5 MB across shards — fine with `unlimitedStorage`.

---

## 8. Architecture

```
┌────────────────────────── youtube.com tab ──────────────────────────┐
│ ISOLATED  contents/history-sync.ts   (thin client, all YT pages)    │
│  · injects the MAIN script (unchanged <script src> pattern)         │
│  · asks MAIN for history → forwards RAW sections to the SW          │
│    (merge lives in the SW: single writer, multi-tab safe)           │
│ MAIN       contents/history-main.ts (parser + observer)             │
│  · ytInitialData parse on /feed/history (first page)                │
│  · NEW: read-only fetch observer — captures the page's OWN          │
│    /youtubei/v1/browse continuation responses while the user        │
│    scrolls (this is how lookback > first page is possible)          │
│  · + duration from thumbnailOverlayTimeStatusRenderer / lengthText  │
│  · + occurrences preserved; cutoff = requested daysBack             │
│ ISOLATED  contents/budget-guard.ts  (M8; gentle/strict/off UI)      │
└──────────────────────────────────────────────────────────────────────┘
                    ▲ chrome.runtime messages
┌─────────────────── background.ts (service worker) ──────────────────┐
│ SYNC COORDINATOR                                                    │
│  · any YouTube page visit → throttled sync request (M1)             │
│  · if no tab is on /feed/history → open one background tab          │
│    (active:false, auto-scroll to load the window), sync, close (M2) │
│  · in-flight lock; merges sections into v2 store (single writer)    │
│ RULES ENGINE (core/rules.ts)   → runs on new videos after merge (M3)│
│ DURATION RESOLVER (core/duration.ts) → throttled watch-page fetches │
│ BUDGET STATUS (core/aggregate.ts) → yl.v2.budgetStatus snapshot (M7)│
│ AGGREGATION (core/aggregate.ts) → shared by dashboard & guard       │
│ action.onClicked → opens tabs/dashboard.html (M4)                   │
└──────────────────────────────────────────────────────────────────────┘
┌─────────────────── tabs/dashboard.tsx (React page, M4+) ────────────┐
│ Overview · Ledger · Rules · Categories · Settings · Insights ·       │
│ Budgets · Onboarding — hash-routed internal tabs                    │
│ reads store directly (chrome.storage) + chrome.storage.onChanged    │
│ hand-rolled SVG charts (no chart lib → no new deps, small bundle)   │
│ dark theme to match YouTube (#0f0f0f / #f1f1f1)                     │
└──────────────────────────────────────────────────────────────────────┘
core/ (pure TS, no chrome deps → unit-testable via `node --test`)
  types.ts · defaults.ts · storage.ts · merge.ts · retention.ts ·
  migrate.ts · estimate.ts · rules.ts (M3) · aggregate.ts (M4/M7) ·
  duration.ts · ledger.ts (high-level SW ops)
```

Changes vs POC, explicitly:
1. **history-main.ts**: same injection + messaging; adds the fetch observer, duration overlay parsing, occurrence preservation, parameterized cutoff (default 14d), MAX_PAGES 30; removes the broken POC debug artifacts.
2. **history-sync.ts**: keeps injection + request; forwards raw sections to the SW instead of writing storage; overlay becomes debug-only.
3. **background.ts**: absorbs merge/retention, initialization + v1→v2 migration, later hidden-tab sync, rules application, duration resolution, budget snapshots; capture-server pings kept but gated behind `settings.devRelay`.
4. New: dashboard page (M4), core modules, v2 storage layer.
5. Manifest: + `unlimitedStorage`; product name "YT Ledger".

---

## 9. Milestones (each: build passes + unit tests for core logic + manual-verification note + local commit)

| # | Deliverable | Verification |
|---|---|---|
| M1 | v2 types/storage/defaults; SW-side merge (single writer, occurrences, progress stats); retention prune (365d default); v1→v2 migration; MAIN parser: duration overlay + daysBack cutoff + fetch observer; thin sync script; manifest/name/permissions | build; node unit tests (merge/migrate/estimate/retention/duration); manual: sync on /feed/history stores multi-day events incl. repeats (console + storage dump) |
| M2 | Hidden-tab sync on any YouTube visit (auto-scroll); duration resolver queue | manual: visit youtube.com home → background tab syncs & closes; durations backfill |
| M3 | Rules engine (pure TS) applied on sync; isShort detection; starter rules | unit tests incl. precedence/regex; manual spot-check |
| M4 | Dashboard: Overview + Ledger + review queue + inline categorize | live use against real history |
| M5 | Rules UI (editor + test-run + reorder) + category manager + Settings (Sync now w/ lookback picker, retention, export/import JSON/CSV) | full CRUD walkthrough |
| M6 | Onboarding wizard + Insights (worst offenders, weekday averages, rule suggestions) | fresh-profile onboarding run |
| M7 | Budgets: weekly budgets UI, budget-status snapshot, spent-vs-budget views | over-budget category triggers status |
| M8 | Budget enforcement on YouTube: gentle/strict/off, feed highlights/hiding, watch-page banner/interstitial, fail-open | live Brave walkthrough in all 3 modes |

---

## 10. Risks & mitigations

- **YouTube shape churn** → keep the defensive recursive parser; extend the offline fixture harness (`scripts/test-parse.mjs` → core tests) as shapes are captured.
- **Fetch observer fragility** (YouTube may switch to XHR or alter URLs) → also watch `xhr` if needed; degrade gracefully to first-page-only sync; diagnostics record it.
- **Multi-tab concurrent syncs** → single-writer merge in the SW with an in-flight lock.
- **Hidden tab side effects** (M2) → `active:false`, one at a time, closed immediately; fall back to "sync when the user visits /feed/history" with a visible hint.
- **Estimation honesty** → progress bar is a resume point, absent bar ≠ proof of 100%; every estimate carries a confidence level; UI says "estimated".
- **Storage growth** → monthly event shards + retention setting + export; `unlimitedStorage`.
- **Popup build bug (Node 26/parcel)** → no default_popup in v1; toolbar click opens the dashboard tab.
- **Budget enforcement** (M8): misclassification → fail-open for unknown videos; manual overrides always win; DOM churn → defensive selectors + MutationObserver debounce; performance → per-videoId classification cache; disruption → modes are opt-in, Off by default, one-class kill switch.
- **Watch-page fetch volume (duration resolver)** → only for unknown durations, concurrency ≤ 2, cached forever, skippable in settings.

---

## 11. Resolved decisions (2026-11-02) ✅

1. **Name**: "YT Ledger" (YouTube Ledger).
2. **Retention**: user-configurable, **default 1 year (365d)**.
3. **Sync**: automatic syncs look back 14 days; manual "Refresh / Sync now" anytime with a lookback picker (7–90d) for that run.
4. **Starter rules**: first-install onboarding configures categories/starter rules; fallback to small, basic, non-irritating defaults. Rule-management UX is the priority, not the starter set.
5. **Insights AND budgets are in scope** (phases M6/M7), not deferred.
6. **Budget enforcement on YouTube**: user-selectable per preference — **Gentle** (subtle highlight/border + indicator on over-budget videos), **Strict** (hide/blur titles & thumbnails in feeds/recommendations; dismissible interstitial on watch pages), or **Off**. Content scripts classify visible videos via stored overrides + rules and read a budget-status snapshot (§4.5).
