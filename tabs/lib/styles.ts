/**
 * "The statement": the YT Ledger dashboard design system.
 *
 * The dashboard reads like an accounting statement for attention: ledger-pad
 * paper, blue-black entry ink, pencil for secondary text and red ink for
 * overages. Amounts sit in a right-aligned money column marked by a red double
 * rule; totals get a single rule above and a double rule below. That money
 * column is the one bold element. Everything around it stays quiet.
 *
 * Scales (pick from these, never invent):
 *   spacing 4 8 12 16 24 32 48 64 · type 12 14 16 18 20 24 30 48 · weights 400/500/600
 *   one radius (4px) for every control and dialog; dots are round.
 */
const serifUrl = chrome.runtime.getURL("assets/fonts/SourceSerif4-Variable.woff2")
const sansUrl = chrome.runtime.getURL("assets/fonts/PublicSans-Variable.woff2")

const DARK = `
    color-scheme: dark;
    /* book binding, dark */
    --paper: hsl(150 20% 13%);
    --paper-raised: hsl(150 17% 17%);
    --paper-sunken: hsl(150 22% 10%);
    --rule: hsl(141 15% 24%);
    --rule-strong: hsl(110 8% 46%);
    --ink: hsl(77 28% 89%);
    --ink-hover: hsl(77 30% 80%);
    --on-ink: hsl(150 20% 13%);
    --pencil: hsl(89 10% 66%);
    --disabled: hsl(100 6% 42%);
    --red: hsl(10 81% 72%);
    --on-red: hsl(150 22% 10%);
    --red-tint: hsl(8 30% 20%);
    --blue: hsl(224 72% 80%);
    --blue-tint: hsl(224 25% 24%);
    --amber: hsl(38 75% 66%);
    --scrim: hsl(150 30% 4% / .72);
    --shadow-drag: 0 5px 15px hsl(0 0% 0% / .4);
    --shadow-modal: 0 15px 35px hsl(0 0% 0% / .55);
    --tier-5: hsl(77 28% 89%);
    --tier-4: hsl(79 24% 86%);
    --tier-3: hsl(81 20% 83%);
    --tier-2: hsl(83 16% 80%);
    --tier-1: hsl(85 13% 77%);
    --tier-0: hsl(87 11% 74%);
    --nav-active: var(--paper-raised);
`

