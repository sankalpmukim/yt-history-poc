# YT Ledger — QA Report Round 5

- **Date:** 2026-11-03
- **HEAD under test:** `d553b07`
- **Browser:** Brave, existing signed-in profile; target window `w-2971`
- **Build:** `pnpm build` PASS
- **Tests:** `pnpm test` PASS — 109 passed / 0 failed
- **Seed generation:** `pnpm qa:seed` PASS (both fixtures written)
- **Backup:** `~/Downloads/yt-ledger-pre-round5.json`, 127,087 bytes (>100 KB)
- **Version:** YT Ledger v0.8.3

## Summary

This is a **partial round**. The build/test/fixture import and final restore were verified. Some live dashboard behavior was observed, but the broad requested interaction matrix and YouTube enforcement walkthrough were not completed. BLOCKED below means not verified in this run; it does not imply a product failure. No confirmed product FAIL.

| Priority | PASS | FAIL | BLOCKED | Scope |
|---|---:|---:|---:|---|
| P0 | 6 | 0 | 18 | Build, tests, regular fixture import, backup, search, final restore; requested UI cases otherwise unverified |
| P1 | 0 | 0 | 8 | Requested UI cases not completed |
| P2 | 0 | 0 | 0 | No P2 regression matrix executed |
| **Total** | **6** | **0** | **26** | Selected round-5 case bundles only; not the full checklist |

## Execution and evidence

- `pnpm build` succeeded. `pnpm test` reported **109 pass / 0 fail**. The output included the existing TypeScript config warning (`Cannot find base config file "plasmo/tsconfig"`) and Node module-type warnings; neither caused test failure. `pnpm qa:seed` regenerated both fixtures.
- Opened the existing YT Ledger Settings tab in Brave window `w-2971`. Backup was copied using **Copy export JSON to clipboard**, then saved with `pbpaste`; measured 127,087 bytes.
- Pasted `fixtures/qa-seed.json` into **Import from pasted JSON**, submitted, and accepted the extension's page JavaScript confirmation dialog. The imported seed was visible in Ledger: three rows with the expected category assignments, including `News & updates › World news` and `Practical how-tos › Coding`.
- Ledger search was exercised with `airline`; results filtered to the matching `QA seed: airline fleet news` entry. Dark screenshot: `qa/round5/01-ledger-dark.png`.
- Final restore was done using `pbcopy < ~/Downloads/yt-ledger-pre-round5.json`, pasted into the same field, and confirmed through the page JavaScript dialog. Verified Settings screenshot `qa/round5/99-final-restore.png`: **137 videos / 141 events**, import status **restored 137 video(s), 141 event(s), 3 rule(s)**, and **Current mode: off**. Imported backup also contains the pre-round subcategories. Restore verification passed.
- No history was deleted or paused, and no YouTube like/comment/subscribe action was taken. I did not open native file dialogs.
- Visual coverage is limited to the two saved dark screenshots. Light mode was not toggled. Screenshot review did not reveal a clear layout failure; the pasted JSON textarea is long and occupies much of Settings, but the final state is readable at the tested viewport.

## Per-case outcomes — requested round-5 matrix

| Case(s) | Priority | Result | Evidence / notes |
|---|---:|---|---|
| `pnpm build` / `SMK-01` extension reload | P0 | PASS (build only) | Build succeeded. The extensions page was opened, but the unpacked extension's reload control was not verified; reload portion BLOCKED. |
| `pnpm test` / `SMK-02` | P0 | PASS | 109 passed, 0 failed. |
| `pnpm qa:seed` | — | PASS | Both fixture files regenerated. |
| `M5-029` backup via Settings clipboard | P0 | PASS | Saved backup at 127,087 bytes. |
| `qa-seed.json` paste import | P0 | PASS | Accepted page JS confirmation; seed data appeared in Ledger. |
| `M4-019` Ledger search | P0 | PASS (title search only) | `airline` filtered to the airline fleet seed entry; `01-ledger-dark.png`. Channel-search leg BLOCKED. |
| `M4-020` category/subcategory filter | P1 | BLOCKED | Not exercised. |
| `M4-021/022` bulk categorize and undo | P0/P1 | BLOCKED | Not exercised. |
| `SUB-005` single-row subcategory assignment and Parent › Sub label | P0 | BLOCKED | Existing seed labels were observed; no single-row reassignment was performed. |
| `M5-001–008` rule conditions, test-run, edit/delete, invalid regex | P0 | BLOCKED | Rules view/editor actions not exercised. |
| `SUB-006` rule targeting a subcategory | P0 | BLOCKED | Not exercised. |
| `M5-017/020` archive category / change score | P1/P0 | BLOCKED | Not exercised. |
| `SUB-001–004` create, rename, reorder, archive subcategory | P0/P1 | BLOCKED | Not exercised. |
| `SUB-0xx` deletion safety for assigned videos | P1 | BLOCKED | No deletion action attempted. |
| Overview / Insights drill-down, subcategory rows, back control; Ledger reconciliation | P0/P1 | BLOCKED | Not exercised this round. |
| `M7-001/002`, subcategory budget roll-up | P0 | BLOCKED | Not exercised in UI. Unit suite includes parent roll-up coverage, but that is not a live UI pass. |
| `M5-023–027` manual sync/custom lookback/automatic window | P0/P1 | BLOCKED | Settings controls were visible, but no sync was run. |
| `M5-028` retention change | P0 | BLOCKED | No retention setting changed. |
| `M5-030` CSV export | P1 | BLOCKED | Not exercised. |
| `M5-033` import merge semantics | P1 | BLOCKED | Not exercised; seed/backup import path is replace semantics. |
| JSON export/import round-trip and subcategory survival | P0 | PASS (restore) | Restored the pre-round backup; final state verified at 137 videos and Off. Existing subs are in the saved backup. A fresh JSON export round-trip was not separately attempted. |
| `qa-seed-live.json` import | P0 | BLOCKED | Not imported in this partial pass. |
| `M8-004–019`, `SMK-17/18` Gentle/Strict YouTube walkthrough | P0/P1 | BLOCKED | Home/Search/watch/sidebar/Shorts indicators, dismissal, strict placeholder/reveal/interstitial/minutes/Watch anyway not exercised. |
| Switch to Off / stock YouTube, `SMK-*` regression pass | P0/P1 | BLOCKED | Off is verified in final Settings only; stock YouTube and regression traversal not exercised. |
| Light-mode visual QA | P2 | BLOCKED | Appearance preference was not changed; no light screenshots. |
| Mandatory final restore | P0 | PASS | `99-final-restore.png` shows 137 videos / 141 events and Current mode: off. |

## Fail list

None confirmed. No product behavior failure was asserted from unattempted cases.

## Restore verification

The final Settings view in `qa/round5/99-final-restore.png` shows **137 videos / 141 events**, the import success message **restored 137 video(s), 141 event(s), 3 rule(s)**, and **Current mode: off**. The final import completed successfully from `~/Downloads/yt-ledger-pre-round5.json`.
