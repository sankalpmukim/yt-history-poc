/** Field-instrument design system for the YT Ledger dashboard. */
export const CSS = `
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
  background-image: linear-gradient(to bottom, transparent 31px, var(--rule) 32px);
  background-size: 100% 32px;
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
.brand-mark { width: 25px; height: 25px; flex: 0 0 25px; border: 1.5px solid var(--accent); border-radius: 50%; display: inline-grid; place-items: center; color: var(--accent); font-size: 14px; line-height: 1; }
.brand .sub { font-size: 10px; color: var(--muted); font-weight: 500; margin-left: auto; }
.nav { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.nav a { display: block; padding: 9px 11px; border-radius: 5px; color: var(--ink-soft); border-left: 2px solid transparent; text-decoration: none; }
.nav a:hover { background: var(--panel2); text-decoration: none; }
.nav a.active { background: var(--panel2); border-left-color: var(--accent); color: var(--text); font-weight: 650; }
.sidefoot { margin-top: auto; padding: 14px 10px 0; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); line-height: 1.8; overflow-wrap: anywhere; }
.main { flex: 1; min-width: 0; padding: 32px clamp(22px, 4vw, 58px) 64px; max-width: 1320px; }
h1 { font-size: clamp(25px, 2.3vw, 34px); line-height: 1.16; letter-spacing: -.045em; margin: 0 0 5px; font-weight: 650; }
h2 { letter-spacing: -.02em; }
.hint { color: var(--muted); font-size: 12.5px; margin: 0 0 22px; max-width: 76ch; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 18px 20px; margin-bottom: 18px; box-shadow: var(--shadow); }
.card h2 { font-size: 15px; margin: 0 0 13px; color: var(--text); font-weight: 650; }
.statgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0; margin: 18px 0 22px; border-block: 1px solid var(--border); background: var(--panel); }
.stat { background: transparent; border: 0; border-right: 1px solid var(--border); border-radius: 0; padding: 14px 17px 15px; }
.stat:last-child { border-right: 0; }
.stat .v { font-size: clamp(21px, 2vw, 27px); font-weight: 650; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.stat .l { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.spread { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.btn { background: var(--panel); color: var(--text); border: 1px solid var(--border); border-radius: 5px; padding: 7px 12px; font-size: 13px; cursor: pointer; transition: background-color .14s ease, border-color .14s ease; }
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
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
`
