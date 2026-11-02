# YT Ledger — QA Report Round 1

- **Date:** 2026-11-02
- **HEAD:** `0066bfa` (`M8: on-YouTube budget enforcement (off / gentle / strict)`)
- **Claimed version:** 0.7.0 (PLAN.md M1–M8 done)
- **QA engineer:** agent-desktop round 1 (Brave, signed-in YouTube, read-only YT account)
- **Build:** `pnpm build` → `build/chrome-mv3-prod` (Plasmo 0.90.5, ~5.4s)
- **Unit tests:** `pnpm test` → **87 pass / 0 fail** (~1.2s). Pre-script `pnpm` install warned `ERR_PNPM_IGNORED_BUILDS` (ignored build scripts); tests still ran via existing `esbuild`.

## Verdict summary

| Pri | PASS | FAIL | BLOCKED | Total |
|-----|------|------|---------|-------|
| P0  | 96   | 2    | 55      | 153   |
| P1  | 62   | 1    | 91      | 154   |
| P2  | 14   | 0    | 22      | 36    |
| **All** | **172** | **3** | **168** | **343** |

SMOKE (derived, not extra cases): 12 observed pass-equivalent, 2 fail-adjacent, 6 blocked.

Round 1 did **not** execute every live P0/P1 path (no signed-out profile, no 20k seed, no wipe, no VoiceOver, no Chrome secondary, native `<select>` for budget mode did not accept AX `select`). Unit tests + code/manifest inspection cover a large slice of Auto cases. Live Brave covered install/reload, onboarding, dashboard, ledger recategorize, settings sync, hidden-tab coordinator, budgets math, enforcement **Off**.

### Hard FAIL list (repro / expected / actual / area)

#### FAIL-1 · M4-015 · P0 · Ledger columns

- **Steps:** Open Ledger on populated store (`qa/round1/09-ledger.png`, `20-ledger-for-chip.png`).
- **Expected:** Row shows title (link), channel, duration, est. watched, category chip, **value tier**, confidence.
- **Actual:** Columns are Category, Title, Channel, Duration, Est. watched, green confidence dot. **No value-tier column** (0–5 / ladder name).
- **Area:** `tabs/views/ledger.tsx` row model / columns.

#### FAIL-2 · M1-023 · P0 · Day-label unit matrix incomplete

- **Steps:** `pnpm test` (core `*.test.ts` only). Inspect `utils/day.ts`.
- **Expected:** Dedicated `dayLabelToDate` tests for Today / Yesterday / weekday / `"Oct 31"` / New Year (`"Dec 31"` in January → previous year).
- **Actual:** No `utils/day.test.ts`. Merge tests cover Today / weekday against a fixed `NOW=2026-11-02`. New Year / `"Oct 31"` year-rollback **not asserted**. Implementation exists (`utils/day.ts` future-year rollback). Live ledger days (Mon 2 Nov, Sun 1 Nov) look correct.
- **Area:** test gap `utils/day.ts` / `core/merge.test.ts`.

#### FAIL-3 · M8-003 / SMK-17–18 · P0 · Budget mode picker not switched live

- **Steps:** Budgets tab, native `<select>` “Off — track only”. AX `select` timed out; headed click opened a 3-item menu that vanished; keyboard Space/Down/Enter left mode **Off** (`qa/round1/23-budgets-set.png`, `25-mode-gentle.png`).
- **Expected:** Off / Gentle / Strict switchable; new mode applies on YouTube without reinstall.
- **Actual:** Mode stayed Off. Gentle/Strict **on-page** cases (M8-004–018, 011–015, SMK-17/18) **not executed**. Code for guard exists (`contents/budget-guard.ts`, class `yl-budget-guard`). This is recorded as **FAIL** on the picker automation/UX (native select is hostile) plus **BLOCKED** for the on-page gentle/strict matrix.
- **Area:** `tabs/views/budgets.tsx` / `tabs/views/settings.tsx` `<select>` for `budgetMode`.

---

## Environment

