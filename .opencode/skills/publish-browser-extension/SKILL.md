---
name: publish-browser-extension
description: Ship a browser extension to the Chrome Web Store and Firefox Add-ons (AMO) from the command line, and check whether a release actually reached each store. Use when releasing, uploading or publishing an extension build, submitting a version for review, attaching source to an AMO version, answering "is the new version live yet", or diagnosing a failed store publish such as a force-disabled AMO listing or a 404 from the retired Chrome v1.1 upload endpoint.
---

# Publish a browser extension

Two stores, two APIs, one loop: bump the version, build both targets, upload,
submit for review, then verify what is actually live. Neither API can edit
listing copy, screenshots or "What's new" — those stay in the dashboards.

## Credentials

Secrets live in a `keys.json` outside the repos (never commit it). The shape
this tooling reads:

```json
{ "chrome":  { "clientId": "...", "clientSecret": "...", "refreshToken": "...", "publisherId": "...", "itemId": "..." },
  "firefox": { "apiKey": "...", "apiSecret": "...", "slug": "..." } }
```

On this machine `~/code/personal/simple-totp-manager/keys.json` already holds a
working `chrome` pair and an account-wide `firefox` pair; both work for any
add-on the account owns. AMO keys are per account, not per add-on. The Chrome
publisher id is shown in the Developer Dashboard under **Publisher > Settings**;
it is not in any keys file, and v2 URLs need it. See
[references/credentials.md](references/credentials.md) for known targets.

## Release loop

1. Bump the version in `package.json` and in the app's own version constant
   (`core/version.ts` here), then build and package both targets.
2. Chrome — upload and submit for review:
   ```sh
   node scripts/cws.mjs release build/chrome-mv3-prod.zip \
     --keys ~/code/personal/simple-totp-manager/keys.json --publisher <publisher-id> --item <item-id>
   ```
3. Firefox — upload, validate, add the version, attach source (the production
   bundle is minified, so AMO needs the source):
   ```sh
   git archive --format=zip vX.Y.Z -o store-assets/app-vX.Y.Z-source.zip
   node scripts/amo.mjs build/firefox-mv3-prod.zip store-assets/app-vX.Y.Z-source.zip \
     --keys ~/code/personal/simple-totp-manager/keys.json --slug <amo-slug>
   ```
4. Verify, and re-verify later — review is asynchronous:
   ```sh
   node scripts/store-status.mjs --item <item-id> --slug <amo-slug> --version X.Y.Z
   ```
   It prints the Chrome live / submitted / draft versions and the AMO state,
   and exits non-zero while a store is not on the expected version.

## Commands

| Script | Purpose |
| --- | --- |
| `scripts/cws.mjs status` | live, submitted and draft versions plus warnings |
| `scripts/cws.mjs upload <zip>` | upload only (refuses a zip whose manifest version ≠ `package.json`) |
| `scripts/cws.mjs publish` | submit the uploaded draft for review |
| `scripts/cws.mjs release <zip>` | upload, wait for the store to parse it, submit for review |
| `scripts/amo.mjs <zip> [source.zip]` | upload + validate + new version (+ source) |
| `scripts/amo.mjs ... --create` | create the add-on first (`--summary` required) |
| `scripts/store-status.mjs` | "did it land?" for both stores, no writes |

Every script takes flags or the matching environment variable
(`CWS_KEYS_JSON`, `CWS_PUBLISHER_ID`, `CWS_ITEM_ID`, `AMO_KEYS_JSON`,
`AMO_SLUG`), so a release can run unattended.

This repository also ships `scripts/cws-publish.mjs` and
`scripts/amo-submit.mjs` with the YT Ledger ids baked in — same flows, no flags.
Use them for a YT Ledger release; use the scripts here for any other extension.

## What fails, and why

- **Chrome upload returns 404 `Could not find handler for this request`** — the
  v1.1 endpoints are retired. Use v2 with the publisher id in the path; this is
  what `scripts/cws.mjs` does. Old tooling (PlasmoHQ/bpp, chrome-webstore-upload
  v1 clients) fails this way.
- **Chrome `publish` fails right after upload** — the package is still being
  parsed. Poll `fetchStatus` until `uploadState` leaves `IN_PROGRESS`.
- **Chrome rejects the upload** — the manifest version was not increased, or the
  account lacks 2-step verification.
- **AMO says `is_disabled_by_mozilla` / the listing 404s / the Developer Hub has
  no "Upload New Version"** — Mozilla force-disabled the add-on; new versions
  cannot be submitted until the review team re-enables it. Do not try to work
  around it: read [references/amo.md](references/amo.md) and resolve it first.
- **AMO 429 with "available in N seconds"** — a per-account submission quota;
  `scripts/amo.mjs` waits it out automatically.
- **"What's new" or listing text is wrong after publishing** — the APIs cannot
  set it. Only the dashboards can.

## References

- [references/chrome-web-store.md](references/chrome-web-store.md) — endpoints, token refresh, status fields, review states, gotchas.
- [references/amo.md](references/amo.md) — JWT auth, upload/validate/source flow, throttling, and how to inspect a force-disabled listing.
- [references/credentials.md](references/credentials.md) — where the keys live and the known publisher/item/slug targets.
