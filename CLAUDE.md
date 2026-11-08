# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

YT Ledger is a Manifest V3 extension for Chromium browsers and Firefox (128+), built with Plasmo, React 18 and pnpm. Both browsers must stay fully supported: any change ships to both builds. It works as an expense manager for YouTube watch time: every watched video becomes a ledger entry, entries get categories on a value ladder, and weekly budgets can be enforced on youtube.com. Everything is local-only, with no server.

## Commands

```sh
pnpm install
pnpm dev            # dev build with live reload → build/chrome-mv3-dev (load unpacked)
pnpm dev:firefox    # same → build/firefox-mv3-dev (about:debugging → Load Temporary Add-on → manifest.json)
pnpm build          # production build → build/chrome-mv3-prod
pnpm build:firefox  # production build → build/firefox-mv3-prod
pnpm build:all      # both production builds
pnpm package        # zips the EXISTING build/chrome-mv3-prod; run `pnpm build` first or you ship a stale version
pnpm package:firefox  # zips the EXISTING build/firefox-mv3-prod; same caveat
pnpm test           # unit tests: esbuild bundles core/*.test.ts + utils/*.test.ts into .test/, then node --test
pnpm e2e            # installs Playwright Chromium, runs pnpm build:all, then all Playwright specs (Chromium + Firefox)
pnpm e2e:headed     # same, headed
pnpm e2e:firefox    # pnpm build:firefox, then only the firefox* projects
pnpm qa:seed        # regenerate fixtures/qa-seed.json and fixtures/qa-seed-live.json (events dated in the current week)
```

**Single unit test file:**

```sh
rm -rf .test && pnpm exec esbuild core/merge.test.ts --bundle --platform=node --format=esm --outdir=.test && node --test .test/
```

To filter by test name, add `--test-name-pattern "<name>"` to `node --test`.

**Single e2e spec.** Specs load `build/chrome-mv3-prod`, so build first:

```sh
pnpm build && pnpm exec playwright test e2e/rules.spec.ts
```

- `--project dashboard` runs only the Chromium dashboard specs (plus `extension.spec.ts`).
- `overlays.spec.ts` runs in the `overlays-light` and `overlays-dark` projects against **live, logged-out youtube.com**, so it needs network access.
- Firefox projects (`firefox`, `firefox-overlays-light`, `firefox-overlays-dark`) load `build/firefox-mv3-prod` into the installed `/Applications/Firefox.app`; they skip if it's missing. `hidden-tab-sync.spec.ts` is Firefox-only and also needs live youtube.com.

**Firefox e2e harness** (`e2e/fixtures.ts`, `e2e/firefox-rdp.ts`; details in `qa/README.md`):
- Playwright drives stock Firefox over WebDriver BiDi (`channel: "moz-firefox"`). The add-on is installed as a temporary add-on over Firefox's remote debugging protocol (RDP). The UUID is fixed via `extensions.webextensions.uuids`, and `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` lets BiDi navigate to `moz-extension://`.
- BiDi can't evaluate in, query or screenshot extension pages. Use `ledger.evaluate(fn, arg)` and `waitForExtension(...)`, which go over RDP in Firefox and `page.evaluate` in Chromium. Functions are serialized, so they can't close over variables; pass data through `arg`.
- The UI-heavy dashboard specs therefore stay Chromium-only. Put cross-browser behaviour in `extension.spec.ts`.
- Playwright can't route the first navigation of a tab the extension opens itself, in either browser.
- When registering `context.route`, the most recently added route wins, so register catch-alls first.
- Both browsers launch muted (`--mute-audio`, `media.volume_scale`). Keep it that way: live specs autoplay YouTube.

**Typecheck.** There's no lint or typecheck script, and Plasmo's build doesn't typecheck. `tsconfig.json` extends `plasmo/tsconfig`, which doesn't resolve, so `tsc -p tsconfig.json` fails. To typecheck, use a temporary config that extends `./node_modules/plasmo/templates/tsconfig.base.json`. A few type errors already exist in `background.ts`, `contents/history-sync.ts` and `core/assign.ts`.

**Dashboard screenshots:**

```sh
node scripts/capture-dashboard-screenshots.mjs after light|dark [page]
```