| Item | Value |
|------|--------|
| Browser | Brave (primary), user profile, YouTube signed in (avatar visible) |
| OS | macOS, agent-desktop 1.0.2, Accessibility + Screen Recording granted |
| Extension ID | `gglbipidgblnfdbocbpbcbgoophakggh` |
| Load path | `~/code/personal/yt-history-poc/build/chrome-mv3-prod` |
| Before QA | Unpacked **YT Ledger 0.3.0** already loaded from that path (Errors present). No “YT History POC” copy. |
| Action | Developer mode on → **Reload** (not Remove). Version became **0.7.0**, SW **active**. Storage kept (64→65 videos). |
| Other extensions | DEV AWS Accounts Manager, PiP, Remove YouTube Shorts 2.1.7, Simple totp. **Shorts remover may bias M8 Shorts.** |
| YouTube | Existing watch tab; later autoplayed another video during a failed home navigation. **Did not** like/comment/subscribe/delete history. |
| Extension-local side effects | Completed onboarding (was `onboardedAt=null`); manual 14d sync; categorized *Nearly 2,000 Boeing 737s…* (Simple Flying) as **News & updates**; set News budget **0.001 h/week** (27s spent / 4s, 23s over). Enforcement left **Off**. |

Screenshots: `qa/round1/00-*.png` … `26-categories.png`.

---

## Build / unit tests (M1-043, M3-028, SMK-02)

```
ℹ tests 87
ℹ pass 87
ℹ fail 0
```

Suites: `aggregate`, `assign`, `budget`, `classify`, `defaults`, `duration`, `estimate`, `exports`, `insights`, `ledger`, `merge`, `migrate`, `resolve`, `retention`, `rules`, `version`.

`pnpm build` succeeded. Prod `manifest.json`: name **YT Ledger**, v0.7.0, MV3, permissions `scripting` `storage` `unlimitedStorage`, hosts `*://*.youtube.com/*` + `http://127.0.0.1:8742/*`, **no `default_popup`**, content scripts `budget-guard` + `history-sync`, WAR `history-main.*.js`.

---

## Install / toolbar (INST, M4, REG, PERM)

| ID | Result | Evidence |
|----|--------|----------|
| INST-001 | PASS | Reload 0.7.0, SW active, toast “Reloaded” (`03-after-reload.png`) |
| INST-002 | BLOCKED | No POC build in profile to in-place upgrade |
| INST-003 | PASS | Reload 0.3.0→0.7.0 kept 64 videos/events |
| INST-004 | BLOCKED | No `ytHistoryPoc.v1` on this profile |
| INST-005 | BLOCKED | Would wipe storage; skipped (no Remove) |
| INST-006 | BLOCKED | No reinstall; export not downloaded |
| INST-007 | BLOCKED | No older build loaded |
| INST-008 | BLOCKED | Did not restart Brave |
| INST-009 | BLOCKED | Single profile |
| INST-010 | BLOCKED | Chrome not run |
| INST-011 | BLOCKED | No update mid-sync |
| INST-012 | PASS | Auto/manual 14d returned **5 day(s)** of items (65), not unbounded |
| PERM-001 | PASS | Manifest matches plan (storage, scripting, unlimitedStorage; YT + 8742; no tabs/cookies/webRequest/history) |
| PERM-002 | PASS | After reload, YT toolbar shows “YT Ledger **Has access to this site**”; sync still worked |
| PERM-003 | BLOCKED | Limbo not simulated |
| PERM-004 | BLOCKED | No >5MB seed |
| PERM-005 | BLOCKED | Site access was on |
| PERM-006 | PASS | `devRelay` checkbox unchecked (`10-settings.png`); current `history-sync.ts` has no 8742 pings (only SW `ping()` gated) |
| PERM-007 | PASS | Grep `eval(`/`new Function` in ts/js: none |
| PERM-008 | BLOCKED | Incognito not opened |
| M4-001 | PASS | Toolbar YT Ledger opens `tabs/dashboard.html` (`04-dashboard-toolbar.png`) |
| M4-002 | PASS | Second toolbar click: still 4 tabs, existing dashboard focused |
| M4-032 / REG-004 | PASS | No popup; `action` has icons only |
| REG-001 / M1-044 | PASS | Watch page stock YouTube, no overlay (`14-youtube-watch-off.png`) |
| REG-008 / M8-001 | PASS | Mode Off; no `over budget` in AX tree; no guard UI |

