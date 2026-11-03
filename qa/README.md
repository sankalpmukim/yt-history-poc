# QA

How YT Ledger is tested.

| What | Where | Run |
|---|---|---|
| Unit tests (pure core logic: merge, rules, aggregation, budgets, retention, import/export, date labels) | `core/*.test.ts`, `utils/*.test.ts` | `pnpm test` |
| End-to-end tests (Playwright, real Chromium with the built extension loaded in a throwaway profile) | `e2e/*.spec.ts` | `pnpm e2e` |
| Manual test plan | [`CHECKLIST.md`](CHECKLIST.md) | by hand |

## End-to-end tests

`pnpm e2e` installs Playwright's Chromium, runs a production build, then loads
`build/chrome-mv3-prod` into a temporary browser profile. It never touches your
real browser profile. Specs seed `chrome.storage.local` from `fixtures/` and cover:

- Dashboard: Ledger search, filters and bulk edits, rules, categories and subcategories,
  Overview/Insights drill-down, budgets, settings (sync, retention, export/import), onboarding
- On-YouTube budget overlays (Gentle / Strict / Off) against real, logged-out youtube.com
  search and watch pages, in light and dark color schemes

Screenshots are written to `qa/e2e/<spec>/`.

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
