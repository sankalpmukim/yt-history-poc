# yt-history-poc

Proof of concept: a Plasmo (MV3) browser extension that reads **your own**
YouTube watch history for the **last two days**, caches it in
`chrome.storage.local`, and keeps the cache in sync on every visit — never
fetching or retaining anything older than the 2-day window (Today +
Yesterday).

**Status: WORKING** — verified live in Brave against a real account:
`sections: Today(11), Yesterday(14)` → `stored 25 entries (last 2 days)`.

## How it works (final architecture)

```
┌────────────────────────── youtube.com tab ──────────────────────────┐
│                                                                     │
│ ISOLATED world (contents/history-sync.ts)  [static manifest CS]     │
│  · injects the MAIN-world script via a <script src> tag             │
│    (url: import → auto web_accessible_resource)                     │
│  · asks MAIN for history, merges into chrome.storage.local          │
│  · merge: upsert by videoId, keep firstSeenAt, refresh dayLabel     │
│  · prune: drop entries not in latest fetch AND firstSeenAt > 48h    │
│  · renders a bottom-right overlay + console logs                    │
│                                                                     │
│ MAIN world (contents/history-main.ts)      [injected script tag]    │
│  · on /feed/history: reads window.ytInitialData — the page's own    │
│    authenticated server-rendered history data (no API call needed)  │
│  · parses day-grouped sections (Today/Yesterday/…) via a recursive  │
│    walker; stops at the first section older than yesterday          │
│  · 2026 shapes: lockupViewModel items (contentId,                    │
│    metadata.lockupMetadataViewModel.title.content, progress via     │
│    thumbnailOverlayProgressBarViewModel.startPercent) + legacy      │
│    videoRenderer fallback                                           │
│                                                                     │
│ background (background.ts) — service worker                         │
│  · storage.onChanged relay (debug channel to local capture server)  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key discoveries made during the POC (why it looks like this)

1. **No public API exists** for watch history (removed from YouTube Data
   API in 2016; Data Portability API is EU-only + app-verification-gated).
2. **Direct innertube POSTs (`/youtubei/v1/browse`) from extension-injected
   scripts come back `logged_in: 0` in Brave** — even with
   `credentials: "include"` and a valid SAPISIDHASH Authorization header.
   The page's own session cookies are stripped from extension-initiated
   API requests. (May differ in Chrome proper.)
3. **The reliable path: `youtube.com/feed/history` server-renders the
   history into `window.ytInitialData`** — fully authenticated, same
   day-grouped structure, ~50+ items per page load. The extension reads
   what the page itself already fetched.
4. **`chrome.scripting.registerContentScripts(world: "MAIN")` from the
   service worker was unreliable**; the classic `<script src>` injection
   from the isolated script works perfectly.
5. **MV3 permission gotcha**: *updating* an unpacked extension after adding
   `host_permissions` puts it in a permission limbo where content scripts
   silently stop injecting. A fresh Remove + Load unpacked grants
   everything. Lesson: change permissions → reinstall.

### Data captured per entry

```jsonc
{
  "videoId": "eMBI0isVJbo",
  "title": "Drivers React After The Race | 2026 Mexico Grand Prix",
  "channel": "FORMULA 1",
  "url": "https://www.youtube.com/watch?v=eMBI0isVJbo",
  "watchState": "Watched 16%",        // best effort (progress bar)
  "dayLabel": "Today",                // YouTube's day-group header
  "firstSeenAt": "…", "lastSeenAt": "…"  // our own sync timestamps
}
```

> Note: innertube/ytInitialData group items by day ("Today", "Yesterday",
> then weekdays/dates) — no exact watch timestamps. The 2-day window is
> therefore day-granular. Exact times only exist in My Activity / Takeout.

## Run it

```bash
pnpm install
pnpm build          # → build/chrome-mv3-prod
```

1. open `brave://extensions` → enable **Developer mode**
2. **Load unpacked** → select `build/chrome-mv3-prod`
3. open https://www.youtube.com/feed/history — the overlay appears
   bottom-right; console shows `[yt-history-poc]` logs

## Debug tooling (this repo)

- `scripts/adx.py` — robust agent-desktop wrappers for the flaky compound
  UI loop (update-extension with SW-restart verification, switch-tab,
  reload-active, console-grep).
- `scripts/capture-server.py` — local sink the SW relays storage events to
  (`python3 scripts/capture-server.py`, port 8742, writes to
  `/private/tmp/opencode/yt-poc-dumps/`). Page-context fetches to it are
  CSP-blocked; only the service worker can reach it.
- `scripts/test-parse.mjs` — offline parser tests against captured real
  response shapes.

## Verification shortcuts

- Console (page context): filter `yt-history-poc` — shows sync flow,
  sections, stored count.
- `window.__YT_HISTORY_POC_SYNC()` in the page console forces a re-sync.
- `chrome.storage.local.get("ytHistoryPoc.v1")` in the SW console dumps
  the cache.

## Known limitations

- No toolbar popup page: Plasmo 0.90.5 pins parcel 2.9.3, whose resolver
  fails on the generated `.plasmo/static/popup.tsx` shim under Node 26.
  Content scripts + background are unaffected. (Build with Node ≤ 22 to
  add one.)
- Reading only happens on `/feed/history` pages. Next step for the POC:
  have the background worker open a hidden tab to `/feed/history`, sync,
  and close it — so any YouTube page open triggers a sync.
- The innertube/ytInitialData shapes are undocumented and churn; the
  parser walks defensively (recursive key search + multiple renderer
  shapes) but will occasionally need updating.
- Personal-use, own-data POC: it reads your history exactly as the
  YouTube tab itself does. Distributing publicly has different policy
  implications (YouTube ToS / store review).
