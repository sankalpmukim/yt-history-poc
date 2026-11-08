# QA

How YT Ledger is tested.

| What | Where | Run |
|---|---|---|
| Unit tests (pure core logic: merge, rules, aggregation, budgets, retention, import/export, date labels) | `core/*.test.ts`, `utils/*.test.ts` | `pnpm test` |
| End-to-end tests (Playwright, real Chromium and Firefox with the built extension loaded in a throwaway profile) | `e2e/*.spec.ts` | `pnpm e2e` (`pnpm e2e:firefox` for Firefox only) |
| Manual test plan | [`CHECKLIST.md`](CHECKLIST.md) | by hand |

## End-to-end tests

`pnpm e2e` installs Playwright's Chromium, runs a production build, then loads
`build/chrome-mv3-prod` into a temporary browser profile. It never touches your
real browser profile. Specs seed `chrome.storage.local` from `fixtures/` and cover:

- Dashboard: Ledger search, filters and bulk edits, rules, categories and subcategories,
  Overview/Insights drill-down, budgets, settings (sync, retention, export/import), onboarding
- On-YouTube budget overlays (Gentle / Strict / Off) against real, logged-out youtube.com
  search and watch pages, in light and dark color schemes
- The extension itself (`extension.spec.ts`), with YouTube replaced by synthetic pages:
  a history page syncing into the ledger, the coordinator re-syncing an open history tab,
  background messaging, permissions, fonts, and every dashboard view

Screenshots are written to `qa/e2e/<spec>/`.

### Firefox

`pnpm e2e` also builds `build/firefox-mv3-prod` and runs the `firefox*` projects
against the installed Firefox (`/Applications/Firefox.app`; skipped if it's missing):
`extension.spec.ts`, `hidden-tab-sync.spec.ts` (live youtube.com) and the overlays in
light and dark. Firefox needs a few workarounds, all in `e2e/fixtures.ts` and `e2e/firefox-rdp.ts`:

- Playwright drives stock Firefox over WebDriver BiDi (`channel: "moz-firefox"`), which
  can't install extensions, so the build is installed as a temporary add-on over
  Firefox's remote debugging protocol, the same way `web-ext` does it.
- BiDi skips extension contexts (Mozilla bug 1755014). It can't evaluate in, query or
  screenshot the dashboard tab. Specs use `ledger.evaluate(...)` instead, which runs in
  the dashboard through the debugging protocol in Firefox and `page.evaluate` in Chromium.
  This is why the UI-heavy dashboard specs stay Chromium-only.
- Playwright can't route a tab the extension opens itself, so the hidden-tab sync is
  tested against live YouTube, and in Firefox only: under Playwright, headless Chromium
  reports every tab as visible, so the tab never acts as hidden.

Both browsers are launched muted (`--mute-audio`, `media.volume_scale = 0`). The live
specs autoplay YouTube, and headless browsers still play sound.

## Fixtures

`pnpm qa:seed` regenerates two deterministic datasets with events dated in the current week:

- `fixtures/qa-seed.json`: a small ledger with categories, subcategories, rules and an over-budget category
- `fixtures/qa-seed-live.json`: catch-all rules and exceeded budgets, so overlays appear on any live YouTube page

Either can be loaded via **Settings → Import from pasted JSON**. Import replaces the current
ledger, so export a backup first (**Copy export JSON to clipboard**).

## Manual checklist

[`CHECKLIST.md`](CHECKLIST.md) is the full manual test plan (IDs, priorities, steps, expected
results) for every feature area, plus a short smoke test. Use it for release checks on a real
signed-in profile.