This serves the prod build with a mocked `chrome.storage` seeded from `fixtures/qa-seed.json`. It writes to `docs/screenshots/after[-light]/` and requires Google Chrome in `/Applications`. Theme is forced through `<html data-theme>`.

## Architecture

**Data flow for a sync.** YouTube has no history API, so the extension reads the history page itself.

1. Any YouTube visit runs `contents/history-sync.ts`, an isolated-world content script. It injects `contents/history-main.ts` into the MAIN world.
   - The script is injected with a `<script src>` tag. `background.ts` also registers it with `chrome.scripting` as a backup path.
2. `history-main.ts` reads YouTube's own `ytInitialData` and its continuation pages, which are grouped by day.
3. Raw sections go to the service worker as `yl.syncResult`. If the current page can't read history, the content script sends `yl.visitNeedHelp`. The worker then pokes an existing `/feed/history` tab or opens one hidden tab, throttled to about every 2 minutes. `yl.manualSync` bypasses the throttle.
4. `background.ts` is the **single writer for sync merges**. It calls `core/ledger.applySyncResult`, which:
   - merges into storage (`core/merge.ts`)
   - counts rewatches as separate events
   - runs rules
   - queues missing durations for `core/resolve.ts`, which fetches public watch pages
5. The worker recomputes a budget-status snapshot (`yl.v2.budgetStatus`). This happens debounced on storage changes, or immediately on `yl.refreshBudget`.
6. `contents/budget-guard.ts` reads that snapshot plus the rules. It classifies feed cards and watch pages with `core/classify.ts` and applies Gentle or Strict overlays. It **fails open**: unknown or uncategorized videos are never touched.

**Firefox.**
- Plasmo's `--target=firefox-mv3` turns the service worker into `background.scripts` (an event page). `package.json` `manifest.browser_specific_settings.gecko` holds the add-on ID, `strict_min_version` and `data_collection_permissions`; Plasmo strips it from Chrome builds.
- Firefox exposes the promise-returning `chrome.*` namespace in MV3, so code uses `chrome.*` everywhere. Don't add a polyfill.
- Both backgrounds are suspended after about 30s idle, so don't rely on in-memory state surviving between messages. Persist it, as `currentHiddenTabId()` does with `yl.v2.syncState`.
- Users can revoke host access, which Firefox treats as optional in MV3. `tabs/lib/access.tsx` shows a notice with an "Allow YouTube access" button. `permissions.request` must be called synchronously in the click handler.
- Real Firefox plays YouTube video and inline previews, which Playwright's Chromium can't. The overlay specs in Firefox are what catch problems with playback behind overlays.
- Check the Firefox build with `npx web-ext lint -s build/firefox-mv3-prod`. The only expected warnings are React-DOM's `innerHTML`.

**Storage.** All data lives in `chrome.storage.local` under `yl.v2.*` keys (`core/types.ts` `KEYS`).
- Events are sharded by month as `yl.v2.events.YYYY-MM`, so a sync rewrites only the shards it touched.
- `core/storage.ts` wraps storage in a `KV` interface, with `MemoryKV` for unit tests.
- `core/migrate.ts` performs the one-time v1→v2 migration.
- The dashboard is an extension page. It reads the whole store in one go (`tabs/lib/data.ts` `loadLedgerData`) and re-renders on storage changes.
- The dashboard writes taxonomy, rules and settings directly. After any change to categories or rules, call `runRulesPass(new ChromeKV(), now)` so auto-assignments are recomputed.

**Taxonomy and value.**
- Categories form an ordered ladder, and **value comes from position**. `valueScore` is derived (`core/taxonomy.ts` `scoreAtPosition`, `deriveCategoryScores`); it is never edited directly.
- A rule or assignment can target a category or a subcategory. "Target" means either; `resolveTarget` and `topLevelCategoryId` map a subcategory to its parent.
- A video's effective category is the manual `categoryOverride`, otherwise the rule-assigned `autoCategoryId`. Manual always wins.
- Rules are ordered by `priority`, and the first match wins (`core/rules.ts`).
- Archived items stay on existing history but aren't offered for new picks.

**Time is estimated:** duration × watch progress × occurrences (`core/estimate.ts`). Confidence is `high`, `medium` (assumed watched to the end) or `low` (unknown duration). History is day-granular only.

