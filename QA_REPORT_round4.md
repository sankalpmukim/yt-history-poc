# YT Ledger — QA Report Round 4

- **Date:** 2026-11-03
- **HEAD:** `58be907` (UI revamp; behavior/control labels retained)
- **Browser:** Brave, existing signed-in profile
- **Build:** `pnpm build` PASS
- **Tests:** `pnpm test` PASS — 107 passed / 0 failed
- **Dashboard version:** 0.8.3 (Settings screenshots)
- **Backup:** `~/Downloads/yt-ledger-pre-round4.json`, 126,752 bytes; copied via Settings → Copy export JSON to clipboard and verified >1 KB.

## Summary

| Priority | PASS | FAIL | BLOCKED | Notes |
|---|---:|---:|---:|---|
| P0 | 8 | 0 | 30 | Build/test, paste-import/restore, settings mode switch, off/unknown fail-open, and SUB parent roll-up passed. Most enforcement and dashboard CRUD paths were not verified. |
| P1 | 2 | 0 | 24 | One limited navigation pass and unit test suite; remaining requested live cases blocked/not run. |
| P2 | 0 | 0 | 0 | Not in this round's requested matrix. |
| **All** | **10** | **0** | **54** | Selected round-4 scope only; not the full 361-case checklist. |

No product P0 failure was confirmed. The report is **incomplete**: the requested live overlay flows and most dashboard interactions were not run. No claims are inferred from code or unit tests for those live cases.

## Execution and evidence

- `agent-desktop permissions`: Accessibility and Screen Recording **granted**. The requested initial snapshot against `--app "Brave Browser"` returned `AMBIGUOUS_TARGET` (two visible Brave windows); targeting the YT Ledger window explicitly worked.
- `pnpm build`: PASS. `pnpm test`: **107/107** PASS.
- Reloaded the unpacked extension on `brave://extensions`; Settings showed **YT Ledger v0.8.3** and the refreshed visual design.
- Backup captured before imports. `pnpm qa:seed` completed. Settings screenshot before import showed **137 videos / 140 events**, mode **Strict** (`qa/round4/00-state.png`).
- Pasted fixture through Settings. An earlier malformed/concatenated paste produced the visible message **“import failed: not valid JSON”** without replacing the original dataset. After correcting the field and confirming the page JavaScript dialog, Settings showed **restored 3 video(s), 3 event(s), 2 rule(s)** (`qa/round4/02-seed-result.png`). This was an operator paste-field issue, not recorded as a product failure.
- Captured dark-theme screenshots of Overview, Ledger, Rules, Categories, Insights, Budgets, and Settings (`qa/round4/03-overview-dark.png`, `11-ledger-dark.png` through `16-settings-dark.png`). Seeded Overview showed parent-level News and Practical rows aggregating the seed's subcategory events. Light-mode comparison was not completed; no `docs/screenshots/after-light` reference was present.
- With Gentle selected, browsed YouTube Home and searched for the stored Simple Flying title. No indicator appeared for the search result (`qa/round4/08-youtube-gentle.png`, `10-search-gentle.png`); the existing stored result is uncategorized, so it is an unknown/fail-open case, not a valid over-budget target. Search was not followed by opening the video. Strict placeholder/reveal/interstitial/Watch anyway and watch-sidebar cases were not exercised.
- Restored via the pasted-JSON path from the saved backup, accepted the confirmation, and set Budget mode to Off. Final Settings screenshot shows **137 videos / 141 events**, mode **Off**, and the prior sync status (`qa/round4/17-final-restored-off.png`). The event count rose from the backup's 140 to 141 after visiting YouTube; no history was deleted or edited. The required approximate original video count and Off mode are verified.

## Per-case outcomes — requested matrix

### Build, import/restore, and settings

| Case | Priority | Result | Evidence |
|---|---:|---|---|
| `pnpm build` / `SMK-01` reload and version | P0 | PASS | Build output; Settings shows v0.8.3. |
| `SMK-02` unit suite | P0 | PASS | 107/107 tests. |
| Backup via clipboard | P0 | PASS | File size 126,752 bytes. |
| Fixture paste-import | P0 | PASS | 3 videos / 3 events / 2 rules after confirmation (`02-seed-result.png`). |
| `M5-029` export JSON backup | P0 | PASS | Clipboard export captured to pre-round backup. |
| `M5-031`, `SMK-13` JSON import/restore round trip | P0 | PASS | Final 137-video state restored using pasted JSON and confirmation. |
| `M5-032`, `ERR-008` invalid JSON containment | P0 | PASS | Invalid paste displayed a validation error; original 137-video store remained intact. |
| `M5-023/024` manual sync/lookback options | P0 | BLOCKED | Controls visible, but custom lookback run not executed. |
| `M5-028` retention | P0 | BLOCKED | Selector visible; no retention setting change/prune verification. |
| `M5-039` settings persistence | P0 | BLOCKED | No browser restart/reload persistence pass. |

