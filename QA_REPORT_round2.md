# YT Ledger — QA Report Round 2

- **Date:** 2026-11-03
- **HEAD at start:** `8e36a343b551ca40dc4bdc3178a67c135eb1e391`
- **Browser:** Brave Browser, signed-in YouTube profile. No likes, comments, subscriptions, history-setting changes, or intentional video playback were performed.
- **Scope:** Round-1 failures; M8 Gentle/Strict live checks; SUB-001–018; executable blocked P0/P1 cases; smoke regression.

## Build and tests

| Command | Result | Notes |
|---|---|---|
| `pnpm build` | PASS | Production Chrome MV3 build succeeded (Plasmo 0.90.5). |
| `pnpm test` | PASS | **105 passed / 0 failed**. Includes the date-label matrix and New Year rollback coverage. |

## Environment and evidence

- The live dashboard displayed YT Ledger **v0.8.1** with the unpacked build path `~/code/personal/yt-history-poc/build/chrome-mv3-prod`. The initial `brave://extensions` screenshot showed stale 0.7.0, so this is qualified by the dashboard observation.
- At initial inspection, the profile contained 65 videos / 65 events. A subsequent YouTube visit triggered a sync, and the dashboard showed 137 videos / 140 events. No account-history controls were changed.
- Screenshots are in `qa/round2/00-before.png` through `qa/round2/11-import-dialog.png`. Relevant evidence: `08-ledger-current.png`, `06-gentle-search-target.png`, `07-strict-search.png`, `09-strict-home.png`, `10-strict-home.png`, and `11-import-dialog.png`.
- Exported extension JSON backup: `~/Downloads/yt-ledger-round2.json` (62.2 KB). Import was **not completed**. The last screenshot shows the macOS Open dialog with the JSON file listed but not selected; the import tool was unavailable in this execution environment. Consequently, the extension's state/mode may remain changed (Strict) and the backup has not been verified/restored. No claim of restoration is made.
- The installed “Remove YouTube Shorts” extension confounds Shorts-surface checks. Watch-page/banner/interstitial checks were intentionally not run because they would require opening a video.

## Target case outcomes

| Case(s) | Pri | Result | Evidence / observation |
|---|---:|---|---|
| M1-023 | P0 | PASS | `pnpm test` includes Today/Yesterday/weekday/month-day and Dec 31 → previous-year January resolution. |
| M4-015 | P0 | PASS | Current Ledger screenshot displays title, channel, duration, estimated watched, category, value tier, and confidence indicator (`08-ledger-current.png`). |
| M8-003 | P0 | PASS | Settings mode was switched between Gentle and Strict and observed selected. |
| M8-005 | P0 | PASS | Gentle search result showed the “over budget · News & updates” chip and red outline (`06-gentle-search-target.png`). |
| M8-012 | P0 | **FAIL** | In Strict search, matching result content was blurred, but the required explicit “hidden — <category> over budget” placeholder was not visible (`07-strict-search.png`). Repro: with Strict selected, search the over-budget Simple Flying item; result is obscured without the specified placeholder. Suspected area: strict-mode search-result rendering/placeholder in the budget guard. |
| M8-018 | P0 | PASS (limited) | Strict-mode navigation to YouTube Home completed; page content loaded (`10-strict-home.png`). This verifies navigation was not blocked in the observed transition only. |
| M8-004, M8-006–011, M8-013–017 | P0/P1 | BLOCKED | No verified home over-budget target/interstitial/recommendation/reveal workflow was completed; opening a video was excluded for account safety. Shorts are confounded by the separate extension. |
| SUB-001–018 | P0/P1 | BLOCKED | No subcategory mutations or round-trip were attempted because a reliable export/restore cycle could not be verified. Existing UI visibility and unit tests are not treated as live passes. |
| Other executable blocked P0/P1 cases | P0/P1 | BLOCKED | Not executed in this round; no result is inferred from unit coverage. |
| SMK-02 / build regression | P0 | PASS | `pnpm test`: 105/105 passed; `pnpm build` succeeded. |

## Round-1 failures

1. **M1-023 — PASS.** The day-label test matrix includes New Year rollback.
2. **M4-015 — PASS.** The current Ledger includes a Value Tier column and confidence indicator.
3. **M8-003 — PASS.** Gentle and Strict selection were both observed in Settings.

## Fail list

- **M8-012 (P0):** Strict search obscures the matching result but does not show the specified “hidden — <category> over budget” placeholder. Evidence: `qa/round2/07-strict-search.png`.

## Summary counts

Counts below cover the explicitly enumerated M1-023, M4-015, M8-003–018 and SUB-001–018 cases (36 cases). The separate smoke/build check is reported separately.

| Priority | PASS | FAIL | BLOCKED | Total |
|---|---:|---:|---:|---:|
| P0 | 5 | 1 | 21 | 27 |
| P1 | 0 | 0 | 9 | 9 |
| P2 | 0 | 0 | 0 | 0 |
| **All** | **5** | **1** | **30** | **36** |

The separately reported SMK-02/build check passed. Other smoke cases and executable blocked P0/P1 cases were not run and are not included in these counts.
