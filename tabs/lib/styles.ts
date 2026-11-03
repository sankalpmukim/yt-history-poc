/** Field-instrument design system for the YT Ledger dashboard. */
const barlowSemiBold = chrome.runtime.getURL("assets/fonts/BarlowCondensed-SemiBold.woff2")
const barlowBold = chrome.runtime.getURL("assets/fonts/BarlowCondensed-Bold.woff2")

export const CSS = `
@font-face { font-family: "Ledger Display"; src: url("${barlowSemiBold}") format("woff2"); font-style: normal; font-weight: 600; font-display: swap; }
@font-face { font-family: "Ledger Display"; src: url("${barlowBold}") format("woff2"); font-style: normal; font-weight: 700; font-display: swap; }
:root {
  color-scheme: light dark;
  --bg: #eef3f1; --panel: #f8faf8; --panel2: #e4ece9; --border: #c8d5d1;
  --text: #18323a; --muted: #536d71; --accent: #147d80; --danger: #a33f35;
  --ok: #32715e; --warn: #986319; --ink-soft: #284a52; --focus: #147d80;
  --rule: rgba(40, 74, 82, .10); --shadow: 0 7px 20px rgba(24,50,58,.045);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14272b; --panel: #1b3237; --panel2: #244047; --border: #38555a;
    --text: #e8f0ec; --muted: #a5bbb7; --accent: #69c2b8; --danger: #ff9384;
    --ok: #84c7a1; --warn: #e0b568; --ink-soft: #c5d8d3; --focus: #8bd8cb;
    --rule: rgba(197,216,211,.09); --shadow: 0 7px 20px rgba(0,0,0,.14);
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  background-color: var(--bg); color: var(--text);
  background-image: linear-gradient(to bottom, transparent 0 31px, var(--rule) 31px 32px, transparent 32px 100%);
  background-size: 100% 40px;
  font: 14px/1.55 "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif;
  letter-spacing: .005em;
}
button, input, select, textarea { font: inherit; }
a { color: var(--accent); text-decoration: none; text-underline-offset: .18em; }
a:hover { text-decoration: underline; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 3px solid var(--focus); outline-offset: 2px;
}
.app { display: flex; min-height: 100vh; }
.sidebar {
  width: 230px; flex: 0 0 230px; padding: 25px 16px 20px;
  border-right: 1px solid var(--border); background: var(--panel);
  position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column;
}
.brand { font-weight: 680; font-size: 16px; padding: 4px 10px 12px; display:flex; gap:9px; align-items:center; letter-spacing: -.025em; }
.brand-mark { width: 25px; height: 25px; flex: 0 0 25px; border: 1.5px solid var(--accent); border-radius: 50%; display: inline-grid; place-items: center; color: var(--accent); padding: 3px; }
.brand .sub { font-size: 10px; color: var(--muted); font-weight: 500; margin-left: auto; }
.nav { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.nav a { display: flex; align-items: center; gap: 11px; padding: 10px 11px; border-radius: 3px; color: var(--ink-soft); border-left: 2px solid transparent; text-decoration: none; }
.nav-icon { width: 18px; height: 18px; flex: 0 0 18px; opacity: .8; }
.nav a:hover { background: var(--panel2); text-decoration: none; }
.nav a.active { background: var(--panel2); border-left-color: var(--accent); color: var(--text); font-weight: 650; }
.sidefoot { margin-top: auto; padding: 14px 10px 0; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); line-height: 1.8; overflow-wrap: anywhere; }
.main { flex: 1; min-width: 0; padding: 32px clamp(22px, 4vw, 58px) 64px; max-width: 1380px; }
h1 { font-size: clamp(25px, 2.3vw, 34px); line-height: 1.16; letter-spacing: -.045em; margin: 0 0 5px; font-weight: 650; }
h2 { letter-spacing: -.02em; }
.hint { color: var(--muted); font-size: 12.5px; margin: 0 0 22px; max-width: 76ch; }
.card { background: transparent; border: 0; border-top: 1px solid var(--border); border-radius: 0; padding: 20px 0 24px; margin: 0; box-shadow: none; }
.card h2 { font-size: 15px; margin: 0 0 13px; color: var(--text); font-weight: 650; }
.statgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 18px; margin: 16px 0 20px; }
.stat { background: transparent; border: 0; border-left: 1px solid var(--border); border-radius: 0; padding: 2px 12px; }
.stat:last-child { border-right: 0; }
.stat .v { font-family: "Ledger Display", "Avenir Next", sans-serif; font-size: 25px; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.stat .l { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.reading-panel { display: grid; grid-template-columns: minmax(250px, .9fr) minmax(340px, 1.6fr); gap: 30px; align-items: end; padding: 18px 0 24px; border-bottom: 1px solid var(--border); }
.reading-copy h1 { margin-bottom: 10px; }
.reading-number { font: 700 clamp(76px, 10vw, 142px)/.78 "Ledger Display", "Avenir Next", sans-serif; letter-spacing: -.035em; font-variant-numeric: lining-nums tabular-nums; white-space: nowrap; color: var(--text); }
.reading-caption { margin-top: 11px; font-size: 13px; color: var(--muted); }
.reading-caption strong { color: var(--accent); font-weight: 650; }
.reading-notes { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.reading-note { padding: 11px 12px 12px; border-right: 1px solid var(--border); }
.reading-note:last-child { border-right: 0; }
.reading-note strong { display: block; font: 600 26px/1 "Ledger Display", "Avenir Next", sans-serif; font-variant-numeric: tabular-nums; }
.reading-note span { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
.trace-card { border-top: 0; padding-top: 24px; }
.trace-card .spread { margin-bottom: 10px; }
.trace-card h2, .ladder-card h2 { font-size: 17px; }
.trace-frame { position: relative; padding: 10px 14px 5px; background: color-mix(in srgb, var(--panel) 76%, transparent); border-left: 2px solid var(--accent); }
.trace-svg { display: block; width: 100%; }
.trace-bar-segment { transform-box: fill-box; transform-origin: center bottom; animation: rise-in .6s cubic-bezier(.2,.7,.2,1) both; }
.trace-ruler { stroke: var(--border); stroke-width: 1; stroke-dasharray: 2 6; }
.trace-line { fill: none; stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.trace-point { fill: var(--panel); stroke: var(--accent); stroke-width: 2; vector-effect: non-scaling-stroke; }
.ladder-card { padding-top: 21px; }
.ladder-head { display: grid; grid-template-columns: minmax(170px, 1.1fr) minmax(260px, 2fr) 72px; gap: 14px; align-items: end; margin: 12px 0 4px; color: var(--muted); font-size: 11px; }
.ladder-direction { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 5px; }
.ladder-row { border-top: 1px solid var(--rule); }
.value-trigger { width: 100%; display: grid; grid-template-columns: minmax(170px, 1.1fr) minmax(260px, 2fr) 72px; gap: 14px; align-items: center; padding: 12px 0; color: var(--text); text-align: left; border: 0; background: transparent; cursor: pointer; }
.value-trigger:hover .value-name { color: var(--accent); }
.value-name { min-width: 0; display: flex; align-items: center; gap: 9px; font-weight: 600; }
.value-name-text { overflow: hidden; text-overflow: ellipsis; }
.ladder-rail { position: relative; height: 22px; background: repeating-linear-gradient(to right, transparent 0, transparent calc(20% - 1px), var(--border) calc(20% - 1px), var(--border) 20%); border-bottom: 1px solid var(--border); }
.ladder-progress { position: absolute; bottom: -1px; left: 0; height: 3px; max-width: 100%; transform-origin: left; }
.ladder-marker { position: absolute; bottom: -4px; width: 9px; height: 9px; border: 2px solid var(--panel); border-radius: 50%; transform: translateX(-50%); box-shadow: 0 0 0 1px currentColor; }
.value-time { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.value-details { margin: 0 0 12px clamp(20px, 4vw, 55px); padding: 4px 0 4px 17px; border-left: 1px solid var(--accent); animation: detail-open .22s ease-out both; }
.value-subrow { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(160px, 2fr) 72px; gap: 12px; align-items: center; padding: 7px 0; color: var(--muted); font-size: 12px; }
.value-subbar { height: 3px; background: var(--panel2); }
.value-subbar > span { display: block; height: 100%; background: var(--accent); }
@keyframes rise-in { from { transform: scaleY(.25); opacity: .55; } to { transform: scaleY(1); opacity: 1; } }
@keyframes detail-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
.row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.spread { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.btn { background: transparent; color: var(--text); border: 1px solid var(--border); border-radius: 3px; padding: 7px 12px; font-size: 13px; cursor: pointer; transition: background-color .14s ease, border-color .14s ease; }
.btn:hover { border-color: var(--accent); background: var(--panel2); }
.btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 650; }
.btn-primary:hover { filter: brightness(1.08); background: var(--accent); }
.btn-danger { background: transparent; border-color: var(--danger); color: var(--danger); }
.btn-sm { padding: 4px 9px; font-size: 12px; }
.btn[disabled] { opacity: .5; cursor: not-allowed; }
select, input[type="text"], input[type="number"], textarea {
  background: var(--panel); color: var(--text); border: 1px solid var(--border);
  border-radius: 5px; padding: 8px 10px; font-size: 13px;
}
textarea { line-height: 1.5; }
input[type="checkbox"] { accent-color: var(--accent); }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 4px; font-size: 11.5px; border: 1px solid; cursor: pointer; white-space: nowrap; background: transparent; }
.chip:hover { filter: brightness(1.12); }
.chip.none { border-style: dashed; color: var(--muted); border-color: var(--muted); }
.tablewrap { overflow-x: auto; }
table.ledger { width: 100%; border-collapse: collapse; font-size: 13px; }
table.ledger th { text-align: left; font-size: 11px; letter-spacing: .025em; color: var(--muted); padding: 8px; border-bottom: 1px solid var(--border); font-weight: 600; }
table.ledger td { padding: 9px 8px; border-bottom: 1px solid var(--rule); vertical-align: middle; }
table.ledger tr:hover td { background: color-mix(in srgb, var(--accent) 6%, var(--panel)); }
.dayhead { display: flex; gap: 10px; align-items: baseline; margin: 22px 0 7px; font-weight: 650; border-bottom: 1px solid var(--border); padding-bottom: 5px; }
.dayhead .muted { color: var(--muted); font-weight: 400; font-size: 12px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.high { background: var(--ok); } .dot.medium { background: var(--warn); } .dot.low { background: var(--muted); }
.overlay { position: fixed; inset: 0; background: rgba(10,25,28,.62); display: flex; align-items: center; justify-content: center; z-index: 100; }
.menu { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; width: min(380px, calc(100vw - 32px)); max-height: 70vh; overflow: auto; box-shadow: var(--shadow); }
.menu h3 { margin: 0 0 10px; font-size: 14px; }
.menu .opt { display: flex; width: 100%; text-align: left; gap: 8px; align-items: center; background: transparent; border: 0; color: var(--text); padding: 8px; border-radius: 5px; cursor: pointer; font-size: 13px; }
.menu .opt:hover { background: var(--panel2); }
.menu .opt[aria-pressed="true"] { background: var(--panel2); box-shadow: inset 3px 0 var(--accent); color: var(--text); }
.taxonomy-dialog { width: min(560px, calc(100vw - 32px)); max-height: min(82vh, 720px); animation: taxonomy-pop .16s ease-out; }
.taxonomy-search-label { display: block; margin: 8px 0 4px; }
.taxonomy-dialog input[role="combobox"] { width: 100%; }
.taxonomy-options { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; max-height: 38vh; overflow: auto; }
.taxonomy-group { border-bottom: 1px solid var(--rule); padding-bottom: 5px; }
.taxonomy-option-row { display: flex; align-items: center; gap: 6px; }
.taxonomy-option-row .opt { flex: 1; min-width: 0; }
.taxonomy-option-row .opt[aria-selected="true"] { background: var(--panel2); box-shadow: inset 3px 0 var(--accent); }
.taxonomy-option-row .opt.keyboard-active { outline: 2px solid var(--accent); outline-offset: -2px; }
.taxonomy-parent-label { padding: 7px 9px 4px; color: var(--muted); font-size: 12px; font-weight: 600; }
.taxonomy-subrow { padding-left: 18px; }
.taxonomy-create-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.taxonomy-subcreate { padding-left: 18px; }
.taxonomy-notice, .taxonomy-error { display: block; margin-top: 8px; color: var(--warn); font-size: 12px; }
.taxonomy-edit { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; padding: 8px 12px; background: var(--panel2); border-radius: 5px; }
.taxonomy-edit label { display: flex; flex-direction: column; gap: 3px; }
.taxonomy-edit label:first-child { flex: 1; min-width: 140px; }
.taxonomy-edit input[type="color"] { width: 44px; height: 34px; padding: 2px; }
@keyframes taxonomy-pop { from { opacity: 0; transform: translateY(5px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) { .taxonomy-dialog { animation: none; } }
.sharebar { height: 7px; border-radius: 2px; background: var(--panel2); overflow: hidden; flex: 1; min-width: 90px; }
.sharebar > div { height: 100%; }
.rangebar { display: flex; gap: 5px; flex-wrap: wrap; }
.rangebar .btn.active { border-color: var(--accent); color: var(--accent); box-shadow: inset 0 -2px var(--accent); }
.bulkbar { position: sticky; top: 0; z-index: 10; background: var(--panel2); border: 1px solid var(--border); border-left: 3px solid var(--accent); border-radius: 5px; padding: 9px 12px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
.legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 260px; }
.legrow { display: flex; align-items: center; gap: 8px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; flex: 0 0 10px; }
.empty { color: var(--muted); padding: 22px 0; text-align: center; }
.queueitem { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--rule); }
.insight-channel { width: 100%; color: var(--text); text-align: left; background: transparent; border-inline: 0; border-top: 0; cursor: pointer; }
.insight-channel:hover { color: var(--accent); background: var(--rule); }
.queueitem:last-child { border-bottom: 0; }
.qlink { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.steps { display: flex; gap: 0; margin: 14px 0 24px; border-bottom: 1px solid var(--border); }
.step { flex: 1; text-align: center; padding: 10px 6px; border-bottom: 2px solid transparent; background: transparent; font-size: 12px; color: var(--muted); }
.step.active { color: var(--text); border-bottom-color: var(--accent); font-weight: 650; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.segmented { display: inline-flex; gap: 4px; padding: 4px; border-radius: 6px; background: var(--panel2); border: 1px solid var(--border); flex-wrap: wrap; }
.segment { display: flex; align-items: center; gap: 8px; background: transparent; border: 1px solid transparent; color: var(--text); cursor: pointer; border-radius: 4px; padding: 8px 12px; font-size: 13px; text-align: left; }
.segment:hover { background: var(--panel); }
.segment.active { background: var(--panel); border-color: var(--accent); color: var(--text); }
.segment:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.segment-mark { font-size: 12px; color: var(--accent); line-height: 1; }
.segment-body { display: flex; flex-direction: column; gap: 1px; }
.segment-label { font-weight: 600; }
.segment-hint { font-size: 11px; color: var(--muted); }
.valuetier { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.category-ladder-item { border-bottom: 1px solid var(--rule); padding: 2px 0 8px; }
.category-main-row { flex-wrap: wrap; }
.category-sub-row { padding-left: clamp(22px, 5vw, 54px); }
.taxonomy-drag-handle { cursor: grab; min-width: 34px; font-size: 17px; touch-action: none; }
.taxonomy-drag-handle:active { cursor: grabbing; }
.taxonomy-drag-handle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.category-position-track { display: inline-flex; width: 90px; height: 4px; background: var(--panel2); border-radius: 3px; overflow: hidden; }
.category-position-track > span { display: block; height: 100%; transition: width .18s ease; }
svg text { fill: var(--muted); }
@media (max-width: 760px) {
  .app { display: block; }
  .sidebar { width: 100%; height: auto; position: static; padding: 10px 12px 8px; border-right: 0; border-bottom: 1px solid var(--border); }
  .brand { padding: 2px 4px 8px; }
  .nav { margin: 0; flex-direction: row; overflow-x: auto; gap: 3px; }
  .nav a { flex: 0 0 auto; padding: 7px 9px; border-left: 0; border-bottom: 2px solid transparent; font-size: 12px; }
  .nav a.active { border-bottom-color: var(--accent); }
  .sidefoot { display: none; }
  .main { padding: 23px 16px 44px; }
  .statgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat:nth-child(2) { border-right: 0; }
  .stat:nth-child(n+3) { border-top: 1px solid var(--border); }
  .reading-panel { grid-template-columns: 1fr; gap: 22px; }
  .reading-number { font-size: clamp(84px, 22vw, 120px); }
  .reading-notes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .reading-note:nth-child(3n) { border-right: 0; }
  .reading-note:nth-child(n+4) { border-top: 1px solid var(--border); }
  .ladder-head { display: none; }
  .value-trigger { grid-template-columns: minmax(100px, 1fr) 82px; gap: 8px; }
  .value-name { grid-column: 1; grid-row: 1; }
  .value-time { grid-column: 2; grid-row: 1; }
  .ladder-rail { grid-column: 1 / -1; grid-row: 2; }
  .value-subrow { grid-template-columns: minmax(95px, 1fr) minmax(60px, 1.5fr) 56px; gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`
