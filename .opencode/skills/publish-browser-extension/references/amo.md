# Firefox Add-ons (AMO) publishing

## Auth

An API key pair from https://addons.mozilla.org/developers/addon/api/key/.
Sign a JWT per request (HS256, 4-minute expiry) and send it as
`Authorization: JWT <token>` — not `Bearer`:

```js
const b64 = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))
const payload = b64(JSON.stringify({ iss: apiKey, jti: randomUUID(), iat: now, exp: now + 240 }))
const sig = b64(createHmac("sha256", apiSecret).update(`${header}.${payload}`).digest())
```

Keys are account-wide: one pair submits every add-on the account owns.

## Flow

```
POST  /api/v5/addons/upload/                      multipart: upload=<zip>, channel=listed
GET   /api/v5/addons/upload/{uuid}/               poll until processed, then check valid
POST  /api/v5/addons/addon/{slug}/versions/       { "upload": "<uuid>" }   add a version
POST  /api/v5/addons/addon/                       create the add-on (first submission)
PATCH /api/v5/addons/addon/{slug}/versions/{id}/  multipart: source=<zip>, license=MIT
GET   /api/v5/addons/addon/{slug}/?show_unlisted=true
```

Validation takes a few seconds; a failed package returns the validator's JSON in
`validation`.

**Source is mandatory for a minified bundle.** Attach a zip of the tagged
source, which also proves reproducibility:

```sh
git archive --format=zip vX.Y.Z -o store-assets/app-vX.Y.Z-source.zip
```

## Throttling

Submission endpoints have a small daily quota. A 429 says
`available in N seconds`; wait that out and retry rather than failing the
release.

## Force-disabled add-ons

Mozilla can disable an add-on outright. Symptoms, all of which appear together:

- the public listing 404s ("We can't find that page");
- `GET /api/v5/addons/addon/{slug}/` returns **401** with
  `"is_disabled_by_mozilla": true`;
- the Developer Hub shows the version as *Disabled by Mozilla* and offers **no
  "Upload New Version"** action;
- `POST /versions/` is refused, so the API cannot fix it either.

The disable reason arrives by email to the developer account; the Hub's Review
History panel often fails to load ("We had a problem retrieving review notes").
Resolve it with the review team before planning a release — nothing in this
tooling can submit around a disabled listing.

### Inspecting the Developer Hub without a browser login

The Hub is session-authenticated. Copy the Firefox cookie database (Firefox
holds a lock while running) and drive the pages with Playwright:

```sh
cp "$HOME/Library/Application Support/Firefox/Profiles/<profile>/cookies.sqlite" /tmp/ffc.sqlite
sqlite3 /tmp/ffc.sqlite "select value from moz_cookies where host='.addons.mozilla.org' and name='sessionid';"
```

```js
const ctx = await chromium.launchPersistentContext("", {})
await ctx.addCookies([{ name: "sessionid", value: SID, domain: ".addons.mozilla.org", path: "/", httpOnly: true, secure: true }])
await page.goto("https://addons.mozilla.org/en-US/developers/addons/")   // dashboard first, slowly
await page.goto("https://addons.mozilla.org/en-US/developers/addon/<slug>/versions/")
```

Navigate from the dashboard rather than deep-linking, and keep a few seconds
between requests: the site serves a CAPTCHA challenge to abrupt traffic. The
dashboard's recent-activity feed names the disabling actor and time.
