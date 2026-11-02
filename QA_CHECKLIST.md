# YT Ledger — QA Checklist & Test Plan

Living QA document. Written against the **planned** feature set — PLAN.md plus the
owner's product decisions below — **not** against the current implementation. Test
names describe *intended* behavior; where PLAN.md is ambiguous the case says
**"verify + document"** so the behavior gets pinned down during testing.

Owner decisions (2026-11-02, override PLAN.md where different):

1. Name: **YT Ledger**.
2. Retention user-configurable, **default 1 year (365d)**.
3. Automatic syncs look back **14 days**; a manual **Refresh / Sync now** button
   usable anytime, with a **"more options"** lookback picker (7/14/30/60/90d) for
   that manual run.
4. **Onboarding** on first install configures starter rules/categories; on skip or
   failure fall back to **basic non-irritating defaults**. Creating/managing own
   rules must have **great UX** (a QA focus, partly judgment-based).
5. **Insights and budgets in scope** (later phases).
6. **Budget enforcement on YouTube pages**, user-chosen mode: **off / gentle /
   strict** (see §4.5 of PLAN.md).
7. **Sync must be invisible** and never disrupt YouTube browsing.

Milestone mapping: PLAN.md defines milestones **M1–M8** (M7 = budgets, M8 = budget
enforcement on YouTube). This checklist is organised M1–M8 plus cross-cutting
sections that span phases (install/upgrade/migration, permissions & reinstall,
privacy, performance, error states, empty states, accessibility, regressions), and
ends with a **smoke subset** to run between phases.

---

## How to read this checklist

Each case: **ID · Area · Preconditions · Steps · Expected · Pri · How**.

- **P0** — must-pass for the owning phase's exit; blocks moving on. Correctness of
  money-equivalents (time, categories, budgets), privacy, invisibility of sync,
  fail-open safety.
- **P1** — should-pass before final release; important, usually has a workaround.
- **P2** — polish, rare edge, documentation-level.

**How** (automation suitability):

- **Auto** — deterministic; fully automatable via browser/desktop automation
  (Playwright persistent context with the extension, or agent-desktop) or via
  node/fixture unit tests (`pnpm test`, `scripts/test-parse.mjs` shapes).
- **Semi** — automation can drive the steps, but the pass/fail call needs human
  judgment (visual subtlety, "non-irritating", feel) or is flaky to assert.
- **Manual** — primarily human judgment (UX quality, screen-reader pass, holistic
  session feel).

**Phase exit criteria**: every P0 in the phase section passes; P1 failures are
triaged with the owner; the smoke subset still passes (no regressions in earlier
phases).

### Test environments & fixtures

| Env | Purpose |
|---|---|
| Brave (primary, stable, default Shields) | All live-YouTube cases; the product's target browser |
| Chrome (secondary sanity) | Innertube-auth behavior differs from Brave; basic sync + dashboard pass |
| Fresh profile, signed out | Install defaults, logged-out error states |
| Test profile signed into controlled YouTube account | Live sync, rules, budgets, enforcement |
| Seeded `chrome.storage.local` (snippets run in the SW console) | Empty/large/edge datasets without waiting for real history (20k-event "heavy year", >20h days, old events for retention, over-budget weeks) |
| Offline fixture harness (`scripts/test-parse.mjs` shapes as unit fixtures) | Parser shapes incl. malformed items, day-label matrix, New Year dates |
| Local capture server (`scripts/capture-server.py`, port 8742) | Only for verifying the gated `devRelay` debug channel |

**Seed-account history recipe** (record exact videoIds/durations/times before
testing): one fully-watched long video (no progress bar), one partially watched
(~16%), the same video watched twice in one day, one Short, one tutorial-titled
video, one lecture-titled video, one since-deleted video, one video watched just
before midnight (day-boundary), history spanning a month boundary.

---

## M1 — Data foundation: v2 store, parser, merge, retention, migration

Scope: v2 types/storage/defaults, SW single-writer merge (occurrences, progress
stats), retention prune (365d default), v1→v2 migration, MAIN parser (duration
overlay, daysBack cutoff, fetch observer), thin sync script, manifest/name.
Exit: all P0 pass.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M1-001 | Defaults — categories | Fresh profile, extension just loaded | Dump `yl.v2.categories` from SW console | Exactly the 8 categories of PLAN §3: ids (`brain-rot`…`deep`), names, emoji, scores 0–5, order 0–7 | P0 | Auto |
| M1-002 | Defaults — settings | Fresh install | Dump `yl.v2.meta` | retentionDays=365, fetchWindowDays=14, budgetMode='off', budgetsWeekly={}, debugOverlay=false, devRelay=false, onboardedAt=null | P0 | Auto |
| M1-003 | Meta shard | Fresh install | Inspect `yl.v2.meta` | Has schema version + installedAt; lastSyncedAt/lastSyncStatus/diagnostics empty until first sync | P1 | Auto |
| M1-004 | Storage layout | After a sync spanning ≥2 months | List storage keys | Keys per PLAN §7: meta, videos, categories, rules, durationQueue, events sharded as `yl.v2.events.<YYYY-MM>` | P1 | Auto |
| M1-005 | Sync — first page | Signed-in profile on /feed/history | Load page; wait; dump store | First-page items stored as videos+events; videoId/title/channel/url correct | P0 | Auto |
| M1-006 | Day sections | Page synced | Compare stored grouping vs page day headers | Items grouped under correct day labels (Today, Yesterday, weekday, "Oct 31") | P0 | Auto |
| M1-007 | Lookback cutoff | History older than window | Sync with daysBack=14, then 7 | No events older than requested window; boundary-day inclusion consistent | P1 | Auto |
| M1-008 | Page cap | Very long history | Force deep lookback | Pagination stops at MAX_PAGES=30 even if window uncovered; diagnostics note truncation | P2 | Auto |
| M1-009 | Fetch observer | On /feed/history | Scroll to trigger page's own continuations | Continuation items captured (deeper than first page) and stored | P0 | Auto |
| M1-010 | Continuation day attribution | While scrolling across a day header | Inspect stored events | Items after a day header are attributed to that day | P1 | Semi |
| M1-011 | Parser shapes | Offline fixture harness | Run fixture tests (2026 lockupViewModel + legacy videoRenderer) | Both shapes normalize to identical fields | P1 | Auto |
| M1-012 | Defensive parsing | Fixture with one malformed item | Parse fixture | Bad item skipped; siblings kept; no exception | P1 | Auto |
| M1-013 | Duration — overlay | Item with `thumbnailOverlayTimeStatusRenderer` | Sync | durationSec set; durationSource='overlay' | P0 | Auto |
| M1-014 | Duration — legacy | Item with `lengthText` only | Sync | durationSec set; durationSource='legacy' | P1 | Auto |
| M1-015 | Duration — unknown | Item with neither | Sync | durationSec null; videoId queued in `yl.v2.durationQueue` | P0 | Auto |
| M1-016 | Progress parse | Item "Watched 16%" | Sync | progressPct=16 (resume point) | P0 | Auto |
| M1-017 | No progress bar | Fully-watched item (bar absent) | Sync | progressPct null; estimated as 100%; confidence medium; never counted as 0% | P0 | Auto |
| M1-018 | Occurrences | Same video watched twice in one day | Sync; inspect events | Single event keyed by videoId+watchedOn with occurrences=2 | P0 | Auto |
| M1-019 | Occurrence authority | History re-lists the item differently | Re-sync | Latest fetched occurrence count wins; no stale compounding | P1 | Auto |
| M1-020 | Progress avg vs latest | Two occurrences: 16% and 80% | Inspect event | progressAvgPct=48 used for estimation; progressPct=80 kept for display | P0 | Auto |
| M1-021 | Merge dedupe | Sync twice the same day | Count events | No duplicates; same keys upserted | P0 | Auto |
| M1-022 | Timestamps | Re-sync an existing event | Inspect | firstSeenAt preserved; lastSeenAt refreshed | P1 | Auto |
| M1-023 | Day-label resolution | Unit fixtures: Today / Yesterday / weekday / "Oct 31" / across New Year | Run dayLabelToDate tests | Local-date resolution correct; "Dec 31" seen in January resolves to previous year | P0 | Auto |
| M1-024 | watchedOn stability | Sync an item today; re-sync tomorrow | Compare | watchedOn unchanged when label shifts Today→Yesterday | P0 | Semi |
| M1-025 | Estimation formula | Unit case: known duration + progress + occurrences | Compute | watchedSec = durationSec × progressFraction × occurrences | P0 | Auto |
| M1-026 | Confidence tiers | Unit matrix of known/unknown fields | Compute | high=progress+dur; medium=dur only (progress assumed); low=no duration | P0 | Auto |
| M1-027 | Low-confidence totals | Event with unresolved duration | View dashboard totals | Its time excluded from totals; video still counted; UI explains why | P0 | Semi |
| M1-028 | Confidence surfacing | Any view showing estimates | Inspect | Confidence shown via chip/tooltip + footnote legend; "estimated" wording present | P1 | Semi |
| M1-029 | Suspicious day | Seed a day with >20h estimated time | View that day | Flagged "suspicious day"; total NOT silently clamped | P1 | Semi |
| M1-030 | Retention — default 365d | Seed events 400d old; restart SW | Inspect shards | Events older than 365d pruned; younger kept | P0 | Auto |
| M1-031 | Retention — 90d | Set retentionDays=90; restart SW | Inspect | Only ≤90d events remain | P1 | Auto |
| M1-032 | Retention — forever | Set retentionDays=null; restart SW | Inspect | Nothing pruned regardless of age | P1 | Auto |
| M1-033 | Shrinking retention | 365→90 with old data present | Restart SW (prune trigger) | Prune applies per new setting | P1 | Auto |
| M1-034 | Shard hygiene | After pruning an entire month | List keys | Empty monthly event shards removed | P2 | Auto |
| M1-035 | v1→v2 migration | Profile with `ytHistoryPoc.v1` data | Load product build; trigger startup | v1 entries become v2 videos+events; watchState→progress mapped | P0 | Auto |
| M1-036 | Migration day attribution | v1 entries carry dayLabel | Inspect | watchedOn derived from v1 day label at migration time | P1 | Auto |
| M1-037 | Migration idempotent | Re-run startup/upgrade again | Inspect | No duplicate events; v1 keys left untouched | P0 | Auto |
| M1-038 | Migration robustness | v1 entry missing fields (no watchState) | Migrate | Safe defaults; no crash | P1 | Auto |
| M1-039 | Single-writer merge | Two tabs deliver sections near-simultaneously | Inspect store | All sections merged; nothing lost; shards consistent | P0 | Auto |
| M1-040 | In-flight lock | Trigger a 2nd sync while one runs | Observe coordinator | Coalesced/queued; never two parallel merges | P0 | Semi |
| M1-041 | Crash mid-merge | Kill SW mid-merge via devtools | Restart SW; inspect store | No half-written shard; store consistent; sync can re-run | P1 | Semi |
| M1-042 | Manifest | Build output | Read manifest.json | Name "YT Ledger"; permissions storage, scripting, unlimitedStorage; YouTube host; **no default_popup** | P0 | Auto |
| M1-043 | Core unit suite | Repo checkout | `pnpm test` | merge/migrate/estimate/retention/duration tests all green | P0 | Auto |
| M1-044 | No POC artifacts | Any YouTube page | Load page | No overlay, no POC-era console spam; debug overlay only when enabled | P0 | Semi |
| M1-045 | Month-boundary sharding | History spanning a month change | Sync; list keys | Events written into the correct YYYY-MM shard for each month | P1 | Auto |