Pre-reload **0.3.0 Errors** (`01-errors-click.png`): mixed-content / unsafe load of `http://127.0.0.1:8742/sync-loaded` and `history-main.*.js` from `https://www.youtube.com/`. Current source gates relay on `devRelay`. Errors page **not re-checked after 0.7.0** → ERR-014 live console **BLOCKED**.

Site access toggles for youtube.com / 127.0.0.1 appear greyed because “Automatically allow access on the following sites” is **on** (AX `checked`); not a permission deny.

---

## M1 — Data foundation

| ID | Pri | Result | How / evidence |
|----|-----|--------|----------------|
| M1-001 | P0 | PASS | `defaults.test.ts` 8 ids `brain-rot`…`deep`; live Categories (`26-categories.png`) |
| M1-002 | P0 | PASS | `defaultSettings`: 365 / 14 / off / overlay false / onboarded null; Settings UI 1 year + 14d + Off |
| M1-003 | P1 | PASS | `ledger.test.ts` ensureInitialized version=2 |
| M1-004 | P1 | PASS | `exports.test.ts` shards `2026-11`/`2026-10`; live month groups |
| M1-005 | P0 | PASS | Sync `ok · 65 item(s)`; ledger titles/channels match YT |
| M1-006 | P0 | PASS | Ledger “Mon 2 Nov”, “Sun 1 Nov” |
| M1-007 | P1 | BLOCKED | Did not run 7d vs 14d cutoff compare |
| M1-008 | P2 | BLOCKED | No 30-page history force |
| M1-009 | P0 | PASS | Hidden-tab sync produced 5 days / 65 items (more than a tiny first page) |
| M1-010 | P1 | BLOCKED | Did not scroll history while inspecting attribution |
| M1-011 | P1 | BLOCKED | `scripts/test-parse.mjs` is a capture helper, not a green fixture suite in `pnpm test` |
| M1-012 | P1 | PASS | merge skips bad ids / unresolved days (`merge.test.ts`) |
| M1-013 | P0 | PASS | Ledger durations present; `durationSource` overlay in merge tests |
| M1-014 | P1 | BLOCKED | Legacy `lengthText` not isolated live |
| M1-015 | P0 | BLOCKED | No unresolved-duration row seen (all green dots) |
| M1-016 | P0 | PASS | Unit + live F-35 15m dur / 1m est; Boeing 4m / 27s after brief watch |
| M1-017 | P0 | PASS | estimate medium/full when no progress; many rows dur=est |
| M1-018 | P0 | PASS | `merge.test.ts` occurrences=2 |
| M1-019 | P1 | PASS | re-sync replaces count (merge test) |
| M1-020 | P0 | PASS | avg 58, latest 16 (merge test) — **note** comment “newest first” |
| M1-021 | P0 | PASS | Second sync 1 new / 64 updated, still 65 events |
| M1-022 | P1 | PASS | merge “firstSeen preserved” test |
| M1-023 | P0 | **FAIL** | See FAIL-2 |
| M1-024 | P0 | BLOCKED | Cannot wait until tomorrow |
| M1-025 | P0 | PASS | `estimate.test.ts` |
| M1-026 | P0 | PASS | high/medium/low tests |
| M1-027 | P0 | BLOCKED | No low-confidence live row |
| M1-028 | P1 | PASS | Welcome copy + green dots; footnote on ledger header |
| M1-029 | P1 | BLOCKED | No >20h day seed |
| M1-030 | P0 | PASS | `retention.test.ts` + ledger pruneNow |
| M1-031 | P1 | PASS | retention 90 in unit |
| M1-032 | P1 | PASS | retention null keeps all |
| M1-033 | P1 | PASS | pruneNow end-to-end |
| M1-034 | P2 | BLOCKED | Empty shard drop not observed live |
| M1-035 | P0 | PASS | `migrate.test.ts` + ledger v1 init |
| M1-036 | P1 | PASS | migrate dayLabel → watchedOn |
| M1-037 | P0 | PASS | migrate once / no dupes tests |
| M1-038 | P1 | PASS | missing watchState defaults |
| M1-039 | P0 | BLOCKED | Two tabs simultaneous merge not forced |
| M1-040 | P0 | PASS | Coordinator `hiddenTabId` single-flight (code + one history tab) |
| M1-041 | P1 | BLOCKED | SW not killed mid-merge |
| M1-042 | P0 | PASS | Manifest name/permissions/no popup |
| M1-043 | P0 | PASS | 87 tests green |
| M1-044 | P0 | PASS | No POC overlay |
| M1-045 | P1 | PASS | merge multi-month shards |

