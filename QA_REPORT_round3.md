# YT Ledger — QA Report Round 3

- **Date:** 2026-11-03
- **HEAD:** `407ffdf`
- **Build:** `pnpm build` PASS (production Chrome MV3 build succeeded)
- **Tests:** `pnpm test` PASS — 106 passed / 0 failed
- **Seed:** `pnpm qa:seed` PASS; fixture regenerated for week of 2026-11-02
- **Backup:** `~/Downloads/yt-ledger-pre-round3.json`, verified present and non-empty (126,666 bytes). The backup was not read.
- **Browser:** Brave; existing profile; Settings showed YT Ledger v0.8.2 and 137 videos / 140 events before fixture import.

## Execution status

This round stopped before fixture import. The dashboard's native macOS Open dialog opened, but agent-desktop could not focus or control the dialog's window to complete the requested Cmd+Shift+G path selection. Repeated semantic/physical shortcut attempts did not expose the Go to Folder sheet; after dialog interaction Brave's accessibility tree became unresponsive. No fixture import was completed, so no seeded live behavior is claimed as tested. The existing backup remains intact. Because the import did not occur, the prior 137-video / 140-event ledger was not replaced by the QA seed.

The extension Reload control was activated from `brave://extensions`; the subsequent dashboard displayed **v0.8.2**. Evidence screenshot: `qa/round3/00-dashboard-settings-before.png`. Build/test output is recorded above.

## Per-case outcomes

| Case(s) | Priority | Result | Evidence / notes |
|---|---:|---|---|
| Build + SMK-02 | P0 | PASS | `pnpm build`; `pnpm test` 106/106 |
| INST-001 / extension reload | P0 | PASS (qualified) | Reload button activated; dashboard showed v0.8.2, screenshot `qa/round3/00-dashboard-settings-before.png`. Extension-card version text was not exposed in AX. |
| M8-004–018 | P0/P1 | BLOCKED | Seed import was not completed. No live YouTube surface checks were made this round. The user permits a paused watch-page visit, but none was needed after import failed. |
| SUB-001–018 | P0/P1 | BLOCKED | Seed/import gate prevented the deterministic round-trip. No live subcategory edits were made. |
| Other previously blocked dashboard P0/P1 cases | P0/P1 | BLOCKED | Not reached because fixture import could not be completed through the native file picker. No pass inferred from unit coverage. |
| SMK-* | P0/P1 | BLOCKED (except build/tests) | No regression walkthrough was completed after the file-picker obstruction. |

## Fail / unresolved list

- **QA-EXEC-1 — fixture import not completed (execution failure; not a product failure):** Expected: choose `fixtures/qa-seed.json` in Settings → Import JSON and confirm replacement. Actual: Open dialog remained in Downloads; Cmd+Shift+G did not yield a navigable path-entry sheet via agent-desktop, and Brave AX subsequently reported `APP_UNRESPONSIVE`. Area: desktop/file-picker automation. No fixture was imported.
- **RESTORE verification outstanding:** Since the seeded import never happened, the original ledger was not replaced, but the mandatory final screenshot confirming original count and Budget mode Off has not been captured. At last dashboard observation before the picker opened, mode was Strict (state left by round 2); do not consider the profile restored to the required Off state.

## Summary

| Result | Count / scope |
|---|---|
| PASS | Build/tests and qualified extension reload/version check |
| FAIL | 1 QA execution failure (file-picker path selection); not attributed to product behavior |
| BLOCKED | M8-004–018, SUB-001–018, other requested dashboard cases, and smoke walkthrough |

**Round 3 is incomplete.** Do not interpret this report as a pass of the seeded M8/subcategory matrix or as confirmation of the mandatory restore state. The backup file is preserved for the next attempt.
