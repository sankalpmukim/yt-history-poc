# Chrome Web Store publishing

## Auth

A Google OAuth client (Web application) with the
`https://www.googleapis.com/auth/chromewebstore` scope. Exchange the refresh
token for an access token, then send it as a bearer token:

```sh
curl -s https://oauth2.googleapis.com/token \
  -d client_id=$CLIENT_ID -d client_secret=$CLIENT_SECRET \
  -d refresh_token=$REFRESH_TOKEN -d grant_type=refresh_token
```

The publishing account must have 2-step verification enabled. Credentials
created for the old v1 API keep working.

## Endpoints (v2 only)

All paths take the publisher id, shown in the Developer Dashboard under
**Publisher > Settings**:

```
GET  https://chromewebstore.googleapis.com/v2/publishers/{pub}/items/{item}:fetchStatus
POST https://chromewebstore.googleapis.com/upload/v2/publishers/{pub}/items/{item}:upload   (body = zip)
POST https://chromewebstore.googleapis.com/v2/publishers/{pub}/items/{item}:publish
POST https://chromewebstore.googleapis.com/v2/publishers/{pub}/items/{item}:cancelSubmission
POST https://chromewebstore.googleapis.com/v2/publishers/{pub}/items/{item}:setPublishedDeployPercentage
```

`upload` sends the raw zip as the body with `Content-Type: application/zip`; the
documented metadata URI without `/upload/` is not the one to call.

**The v1.1 endpoints are retired.** `POST
https://www.googleapis.com/upload/chromewebstore/v1.1/items/{id}` answers `404
Could not find handler for this request`, and `/publish` likewise. Tools built
on v1.1 (PlasmoHQ/bpp v3, older chrome-webstore-upload clients) fail with that
404 or a 400 — that is the endpoint, not the package.

## Status shape

```json
{
  "itemId": "…",
  "publishedItemRevisionStatus": { "state": "PUBLISHED",      "distributionChannels": [{ "crxVersion": "0.12.0" }] },
  "submittedItemRevisionStatus": { "state": "PENDING_REVIEW", "distributionChannels": [{ "crxVersion": "0.13.1" }] }
}
```

The version lives in `distributionChannels[0].crxVersion`, not at the top of the
revision object. `uploadState` is `IN_PROGRESS` while the store parses a fresh
package; publishing before it settles fails.

## Review

`publish` submits the uploaded draft and returns `state: PENDING_REVIEW`. The
live version only changes once review passes; until then the listing serves the
previous version. `cancelSubmission` withdraws a submission under review.

## Gotchas

- Bump `version` in the manifest before every upload or the upload is rejected.
- Publish uses the item's existing visibility. If visibility was changed in the
  dashboard, publish once manually there before the API will accept it.
- The API cannot create items, edit listing copy, screenshots, privacy answers
  or "What's new". Those are dashboard-only.
- Packages are capped at 2 GB.
- Without credentials the public listing page still shows the live version; the
  row is `<div>Version</div><div>X.Y.Z</div>`. `store-status.mjs` falls back to
  that scrape.