---

## M2 — Hidden-tab sync & resolver

| ID | Pri | Result | Evidence |
|----|-----|--------|----------|
| M2-001 | P0 | PASS | Sync now + YT visit opened `youtube.com/feed/history` background tab |
| M2-002 | P0 | PASS | Dashboard stayed selected; history tab `active:false` |
| M2-003 | P0 | PASS | YouTube tab “Audio playing” after coordinator (`window title 🔊`) |
| M2-004 | P1 | PASS | Brief visible strip tab, then gone (~25s). Unobtrusive-enough; still noticeable |
| M2-005 | P1 | BLOCKED | No scroll logs |
| M2-006 | P0 | PASS | Tab count 5→4; history gone (`13-sync-complete.png`) |
| M2-007 | P1 | BLOCKED | No orphan left for restart |
| M2-008 | P1 | BLOCKED | Rapid nav not systematically counted |
| M2-009 | P1 | BLOCKED | No pre-existing user history tab |
| M2-010 | P1 | PASS | Code: single `hiddenTabId`; one tab observed |
| M2-011 | P1 | BLOCKED | Offline not forced |
| M2-012 | P0 | BLOCKED | Must not sign user out |
| M2-013 | P0 | BLOCKED | Did not sit on user-owned history tab during auto-scroll |
| M2-014 | P1 | PASS | Watch page 5min-class: no extension UI (`14`) |
| M2-015 | P1 | BLOCKED | Fullscreen not used |
| M2-016 | P0 | BLOCKED | Queue empty / all durations present |
| M2-017 | P1 | BLOCKED | No watch-page fetch audit |
| M2-018 | P1 | BLOCKED | Network panel not captured |
| M2-019 | P1 | BLOCKED | No deleted video |
| M2-020 | P1 | PASS | `resolve.test.ts` isShort; live 17s row |
| M2-021 | P0 | BLOCKED | No backfill-from-hidden-time |
| M2-022 | P2 | BLOCKED | Skip toggle not in Settings screenshot |
| M2-023 | P0 | PASS | Re-sync updated, no duplicate explosion (65 keys) |
| M2-024 | P1 | BLOCKED | SW idle-kill not waited |

---

## M3 — Rules engine

Unit `rules.test.ts` + `ledger.test.ts` apply/override/hitCount. Live: 3 starter rules (`16-rules.png`).

