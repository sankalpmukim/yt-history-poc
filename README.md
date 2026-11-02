# yt-history-poc → YT Ledger

**This repo is becoming "YT Ledger"** — an expense manager for your own
YouTube watch history (watch events = transactions, categories = spending
categories, value scores = the inverse of cost, budgets = time budgets).
See [PLAN.md](./PLAN.md) for the approved product plan and milestones.

**Status: M7 complete** — everything in M6 plus **weekly budgets**: per-category
hours/week in the Budgets tab, spent-vs-budget bars (over/under, week runs
Monday 00:00 local), enforcement-mode picker (off/gentle/strict — enforcement
itself is M8), and a `yl.v2.budgetStatus` snapshot the service worker
refreshes on every relevant storage change so the on-YouTube guard never
re-aggregates events.

**Status: M6 complete** — everything in M5 plus the **onboarding wizard**
(first dashboard open: privacy intro → category-ladder pass with live
renames/re-scores → starter-rules selection with live match counts and a
"start clean" option → budget-mode choice; skipping anywhere keeps the
non-irritating fallback defaults; rerunnable from Settings) and
**Insights**: worst offenders (channels by time in score ≤1), best-value
channels (score ≥4), weekday-average watch pattern, and **rule
suggestions** — channels you keep categorizing the same way manually
("always categorize…?" one click) and channels with the most uncategorized
time.

**Status: M5 complete** — everything in M4 plus the **Rules UI** (ordered
list with enable/reorder/delete, hit counts, dead/archive warnings; full
editor for channel equals/contains, title any-of, title regex + flags,
Shorts-ness, duration bound, priority; **test-run** showing how many stored
videos a rule would match before saving), the **Categories manager** (the
0–5 value ladder: emoji/color/name/score editing, add, archive, reorder,
per-category rule counts), and **Settings**: **Refresh / Sync now** anytime
with a lookback picker (7–90 days, presets + custom), automatic fetch
window, retention (90d / 1 year / forever), budget-mode selector (active
from M8), debug toggles, **JSON backup export/import** and **CSV ledger
export**, and a wipe zone.

**Status: M4 complete** — the **dashboard** is live: click the YT Ledger
toolbar icon to open it (a full tab; no popup — see the known Plasmo/Node-26
popup bug). It ships **Overview** (range picker Today/7/30/90/All; stat
cards for est. watch time, avg/day, time value index, low-value share,
events, uncategorized time; daily stacked-bar trend by category; category
donut + ranked list with share bars and top channels; review queue for
uncategorized videos with inline categorize + one-click channel rules) and
the **Ledger** (the transactions view: watch events grouped by day, search /
category filters, per-row category chips with an "always for this channel"
option, occurrence counts, estimate-confidence dots, multi-select bulk
assign / clear overrides). Hand-rolled SVG charts — zero new runtime deps
beyond react/react-dom.

**Status: M3 complete** — everything in M2 plus the **rules engine**: videos
are auto-categorized on every sync (and re-tried whenever the duration
resolver discovers new duration/isShort evidence) using priority-ordered,
first-match-wins rules over channel (equals/contains), title (substrings or
regex), Shorts-ness, and duration bounds. Matching is case-insensitive and
fails closed — "unknown" data never matches, so categories are only assigned
on real evidence. Manual overrides always win; disabled rules and rules
targeting archived/deleted categories are skipped; invalid regexes disable a
rule rather than break the pass. `hitCount` on each rule reflects how many
videos it currently assigns. Ships with the two starter keyword rules
enabled + a disabled Shorts rule (all editable).

**Status: M2 complete** — everything in M1 plus:
- **Sync coordinator**: a visit to any YouTube page that can't read history
  itself (Brave strips auth from extension-initiated innertube calls) asks
  the service worker to sync elsewhere — it pokes an existing
  `/feed/history` tab if one is announced, else opens one **hidden tab**
  (`active:false`) that auto-scrolls to load the lookback window, syncs,
  acks, and is closed (one at a time, throttled to one coordinator run per
  2 minutes; manual `__YT_LEDGER_SYNC(n)` bypasses the throttle). Leftover
  hidden tabs from dead service workers are cleaned up on startup.
- **Duration resolver**: videos without a duration are queued and backfilled
  from public watch pages (`lengthSeconds` + Shorts page-type detection),
  ≤15 fetches per run, 600ms apart, ≤3 attempts per video, cached forever.
  Auto-scroll only ever runs in hidden tabs — the user's own scrolling is
  never fought.