**Where code lives.**
- `core/` is pure, unit-tested logic: merge, rules, aggregate, budget, insights, retention, exports, taxonomy. Keep it free of `chrome.*` except through `KV`.
- `tabs/dashboard.tsx` is a hash-routed shell (`#/overview`, `#/ledger`, …). First run forces `#/onboarding` until `settings.onboardedAt` is set.
- Views are in `tabs/views/`. Shared UI is in `tabs/lib/ui.tsx`: `Dialog`, `TaxonomyPicker`, `CategoryChip`, `RangeBar`, `BudgetModeControl`, plus the `fmtDur` and `plural` helpers.

## Dashboard design system ("the statement")

All CSS is one template string in `tabs/lib/styles.ts`. There's no CSS framework.

**Tokens and themes.**
- Tokens are HSL custom properties for ledger paper, ink and pencil.
- Red is reserved for overages and the money column.
- Dark tokens apply under `prefers-color-scheme: dark`, unless `[data-theme="light"]` is set, and always under `[data-theme="dark"]`.

**Type.**
- Source Serif 4 is used for figures and titles; Public Sans for the UI.
- Both are bundled as woff2 in `assets/fonts/`. They must be listed in `package.json` `manifest.web_accessible_resources` so the YouTube overlays can load them.

**The money column.**
- The one signature element is `.money`: a right-aligned column with a red double rule.
- Totals use `.total-rule`: a single rule above and a double rule below.
- Don't add competing bold elements.

**Scales.**
- Spacing: 4/8/12/16/24/32/48/64.
- Type: 12/14/16/18/20/24/30/48.
- One 4px radius for controls and dialogs.

**Dialogs.** Use the shared `Dialog` component. It portals, traps focus, handles Escape for the topmost dialog only, and restores focus, falling back to `#main`.

**Overlays.** On YouTube, the overlays follow YouTube's own theme (`html[dark]`), not the OS theme. Build their DOM with `textContent`, never `innerHTML`.
- Strict mode must also stop playback. Hover events over a veil are stopped before YouTube's listeners run. A hover preview (`#video-preview`) that sits on a veil is hidden and paused, by geometry. The watch-page interstitial keeps the `#movie_player` video paused until "Watch anyway" is clicked.

## Tests pin UI copy

The e2e specs assert on exact visible text and accessible names: button labels, headings, `aria-label`s such as `"Drill into …"` and `"Reorder category …"`, and label text used by `getByLabel`.
- `getByLabel` and `getByRole` match substrings case-insensitively. A new label that contains "Name", "Shorts", "Edit" or "Delete" near the targeted control can cause strict-mode violations.
- When you change copy, grep `e2e/` and update the assertions.
- Specs also rely on these classes: `.card`, `.queueitem`, `.reading-number`, `.value-details`, `button.chip`, `table.ledger`, `.overlay`, `.category-main-row`, and the `.yl-budget-guard*` classes.
- `overlays.spec.ts` checks rendered font sizes: chips must be at least 12px and the veil at least 13px.
- Several specs check that `/0–5|0-5|\b[0-5]\s*\/\s*5\b/` **never** appears. Numeric value scores are intentionally hidden from the UI.

## Versioning and releases

- `core/version.ts` `APP_VERSION` must equal `package.json` `version`; `core/version.test.ts` enforces this.
- Release convention:
  1. Commit the work.
  2. Make a `release: vX.Y.Z` commit that bumps both version files.
  3. Create an annotated tag `vX.Y.Z` and push `main` plus the tag.
  4. Run `pnpm build:all && pnpm package && pnpm package:firefox`. Copy `build/chrome-mv3-prod.zip` to `yt-ledger-vX.Y.Z.zip` and `build/firefox-mv3-prod.zip` to `yt-ledger-vX.Y.Z-firefox.zip`.
  5. Run `gh release create vX.Y.Z yt-ledger-vX.Y.Z.zip yt-ledger-vX.Y.Z-firefox.zip --title "YT Ledger vX.Y.Z"`. The notes end with "Install: Chrome: unzip and Load unpacked in chrome://extensions. Firefox: about:debugging → Load Temporary Add-on → pick the -firefox.zip."
- Development-only code (the dev relay to `127.0.0.1:8742`) is gated on `process.env.NODE_ENV !== "production"`, so production builds ship no localhost host permission.