### M8 enforcement

| Case | Priority | Result | Evidence |
|---|---:|---|---|
| `M8-001`, `SMK-16` Off / stock YouTube | P0 | PASS (observed search) | Off mode confirmed; search page showed no extension treatment (`09-search-off.png`). |
| `M8-003` mode switching | P0 | PASS | Settings mode switched Off → Gentle → Off; final Off screenshot. |
| `M8-004` Gentle home | P0 | BLOCKED | Home observed in Gentle, but no known over-budget categorized item was present in the visible feed. |
| `M8-005` Gentle search | P0 | BLOCKED | Search result matched a stored Simple Flying video, but it was uncategorized; not a valid over-budget target. No failure inferred. |
| `M8-006/007` Gentle recommendations / watch banner | P0 | BLOCKED | No known over-budget watch target; no watch page opened. |
| `M8-008` Gentle Shorts shelf | P1 | BLOCKED | No qualified Short target; separate Shorts-removal extension may confound. |
| `M8-009/010` gentle non-invasive / banner persistence | P0/P1 | BLOCKED | No indicator/banner shown to interact with. |
| `M8-011/012` Strict home/search placeholder | P0 | BLOCKED | No qualified over-budget categorized live target available; no strict feed placeholder assertion. |
| `M8-013` Strict recommendations | P0 | BLOCKED | No watch page with qualified target. |
| `M8-014` click-to-reveal | P1 | BLOCKED | No strict hidden item available. |
| `M8-015/016` strict interstitial / math | P0 | BLOCKED | No qualified watch target/interstitial. |
| `M8-017` Watch anyway | P1 | BLOCKED | No interstitial to dismiss. |
| `M8-018` Strict never blocks navigation | P0 | PASS (limited) | YouTube navigation/search loaded; strict-specific traversal not verified. |
| `M8-019` unknown fail-open | P0 | PASS (observed) | Uncategorized Simple Flying search result remained visible in Gentle. |

### Dashboard P0/P1 previously blocked

| Case(s) | Priority | Result | Notes |
|---|---:|---|---|
| `M4-019` Ledger search; `M4-021` bulk categorize | P0 | BLOCKED | Not exercised. |
| `M4-022` bulk undo/recovery | P1 | BLOCKED | No bulk action executed. |
| `M5-001–008` rule CRUD, test-run, invalid regex | P0 | BLOCKED | Views/screenshots captured; editor mutations/test-run not executed. |
| `M5-017` category archive; `M5-020` score change | P0/P1 | BLOCKED | No category mutation. |
| `M5-025–027` manual custom lookback / one-shot window / auto-window | P0/P1 | BLOCKED | No manual deep/custom run. |
| `M5-030` CSV export | P1 | BLOCKED | Not requested for this round's round-trip and not run. |
| `M5-033` import merge semantics | P1 | BLOCKED | Only replacement import/restore was exercised. |
| `M5-040` export version inspection | P2 | BLOCKED | Not run live. |

### Subcategories

| Case | Priority | Result | Notes |
|---|---:|---|---|
| `SUB-001–006` create/rename/archive/reorder/assign/rule target | P0/P1 | BLOCKED | No subcategory mutations. |
| `SUB-007` parent-level chart roll-up | P0 | PASS | Seed Overview rendered News and Practical parent rows with their seeded child-assigned time included (`03-overview-dark.png`). |
| `SUB-008–018` drill-down, labels, budget, deletion/archive safety, export references, migration | P0/P1 | BLOCKED | Not interactively verified. |

### Smoke and visual regression

| Case(s) | Result | Notes |
|---|---|---|
| `SMK-01`, `SMK-02` | PASS | Reload/version and 107 tests. |
| `SMK-09` | PASS | Seeded Overview cards and charts rendered. |
| `SMK-13` | PASS | Pasted fixture import and backup restore verified. |
| `SMK-16` | PASS (limited) | Off mode and stock search observed. |
| `SMK-17–18` | BLOCKED | No qualifying over-budget real video for Gentle banner or Strict interstitial/placeholder workflow. |
| Other `SMK-*` | BLOCKED | Not run this round. |
| Dashboard visual QA — dark | PASS (captured) | Overview, Ledger, Rules, Categories, Insights, Budgets, Settings screenshots in `qa/round4/`. |
| Dashboard visual QA — light | BLOCKED | Appearance was not toggled; no local `after-light` reference screenshot was available. |

## Fail list

None confirmed. The observed “import failed: not valid JSON” came from the pasted field containing an invalid/concatenated payload; replacing it with the fixture and accepting the confirmation restored the expected three-video seed, then the saved backup restored the user's store. No persistent import failure was observed.

## Restore verification

`qa/round4/17-final-restored-off.png` shows Settings with **137 videos / 141 events** and **Current mode: off**. The original backup held 137 videos / 140 events; one additional event arrived during the authorized YouTube browse/sync. No history deletion, account-setting change, or intentional playback occurred.
