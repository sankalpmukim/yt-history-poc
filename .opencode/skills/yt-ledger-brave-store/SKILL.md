---
name: yt-ledger-brave-store
description: Read and query the YT Ledger extension's real local data (chrome.storage.local) from the user's Brave browser profile, and analyze it with this repo's core modules. Use whenever a task involves the user's actual YT Ledger data — locating the installation, dumping the store, inspecting videos/events/categories/rules/settings, running aggregates, signals or health checks on real usage, or seeding screenshots from real data. Requires Brave on macOS with the extension loaded unpacked from this repo's build/chrome-mv3-prod.
---

# YT Ledger Brave store

The extension's data lives in Brave's LevelDB at
`~/Library/Application Support/BraveSoftware/Brave-Browser/<Profile>/Local Extension Settings/<ext-id>`.
Brave holds a `LOCK` on that database while running, so **always work on a
copy** — never touch the original. Chromium reads the LevelDB itself (no
parser): a scratch Chromium profile containing the copy plus `--load-extension`
of this repo's `build/chrome-mv3-prod` derives the same extension id, and
`chrome.storage.local.get` returns the whole store.

## Workflow

1. **Locate and copy** (fragile step, scripted):
   ```sh
   bash scripts/locate-brave-install.sh
   ```
   Prints `EXT_ID=`, `PROFILE=`, `LDB_COPY=` (a temp copy of the LevelDB).

2. **Dump** the store:
   ```sh
   node scripts/dump-store.mjs "$LDB_COPY" "$EXT_ID" /tmp/yt-ledger-store.json
   ```

3. **Query** it — reports run through the repo's own `core/*` modules, so
   numbers match the dashboard:
   ```sh
   node scripts/query-store.mjs /tmp/yt-ledger-store.json summary
   node scripts/query-store.mjs /tmp/yt-ledger-store.json signals
   node scripts/query-store.mjs /tmp/yt-ledger-store.json day 2026-11-10
   ```
   Reports: `summary`, `signals`, `channels [n]`, `day YYYY-MM-DD`,
   `videos [n] [--cat id]`, `rules`, `health`, `key <storage-key>`.
   Read `references/data-model.md` before writing any query.

## For anything the reports don't cover

Write a throwaway `.ts` that imports from `core/*` (pure modules — no
`chrome.*`) and bundle-and-run it against the dump:
```sh
node_modules/.bin/esbuild my-query.ts --bundle --platform=node --format=esm --outfile=/tmp/q.mjs
# then node /tmp/q.mjs with the dump path passed in
```
`core/aggregate` rolls events into rows/totals, `core/signals` carries the
insight engine. Prefer composing those over reimplementing their rules.

## Caveats

- The dump is **personal data** (full watch history). Keep it in a temp
  directory; never commit it or paste it into shared artifacts.
- It is a **snapshot** — re-run locate + dump after the user syncs or watches.
- Only Brave on macOS is wired up (`locate-brave-install.sh`); the dump and
  query steps work on any exported store JSON regardless.