export const CSS = `
@font-face { font-family: "Ledger Serif"; src: url("${serifUrl}") format("woff2-variations"), url("${serifUrl}") format("woff2"); font-weight: 200 900; font-style: normal; font-display: swap; }
@font-face { font-family: "Ledger Sans"; src: url("${sansUrl}") format("woff2-variations"), url("${sansUrl}") format("woff2"); font-weight: 100 900; font-style: normal; font-display: swap; }

:root {
  color-scheme: light;
  --serif: "Ledger Serif", "Iowan Old Style", Georgia, serif;
  --sans: "Ledger Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --radius: 4px;

  /* ledger pad, light */
  --paper: hsl(70 30% 92%);
  --paper-raised: hsl(70 45% 97%);
  --paper-sunken: hsl(72 22% 86%);
  --rule: hsl(80 22% 77%);          /* decorative dividers only */
  --rule-strong: hsl(84 9% 46%);    /* control borders, >= 3:1 */
  --ink: hsl(221 40% 19%);
  --ink-hover: hsl(221 36% 29%);
  --on-ink: hsl(70 45% 97%);
  --pencil: hsl(94 8% 33%);
  --disabled: hsl(84 7% 58%);
  --red: hsl(4 77% 39%);
  --on-red: hsl(0 0% 100%);
  --red-tint: hsl(4 70% 93%);
  --blue: hsl(222 57% 38%);
  --blue-tint: hsl(222 60% 92%);
  --amber: hsl(33 85% 29%);
  --scrim: hsl(221 40% 10% / .6);
  --shadow-drag: 0 5px 15px hsl(221 40% 10% / .2);
  --shadow-modal: 0 15px 35px hsl(221 40% 10% / .28);

  /* ink density for the value ladder: higher value = denser ink */
  --tier-5: hsl(221 40% 19%);
  --tier-4: hsl(221 34% 21%);
  --tier-3: hsl(221 28% 23%);
  --tier-2: hsl(221 22% 25%);
  --tier-1: hsl(221 16% 27%);
  --tier-0: hsl(221 10% 29%);
  --nav-active: var(--paper-sunken);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${DARK}
  }
}
:root[data-theme="dark"] {
${DARK}
}

* { box-sizing: border-box; }
html { scroll-padding-top: 64px; }
html, body { margin: 0; padding: 0; min-height: 100%; }
body {
  background: var(--paper); color: var(--ink);
  font: 400 14px/1.5 var(--sans);
  font-feature-settings: "tnum" 1;
  -webkit-font-smoothing: antialiased;
}
button, input, select, textarea { font: inherit; color: inherit; }
a { color: var(--blue); text-decoration: none; text-underline-offset: 3px; }
a:hover { text-decoration: underline; }
:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
code { font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.muted { color: var(--pencil); }
.small { font-size: 12px; }
.text-danger { color: var(--red); }
.text-warn { color: var(--amber); }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.loading { padding: 48px; color: var(--pencil); }

/* ---------- shell ---------- */
.app { display: grid; grid-template-columns: 224px minmax(0, 1fr); min-height: 100vh; }
.sidebar {
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  display: flex; flex-direction: column; gap: 32px;
  padding: 32px 16px 24px 24px; border-right: 1px solid var(--rule);
}
.brand { font: 600 20px/1.2 var(--serif); letter-spacing: -.01em; color: var(--ink); margin: 0; }
.nav { display: flex; flex-direction: column; gap: 4px; }
.nav a {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-left: -12px; padding: 8px 12px; border-radius: var(--radius);
  color: var(--pencil); font-weight: 500; text-decoration: none;
}
.nav a:hover { color: var(--ink); background: var(--paper-sunken); }
.nav a.active { color: var(--ink); font-weight: 600; background: var(--nav-active); }
.nav-count { font-size: 12px; font-weight: 500; color: var(--pencil); }
.nav-count.over { color: var(--red); font-weight: 600; }
.sidefoot { margin-top: auto; font-size: 12px; color: var(--pencil); line-height: 1.6; overflow-wrap: anywhere; }
.main:focus { outline: none; }
.main { min-width: 0; max-width: 1120px; padding: 32px 48px 64px; }

/* ---------- page furniture ---------- */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
h1 { font: 600 30px/1.15 var(--serif); letter-spacing: -.015em; margin: 0; color: var(--ink); }
h2 { font: 600 16px/1.35 var(--sans); margin: 0; color: var(--ink); }
h3 { font: 600 18px/1.3 var(--serif); margin: 0; color: var(--ink); }
.lede { color: var(--pencil); max-width: 36em; margin: 0 0 32px; line-height: 1.6; }
.card { padding: 0; margin: 0 0 48px; }
.section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.section-note { color: var(--pencil); margin: 4px 0 0; max-width: 40em; }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.spread { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; margin-top: 24px; }
.actions .status { margin-right: auto; }
.empty { color: var(--pencil); padding: 16px 0; max-width: 36em; }
.empty strong { color: var(--ink); font-weight: 600; }

/* ---------- controls ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 32px; padding: 6px 12px;
  border: 1px solid var(--rule-strong); border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink);
  font: 500 14px/1.2 var(--sans); white-space: nowrap; cursor: pointer;
}
.btn:hover { background: var(--paper-sunken); }
.btn-primary { background: var(--ink); border-color: var(--ink); color: var(--on-ink); font-weight: 600; }
.btn-primary:hover { background: var(--ink-hover); border-color: var(--ink-hover); }
.btn-quiet { background: transparent; border-color: transparent; color: var(--pencil); }
.btn-quiet:hover { background: var(--paper-sunken); color: var(--ink); }
.btn-link { background: transparent; border-color: transparent; color: var(--blue); padding-inline: 4px; }
.btn-link:hover { background: transparent; text-decoration: underline; text-underline-offset: 3px; }
.btn-danger { background: var(--red); border-color: var(--red); color: var(--on-red); font-weight: 600; }
.btn-danger:hover { background: var(--red); filter: none; text-decoration: underline; text-underline-offset: 3px; }
.btn.text-danger { color: var(--red); }
.btn-sm { min-height: 32px; padding: 4px 8px; font-size: 12px; }
.btn-icon { min-width: 32px; padding-inline: 4px; font-size: 14px; }
.btn[disabled], .btn[disabled]:hover { background: transparent; border-color: var(--rule); color: var(--disabled); cursor: not-allowed; text-decoration: none; }
.btn-quiet[disabled], .btn-link[disabled] { border-color: transparent; }

input[type="text"], input[type="number"], input:not([type]), select, textarea {
  min-height: 32px; padding: 6px 12px;
  background: var(--paper-raised); color: var(--ink);
  border: 1px solid var(--rule-strong); border-radius: var(--radius);
  font: 400 14px/1.4 var(--sans);
}
select { padding-right: 8px; }
textarea { line-height: 1.5; width: 100%; max-width: 640px; resize: vertical; font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
::placeholder { color: var(--pencil); opacity: 1; }
input[type="checkbox"] { accent-color: var(--ink); width: 16px; height: 16px; margin: 0; flex: 0 0 16px; }
input[type="color"] { width: 32px; height: 32px; padding: 0; border: 1px solid var(--rule-strong); border-radius: var(--radius); background: transparent; cursor: pointer; }
input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
input[type="color"]::-webkit-color-swatch { border: 0; border-radius: 2px; }
input[type="color"]::-moz-color-swatch { border: 0; border-radius: 2px; }
.field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 500; color: var(--pencil); min-width: 0; }
.field > input, .field > select, .field > button { font-size: 14px; }
.field-hint { font-weight: 400; }
.field-grow { flex: 1 1 200px; }
.check { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; }
.fieldset { border: 0; padding: 0; margin: 24px 0 0; display: grid; gap: 16px; min-width: 0; }
.fieldset legend { padding: 0; margin-bottom: 12px; font-weight: 600; }
.field-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }

/* range selector: one joined control */
.rangebar { display: inline-flex; border: 1px solid var(--rule-strong); border-radius: var(--radius); overflow: hidden; }
.rangebar .btn { border: 0; border-radius: 0; background: transparent; color: var(--pencil); min-height: 32px; padding-inline: 12px; }
.rangebar .btn + .btn { border-left: 1px solid var(--rule); }
.rangebar .btn:hover { color: var(--ink); background: var(--paper-sunken); }
.rangebar .btn.active { background: var(--ink); color: var(--on-ink); font-weight: 600; }
.rangebar .btn:focus-visible, .segment:focus-visible { outline-offset: -4px; }
.rangebar .btn.active:focus-visible, .segment.active:focus-visible, .bulkbar :focus-visible { outline-color: var(--on-ink); }

/* category chip: neutral text, the category colour lives on the dot */
.chip {
  display: inline-flex; align-items: center; gap: 8px; max-width: 100%;
  padding: 2px 8px; min-height: 24px;
  border: 1px solid var(--rule); border-radius: var(--radius);
  background: transparent; color: var(--ink);
  font: 500 12px/1.5 var(--sans); white-space: nowrap; cursor: pointer;
}
.chip:hover { border-color: var(--rule-strong); background: var(--paper-raised); }
.chip.none { border-style: dashed; border-color: var(--rule-strong); color: var(--pencil); }
.chip-text { overflow: hidden; text-overflow: ellipsis; }
.swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }

/* ---------- the money column ---------- */
.amount { font-family: var(--serif); font-variant-numeric: lining-nums tabular-nums; text-align: right; white-space: nowrap; }
.money { border-left: 3px double var(--red); padding-left: 16px; text-align: right; }
.total-rule { border-top: 1px solid var(--ink); border-bottom: 3px double var(--ink); }

/* ---------- overview statement ---------- */
.statement { margin-top: 24px; }
.stmt-caption { display: grid; grid-template-columns: minmax(0, 1fr) 128px; color: var(--pencil); font-size: 12px; }
.stmt-caption > span:last-child { padding: 0 0 8px 16px; border-left: 3px double var(--red); text-align: right; }
.stmt-caption > span:first-child { padding-bottom: 8px; }
.ladder-row { border-top: 1px solid var(--rule); }
.value-trigger {
  width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 128px; align-items: stretch;
  padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer;
}
.value-trigger:disabled, .value-trigger.static { cursor: default; }
.value-trigger:not(:disabled):not(.static):hover .value-name-text { text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px; }
.value-main { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: 16px; align-items: center; padding: 12px 16px 12px 0; min-width: 0; }
.value-name { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.value-name .swatch { align-self: center; }
.value-name-text { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.value-top { color: var(--pencil); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.value-share { color: var(--pencil); font-size: 12px; text-align: right; }
.value-time { display: flex; align-items: center; justify-content: flex-end; font-size: 18px; }
.value-trigger[aria-expanded="true"] .value-name-text { font-weight: 600; }
.tier-5 { color: var(--tier-5); } .tier-4 { color: var(--tier-4); } .tier-3 { color: var(--tier-3); }
.tier-2 { color: var(--tier-2); } .tier-1 { color: var(--tier-1); } .tier-0 { color: var(--tier-0); }
.value-details { animation: detail-open .18s ease-out both; }
.value-subrow { display: grid; grid-template-columns: minmax(0, 1fr) 128px; font-size: 14px; color: var(--pencil); }
.value-subrow > .value-main { padding: 8px 16px 8px 24px; }
.value-subrow .value-time { font-size: 14px; }
.value-subrow-note { padding: 8px 16px 12px 24px; }
.stmt-total { display: grid; grid-template-columns: minmax(0, 1fr) 128px; align-items: center; border-top: 1px solid var(--rule); }
.stmt-total-label { padding-right: 16px; font-weight: 600; }
.stmt-total-amount { display: flex; flex-direction: column; align-items: flex-end; padding: 8px 0 0 16px; }
.reading-number { display: inline-block; font: 600 48px/1.1 var(--serif); letter-spacing: -.02em; font-variant-numeric: lining-nums tabular-nums; padding: 4px 0 8px; }
.stmt-notes { margin: 16px 0 0; max-width: 40em; color: var(--pencil); line-height: 1.6; }
@keyframes detail-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

/* ---------- daily chart ---------- */
.trace-frame { overflow-x: auto; padding-bottom: 4px; }
.trace-svg { display: block; }
.trace-ruler { stroke: var(--rule); stroke-width: 1; }
.trace-axis { stroke: var(--rule-strong); stroke-width: 1; }
.trace-label { fill: var(--pencil); font: 12px var(--sans); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 16px 0 0; padding: 0; list-style: none; color: var(--pencil); font-size: 12px; }
.legend li { display: inline-flex; align-items: center; gap: 8px; }

/* ---------- lists (rules, budgets, categories, queue) ---------- */
.list { margin: 0; padding: 0; list-style: none; }
.queueitem { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--rule); min-width: 0; }
.queueitem:last-child { border-bottom: 1px solid var(--rule); }
.qlink { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.item-main { flex: 1 1 240px; min-width: 0; }
.item-title { font-weight: 500; }
.item-sub { color: var(--pencil); font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
.item-index { font-family: var(--serif); color: var(--pencil); width: 24px; text-align: right; flex: 0 0 24px; }
.item-meta { color: var(--pencil); font-size: 12px; white-space: nowrap; }
.item-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.item-off .item-title { color: var(--pencil); }
.tag { display: inline-block; padding: 0 4px; margin-left: 8px; border: 1px solid var(--rule-strong); border-radius: var(--radius); font-size: 12px; font-weight: 500; color: var(--pencil); vertical-align: 1px; }
.confirm { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.confirm-text { color: var(--red); font-weight: 500; }

/* insights channel rows */
.insight-channel { width: 100%; text-align: left; background: transparent; border-inline: 0; border-bottom: 0; color: var(--ink); cursor: pointer; font: inherit; }
.insight-channel:last-child { border-bottom: 1px solid var(--rule); }
.insight-channel:hover .item-title { text-decoration: underline; text-underline-offset: 3px; }
.insight-channel .amount { width: 112px; font-size: 16px; align-self: stretch; display: flex; align-items: center; justify-content: flex-end; }
.insight-channel { padding-block: 0; }
.insight-channel > .item-main, .insight-channel > .item-meta { padding-block: 12px; }
.weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; align-items: end; height: 160px; max-width: 640px; }
.weekday { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; height: 100%; }
.weekday-bar { width: 100%; max-width: 48px; background: var(--rule-strong); }
.weekday-bar.peak { background: var(--ink); }
.weekday-value { font-family: var(--serif); font-size: 12px; }
.weekday-label { color: var(--pencil); font-size: 12px; }

/* budgets */
.budget-row { display: grid; grid-template-columns: minmax(160px, 1.4fr) 112px minmax(80px, 1fr) 128px 96px; gap: 16px; align-items: center; }
.queueitem.budget-row { padding-block: 0; min-height: 56px; }
.queueitem.budget-head { min-height: 32px; align-items: end; padding-bottom: 8px; }
.budget-name { display: flex; align-items: center; gap: 8px; min-width: 0; font-weight: 500; }
.budget-row input { width: 100%; }
.meter { position: relative; height: 4px; background: var(--paper-sunken); border-radius: 2px; overflow: hidden; }
.meter > span { position: absolute; inset: 0 auto 0 0; background: var(--ink); border-radius: 2px; }
.budget-spent { font-family: var(--serif); text-align: right; white-space: nowrap; align-self: stretch; display: flex; align-items: center; justify-content: flex-end; }
.budget-left { text-align: right; font-size: 12px; white-space: nowrap; color: var(--pencil); }
.budget-left.over { color: var(--red); font-weight: 600; }
.budget-left.near { color: var(--amber); font-weight: 600; }
.budget-head { color: var(--pencil); font-size: 12px; padding-bottom: 8px; border-top: 0; }
.budget-head > span:nth-child(n+4) { text-align: right; }
.budget-head > span:nth-child(4) { border-left: 3px double var(--red); align-self: stretch; display: flex; align-items: flex-end; justify-content: flex-end; }

/* categories */
.ladder-end { color: var(--pencil); font-size: 12px; padding: 8px 0; }
.category-ladder-item { border-top: 1px solid var(--rule); }
.category-ladder-item:last-of-type { border-bottom: 1px solid var(--rule); }
.category-ladder-item.dragging { box-shadow: var(--shadow-drag); background: var(--paper-raised); }
.category-ladder-item .queueitem { border: 0; padding: 8px 0; flex-wrap: wrap; }
.category-ladder-item .queueitem:last-child { border-bottom: 0; }
.category-ladder-item .category-sub-row { padding-left: 40px; }
.category-sub-row input[type="text"]:not(.emoji-input) { width: 192px; }
.category-main-row input[type="text"]:not(.emoji-input) { width: 224px; font-weight: 500; }
input.emoji-input { width: 40px; text-align: center; padding-inline: 4px; border-color: transparent; background: transparent; }
input.emoji-input:hover, input.emoji-input:focus { border-color: var(--rule-strong); background: var(--paper-raised); }
.category-ladder-item input[type="color"] { width: 24px; height: 24px; }
.archived input[type="text"] { color: var(--pencil); text-decoration: line-through; text-decoration-thickness: 1px; }
.taxonomy-drag-handle { cursor: grab; touch-action: none; color: var(--pencil); font-size: 16px; }
.taxonomy-drag-handle:active { cursor: grabbing; }
.category-position-track { display: inline-flex; width: 64px; height: 4px; background: var(--paper-sunken); border-radius: 2px; overflow: hidden; }
.category-position-track > span { display: block; height: 100%; background: var(--pencil); }
.row-push { margin-left: auto; }

/* ledger */
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 32px; }
.filters input[type="text"] { flex: 1 1 240px; max-width: 360px; }
.filters-summary { margin-left: auto; color: var(--pencil); }
.filters-summary strong { color: var(--ink); font-family: var(--serif); font-weight: 600; font-size: 16px; }
.bulkbar {
  position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  margin: -16px 0 24px; padding: 8px 12px; border-radius: var(--radius);
  background: var(--ink); color: var(--on-ink);
}
.bulkbar .btn { background: transparent; border-color: var(--on-ink); color: var(--on-ink); }
.bulkbar .btn:hover { background: var(--ink-hover); }
.bulkbar .btn-quiet { border-color: transparent; }
.bulkbar-count { font-weight: 600; margin-right: 8px; }
.day { margin: 0 0 32px; }
.dayhead { font: 600 18px/1.3 var(--serif); margin: 0 0 8px; }
.tablewrap { overflow-x: auto; }
table.ledger { width: 100%; border-collapse: collapse; }
table.ledger th { text-align: left; font-size: 12px; font-weight: 500; color: var(--pencil); padding: 0 12px 8px 0; }
table.ledger td { padding: 8px 12px 8px 0; border-top: 1px solid var(--rule); vertical-align: middle; }
table.ledger th.money, table.ledger td.money { padding-right: 0; width: 112px; text-align: right; }
table.ledger td.money { font-family: var(--serif); font-size: 16px; }
table.ledger .col-check { width: 32px; }
table.ledger .col-cat { width: 224px; }
table.ledger .col-len { width: 72px; text-align: right; color: var(--pencil); }
table.ledger tbody tr:hover td { background: var(--paper-sunken); }
table.ledger tbody tr:hover td.money { background: transparent; }
table.ledger tfoot td { border-top: 0; padding-top: 4px; }
table.ledger tfoot .total-label { color: var(--pencil); text-align: right; font-size: 12px; }
table.ledger tfoot .amount { font-weight: 600; }
.title-cell { max-width: 0; }
.title-cell a { display: block; color: var(--ink); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-cell .item-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.est { color: var(--pencil); font-family: var(--sans); font-size: 12px; margin-right: 4px; }

/* settings */
.setting-group { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.status { font-size: 14px; color: var(--pencil); margin-top: 12px; }
.status:empty { margin: 0; }
.danger-zone { padding-top: 24px; border-top: 1px solid var(--rule); }
.app-footer { color: var(--pencil); font-size: 12px; }

/* segmented control (budget mode) */
.segmented { display: inline-flex; flex-wrap: wrap; gap: 0; border: 1px solid var(--rule-strong); border-radius: var(--radius); overflow: hidden; }
.segment { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 128px; padding: 8px 16px; border: 0; background: transparent; color: var(--ink); cursor: pointer; text-align: left; }
.segment + .segment { border-left: 1px solid var(--rule); }
.segment:hover { background: var(--paper-sunken); }
.segment.active { background: var(--ink); color: var(--on-ink); }
.segment-label { font-weight: 600; }
.segment-hint { font-size: 12px; color: var(--pencil); }
.segment.active .segment-hint { color: var(--on-ink); }
.segmented.compact .segment { min-width: 0; }

/* ---------- dialogs ---------- */
.overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding: 64px 16px 16px; background: var(--scrim); overflow-y: auto; }
.menu {
  width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 96px); overflow: auto;
  padding: 24px; border-radius: var(--radius);
  background: var(--paper-raised); color: var(--ink); box-shadow: var(--shadow-modal);
  animation: dialog-in .16s ease-out;
}
.menu-wide { width: min(560px, calc(100vw - 32px)); }
.menu h3 { margin-bottom: 16px; }
.menu-context { color: var(--pencil); margin: -12px 0 16px; overflow-wrap: anywhere; }
.menu .opt { display: flex; flex: 1; min-width: 0; text-align: left; gap: 8px; align-items: center; background: transparent; border: 0; color: var(--ink); padding: 8px; border-radius: var(--radius); cursor: pointer; }
.menu .opt:hover { background: var(--paper-sunken); }
.taxonomy-dialog { width: min(560px, calc(100vw - 32px)); }
.taxonomy-search-label { display: block; margin: 0 0 4px; font-size: 12px; font-weight: 500; color: var(--pencil); }
.taxonomy-dialog input[role="combobox"] { width: 100%; }
.taxonomy-options { display: flex; flex-direction: column; margin-top: 12px; max-height: 40vh; overflow: auto; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 4px 0; }
.taxonomy-group + .taxonomy-group { border-top: 1px solid var(--rule); margin-top: 4px; padding-top: 4px; }
.taxonomy-option-row { display: flex; align-items: center; gap: 4px; }
.taxonomy-option-row .edit-btn { opacity: 0; }
.taxonomy-option-row:hover .edit-btn, .taxonomy-option-row .edit-btn:focus-visible, .taxonomy-option-row .opt[aria-selected="true"] ~ .edit-btn { opacity: 1; }
.taxonomy-option-row .opt[aria-selected="true"] { background: var(--blue-tint); font-weight: 600; }
.taxonomy-option-row .opt.keyboard-active { outline: 2px solid var(--blue); outline-offset: -2px; }
.taxonomy-parent-label { padding: 8px; color: var(--pencil); font-size: 12px; font-weight: 600; }
.taxonomy-subrow { padding-left: 24px; }
.taxonomy-create-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.taxonomy-subcreate { padding-left: 24px; margin: 0 0 4px; }
.taxonomy-notice, .taxonomy-error { display: block; margin-top: 8px; color: var(--amber); font-size: 12px; font-weight: 500; }
.access-notice { margin: 0 0 32px; padding: 12px 16px; max-width: 48em; background: var(--paper-raised); border: 1px solid var(--rule); border-left: 4px solid var(--amber); border-radius: var(--radius); }
.access-notice-title { margin: 0 0 4px; font-weight: 600; color: var(--ink); }
.access-notice-body { margin: 0 0 12px; color: var(--pencil); line-height: 1.5; }
.access-notice-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.access-notice-hint { color: var(--pencil); font-size: 12px; }
.access-notice-wrap:not(:empty) { padding: 32px 48px 0; }
.access-notice-wrap .access-notice { margin: 0 auto; }
.taxonomy-error { color: var(--red); }
.taxonomy-edit { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 8px; margin: 4px 0 8px 24px; padding: 12px; background: var(--paper-sunken); border-radius: var(--radius); }
.taxonomy-edit .field:first-child { flex: 1 1 160px; }
.taxonomy-edit input[aria-label="Emoji"] { width: 64px; }
.menu-footer { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; margin-top: 24px; }
.menu-footer .btn-quiet:first-child { margin-right: auto; }
.preview { margin-top: 16px; padding: 12px; border-radius: var(--radius); background: var(--paper-sunken); }
.preview.error { background: var(--red-tint); color: var(--red); }
@keyframes dialog-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

/* ---------- onboarding ---------- */
.setup { max-width: 640px; margin: 0 auto; padding: 48px 16px 64px; }
.setup .brand { margin-bottom: 32px; }
.steps { display: flex; gap: 8px; margin: 0 0 48px; padding: 0; list-style: none; counter-reset: step; flex-wrap: wrap; }
.step { flex: 1 1 96px; padding: 8px 0; border-top: 3px solid var(--rule); font-size: 12px; color: var(--pencil); counter-increment: step; }
.step::before { content: counter(step) ". "; }
.step.done { border-top-color: var(--rule-strong); }
.step.active { border-top-color: var(--ink); color: var(--ink); font-weight: 600; }
.setup h2 { font: 600 30px/1.2 var(--serif); margin-bottom: 16px; outline: none; }
.setup p { max-width: 36em; line-height: 1.6; }
.setup-points { margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 16px; }
.setup-points li { max-width: 36em; }
.setup-points strong { display: block; font-weight: 600; }

@media (max-width: 1040px) {
  .main { padding: 32px 32px 64px; }
  .budget-row { grid-template-columns: minmax(140px, 1fr) 96px minmax(64px, 1fr) 112px; }
  .budget-row > .budget-left { grid-column: 4; }
  .budget-head > span:nth-child(5) { display: none; }
}
@media (max-width: 860px) {
  .app { display: block; }
  .sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--rule); }
  .nav { flex-direction: row; overflow-x: auto; gap: 4px; width: 100%; order: 3; }
  .nav a { flex: 0 0 auto; margin-left: 0; padding: 8px 12px; }
  .sidefoot { margin: 0 0 0 auto; }
  .main { padding: 24px 16px 48px; }
  h1 { font-size: 24px; }
  .value-top { display: none; }
  .stmt-caption, .value-trigger, .value-subrow, .stmt-total { grid-template-columns: minmax(0, 1fr) 96px; }
  .money, .stmt-caption > span:last-child { padding-left: 12px; }
  .reading-number { font-size: 36px; }
  .budget-row { grid-template-columns: minmax(0, 1fr) 96px; gap: 8px 12px; }
  .budget-row > .meter { grid-column: 1 / -1; }
  .budget-row > .budget-spent { grid-column: 1; text-align: left; }
  .budget-row > .budget-left { grid-column: 2; }
  .budget-head { display: none; }
  table.ledger .col-cat { width: auto; }
  .filters-summary { margin-left: 0; width: 100%; }
}
@media (max-width: 600px) {
  table.ledger .col-len { display: none; }
  table.ledger th.money, table.ledger td.money { width: 72px; padding-left: 8px; }
  table.ledger .title-cell { min-width: 140px; }
  table.ledger .col-cat { width: 120px; }
  .chip { max-width: 120px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`