## M2 — Hidden-tab sync & duration resolver

Scope: sync coordinator on any YouTube visit (hidden tab, auto-scroll),
throttling, fallbacks, duration resolver queue. Exit: all P0 pass; the
"invisible sync" requirement holds end-to-end.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M2-001 | Coordinator trigger | Signed in; no /feed/history tab open | Visit youtube.com home | Hidden tab to /feed/history opens, syncs, closes; events stored | P0 | Auto |
| M2-002 | Hidden tab focus | User is typing in a page | Trigger a sync | Tab never steals focus (active:false); typing uninterrupted | P0 | Auto |
| M2-003 | Playback undisturbed | A video is playing (with sound) | Trigger sync via navigation | Playback continues; no pause, no audio change, no player state change | P0 | Semi |
| M2-004 | Visual footprint | Watch the tab strip during a sync | Trigger sync | At most a brief background tab; closes promptly; overall unobtrusive | P1 | Manual |
| M2-005 | Auto-scroll bounds | Hidden tab syncing 14d | Observe scroll logs | Scrolls only until the window is loaded; stops; never infinite | P1 | Semi |
| M2-006 | Tab cleanup | After sync completes | Inspect open tabs | Hidden tab closed immediately; none linger | P0 | Auto |
| M2-007 | Orphan cleanup | Leave a hidden history tab; restart browser/SW | Startup | Orphaned sync tab detected and closed | P1 | Semi |
| M2-008 | Throttling | Navigate rapidly across 5+ YT pages | Observe coordinator | No hidden-tab spam; runs throttled/coalesced | P1 | Semi |
| M2-009 | Existing history tab reuse | /feed/history already open elsewhere | Visit another YT page | Existing tab poked/reused; no duplicate hidden tab | P1 | Semi |
| M2-010 | One at a time | Trigger sync from 2 tabs quickly | Observe | Single coordinator run; serialized | P1 | Semi |
| M2-011 | Sync fallback | Force hidden-tab sync to fail (go offline) | Then user opens /feed/history | Sync completes there; a visible hint is shown | P1 | Semi |
| M2-012 | Logged out | Signed out of YouTube; visit YT | Observe | Graceful failure + diagnostics; no open/close tab loop | P0 | Semi |
| M2-013 | No auto-scroll in user tabs | User browsing /feed/history themselves | Watch the tab during its sync | Extension never scrolls the user's own tab | P0 | Semi |
| M2-014 | Invisibility on content pages | Watch a video normally for 5 min | Observe page | No extension UI, no console spam, no perceptible slowdown | P1 | Semi |
| M2-015 | Fullscreen | Fullscreen video; navigate within YT | Observe | Sync never exits fullscreen | P1 | Semi |
| M2-016 | Duration backfill | An unknown-duration event exists | Wait for resolver run | durationSec filled; durationSource='watch-page' | P0 | Auto |
| M2-017 | Duration cache | After a video was resolved | Re-sync the same video | No new watch-page fetch (cached forever) | P1 | Auto |
| M2-018 | Resolver throttling | Queue of ~20 unknown durations | Watch network panel | ≤2 concurrent, spaced requests; no burst; no YT rate-limit page | P1 | Semi |
| M2-019 | Resolver give-up | Deleted/private video in queue | Let resolver run | Bounded attempts then skip; stays low-confidence; count still shown | P1 | Semi |
| M2-020 | Shorts detection | A Short in the queue | After resolver run | isShort set from the watch page | P1 | Auto |
| M2-021 | Totals update after backfill | Event previously time-hidden | After resolution | Estimated time now included in totals | P0 | Semi |
| M2-022 | Resolver skip setting | Settings page exists | Toggle skip | No watch-page fetches while disabled | P2 | Semi |
| M2-023 | Multi-tab no dupes | 2 YT tabs both trigger a sync | Inspect events | Single set of events; no duplicates | P0 | Auto |
| M2-024 | SW lifecycle | Idle long enough for MV3 SW kill; visit YT | Observe | SW restarts; sync state sane; no stuck in-flight lock | P1 | Semi |

## M3 — Rules engine

