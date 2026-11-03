# YT Ledger round 7 QA

Date: 2026-11-03  
Target: Brave signed-in session; repository HEAD `eec41c7`

## Results

| Check | Result | Notes / evidence |
|---|---|---|
| `pnpm build` | PASS | Plasmo completed successfully. `package.json` version is `0.8.3`. |
| Reload unpacked extension and verify Settings version | FAIL | Not reached. Brave UI could not be controlled with the required `agent-desktop` method. |
| Export live library to `~/Downloads/yt-ledger-pre-round7.json`, size and count | FAIL | Not reached; no backup was created and no count was read. |
| Generate QA seed | PASS | `pnpm qa:seed` completed. Generated tracked fixture changes were restored; no fixture files are included. |
| Import `fixtures/qa-seed-live.json` | FAIL | Not performed. |
| Gentle: Home card outline/chip, Search `news`, paused watch page banner/sidebar | FAIL | Not reached; no screenshots. |
| Strict: Home, Search, watch placeholder, reveal interstitial and Watch anyway | FAIL | Not reached; no screenshots. |
| YouTube theme; dashboard Overview in light and dark macOS appearances, restore original appearance | FAIL | Not reached; no appearance setting was changed. |
| Mandatory restore live backup, set Budget Off, verify original count and overlay-free Home | FAIL | Not reached. Seed was not imported, so the live library was not modified. |

## Failure detail

The required interaction path was blocked repeatedly by `agent-desktop press --window-id w-93 cmd+l` timing out with `application_inventory_unstable`: macOS app inventory reported malformed `ps` output. A fresh screenshot confirmed the keypress had not navigated. Per the requested method, no alternate interaction path was used. No native file dialog was opened, and no likes, comments, subscriptions, or history deletion actions were taken.

## Screenshot evidence

- `qa/round7/01-initial.png` — initial signed-in YouTube watch page, captured and visually inspected. It is only a starting-state record, not evidence of the requested feature checks.