| ID | Pri | Result |
|----|-----|--------|
| M3-001 | P0 | PASS (unit applySyncResult auto-cat) |
| M3-002 | P0 | PASS (first match wins) |
| M3-003–008 | P0 | PASS (channel/title/regex/isShort/maxDur) |
| M3-009 | P1 | PASS (AND) |
| M3-010 | P0 | PASS (override beats) |
| M3-011 | P0 | PASS (live almost all Uncategorized; no silent default) |
| M3-012 | P1 | PASS (News chip on Boeing event after override) |
| M3-013 | P1 | PASS (unit hitCount); live list shows 0 video(s) on starters |
| M3-014 | P0 | PASS (disabled shorts rule) |
| M3-015 | P0 | PASS (invalid regex skip) |
| M3-016 | P2 | PASS (ledger test archived category skip) |
| M3-017 | P1 | BLOCKED (not run in three runtimes) |
| M3-018 | P0 | PASS (re-sync no churn / overrides) |
| M3-019 | P1 | BLOCKED (new rule retro not saved) |
| M3-020–021 | P1 | PASS (ledger “rules retry when duration arrives”; isShort unknown) |
| M3-022 | P0 | PASS (2 on + Shorts off) |
| M3-023 | P1 | PASS (onboarding live counts 1 tutorial / 0 lecture) |
| M3-024 | P1 | BLOCKED (did not enable Shorts rule) |
| M3-025 | P1 | PASS (unit migration then rules) |
| M3-026 | P2 | BLOCKED (empty-condition editor) |
| M3-027 | P1 | PASS (priority #1 #2 #3 + arrows) |
| M3-028 | P0 | PASS |
| M3-029–030 | P2 | BLOCKED / unit unicode not dedicated |

---

## M4 — Dashboard

| ID | Pri | Result | Evidence |
|----|-----|--------|----------|
| M4-001–002 | P0 | PASS | Toolbar |
| M4-003 | P1 | PASS | Hash `#/onboarding` `#/overview` `#/ledger` `#/settings` `#/insights` `#/budgets` `#/categories` `#/rules` |
| M4-004 | P0 | PASS | Cards: 12h55m, avg/active day, TVI 3.0, low-value 0%, 64 events/videos, uncategorized time (`08-onboarding-done.png`) |
| M4-005 | P0 | PASS | Today/7/30/90/All present |
| M4-006 | P1 | BLOCKED | Day-boundary seed not hand-calc |
| M4-007–008 | P0 | PASS | Unit aggregate + live 0% low-value with almost no score≤1 time |
| M4-009 | P1 | PASS | Daily bars 27 Oct / 2 Nov |
| M4-010 | P0 | PASS | Donut Uncategorized 97% / LTT 3% |
| M4-011 | P1 | PASS | Shares ~100% |
| M4-012 | P0 | PASS | Queue + chip opens modal with channel rule (`overview.tsx`) |
| M4-013 | P0 | PASS | Ledger modal Apply updated chip immediately (`22-after-categorize.png`) |
| M4-014 | P0 | PASS | Chronological by day, newest first |
| M4-015 | P0 | **FAIL** | No value-tier column |
| M4-016 | P1 | BLOCKED | Title link not clicked (would open YT; OK but not asserted) |
| M4-017 | P0 | PASS | News & updates override |
| M4-018 | P0 | PASS | “Also always categorize Simple Flying…” checkbox present; left unchecked |
| M4-019 | P0 | BLOCKED | Search not typed |
| M4-020 | P1 | PASS | Category filter + only-uncategorized checkbox present |
| M4-021 | P0 | BLOCKED | Bulk 12 rows not executed |
| M4-022 | P1 | BLOCKED | Undo path not tried |
| M4-023 | P1 | PASS | “estimated” on Overview donut + ledger formula line |
| M4-024 | P0 | BLOCKED | No pending duration row |
| M4-025 | P1 | PASS | Uncategorized first-class |
| M4-026 | P2 | PASS | Dark #0f-like theme |
| M4-027 | P1 | PASS | Settings/sidebar counts updated 64→65 without reload |
| M4-028 | P1 | BLOCKED | No 20k seed |
| M4-029 | P1 | PASS | Label **avg / active day** (convention documented in UI) |
| M4-030 | P1 | BLOCKED | No ×N badge seen |
| M4-031 | P1 | BLOCKED | No suspicious day |
| M4-032 | P0 | PASS | |
| M4-033 | P1 | BLOCKED | Not signed out |
| M4-034 | P0 | PASS | Boeing row appeared after watching; 65 matches status panel |

---

## M5 — Rules UI / Categories / Settings

| ID | Pri | Result |
|----|-----|--------|
| M5-001 | P0 | BLOCKED (did not create each condition type; editor exists + New rule) |
| M5-002–003 | P0 | BLOCKED (test-run not opened) |
| M5-004 | P0 | PASS (enable checkboxes on list) |
| M5-005 | P1 | BLOCKED (edit not saved) |
| M5-006 | P0 | BLOCKED (delete not clicked) |
| M5-007 | P0 | PASS (↑↓ reorder controls) |
| M5-008 | P0 | BLOCKED (invalid regex in editor) |
| M5-009 | P1 | PASS (flags shown `/i` on list) |
| M5-010 | P1 | BLOCKED |
| M5-011 | P1 | PASS (starters editable) |
| M5-012 | P2 | PASS (0 video(s) stats) |
| M5-013 | P1 | PASS (ledger → modal channel rule <30s) |
| M5-014 | P1 | PASS (#1 #2 #3) |
| M5-015 | P0 | PASS (Add category + ladder UI) |
| M5-016 | P0 | PASS (LTT rename already in all views) |
| M5-017 | P1 | PASS (Archive only; copy says archived keep history) |
| M5-018 | P1 | PASS (reorder arrows) |
| M5-019 | P2 | PASS (Archive, no Delete) |
| M5-020 | P0 | BLOCKED (did not change score) |
| M5-021 | P1 | BLOCKED (archive-with-rules) |
| M5-022 | P0 | PASS (last sync + diagnostics) |
| M5-023 | P0 | PASS (Refresh/Sync now while recently synced) |
| M5-024 | P0 | PASS (7/14/30/60/90 in `12-sync-now.png`) |
| M5-025 | P0 | BLOCKED (90d not run) |
| M5-026 | P0 | PASS (auto window still 14d after manual) |
| M5-027 | P1 | PASS (7/14/21/30 in settings.tsx auto window) |
| M5-028 | P0 | PASS (1 year selected; 90/forever in code) |
| M5-029 | P0 | BLOCKED (export not clicked — would download) |
| M5-030 | P1 | PASS (CSV builder unit) |
| M5-031 | P0 | PASS (backup round-trip unit) |
| M5-032 | P0 | PASS (validateBackup rejects garbage) |
| M5-033 | P1 | PASS (import **replaces** shards via `chrome.storage.local.set` — documented: replace not merge) |
| M5-034 | P0 | BLOCKED (wipe skipped) |
| M5-035 | P2 | BLOCKED |
| M5-036 | P2 | PASS (overlay checkbox off) |
| M5-037 | P1 | PASS (devRelay off) |
| M5-038 | P2 | BLOCKED |
| M5-039 | P0 | PASS (settings survived 0.3.0→0.7.0 reload) |
| M5-040 | P2 | PASS (`backupVersion` in exports tests) |

---

## M6 — Onboarding + Insights

| ID | Pri | Result |
|----|-----|--------|
| M6-001 | P0 | PASS | Wizard auto `#/onboarding` (`04`) |
| M6-002 | P1 | PASS | “Local-only… nothing is uploaded” |
| M6-003 | P0 | PASS | Ladder 0–5; LTT already renamed |
| M6-004 | P0 | PASS | Live match counts |
| M6-005 | P1 | BLOCKED | Did not choose Start clean |
| M6-006 | P1 | PASS | Skip budgets |
| M6-007 | P0 | PASS | Landed Overview; later toolbar opens Overview not wizard |
| M6-008 | P0 | BLOCKED | Did not dismiss at step 2 (completed flow) |
| M6-009 | P1 | PASS | 3 visible rules |
| M6-010 | P1 | PASS | Wizard with 64 videos already stored |
| M6-011 | P1 | BLOCKED | Did not navigate away mid-wizard |
| M6-012 | P1 | BLOCKED | No wipe |
| M6-013 | P1 | BLOCKED | No v1 |
| M6-014 | P1 | BLOCKED | No storage error |
| M6-015 | P2 | BLOCKED | |
| M6-016 | P0 | PASS | Empty “no low-value time” (`18-insights.png`) |
| M6-017 | P1 | PASS | Empty high-value band (LTT is score 3) |
| M6-018 | P1 | PASS | Weekday bars Sun–Sat |
| M6-019 | P0 | PASS | Channel “Categorize…” suggestions (uncategorized time), not auto-created |
| M6-020 | P1 | PASS | Explicit buttons only |
| M6-021 | P1 | PASS | Empty states when bands empty (data >7d so not the thin-data message) |
| M6-022 | P2 | PASS | 7/30/90/All on Insights |
| M6-023 | P1 | BLOCKED | Not hand-reconciled to Overview |
| M6-024 | P2 | PASS | 0–5 copy |

---

## M7 — Budgets

| ID | Pri | Result |
|----|-----|--------|
| M7-001 | P0 | PASS | 0.001 h/week News saved |
| M7-002 | P0 | PASS | 27s / 4s, 23s over, red bar |
| M7-003 | P0 | PASS | “Monday 00:00 local (current week: Mon 2 Nov, 7 day(s) left)” — today is Mon 2 Nov 2026 |
| M7-004 | P0 | PASS | Only this week (today’s 27s News) |
| M7-005 | P0 | BLOCKED | Clock not mocked |
| M7-006 | P0 | PASS | Other cats 0s spent, not over |
| M7-007 | P1 | PASS | Sub-hour 0.001 treated as 4s cap, overage shown |
| M7-008 | P0 | PASS | Status implied by UI; unit `computeBudgetStatus` |
| M7-009 | P0 | PASS | 27s = Boeing est. watched |
| M7-010 | P1 | BLOCKED | Only one budget set |
| M7-011 | P1 | PASS | Bar updated live after save |
| M7-012 | P0 | PASS | Off/Gentle/Strict in onboarding + Settings + Budgets (default Off) |
| M7-013 | P1 | BLOCKED | |
| M7-014 | P2 | BLOCKED | |
| M7-015 | P1 | PASS | export includes settings unit |
| M7-016 | P2 | PASS | week label |
| M7-017 | P1 | PASS | unit occurrences |
| M7-018 | P1 | PASS | LTT rename kept (no budget on it) |

---

## M8 — Enforcement

| ID | Pri | Result |
|----|-----|--------|
| M8-001 | P0 | PASS | Off = stock YT |
| M8-002 | P1 | PASS | No perceptible extra UI |
| M8-003 | P0 | **FAIL** | Could not change mode (see FAIL-3) |
| M8-004–018 | P0/P1 | BLOCKED | Need Gentle/Strict |
| M8-019 | P0 | PASS | `classify.test.ts` fail-open unknown |
| M8-020 | P0 | PASS | classify override wins (unit); live override set |
| M8-021 | P0 | PASS | live rules for unseen (unit) |
| M8-022–023 | P1 | BLOCKED | |
| M8-024 | P0 | PASS | code fail-open + unit |
| M8-025 | P1 | PASS | class `yl-budget-guard` documented |
| M8-026 | P0 | PASS | missing snapshot fail-open (unit/code) |
| M8-027–032 | P1/P0 | BLOCKED | mode off / no perf trace |
| M8-033–036 | P1/P2 | BLOCKED | |
| M8-037 | P1 | BLOCKED | |
| M8-038 | P1 | BLOCKED | |
| M8-039 | P1 | PASS | content_scripts matches youtube.com only |
| M8-040 | P1 | PASS | guard does not write events (code) |

---

## PRIV / PERF / ERR / EMPTY / A11Y / REG

| ID | Pri | Result | Note |
|----|-----|--------|------|
| PRIV-001 | P0 | BLOCKED | No net log of extension requests |
| PRIV-002 | P0 | PASS | devRelay off; 0.7.0 source gated |
| PRIV-003 | P1 | BLOCKED | Not enabled |
| PRIV-004 | P0 | PASS | Settings copy + `chrome.storage.local` only in code |
| PRIV-005 | P0 | PASS | Dashboard chrome-extension://, no remote fonts observed |
| PRIV-006 | P1 | PASS | Onboarding privacy |
| PRIV-007 | P1 | PASS | export builder includes shards (unit) |
| PRIV-008 | P2 | BLOCKED | |
| PRIV-009 | P0 | BLOCKED | Wipe skipped |
| PRIV-010 | P2 | PASS | Reads history + DOM guard (judgment) |
| PERF-001 | P0 | BLOCKED | No 20k seed (65 events instant) |
| PERF-002–006 | P1 | BLOCKED | |
| PERF-007 | P0 | BLOCKED | Strict off |
| PERF-008–012 | P1/P2 | BLOCKED | |
| ERR-001 | P0 | BLOCKED | Logged-out history not opened |
| ERR-002 | P1 | PASS | merge skip |
| ERR-003 | P0 | BLOCKED | |
| ERR-004 | P1 | BLOCKED | |
| ERR-005 | P0 | BLOCKED | |
| ERR-006–007 | P1 | BLOCKED | |
| ERR-008 | P0 | PASS | import validate |
| ERR-009 | P0 | PASS | budget week Monday; day.ts local |
| ERR-010 | P1 | BLOCKED | EN UI |
| ERR-011 | P1 | BLOCKED | |
| ERR-012 | P1 | BLOCKED | |
| ERR-013 | P1 | PASS | Dashboard usable during sync |
| ERR-014 | P1 | BLOCKED | SW/page consoles not dumped after 0.7.0 |
| EMPTY-001 | P0 | BLOCKED | Store was not empty |
| EMPTY-002 | P1 | BLOCKED | |
| EMPTY-003 | P1 | BLOCKED | |
| EMPTY-004 | P1 | BLOCKED | Start clean not chosen |
| EMPTY-005 | P1 | BLOCKED | Queue not empty |
| EMPTY-006 | P2 | BLOCKED | |
| EMPTY-007 | P1 | PASS | Insights empty bands |
| EMPTY-008 | P1 | PASS | Budgets explain week + inputs (weak empty CTA, still usable) |
| EMPTY-009 | P1 | BLOCKED | Today range not clicked after data |
| EMPTY-010 | P1 | BLOCKED | |
| A11Y-001 | P0 | BLOCKED | Full keyboard pass not done (some buttons unnamed) |
| A11Y-002–012 | P1/P2 | BLOCKED | No VoiceOver / contrast meter |
| REG-002 | P2 | BLOCKED | Console filter not captured |
| REG-003 | P0 | PASS | 5-day history kept; retention 365 |
| REG-005 | P1 | PASS | migrate once unit |
| REG-006 | P0 | PASS | single-writer code + one coordinator |
| REG-007 | P1 | PASS | settings kept on reload |
| REG-009 | P0 | PASS | Watch + sync: user-facing YT unchanged (Off) |
| REG-010 | P2 | BLOCKED | |

---

## SMOKE subset

| ID | Result |
|----|--------|
| SMK-01 | PASS (reload 0.7.0) |
| SMK-02 | PASS (87 tests) |
| SMK-03 | PASS (history sync 65) |
| SMK-04 | PASS (hidden tab, no leftover) |
| SMK-05 | BLOCKED |
| SMK-06 | BLOCKED (no next-day) |
| SMK-07 | BLOCKED (no v1) |
| SMK-08 | PASS (unit override) |
| SMK-09 | PASS |
| SMK-10 | PASS (recategorize; channel rule UI present) |
| SMK-11 | BLOCKED (no new rule create/test-run) |
| SMK-12 | PASS |
| SMK-13 | BLOCKED (no wipe/import live) |
| SMK-14 | BLOCKED (completed wizard, not skip-at-2) |
| SMK-15 | PASS (over bar) |
| SMK-16 | PASS |
| SMK-17 | BLOCKED/FAIL-adjacent (mode stuck Off) |
| SMK-18 | BLOCKED |
| SMK-19 | PASS (devRelay off; no 8742 in 0.7.0 CS) |
| SMK-20 | BLOCKED (not a fresh empty profile) |

---

## Method notes

- **agent-desktop** AX on Chromium is incomplete: extension cards lack names; HTML `<select>` menus disappear before `--surface menu`; some clicks surface a 2-item leftover `sectionMenu`. Headed physical click used only for the budget mode control.
- **Did not** Remove the extension (would wipe `chrome.storage.local`). Reloading the same unpacked path was the “fresh 0.7.0” path.
- **Did not** export JSON before reload (reload keeps storage). Categorize + 0.001h News budget remain as QA residue — owner may clear News budget and/or recategorize the Boeing video.
- Cases marked BLOCKED are **not** product failures; they need another round (signed-out profile, wipe+export, Gentle/Strict after a reliable mode switch, 20k seed, VoiceOver, Chrome).

## Recommended next QA round

1. Fix/replace native `<select>` for budget mode (or document a reliable control) and re-run **M8 P0** on home/search/watch/Shorts.
2. Add `utils/day.test.ts` New Year / `"Oct 31"` matrix (**M1-023**).
3. Add Ledger value-tier column or drop it from the checklist (**M4-015**).
4. Re-open `brave://extensions/?errors=…` after 0.7.0 on a YT visit.
5. Export JSON, then a **throwaway** wipe/onboarding-skip pass on a copy — not this signed-in profile without backup.