Scope: pure-TS engine applied on sync; precedence; matchers; overrides;
uncategorized handling; starter/fallback rules. Exit: all P0 pass; engine
unit tests green.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M3-001 | Auto-apply on sync | Rules exist; new videos arrive via sync | Sync | Rules run once per new video; autoCategoryId/appliedRuleId set | P0 | Auto |
| M3-002 | Priority — first match wins | Two rules both matching, different priority order | Sync/evaluate | Lower priority number wins; later matches ignored | P0 | Auto |
| M3-003 | channelEquals | Rule with channelEquals | Evaluate fixtures (case variants) | Case-insensitive exact match only | P0 | Auto |
| M3-004 | channelContains | Rule with channelContains | Evaluate fixtures | Case-insensitive substring match | P0 | Auto |
| M3-005 | titleContains any-of | Rule with multiple terms | Evaluate | Any term matches; case-insensitive | P0 | Auto |
| M3-006 | titleRegex | Rule with regex + flags | Evaluate | Regex with flags honored (e.g. `i`) | P0 | Auto |
| M3-007 | isShort condition | isShort true/false/unknown videos | Evaluate | Matches only when isShort===true; unknown does not match | P0 | Auto |
| M3-008 | maxDurationSec | Durations known | Evaluate | Matches only when duration ≤ threshold | P0 | Auto |
| M3-009 | Condition combination | Rule with channel + title + isShort | Evaluate | Conditions AND-ed | P1 | Auto |
| M3-010 | Override beats rules | Video with categoryOverride; matching rule exists | Sync again | Override kept; rule never re-applies to it | P0 | Auto |
| M3-011 | Uncategorized never silent | No rule matches; no override | Inspect video | autoCategoryId null; surfaces in uncategorized/review queue; never a default guess | P0 | Auto |
| M3-012 | Events inherit category | Video categorized | Inspect its events | Events use video's category (override ?? auto ?? uncategorized) | P1 | Auto |
| M3-013 | Rule stats | Rule fired | Inspect rule | hitCount incremented; lastHitAt updated | P1 | Auto |
| M3-014 | Disabled rule inert | Rule disabled but matching | Sync | Not applied | P0 | Auto |
| M3-015 | Invalid regex fails safe | Rule with broken regex (e.g. `[`) | Run engine | No crash; rule skipped/failing gracefully; sync unaffected | P0 | Auto |
| M3-016 | Rule → archived category | Rule targets archived category | Evaluate | Safe behavior (no crash; verify + document treatment) | P2 | Semi |
| M3-017 | Engine parity | Same inputs in node, SW, and content script | Run engine in all three | Identical categorization (needed for M8 on-page evaluation) | P1 | Auto |
| M3-018 | Re-runs don't churn | Re-sync unchanged videos | Inspect | autoCategoryId/appliedRuleId not recomputed pointlessly; overrides intact | P0 | Auto |
| M3-019 | Retro-apply semantics | New rule matching existing stored videos | Save rule | Behavior matches design (auto-apply to stored videos or explicit apply affordance); overrides never clobbered — verify + document | P1 | Semi |
| M3-020 | Duration-dependent timing | maxDurationSec rule; duration resolves later | Sync → resolve → re-eval | Category reflects duration once known (or documented limitation) | P1 | Semi |
| M3-021 | isShort-unknown timing | isShort rule; video not yet resolved | Evaluate before/after resolver | Defined behavior (no match until known; applies when known) — verify + document | P1 | Semi |
| M3-022 | Fallback starter set | Onboarding not completed | Inspect rules | Two enabled keyword rules (tutorial/how to/guide → Practical; lecture/course/crash course → Courses) + disabled "Shorts → Brain rot" | P0 | Auto |
| M3-023 | Starter rule matching | Titles like "Python tutorial", "Lecture 3" | Evaluate | Land in Practical how-tos / Courses & lectures respectively | P1 | Auto |
| M3-024 | Shorts rule activation | Enable the disabled Shorts rule | Evaluate a Short | Routed to Brain rot | P1 | Auto |
| M3-025 | Rules after migration | Videos imported from v1 | Post-migration pass | Rules applied to migrated videos | P1 | Auto |
| M3-026 | Empty-condition rule | Rule with no conditions | Save/evaluate | Rejected by editor or safely non-matching; never catch-all | P2 | Semi |
| M3-027 | Priority stability | Reorder/delete rules | Inspect priorities | Order stays consistent; no gaps/dupes breaking first-match-wins | P1 | Auto |
| M3-028 | Engine unit tests | Repo | `pnpm test` (rules) | Precedence/regex/isShort/duration cases green | P0 | Auto |
| M3-029 | Unicode & case-folding | Titles/channels with emoji, CJK, German ß, Turkish İ | Evaluate | Matching case-insensitive & unicode-safe; no false positives | P2 | Auto |
| M3-030 | Pathological regex | Rule with catastrophic-backtracking regex | Evaluate with long title | Guarded (length limit/timeout); no SW hang — verify + document | P2 | Semi |

## M4 — Dashboard: Overview + Ledger + review queue

