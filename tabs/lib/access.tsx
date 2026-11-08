/**
 * YouTube site access.
 *
 * Both browsers let the user withhold an extension's host permission after
 * install (Firefox: about:addons → Permissions; Chrome: "Site access"). When
 * youtube.com access is off, no content script runs, so syncing and the
 * budget overlays stop without any error. Detect that and offer a one-click
 * grant from the dashboard.
 */

import { useEffect, useState } from "react"

const YOUTUBE_ORIGINS = ["*://*.youtube.com/*"]

/** null while checking; true when the permissions API is unavailable (mocked pages). */
export function useYouTubeAccess(): boolean | null {
  const [granted, setGranted] = useState<boolean | null>(null)
  useEffect(() => {
    const api = globalThis.chrome?.permissions
    if (!api?.contains) {
      setGranted(true)
      return
    }
    let alive = true
    const check = () => {
      api.contains({ origins: YOUTUBE_ORIGINS })
        .then((ok) => { if (alive) setGranted(ok) })
        .catch(() => { if (alive) setGranted(true) }) // fail open: never nag on an API error
    }
    check()
    api.onAdded?.addListener(check)
    api.onRemoved?.addListener(check)
    return () => {
      alive = false
      api.onAdded?.removeListener(check)
      api.onRemoved?.removeListener(check)
    }
  }, [])
  return granted
}

export function YouTubeAccessNotice() {
  const granted = useYouTubeAccess()
  const [declined, setDeclined] = useState(false)
  if (granted !== false) return null

  const request = () => {
    // Firefox only honours permissions.request() synchronously inside the
    // click handler, so nothing may be awaited before this call.
    chrome.permissions.request({ origins: YOUTUBE_ORIGINS })
      .then((ok) => setDeclined(!ok))
      .catch(() => setDeclined(true))
  }

  return (
    <div className="access-notice" role="region" aria-labelledby="access-notice-title">
      <p className="access-notice-title" id="access-notice-title">YouTube access is turned off</p>
      <p className="access-notice-body">
        Your browser isn't letting YT Ledger read youtube.com, so syncing and budget overlays are paused.
        After allowing access, reload any open YouTube tabs.
      </p>
      <div className="access-notice-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={request}>Allow YouTube access</button>
        {declined ? <span className="access-notice-hint">Access wasn't granted. You can also allow it from the browser's extension settings.</span> : null}
      </div>
    </div>
  )
}
