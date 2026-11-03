# YT Ledger — QA Report Round 6a

- **Date:** 2026-11-03
- **HEAD under test:** `a3e8988` (as supplied)
- **Browser:** Brave, existing signed-in profile; target window `w-2971`
- **Scope:** On-YouTube budget overlays only
- **Outcome:** BLOCKED — only the pre-test export was verified. Live fixture import and YouTube UI checks could not be completed, so no behavioral PASS/FAIL is asserted.

## Setup / execution

- Read the `qa-seed-live.json` instructions in `README.md`: two live-test categories have 60-second weekly budgets and 30 minutes seeded spend each; the NASA channel rule takes priority over the catch-all title rule. Fixtures select Strict initially; switch to Gentle/Strict in Settings > Budgets. Synthetic IDs do not need to exist on YouTube.
- Ran `PATH=/Users/sankalpmukim/.local/share/vite-plus/bin:$PATH pnpm qa:seed` (using installed pnpm at `/opt/homebrew/bin/pnpm`). Both fixture files were regenerated successfully; generated fixture changes were discarded after the run so only requested QA artifacts remain changed.
- Clicked Settings > Copy export JSON to clipboard. Saved clipboard content to `~/Downloads/yt-ledger-pre-6a.json`; measured **127,087 bytes**, satisfying the >100 KB check.
- Prepared the live fixture on clipboard with `pbcopy < fixtures/qa-seed-live.json`.
- **Blocker:** the attempted headed UI click was rejected because `agent-desktop click` does not accept `--window-id`. The attempted keyboard shortcuts were delivered, but the textarea did not change: fresh accessibility snapshot still showed the old backup JSON. Thus the live seed was not imported. No confirmation prompt appeared. As a consequence, mandatory restore import could not be performed; Settings remained at the pre-test baseline (Off). No site interaction or state-changing YouTube action was taken.
- Screenshot `qa/round6a/01-settings-preimport.png` records the Settings baseline. No overlay screenshots exist because the expected live data was not imported and overlay cases were not exercised.
- Native file dialog was not opened. No likes, comments, subscriptions, or history deletion were performed.

## Cases

| Case | Result | Evidence / detail |
|---|---|---|
| Export backup / >100 KB | PASS | `~/Downloads/yt-ledger-pre-6a.json`, 127,087 bytes; Settings baseline screenshot `qa/round6a/01-settings-preimport.png` |
| `pnpm qa:seed` | PASS | Both live and regular fixtures regenerated; working tree fixture changes subsequently cleared |
| Paste-import live fixture and confirmation | BLOCKED | Attempted clipboard path; textarea remained unchanged in fresh snapshot; no page JS confirmation |
| M8-004 | BLOCKED | No live data imported |
| M8-005 | BLOCKED | No live data imported |
| M8-006 | BLOCKED | No live data imported |
| M8-007 | BLOCKED | No live data imported |
| M8-008 | BLOCKED | No live data imported |
| M8-009 | BLOCKED | No live data imported |
| M8-010 | BLOCKED | No live data imported |
| M8-011 | BLOCKED | No live data imported |
| M8-012 | BLOCKED | No live data imported |
| M8-013 | BLOCKED | No live data imported |
| M8-014 | BLOCKED | No live data imported |
| M8-015 | BLOCKED | No live data imported |
| M8-016 | BLOCKED | No live data imported |
| M8-017 | BLOCKED | No live data imported |
| M8-018 | BLOCKED | No live data imported |
| M8-019 | BLOCKED | No live data imported |
| SMK-16 | BLOCKED | No live data imported |
| SMK-17 | BLOCKED | No live data imported |
| SMK-18 | BLOCKED | No live data imported |
| Mandatory restore / final Settings verification | BLOCKED | Import step never changed ledger state; baseline was already Off. Required post-test restore confirmation and ~137-video screenshot were not produced. |

## FAIL list

None confirmed. Cases that could not be exercised are BLOCKED, not product failures.

## Reproduction notes

Expected for import: paste the live fixture into Settings > Data > Import from pasted JSON, submit, and accept the page JavaScript confirmation. Actual: after the attempted click/keyboard sequence the field still contained the prior backup JSON and no confirmation appeared. Expected for the remainder: Gentle/Strict overlays on matched YouTube items and Off stock UI; actual: not tested.