Scope: toolbar→dashboard, Overview cards/charts, Ledger CRUD-ish flows, inline
categorization. Exit: all P0 pass against real history.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M4-001 | Toolbar → dashboard | Extension loaded | Click toolbar icon | Dashboard tab opens (no popup in v1) | P0 | Auto |
| M4-002 | Focus existing | Dashboard already open | Click toolbar icon again | Existing tab focused; no duplicate tabs | P0 | Auto |
| M4-003 | Hash routes | Dashboard open | Switch tabs; use back/forward; deep-link a hash | Views switch correctly; browser history works | P1 | Auto |
| M4-004 | Stat cards present | Data synced | Open Overview | Cards: total est. watch time, avg/day, # videos, time value index (0–5), brain-rot share %, uncategorized count | P0 | Auto |
| M4-005 | Range switcher | Data across ranges | Toggle Today/7d/30d/90d/All | Cards + charts update per range | P0 | Auto |
| M4-006 | Range math | Seeded events at day boundaries | Compare computed vs hand-calculated | Today = local midnight boundary; 7d rolling includes today; correct slicing | P1 | Auto |
| M4-007 | Time value index | Seeded known dataset | Compare vs hand-calc | Weighted by watched time × score over total watched time; 0–5 scale; formula documented | P0 | Auto |
| M4-008 | Brain-rot share | Seeded dataset | Compare | % of time in score ≤1 categories; matches hand-calc | P0 | Auto |
| M4-009 | Trend chart | Multi-day data | Inspect stacked daily bars | Daily bars stacked by category; buckets match watchedOn; hover shows values | P1 | Semi |
| M4-010 | Breakdown | Data present | Inspect donut + ranked list | Per-category hours, % share, top channels listed | P0 | Auto |
| M4-011 | Share math | Seeded dataset | Sum category shares | Shares ≈100% of *estimated* time; low-confidence policy applied consistently | P1 | Auto |
| M4-012 | Review queue | Uncategorized videos exist | Inspect Overview card | Latest uncategorized listed with inline category chips + "assign all from this channel" | P0 | Auto |
| M4-013 | Assign from queue | Queue populated | Click chips; use channel shortcut | Video(s) categorized; card and aggregates update live | P0 | Auto |
| M4-014 | Ledger listing | Data present | Open Ledger | Chronological events grouped by day (verify direction); all days present | P0 | Auto |
| M4-015 | Ledger columns | Data present | Inspect row | Title (link), channel, duration, est. watched, category chip, value tier, confidence | P0 | Auto |
| M4-016 | Title links | Ledger row | Click title | Opens correct YouTube video (new tab) | P1 | Auto |
| M4-017 | Category chip | Ledger row | Click chip; pick category | Sets manual override; chip + aggregates update immediately | P0 | Auto |
| M4-018 | Always-categorize channel | Manual assignment dialog | Use "always categorize this channel as…" | Rule created in one click; applies to that channel's videos | P0 | Auto |
| M4-019 | Ledger search | Data present | Search by title; by channel | Results filter correctly and quickly | P0 | Auto |
| M4-020 | Ledger filters | Data present | Filter by category / channel / value tier | Combinable filters behave | P1 | Auto |
| M4-021 | Multi-select bulk | Many rows visible | Select 12 rows; bulk categorize | All selected get the category in one action | P0 | Auto |
| M4-022 | Bulk semantics | Bulk applied | Inspect; attempt undo path | Bulk sets overrides (or creates rule) per design; mistake recoverable — verify + document | P1 | Semi |
| M4-023 | Estimate labeling | Estimates visible | Hover/inspect | "estimated" wording; confidence tooltips; footnote legend present | P1 | Semi |
| M4-024 | Low-confidence rows | Unresolved-duration event | Inspect row + totals | Row shows count; time shown as pending/— and excluded from totals | P0 | Semi |
| M4-025 | Uncategorized bucket | Uncategorized events exist | Inspect | Shown as first-class bucket; never silently assigned | P1 | Auto |
| M4-026 | Dark theme | Dashboard open | Visual check | YouTube-matching dark theme (#0f0f0f / #f1f1f1) | P2 | Semi |
| M4-027 | Live updates | Dashboard open while a sync runs | Watch views | Views refresh via storage.onChanged without reload | P1 | Auto |
| M4-028 | Large dataset | Seeded heavy year (~20k events) | Open each view | Renders without freeze; usable interactions | P1 | Semi |
| M4-029 | Avg/day math | Seeded dataset | Compare | avg/day = range total / range days (verify day-count convention) | P1 | Auto |
| M4-030 | Occurrences surfaced | Event with occurrences=3 | Inspect Ledger row | Repeat count visible (e.g. ×3); estimate uses it | P1 | Semi |
| M4-031 | Suspicious day surfaced | Seeded >20h day | View that day | "Suspicious day" flag visible; total not clamped | P1 | Semi |
| M4-032 | No-popup guard | Any build | Check toolbar behavior | No broken popup; click always opens dashboard (regression vs Plasmo/Node-26 bug) | P0 | Auto |
| M4-033 | Logged-out dashboard | Not signed in | Open dashboard | Opens cleanly; empty/guidance states; no errors | P1 | Auto |
| M4-034 | Data spot-check | Real history | Sample 5 videos | Dashboard numbers match storage dump exactly | P0 | Semi |

## M5 — Rules UI, Categories manager, Settings

Scope: rule editor + test-run + reorder, category manager, Settings (Sync now +
lookback picker, retention, export/import, danger zone). Exit: all P0 pass; rule
management UX judged good.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M5-001 | Rule creation | Dashboard open | Create rule of each condition type | All condition types (channel is/contains, title substring/regex, is Short, duration < N) available & saved | P0 | Auto |
| M5-002 | Test-run exists | Stored videos present | Open editor; type conditions | Live match count vs stored videos shown before saving | P0 | Auto |
| M5-003 | Test-run correct | Seeded dataset; hand-counted matches | Compare | Count matches exactly | P0 | Auto |
| M5-004 | Enable/disable | Rule exists | Toggle | Disabled rule stops applying; enabled resumes | P0 | Auto |
| M5-005 | Edit rule | Rule exists | Edit condition/category; save | Change persists; re-evaluation per design (see M3-019) | P1 | Auto |
| M5-006 | Delete rule | Rule exists | Delete | Gone; no longer applies; no orphan references | P0 | Auto |
| M5-007 | Reorder rules | ≥2 rules | Drag reorder | Priority changes; first-match-wins respects new order immediately | P0 | Auto |
| M5-008 | Regex validation | Editor open | Enter invalid regex | Blocked with clear message before save | P0 | Auto |
| M5-009 | Regex flags | Editor open | Set flags | Flags honored by test-run and engine | P1 | Auto |
| M5-010 | Category select | Editor open | Try saving without category | Prevented; must pick valid (non-archived) category | P1 | Auto |
| M5-011 | Starter rules editable | Fallback set present | Edit/disable starter rules | Fully editable like user rules; visibly labeled | P1 | Auto |
| M5-012 | Rule stats shown | Rules with hits | View list | hitCount / lastHitAt visible | P2 | Auto |
| M5-013 | Rule UX judgment | Real history | Create a channel rule in ≤30s from Ledger context | Fast, obvious, no dead-ends (owner: rules UX is the priority) | P1 | Manual |
| M5-014 | Order obviousness | Several rules | View list | Priority order visually obvious (numbers or clear ordering) | P1 | Manual |
| M5-015 | Category create | Manager open | Create category mid-ladder with emoji/color/score | Created at chosen position; appears in all pickers | P0 | Auto |
| M5-016 | Category edits propagate | Category in use | Rename/re-score/re-color | Reflected across Overview, Ledger, chips, Insights immediately | P0 | Auto |
| M5-017 | Category archive | Category in use | Archive it | Removed from pickers; existing videos handled sensibly (verify + document) | P1 | Semi |
| M5-018 | Category reorder | Several categories | Reorder | New order reflected in ladder, breakdown lists, pickers | P1 | Auto |
| M5-019 | Archive vs delete | Manager open | Attempt delete | Only archive offered (per plan) or delete guarded; document | P2 | Semi |
| M5-020 | Score change effects | Scored data present | Change a category's score | Time value index + brain-rot share recompute correctly | P0 | Auto |
| M5-021 | Archive-with-rules warning | Rule targets category | Archive it | Warning shown; rule handling defined (see M3-016) | P1 | Semi |
| M5-022 | Sync status panel | ≥1 sync run | Open Settings | Last sync time, result, diagnostics shown; link to Sync now | P0 | Auto |
| M5-023 | Sync now | Anytime (even just synced) | Click Refresh/Sync now | Manual sync runs immediately regardless of throttle | P0 | Auto |
| M5-024 | Lookback picker | Settings open | Open "more options" | 7/14/30/60/90-day choices offered for this manual run | P0 | Auto |
| M5-025 | Deep manual sync | 90d chosen; history deep enough | Run manual sync with 90d | Older events stored (bounded by MAX_PAGES); status reflects run | P0 | Semi |
| M5-026 | One-shot lookback | After a 90d manual run | Observe next automatic sync | Auto sync still uses configured 14d window (picker applies to that run only) | P0 | Auto |
| M5-027 | Auto window config | Settings open | Change automatic fetch window 7–30 | Persisted; bounds enforced; future auto syncs honor it | P1 | Auto |
| M5-028 | Retention selector | Settings open | Switch 90/365/forever | Persisted; prune verified (cross-ref M1-030..033) | P0 | Auto |
| M5-029 | Export JSON | Populated store | Export | Backup includes settings, categories, rules, videos, events (all shards) | P0 | Auto |
| M5-030 | Export CSV | Populated store | Export CSV | Sensible tabular columns (day, title, channel, duration, est, category) | P1 | Auto |
| M5-031 | Import restore | Fresh profile + export file | Import | Full state restored; dashboards correct | P0 | Auto |
| M5-032 | Import corrupt file | Garbage/foreign JSON | Import | Graceful error; existing data untouched | P0 | Auto |
| M5-033 | Import semantics | Existing data + import | Import | Merge-vs-replace semantics defined & predictable; no silent duplicates | P1 | Semi |
| M5-034 | Danger zone wipe | Data present | Wipe (with confirmation) | All `yl.v2.*` cleared; defaults reseeded; onboarding state reset | P0 | Auto |
| M5-035 | Wipe scope for v1 | `ytHistoryPoc.v1` present | Wipe | v1 keys treatment defined (kept per "untouched" vs full wipe) — verify + document | P2 | Semi |
| M5-036 | Debug overlay toggle | Settings open | Toggle on; visit YouTube | Overlay appears only when enabled; off by default | P2 | Auto |
| M5-037 | devRelay toggle | Settings open | Check default | Off by default; no capture-server traffic unless enabled | P1 | Auto |
| M5-038 | Resolver skip | Settings open | Toggle duration-resolver skip | No watch-page fetches when disabled | P2 | Semi |
| M5-039 | Settings persistence | Change several settings | Restart browser | All settings persist | P0 | Auto |
| M5-040 | Export versioning | Export file | Inspect file | Schema version stamped for future import compatibility | P2 | Auto |

## M6 — Onboarding wizard + Insights

Scope: first-install wizard (categories, starter rules with live counts, budget
mode, fallback defaults) and Insights (worst offenders, best value, weekday
averages, rule suggestions). Exit: all P0 pass on a fresh profile.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M6-001 | Wizard auto-runs | Fresh install; first dashboard open | Open dashboard | Wizard starts automatically on first open | P0 | Auto |
| M6-002 | Welcome + privacy note | Wizard step 1 | Read | Local-only privacy note clearly stated | P1 | Semi |
| M6-003 | Ladder walkthrough | Wizard step 2 | Rename, reorder, remove a category | Edits apply; 0–5 spectrum visible | P0 | Auto |
| M6-004 | Starter rules + live counts | History already synced | Open starter-rules step | Suggested keyword rules show live match counts vs existing history | P0 | Auto |
| M6-005 | Start clean | Wizard step 3 | Choose "start clean" | No starter rules created | P1 | Auto |
| M6-006 | Budget step skippable | Wizard step 4 | Skip | Completable without choosing; budgetMode stays 'off' | P1 | Auto |
| M6-007 | Completion recorded | Finish wizard | Inspect settings | `settings.onboardedAt` set; wizard never re-runs on later opens | P0 | Auto |
| M6-008 | Dismiss early → fallback | Wizard open | Close/dismiss at step 2 | Fallback defaults active: 8 categories + 2 enabled keyword rules + 1 disabled Shorts rule | P0 | Auto |
| M6-009 | Fallback non-irritating | Fallback active | Review Rules UI | Rules visible, editable, few — not noisy (judgment) | P1 | Manual |
| M6-010 | Wizard with existing data | Sync ran before first dashboard open | Run wizard | Live match counts non-zero and correct; wizard works with populated store | P1 | Auto |
| M6-011 | Wizard skippable, no trap | Wizard open | Navigate away/decline | Dashboard usable without completing; no blocking modal loop | P1 | Semi |
| M6-012 | Re-run after wipe | Wipe data | Open dashboard | Wizard runs again (onboarding state reset) | P1 | Auto |
| M6-013 | Upgraded POC user | v1 data migrated | First dashboard open | Wizard runs once; migrated data preserved | P1 | Semi |
| M6-014 | Wizard failure | Simulate storage error mid-wizard | Complete/fail step | Falls back to defaults; no lockout or blank dashboard | P1 | Semi |
| M6-015 | Wizard mid-state | Dismiss after partial edits | Reopen dashboard | Partial choices either kept or cleanly restarted — defined behavior | P2 | Semi |
| M6-016 | Worst offenders | Scored history | Open Insights | Top channels ranked by low-value (score ≤1) watch time | P0 | Auto |
| M6-017 | Best-value channels | Scored history | Open Insights | High-score channels ranked by time | P1 | Auto |
| M6-018 | Weekday averages | Multi-week data | Open Insights | Weekday averages shown (no hour heatmap — day granularity only) | P1 | Auto |
| M6-019 | Rule suggestions | Channel manually re-categorized repeatedly | Trigger Insights | "Always categorize X as…?" offered; accept creates rule; decline mutes | P0 | Auto |
| M6-020 | Explicit learning only | Suggestions visible | Inspect | Nothing auto-created; learning only via explicit user action | P1 | Semi |
| M6-021 | Insights empty state | <7 days data | Open Insights | Friendly insufficient-data state | P1 | Auto |
| M6-022 | Insights ranges | Data present | Switch range | Insight figures respect selected range consistently | P2 | Auto |
| M6-023 | Insights reconcile | Same dataset | Compare vs Overview | Totals agree with Overview for same range | P1 | Auto |
| M6-024 | Value spectrum display | Categories scored | View Insights | 0–5 spectrum surfaced; low-value share consistent with Overview | P2 | Semi |

## M7 — Budgets core (UI, weekly logic, status snapshot)

Scope: weekly per-category budgets, spent-vs-budget views, Monday-00:00-local
week, `yl.v2.budgetStatus` snapshot. Exit: all P0 pass.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M7-001 | Set weekly budget | Categories exist | Set e.g. 5h/week for Brain rot | Saved (secondsPerWeek); visible in UI | P0 | Auto |
| M7-002 | Spent vs budget bars | Seeded week of watch data | Open Budgets | Spent/budget bars correct; over/under status right | P0 | Auto |
| M7-003 | Week definition | Any | Inspect week window | Week = Monday 00:00 → Sunday 24:00 local | P0 | Auto |
| M7-004 | Partial week | Mid-week | Check spend | Only this ISO week's events counted | P0 | Auto |
| M7-005 | Rollover moment | Seed spend; cross Monday 00:00 (or mock clock) | Observe | Spend resets at Monday 00:00 local; prior week archived in views | P0 | Semi |
| M7-006 | No budget = unlimited | Category without budget | Spend heavily | Never shown over-budget | P0 | Auto |
| M7-007 | Zero budget edge | Budget = 0 set | Spend anything | Sensible over-budget behavior (verify + document) | P1 | Semi |
| M7-008 | Status snapshot | Budgets + spend | Inspect `yl.v2.budgetStatus` | Per-category spent seconds vs budget; refreshed on every sync/storage change | P0 | Auto |
| M7-009 | Snapshot math | Seeded dataset | Hand-compare | Spent = Σ watchedSec for the current week per category | P0 | Auto |
| M7-010 | Multiple categories | 3 budgets, mixed over/under | View | Each shown correctly simultaneously | P1 | Auto |
| M7-011 | Budget edits live | Over-budget now | Change budget above spend | Status + bars update without restart | P1 | Auto |
| M7-012 | Mode picker | Settings/Budgets | Check picker | Off / Gentle / Strict present; default Off | P0 | Auto |
| M7-013 | Low-confidence consistency | Unresolved durations this week | Compare Budgets vs Overview | Same exclusion policy as totals (spend may lag until durations resolve; documented) | P1 | Semi |
| M7-014 | Archived categories | Budget set, then archive | View Budgets | Hidden from active view; spend not orphaned | P2 | Semi |
| M7-015 | Budgets in export | Budgets configured | Export; wipe; import | Budgets + mode survive round-trip | P1 | Auto |
| M7-016 | Week label | Budgets view | Inspect | Current week's date range displayed | P2 | Auto |
| M7-017 | Occurrences counted | Video watched 3× in-week | Compute spend | 3× the per-watch estimate counted | P1 | Auto |
| M7-018 | Rename keeps budget | Budget set | Rename category | Budget stays attached | P1 | Auto |

## M8 — Budget enforcement on YouTube (off / gentle / strict)

Scope: `budget-guard` content script; classification precedence (override →
stored auto → on-page rules → unknown fail-open); gentle indicators; strict
hiding/blur + interstitial; guardrails (cache, debounce, kill switch,
fail-open). Surfaces: home, search, watch page + its recommendations, Shorts.
Exit: all P0 pass in a live Brave walkthrough across all three modes.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| M8-001 | Off default | Fresh install; over-budget spend seeded | Browse home/search/watch/Shorts | Zero DOM changes; YouTube indistinguishable from stock | P0 | Auto |
| M8-002 | Off overhead | Mode off | Browse normally | No perceptible cost from guard (script idle/absent) | P1 | Semi |
| M8-003 | Mode switching | YouTube tab open | Change mode in Settings; reload/SPA-nav | New mode applies without reinstall/restart | P0 | Auto |
| M8-004 | Gentle — home | Over-budget category; gentle on | Load home feed | Subtle red thumbnail border + small "over budget · <category>" chip on matching videos | P0 | Semi |
| M8-005 | Gentle — search | Same | Search for over-budget content | Same indicator on results | P0 | Semi |
| M8-006 | Gentle — recommendations | Same | Open any watch page | Rail/sidebar recommendations show indicator | P0 | Semi |
| M8-007 | Gentle — watch banner | Over-budget video opened | Open its watch page | Dismissible banner shown; informational | P0 | Semi |
| M8-008 | Gentle — Shorts shelf | Over-budget Short in feed | Browse home Shorts shelf / Shorts feed | Chip/border present on Shorts | P1 | Semi |
| M8-009 | Gentle non-invasive | Indicators visible | Click/hover/observe layout | Nothing moves; clicks unaffected; purely informational | P0 | Manual |
| M8-010 | Banner persistence | Banner dismissed | SPA-navigate; return | Doesn't re-appear instantly; behavior defined (session/page) — verify + document | P1 | Semi |
| M8-011 | Strict — feeds | Strict on; over-budget items in home | Load home | Titles + thumbnails blurred/hidden; placeholder "hidden — <category> over budget" | P0 | Semi |
| M8-012 | Strict — search | Same | Search over-budget terms | Same hiding on results | P0 | Semi |
| M8-013 | Strict — recommendations | Same | Watch page | Rail recommendations hidden/blurred with placeholder | P0 | Semi |
| M8-014 | Reveal once | Strict; reveal enabled in settings | Click "reveal once" | Single item revealed; mode still active for others | P1 | Semi |
| M8-015 | Strict — interstitial | Over-budget watch page | Open video | Dismissible interstitial "You're N min over budget in <category>" + "Watch anyway" | P0 | Semi |
| M8-016 | Interstitial math | Known overage | Compare N vs snapshot | N min matches budgetStatus overage | P0 | Auto |
| M8-017 | Watch anyway | Interstitial shown | Click "Watch anyway" | Video plays; dismissal scope defined (per visit) — verify + document | P1 | Semi |
| M8-018 | Strict never blocks | Strict active | Navigate/open pages | Navigation/load never blocked; only content obscured | P0 | Semi |
| M8-019 | Unknown fail-open | Video not in store; no rule matches | Both modes | Never marked over-budget; always shown | P0 | Auto |
| M8-020 | Override respected | Override changed via dashboard | Reload YouTube | On-page treatment follows override | P0 | Auto |
| M8-021 | On-page rules parity | Rule-matched video not yet stored | Compare page treatment vs SW categorization | Content-script engine result identical to SW | P0 | Auto |
| M8-022 | Stored category preferred | videoId known | Browse | Uses stored category; no redundant re-evaluation churn | P1 | Semi |
| M8-023 | Deleted/archived category | Budget references archived category | Browse | Fail-open/safe display; no crash | P1 | Semi |
| M8-024 | Engine throw → fail-open | Inject/fault engine error | Load page | Page renders normally; no enforcement deadlock | P0 | Semi |
| M8-025 | One-class kill switch | Enforcement UI present | Toggle kill switch / remove class | All enforcement UI removable instantly via single mechanism | P1 | Semi |
| M8-026 | Missing/stale snapshot | `yl.v2.budgetStatus` absent | Load page | Guard fails open; no errors thrown at user | P0 | Semi |
| M8-027 | Snapshot refresh cadence | YT open; sync completes | Observe indicators | Indicators update on next nav/refresh; staleness bounded — verify + document | P1 | Semi |
| M8-028 | Per-videoId cache | Long feed scroll | Profile classification calls | Cached per videoId; no per-frame re-evaluation | P1 | Semi |
| M8-029 | Scroll performance | Strict on; fast-scroll home/search | Record long tasks / input latency | Debounced MutationObserver; no jank | P0 | Semi |
| M8-030 | SPA navigation | Mode on | home → watch → search → home | Indicators re-apply; no duplicates or zombie overlays | P0 | Semi |
| M8-031 | Infinite scroll | Mode on | Keep scrolling feed | Newly loaded items classified (both modes) | P0 | Semi |
| M8-032 | Selector drift | Simulate changed DOM shapes | Load page | Fails open; no console error spam | P1 | Semi |
| M8-033 | YT themes | Dark + light YouTube theme | Check indicators | Legible in both themes | P1 | Manual |
| M8-034 | Miniplayer/theater | Banner/interstitial shown | Use miniplayer/theater modes | Player controls unaffected | P2 | Manual |
| M8-035 | Shorts surface | Strict on; over-budget Shorts | Open Shorts feed | Strict/gentle handling works on the Shorts surface specifically | P1 | Semi |
| M8-036 | Continue-watching rows | Resume rows on home | Check treatment | Rows treated like other feed items | P2 | Semi |
| M8-037 | Mixed over-budget feed | Two categories over budget | Browse mixed feed | Each item judged by its own category | P1 | Auto |
| M8-038 | Budget clears mid-session | Cross week rollover with page open | Continue browsing | Indicators clear once under budget | P1 | Semi |
| M8-039 | Scope containment | Mode on | Visit non-YouTube pages; YT embeds elsewhere | No enforcement/leakage outside youtube.com pages | P1 | Semi |
| M8-040 | No phantom activity | Enforcement active | Browse/watch | Guard never writes events or affects sync data | P1 | Auto |

## INST — Install / upgrade / migration from the POC

Cross-phase. Covers fresh install, in-place upgrade of the unpacked POC →
product, migration end-to-end, persistence, reinstall data loss.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| INST-001 | Fresh install | Built output | brave://extensions → Load unpacked | Loads without errors; SW active; no install-time console errors | P0 | Auto |
| INST-002 | In-place upgrade from POC | POC build installed | Update unpacked extension to product build | Content scripts still inject (MV3 permission-limbo gotcha addressed — see PERM-002) | P0 | Semi |
| INST-003 | Upgrade keeps v2 data | Product build with data | Update to newer build | All shards preserved; version bumped cleanly | P1 | Auto |
| INST-004 | POC migration E2E | Profile with real `ytHistoryPoc.v1` data | Install product build; open dashboard | Migrated history visible in v2 (cross-ref M1-035..038) | P0 | Semi |
| INST-005 | Uninstall clears storage | Data present | Remove extension; reinstall | chrome.storage.local wiped on removal (expected MV3 behavior; export is the recovery path) | P1 | Auto |
| INST-006 | Reinstall + import | Export file saved | Reinstall; import JSON | Full state restored (settings, categories, rules, videos, events) | P0 | Auto |
| INST-007 | Downgrade guard | Newer-schema data | Load older build | No corruption; readable state or safe refusal with message | P2 | Semi |
| INST-008 | Restart persistence | Data present | Restart browser | All shards + settings intact | P0 | Auto |
| INST-009 | Profile isolation | Two Brave profiles, both installed | Use both | Data fully isolated per profile | P1 | Auto |
| INST-010 | Chrome secondary | Same build in Chrome | Run smoke subset | Core sync + dashboard work (note innertube-auth differences vs Brave) | P2 | Semi |
| INST-011 | Update mid-sync | Hidden-tab sync in-flight | Update/reload extension | No stuck state after SW restart; orphan tab cleaned | P2 | Semi |
| INST-012 | Huge history account | Years of watch history | Fresh install; auto sync | Auto sync bounded to 14d (fast); deeper data only via manual lookback, bounded by MAX_PAGES | P1 | Semi |

## PERM — Permissions & reinstall

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| PERM-001 | Manifest permissions | Built output | Diff manifest vs plan | Exactly: permissions storage, scripting, unlimitedStorage; hosts `*://*.youtube.com/*` + `127.0.0.1:8742`; no extras (no tabs, cookies, webRequest, history) | P0 | Auto |
| PERM-002 | Update keeps injection | Extension installed | Re-load updated build without reinstall | Content scripts still inject after update; if permission change requires it, remove+reinstall is prompted/documented | P0 | Semi |
| PERM-003 | Permission-limo recovery | Simulate limbo (update added host perms) | Follow documented recovery | Remove + Load unpacked restores function; docs warn storage is cleared → export first | P1 | Semi |
| PERM-004 | unlimitedStorage headroom | Seeded >5MB store | Write + read | No quota errors with large datasets | P1 | Auto |
| PERM-005 | Site-access restrictions | Brave site permissions restrict extension on YT | Sync attempt | Graceful degradation + diagnostics | P2 | Semi |
| PERM-006 | Dev host unused by default | devRelay off | Monitor network | Zero requests to 127.0.0.1:8742 (cross-ref PRIV-002) | P0 | Auto |
| PERM-007 | Remote-code hygiene | Built output | Inspect for eval/remote scripts | No remote code; MV3 CSP clean | P1 | Auto |
| PERM-008 | Incognito behavior | Incognito window | Open YT in incognito | Extension off by default there; if manually enabled, no sync of incognito history, no errors | P2 | Semi |

## PRIV — Privacy (nothing leaves the machine)

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| PRIV-001 | Network egress audit | Full session: sync + dashboard + enforcement | Record all extension-initiated requests | Only youtube.com (page-context sync/duration resolver); zero third-party/analytics endpoints | P0 | Semi |
| PRIV-002 | devRelay default off | Fresh install | Monitor port 8742 | Zero pings until user enables devRelay | P0 | Auto |
| PRIV-003 | devRelay scope | devRelay enabled | Monitor | Pings only to local capture server; stops when toggled off | P1 | Auto |
| PRIV-004 | Local-only storage | Any session | Inspect storage areas | Everything in chrome.storage.local; nothing in chrome.storage.sync | P0 | Auto |
| PRIV-005 | No remote resources | Dashboard open | Inspect network/CSP | Dashboard loads no remote scripts/fonts/styles | P0 | Auto |
| PRIV-006 | Privacy note | Onboarding | Read step 1 | States data stays local clearly | P1 | Semi |
| PRIV-007 | Export completeness | Populated store | Export; inspect | Contains everything stored — user can audit their own data | P1 | Semi |
| PRIV-008 | Resolver scope | Resolver running | Inspect requests | Fetches only watch pages of stored videoIds; no extra query params/PII | P2 | Semi |
| PRIV-009 | Wipe completeness | Data present | Wipe; dump storage | All `yl.v2.*` keys gone | P0 | Auto |
| PRIV-010 | Scope of reading | Session active | Review what's read | Reads only the user's own history feed + visible feed DOM for enforcement; nothing else scraped | P2 | Manual |

## PERF — Performance & resource usage

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| PERF-001 | Dashboard heavy data | Seeded ~20k events (heavy year) | Open each view; measure | Initial render ≲2–3s; tab switches smooth | P0 | Semi |
| PERF-002 | Shard reads | Heavy seeded store | Switch ranges | Only needed monthly shards read (storage access pattern) | P1 | Semi |
| PERF-003 | Chart interactions | 90d range | Hover/scroll charts | No jank in hand-rolled SVG charts | P1 | Semi |
| PERF-004 | Auto sync duration | 14d window | Time a hidden-tab sync | Completes in a bounded, reasonable time; MAX_PAGES respected | P1 | Semi |
| PERF-005 | Manual deep sync | 90d lookback | Time it; watch status panel | Bounded duration; progress/status visible; no frozen UI | P1 | Semi |
| PERF-006 | Resolver load | 20+ unknown durations | Monitor during backfill | ≤2 concurrent; browser unaffected | P1 | Semi |
| PERF-007 | Guard scroll jank | Strict mode; long feed | Record long tasks while fast-scrolling | No long tasks causing input latency; debounced | P0 | Semi |
| PERF-008 | Memory stability | 30-min session with syncs + dashboard open | Watch SW/page memory | No monotonic growth (leaks) | P1 | Semi |
| PERF-009 | Write amplification | Sync with small delta | Observe storage writes | Only touched shards rewritten | P2 | Semi |
| PERF-010 | Hidden-tab cost | Sync running | Observe CPU | Auto-scroll modest; tab closed frees resources | P2 | Semi |
| PERF-011 | Bulk rule application | 20k stored videos; test-run/apply | Run | Completes without UI freeze (worker/chunked) | P1 | Semi |
| PERF-012 | Live-update thrash | Dashboard open during sync | Observe re-renders | storage.onChanged updates coalesced; no thrash | P2 | Semi |

## ERR — Error states & resilience

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| ERR-001 | Missing ytInitialData | Logged out / shape A-B test | Load /feed/history | No crash; diagnostics recorded; status panel shows failure | P0 | Semi |
| ERR-002 | Parser containment | Fixture: one bad section | Parse | Bad section skipped; others kept; no exception escapes | P1 | Auto |
| ERR-003 | Observer degradation | Simulate no continuation captures | Sync | Degrades to first-page-only; diagnostics record it | P0 | Semi |
| ERR-004 | Hidden-tab failure | Tab crash/timeout during sync | Observe | Cleanup + fallback + diagnostics; next sync works | P1 | Semi |
| ERR-005 | SW killed mid-sync | Kill SW during merge | Restart; inspect | In-flight lock recovered; store consistent | P0 | Semi |
| ERR-006 | Corrupt shard | Damage one events shard | Open dashboard | Readable error; other shards still render; no cascading loss | P1 | Semi |
| ERR-007 | Corrupt rule via storage | Edit rules shard directly (bad regex) | Run engine + Rules UI | Fails safe; UI flags it | P1 | Semi |
| ERR-008 | Bad import file | Corrupt JSON | Import | Clear error; no data loss | P0 | Auto |
| ERR-009 | Clock/TZ edges | Mock: midnight crossing, TZ change, DST | Check day attribution + week rollover | Correct local-day handling; no off-by-one | P0 | Auto |
| ERR-010 | Localized YouTube UI | Interface language ≠ English | Sync | Localized day labels resolved or gracefully handled + diagnostics (known gap — verify + document) | P1 | Semi |
| ERR-011 | Offline manual sync | Network disabled | Click Sync now | Clear failure; retry works after reconnect | P1 | Auto |
| ERR-012 | Resolver 429/block | Simulate rate-limit responses | Observe resolver | Backs off/skips; no hammering | P1 | Semi |
| ERR-013 | Dashboard during sync | Sync in-flight | Open dashboard | Consistent partial views or graceful loading state; no NaNs | P1 | Semi |
| ERR-014 | Console hygiene | All surfaces | Check consoles (page, SW, dashboard) | No uncaught errors | P1 | Auto |

## EMPTY — Empty states & first run

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| EMPTY-001 | Dashboard before first sync | Fresh install; no sync yet | Open dashboard | Friendly empty states; zeros/dashes; no NaN/undefined anywhere | P0 | Auto |
| EMPTY-002 | Empty YouTube history | New YT account | Sync; open dashboard | Clean empty state; no fake data | P1 | Semi |
| EMPTY-003 | Logged out | Signed out | Open dashboard + trigger sync | Guidance to sign in; no errors | P1 | Semi |
| EMPTY-004 | Zero rules | "Start clean" chosen | Open Rules | Helpful empty state with create CTA | P1 | Auto |
| EMPTY-005 | Empty review queue | Everything categorized | Open Overview | "All caught up" style state | P1 | Auto |
| EMPTY-006 | Search no results | Ledger open | Search gibberish | No-results state; filters resettable | P2 | Auto |
| EMPTY-007 | Insights thin data | <7 days | Open Insights | Insufficient-data message | P1 | Auto |
| EMPTY-008 | No budgets set | Budgets tab | Open Budgets | Explains how to set first budget | P1 | Auto |
| EMPTY-009 | Empty range | Range=Today before any watch today | Switch to Today | Zero state handled gracefully | P1 | Auto |
| EMPTY-010 | Post-wipe | After danger-zone wipe | Browse dashboard | All views empty-clean; onboarding re-invitable | P1 | Auto |

## A11Y — Accessibility

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| A11Y-001 | Keyboard navigation | Dashboard open | Tab through all views | Every control reachable + operable; logical order | P0 | Semi |
| A11Y-002 | Dialogs | Rule editor; wipe confirm | Keyboard-only use | Focus trap, Esc closes, focus returns to trigger | P1 | Semi |
| A11Y-003 | Chart alternatives | Overview/Insights | Inspect SVG | aria-labels or data-table alternative for charts | P1 | Semi |
| A11Y-004 | Contrast | Dark theme | Measure text contrast | ≥WCAG AA for text on cards/chips | P1 | Semi |
| A11Y-005 | Not color-alone | Confidence + over-budget indicators | Inspect | Text/icon accompanies color everywhere | P1 | Semi |
| A11Y-006 | Screen reader — stats | VoiceOver on | Read Overview | Stat cards announce label + value sensibly | P1 | Manual |
| A11Y-007 | Ledger table semantics | Screen reader on | Read Ledger rows | Headers/rows associated; sortable/filters labeled | P1 | Manual |
| A11Y-008 | Enforcement UI a11y | Banner/interstitial shown | Keyboard + SR | Dismissible via keyboard; announced politely; focus managed | P1 | Manual |
| A11Y-009 | Strict blur vs SR | Strict mode | SR browse hidden feed | Hidden titles not announced (placeholder is) | P1 | Manual |
| A11Y-010 | Reduced motion | OS reduce-motion on | Use dashboard | Animations minimized | P2 | Semi |
| A11Y-011 | Hit targets | Chips/toggles | Measure | ≥24×24px (ideally 44) targets | P2 | Semi |
| A11Y-012 | Onboarding a11y | Wizard open | Complete keyboard-only/SR | Wizard fully operable | P1 | Manual |

## REG — Regression guards (known risks & past bugs)

Run the relevant subset after every phase.

| ID | Area | Preconditions | Steps | Expected | Pri | How |
|---|---|---|---|---|---|---|
| REG-001 | POC overlay stays dead | Upgraded from POC build | Browse YouTube | No overlay (debug-only, off by default) — M1-044 after every phase | P0 | Auto |
| REG-002 | Console noise | Any page | Filter console | No POC-era always-on logging | P2 | Auto |
| REG-003 | No 48h prune regression | Events 3+ days old stored | Run syncs + restarts | Events survive (retention now ≥90d default 365d; the POC 48h prune must never return) | P0 | Auto |
| REG-004 | Popup bug guard | Any build/Node version | Click toolbar | No default_popup in manifest; click opens dashboard (Plasmo/Node-26 popup bug stays avoided) | P0 | Auto |
| REG-005 | Migration not re-triggered | Migrated profile on later update | Update builds | Migration doesn't duplicate/re-run | P1 | Auto |
| REG-006 | Single-writer still safe | Multi-tab open | Re-run M1-039/040 after phases | Merge correctness preserved | P0 | Auto |
| REG-007 | Settings preserved on upgrade | Configured settings | Update build | retention/fetchWindow/budgetMode preserved | P1 | Auto |
| REG-008 | Enforcement default off on upgrade | User never touches budgets | Update through phases | YouTube unmodified until user opts in | P0 | Auto |
| REG-009 | Invisibility holistic session | Sync due; user session 30 min | Browse normally with video, search, Shorts | User notices nothing (syncs, hidden tabs, resolver all silent) | P0 | Manual |
| REG-010 | Duration cache across updates | Resolved durations | Update build; sync | No re-fetch storm (cache persists) | P2 | Semi |

## SMOKE — Between-phase subset (~15–20 min)

Run after each phase completes (and before calling any phase done). All items
reference full cases above.

| ID | Quick check (covers) | Expected |
|---|---|---|
| SMK-01 | Load/unload extension fresh (INST-001, M1-001/002) | Loads clean; defaults seeded |
| SMK-02 | `pnpm test` (M1-043, M3-028) | All green |
| SMK-03 | Open /feed/history → sync stores events incl. a repeat (M1-005/018) | Events + occurrences stored |
| SMK-04 | Visit YT home → hidden-tab sync, invisible, tab closes (M2-001/002/006) | Silent sync, no leftovers |
| SMK-05 | Unknown duration backfills; totals update (M2-016/021) | Time appears |
| SMK-06 | Day attribution stable across re-sync (M1-023/024) | watchedOn unchanged |
| SMK-07 | POC profile upgrade → migration once (M1-035/037, INST-004) | v1→v2, no dupes |
| SMK-08 | Manual override beats rule (M3-010) | Override wins |
| SMK-09 | Toolbar → dashboard; Overview cards render (M4-001/004) | Cards + numbers sane |
| SMK-10 | Ledger: recategorize + always-channel rule (M4-017/018) | Updates + rule created |
| SMK-11 | Rule create/enable/reorder + test-run count (M5-001/003/007) | Works, count correct |
| SMK-12 | Sync now + lookback picker 7–90 (M5-023/024) | Manual sync honors choice |
| SMK-13 | Export JSON → wipe → import (M5-029/031/034) | Round-trip restores |
| SMK-14 | Skip onboarding → fallback defaults (M6-008) | 8 cats + 2 rules on + Shorts off |
| SMK-15 | Budget set → over-budget bar + snapshot (M7-002/008) | Status correct |
| SMK-16 | Enforcement Off default = pristine YouTube (M8-001) | No DOM changes |
| SMK-17 | Gentle: home chip + watch banner (M8-004/007) | Indicators shown, dismissible |
| SMK-18 | Strict: search hiding + interstitial (M8-012/015) | Hidden w/ placeholder; Watch anyway works |
| SMK-19 | Privacy: net-log clean; devRelay silent (PRIV-001/002) | No egress |
| SMK-20 | Fresh profile: empty states + console clean (EMPTY-001, ERR-014) | No errors/NaNs |

---

## Coverage summary

| Section | Cases | P0 | P1 | P2 | Auto | Semi | Manual |
|---|---|---|---|---|---|---|---|
| M1 Data foundation | 45 | 25 | 18 | 2 | 37 | 8 | 0 |
| M2 Hidden-tab sync + resolver | 24 | 9 | 14 | 1 | 7 | 16 | 1 |
| M3 Rules engine | 30 | 15 | 11 | 4 | 24 | 6 | 0 |
| M4 Dashboard (Overview+Ledger) | 34 | 18 | 15 | 1 | 25 | 9 | 0 |
| M5 Rules UI/Categories/Settings | 40 | 21 | 13 | 6 | 31 | 7 | 2 |
| M6 Onboarding + Insights | 24 | 7 | 14 | 3 | 16 | 7 | 1 |
| M7 Budgets core | 18 | 9 | 7 | 2 | 14 | 4 | 0 |
| M8 Enforcement | 40 | 21 | 17 | 2 | 8 | 29 | 3 |
| INST Install/upgrade/migration | 12 | 5 | 4 | 3 | 6 | 6 | 0 |
| PERM Permissions & reinstall | 8 | 3 | 3 | 2 | 4 | 4 | 0 |
| PRIV Privacy | 10 | 5 | 3 | 2 | 5 | 4 | 1 |
| PERF Performance | 12 | 2 | 7 | 3 | 0 | 12 | 0 |
| ERR Error states | 14 | 5 | 9 | 0 | 5 | 9 | 0 |
| EMPTY Empty states | 10 | 1 | 8 | 1 | 8 | 2 | 0 |
| A11Y Accessibility | 12 | 1 | 9 | 2 | 0 | 7 | 5 |
| REG Regressions | 10 | 6 | 2 | 2 | 8 | 1 | 1 |
| **Total** | **343** | **153** | **154** | **36** | **198** | **131** | **14** |
| SMOKE (derived) | 20 | — | — | — | — | — | — |

Maintenance: when a phase lands, mark each case pass/fail/blocked in a run log
(separate file or column added here); any plan change that alters expected
behavior must update the affected cases in the same commit.