**Status: M1 complete** — v2 data layer (events with occurrences + monthly
shards, videos, categories, rules, settings), single-writer merge in the
service worker, v1→v2 migration, retention pruning (default 365d, was 48h),
14-day automatic sync window (was 2), duration capture from history
thumbnails, and a read-only fetch observer in the MAIN world so lookback can
go deeper than the first page (as the user scrolls history). The original POC
behavior (sync on every YouTube visit via `/feed/history`'s `ytInitialData`)
is preserved.

## Legacy POC description

Proof of concept: a Plasmo (MV3) browser extension that reads **your own**
YouTube watch history for the **last two days**, caches it in
`chrome.storage.local`, and keeps the cache in sync on every visit — never
fetching or retaining anything older than the 2-day window (Today +
Yesterday).

**Status: WORKING** — verified live in Brave against a real account:
`sections: Today(11), Yesterday(14)` → `stored 25 entries (last 2 days)`.

## How it works (final architecture)

```
┌────────────────────────── youtube.com tab ──────────────────────────┐
│                                                                     │
│ ISOLATED world (contents/history-sync.ts)  [static manifest CS]     │
│  · injects the MAIN-world script via a <script src> tag             │
│    (url: import → auto web_accessible_resource)                     │
│  · asks MAIN for history, merges into chrome.storage.local          │
│  · merge: upsert by videoId, keep firstSeenAt, refresh dayLabel     │
│  · prune: drop entries not in latest fetch AND firstSeenAt > 48h    │
│  · renders a bottom-right overlay + console logs                    │
│                                                                     │
│ MAIN world (contents/history-main.ts)      [injected script tag]    │
│  · on /feed/history: reads window.ytInitialData — the page's own    │
│    authenticated server-rendered history data (no API call needed)  │
│  · parses day-grouped sections (Today/Yesterday/…) via a recursive  │
│    walker; stops at the first section older than yesterday          │
│  · 2026 shapes: lockupViewModel items (contentId,                    │
│    metadata.lockupMetadataViewModel.title.content, progress via     │
│    thumbnailOverlayProgressBarViewModel.startPercent) + legacy      │
│    videoRenderer fallback                                           │
│                                                                     │
│ background (background.ts) — service worker                         │
│  · storage.onChanged relay (debug channel to local capture server)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key discoveries made during the POC (why it looks like this)

1. **No public API exists** for watch history (removed from YouTube Data
   API in 2016; Data Portability API is EU-only + app-verification-gated).
2. **Direct innertube POSTs (`/youtubei/v1/browse`) from extension-injected
   scripts come back `logged_in: 0` in Brave** — even with
   `credentials: "include"` and a valid SAPISIDHASH Authorization header.
   The page's own session cookies are stripped from extension-initiated
   API requests. (May differ in Chrome proper.)
3. **The reliable path: `youtube.com/feed/history` server-renders the
   history into `window.ytInitialData`** — fully authenticated, same
   day-grouped structure, ~50+ items per page load. The extension reads
   what the page itself already fetched.
4. **`chrome.scripting.registerContentScripts(world: "MAIN")` from the
   service worker was unreliable**; the classic `<script src>` injection
   from the isolated script works perfectly.
5. **MV3 permission gotcha**: *updating* an unpacked extension after adding
   `host_permissions` puts it in a permission limbo where content scripts
   silently stop injecting. A fresh Remove + Load unpacked grants
   everything. Lesson: change permissions → reinstall.

### Data captured per entry

```jsonc
{
  "videoId": "eMBI0isVJbo",
  "title": "Drivers React After The Race | 2026 Mexico Grand Prix",
  "channel": "FORMULA 1",
  "url": "https://www.youtube.com/watch?v=eMBI0isVJbo",
  "watchState": "Watched 16%",        // best effort (progress bar)
  "dayLabel": "Today",                // YouTube's day-group header
  "firstSeenAt": "…", "lastSeenAt": "…"  // our own sync timestamps
}
```

> Note: innertube/ytInitialData group items by day ("Today", "Yesterday",
> then weekdays/dates) — no exact watch timestamps. The 2-day window is
> therefore day-granular. Exact times only exist in My Activity / Takeout.

## Run it

```bash
pnpm install
pnpm build          # → build/chrome-mv3-prod
```

1. open `brave://extensions` → enable **Developer mode**
2. **Load unpacked** → select `build/chrome-mv3-prod`
3. open https://www.youtube.com/feed/history — the overlay appears
   bottom-right; console shows `[yt-history-poc]` logs

## Debug tooling (this repo)

- `scripts/adx.py` — robust agent-desktop wrappers for the flaky compound
  UI loop (update-extension with SW-restart verification, switch-tab,
  reload-active, console-grep).
- `scripts/capture-server.py` — local sink the SW relays storage events to
  (`python3 scripts/capture-server.py`, port 8742, writes to
  `/private/tmp/opencode/yt-poc-dumps/`). Page-context fetches to it are
  CSP-blocked; only the service worker can reach it.
- `scripts/test-parse.mjs` — offline parser tests against captured real
  response shapes.

## Verification shortcuts

- Unit tests for the core logic: `pnpm test` (merge/migrate/estimate/
  retention/duration/resolve/rules/ledger — 62 tests, node + esbuild, no
  browser needed).
- After any sync, inspect auto-categorization in the SW console:
  `chrome.storage.local.get("yl.v2.videos", d => Object.values(d["yl.v2.videos"]).filter(v => v.appliedRuleId))`
  — tutorial/lecture-ish titles should show `appliedRuleId:
  "starter-tutorial"/"starter-lecture"`. Rule stats:
  `chrome.storage.local.get("yl.v2.rules", console.dir)` (hitCount = videos
  currently assigned by each rule).
- Manual override check: set a video's `categoryOverride` in the console,
  re-sync (`window.__YT_LEDGER_SYNC()`), and confirm rules leave it alone.
- Console (page context): filter `yt-ledger` — shows sync flow, sections,
  stored-event summary from the service worker.
- Visit `youtube.com` (any page, NOT the history feed): within a few seconds
  the console shows `coordinator: hidden tab N opened (14d lookback)` — a
  background tab opens `/feed/history`, auto-scrolls, syncs, and closes.
- `window.__YT_LEDGER_SYNC()` in the page console forces a re-sync;
  `window.__YT_LEDGER_SYNC(30)` forces one with a 30-day lookback (works
  from any YouTube page — it goes through the coordinator).
- Service-worker console (`brave://extensions` → YT Ledger → service
  worker): watch for `duration resolver: +N resolved…`; the v2 keys are
  `yl.v2.*` (meta, videos, events.<YYYY-MM>, categories, rules,
  durationQueue/durationAttempts, syncState).
- A small on-page debug overlay can be enabled with
  `settings.debugOverlay` in `yl.v2.meta` (off by default).

## Troubleshooting: "YT History POC" overlay / `chrome.storage` undefined

Symptom: a bottom-right overlay with **old POC text** ("YT History POC — 0
videos (last 2 days) … error: Cannot read properties of undefined (reading
'local')") after updating the extension.

Cause: that overlay is rendered by the **old POC content script still alive
in an already-open YouTube tab**. A plain extension *reload* does not
re-inject content scripts into existing tabs — the previous script keeps
running there, orphaned, and after a reload its `chrome.*` bindings are dead
(hence `chrome.storage` being `undefined`). The same text can also linger as
frozen DOM. Independently, reloading (instead of removing + re-adding) an
unpacked extension whose manifest **gained permissions** (`unlimitedStorage`
in M1) can leave it in a permission limbo where extension APIs vanish.

Fix (exact steps):

1. `brave://extensions` → Developer mode on.
2. **Remove every entry** for this project (both "YT History POC" and any
   earlier "YT Ledger" load) — a stale second entry keeps injecting its old
   scripts. Do not keep two.
3. **Load unpacked** → select exactly
   `/Users/sankalpmukim/code/personal/yt-history-poc/build/chrome-mv3-prod`.
   The entry must show **YT Ledger**, version **0.2.1** (see `core/version.ts`;
   a version-sync unit test keeps it matched to package.json).
4. **Hard-reload every open YouTube tab** (⌘⇧R) or close them and open a
   fresh one — this kills orphaned old scripts and lets the new content
   script inject.
5. Verify in the YouTube tab's console (filter `yt-ledger`):
   `content script v0.2.1 loaded on www.youtube.com/…` appears, and
   `window.__YT_LEDGER_VERSION` returns `"0.2.1"`.
6. The new build also **auto-removes any leftover POC overlay** and keeps
   removing it if an orphaned script re-adds it (for 5 minutes after load),
   so the old card disappears once the new script runs.

Quick identity check for "which build is live": the console line above, the
version on `brave://extensions`, and `window.__YT_LEDGER_VERSION` in any
YouTube tab must all agree.

## Known limitations

- No toolbar popup page: Plasmo 0.90.5 pins parcel 2.9.3, whose resolver
  fails on the generated `.plasmo/static/popup.tsx` shim under Node 26.
  Content scripts + background are unaffected. (Build with Node ≤ 22 to
  add one.)
- Reading only happens on `/feed/history` pages. Next step for the POC:
  have the background worker open a hidden tab to `/feed/history`, sync,
  and close it — so any YouTube page open triggers a sync.
- The innertube/ytInitialData shapes are undocumented and churn; the
  parser walks defensively (recursive key search + multiple renderer
  shapes) but will occasionally need updating.
- Personal-use, own-data POC: it reads your history exactly as the
  YouTube tab itself does. Distributing publicly has different policy
  implications (YouTube ToS / store review).
