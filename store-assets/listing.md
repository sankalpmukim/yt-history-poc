# YT Ledger — store listing copy

## Name

YT Ledger — watch time, accounted for

## Short summary (Chrome ≤132 / AMO ≤250)

An expense manager for YouTube watch time: every video becomes a ledger entry, categories sit on a value ladder, and weekly budgets are enforced on youtube.com.

## Detailed description (Chrome Web Store, plain text)

YT Ledger is an expense manager for your YouTube watch time. Every video you watch becomes an entry in a local ledger, entries are organized on a value ladder from "brain rot" to "courses & lectures", and weekly budgets can be enforced right on youtube.com — gently or strictly.

Expense trackers work because they make spending visible: every transaction lands in a category, and the totals tell you something you didn't want to hear. YT Ledger does the same for time. It's not about watching less. It's about knowing what the time actually went to.

HOW IT WORKS

• Sync — YouTube has no history API, so the extension reads the history page itself, locally in your browser. Rewatches are counted as separate entries.

• Ledger — every video becomes an entry with estimated watch time (duration × progress), a category and a spot on your value ladder. Search, filter, and assign entries individually or in bulk.

• Rules — auto-categorize by title (including regex), channel or duration. The first matching rule wins, and manual assignments always beat rules.

• Budgets — weekly budgets per category, enforced on youtube.com in two modes:
 – Gentle: a chip marks over-budget videos in your feed, and watch pages show a banner.
 – Strict: over-budget videos are hidden behind a veil, and watch pages are gated behind "Watch anyway" — playback stays paused until you choose to.

• Insights — where the time actually went, week by week, with drill-downs, trends and a category ladder you can reorder to match what you consider valuable.

PRIVACY

Everything stays in your browser. No server, no account, no analytics, no tracking. Durations for videos you watched are looked up from public YouTube watch pages; nothing is ever sent anywhere else. Export your full ledger as CSV or JSON at any time.

Works in Chrome, Brave, Edge and other Chromium browsers, and in Firefox 128+.

## AMO description (HTML subset)

Uses the same text as above.

## Chrome privacy tab

Single purpose: Track YouTube watch history locally and show budget overlays on youtube.com.

Permission justifications:
- storage — Stores your ledger, categories, rules and settings locally in your browser.
- scripting — Registers the page-context script that reads YouTube's own history data on youtube.com.
- tabs — Finds an open youtube.com history tab, or briefly opens a hidden one, to sync your watch history.
- Host access *://*.youtube.com/* — Reads your watch history, looks up video durations from public watch pages, and shows budget overlays on youtube.com.

Data usage: no data is collected, used or transferred. No analytics, no tracking.

## AMO reviewer notes

Open source (MIT): https://github.com/sankalpmukim/yt-history-poc, tag v0.12.0. The package is the minified bundle produced by `pnpm build:firefox` (Plasmo/esbuild/React); no remote code is loaded and there is no server — all data stays in browser.storage.local. Duration lookups fetch public YouTube watch pages only.
