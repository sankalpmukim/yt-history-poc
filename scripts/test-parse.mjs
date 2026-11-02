// Quick offline test of the parsing logic against the real captured shape.
const collect = (root, key, out = []) => {
  if (!root || typeof root !== "object") return out
  if (Array.isArray(root)) { root.forEach(v => collect(v, key, out)); return out }
  for (const [k, v] of Object.entries(root)) { if (k === key) out.push(v); collect(v, key, out) }
  return out
}
const textOf = (node) => {
  if (!node) return ""
  if (typeof node === "string") return node
  if (typeof node.simpleText === "string") return node.simpleText
  if (typeof node.content === "string") return node.content
  if (Array.isArray(node.runs)) return node.runs.map(r => r?.text ?? "").join("")
  return ""
}
const parseWatchState = (c) => {
  const pct = collect(c, "thumbnailOverlayResumePlaybackRenderer")[0]?.percentDurationWatched
    ?? collect(c, "thumbnailOverlayProgressBarViewModel")[0]?.startPercent
  return typeof pct === "number" ? `Watched ${pct}%` : ""
}
const parseItem = (node) => {
  const vr = node?.videoRenderer
  if (vr?.videoId) return { videoId: vr.videoId, title: textOf(vr.title) }
  const lock = node?.lockupViewModel
  if (lock?.contentId) {
    const meta = lock?.metadata?.lockupMetadataViewModel
    const rows = meta?.metadata?.contentMetadataViewModel?.metadataRows ?? []
    const parts = []
    for (const row of rows) for (const part of row?.metadataParts ?? [])
      if (typeof part?.text?.content === "string") parts.push(part.text.content)
    return { videoId: lock.contentId, title: meta?.title?.content ?? "", channel: parts[0] ?? "", watchState: parseWatchState(lock) }
  }
  return null
}
const parseSection = (sec) => {
  const headerNode = sec?.header?.itemSectionHeaderRenderer?.title ?? sec?.header?.submenuHeaderRenderer?.title
  const dayLabel = textOf(headerNode)
  const items = []
  for (const c of Array.isArray(sec?.contents) ? sec.contents : []) {
    const it = parseItem(c)
    if (it && it.title) items.push(it)
  }
  if (!dayLabel || items.length === 0) return null
  return { dayLabel, items }
}

// real shapes captured from the live page
const lockup = {
  contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { progressBar: { thumbnailOverlayProgressBarViewModel: { startPercent: 16 } } } }] } },
  metadata: {
    lockupMetadataViewModel: {
      title: { content: "Drivers React After The Race | 2026 Mexico Grand Prix" },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: "FORMULA 1" } }, { text: { content: "642K" } }] }] } }
    }
  },
  contentId: "eMBI0isVJbo",
  contentType: "LOCKUP_CONTENT_TYPE_VIDEO"
}
const sectionToday = {
  contents: [{ lockupViewModel: lockup }],
  header: { itemSectionHeaderRenderer: { title: { runs: [{ text: "Today" }] } } }
}
const sectionYesterday = {
  contents: [{ lockupViewModel: { ...lockup, contentId: "ce9H5xCSH8w" } }],
  header: { itemSectionHeaderRenderer: { title: { simpleText: "Yesterday" } } }
}
const sectionOld = {
  contents: [{ lockupViewModel: { ...lockup, contentId: "OLD" } }],
  header: { itemSectionHeaderRenderer: { title: { simpleText: "Saturday" } } }
}
const ytInitialData = { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [
  { itemSectionRenderer: sectionToday },
  { itemSectionRenderer: sectionYesterday },
  { itemSectionRenderer: sectionOld }
] } } } }] } } }

const secs = collect(ytInitialData, "itemSectionRenderer").map(parseSection).filter(Boolean)
console.log('collect found:', collect(ytInitialData, "itemSectionRenderer").length, 'sections')
console.log('raw parse results:', collect(ytInitialData, "itemSectionRenderer").map(s => {
  const headerNode = s?.header?.itemSectionHeaderRenderer?.title ?? s?.header?.submenuHeaderRenderer?.title
  const dayLabel = textOf(headerNode)
  const items = (s?.contents ?? []).map(parseItem)
  return `day=${JSON.stringify(dayLabel)} items=${JSON.stringify(items.map(i => i && i.title))}`
}))
console.log('parsed sections:', secs.map(s => `${s.dayLabel}(${s.items.length})`))
console.log('first item:', JSON.stringify(secs[0]?.items[0]))
