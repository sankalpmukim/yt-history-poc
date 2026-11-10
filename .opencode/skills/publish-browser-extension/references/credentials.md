# Credentials and known targets

Secrets are never committed. They live in a `keys.json` outside the repos; the
publishing scripts accept it through `--keys` or `CWS_KEYS_JSON` /
`AMO_KEYS_JSON`.

## Where the working keys are

`~/code/personal/simple-totp-manager/keys.json` holds both pairs for the same
accounts that own the extensions published from this machine:

- `chrome.clientId` / `chrome.clientSecret` / `chrome.refreshToken` — an OAuth
  client with the `chromewebstore` scope. It publishes every item on the
  account, not just the one it was created for.
- `firefox.apiKey` / `firefox.apiSecret` — an account-wide AMO key pair.

`~/code/personal/aws-accounts-manager/keys.json` has the same `chrome` shape
plus Edge publishing fields.

The Chrome **publisher id** is not stored in any of them; read it from
https://chrome.google.com/webstore/devconsole → Publisher > Settings. Item ids
appear in the dashboard URL and equal the extension id.

## Targets

| Extension | Chrome publisher | Chrome item | AMO slug |
| --- | --- | --- | --- |
| YT Ledger (`yt-history-poc`) | `12887c7f-cb4e-4f77-9928-830ee8fc1510` | `ebijfodalkiphkomfjnonjpdfjdfihfo` | `yt-ledger` |
| Simple TOTP Manager | same account | `fbldnilamcajffalfgnfgbliedfpnofk` | — |

YT Ledger's AMO add-on id is `yt-ledger@sankalpmukim` (declared in
`package.json` → `manifest.browser_specific_settings.gecko.id`).

## Creating keys

- **Chrome**: Google Cloud project → enable *Chrome Web Store API* → OAuth
  consent screen (External, add yourself as a test user) → OAuth client (Web
  application, redirect `https://developers.google.com/oauthplayground`) →
  exchange the code in the OAuth Playground for a refresh token.
- **Firefox**: https://addons.mozilla.org/developers/addon/api/key/ issues a
  key and secret; regenerate if the secret leaks.

Add `publisherId` and `itemId` to the `chrome` block if a repo should publish
without flags.
