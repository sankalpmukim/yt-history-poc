/** Global stylesheet, injected once as a <style> tag. YouTube-dark theme. */
export const CSS = `
:root {
  --bg: #0f0f0f; --panel: #181818; --panel2: #212121; --border: #303030;
  --text: #f1f1f1; --muted: #9aa0a6; --accent: #3ea6ff; --danger: #f87171;
  --ok: #4ade80; --warn: #fbbf24;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg); color: var(--text);
  font: 14px/1.5 "Roboto", "Segoe UI", system-ui, sans-serif;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.app { display: flex; min-height: 100vh; }
.sidebar {
  width: 216px; flex: 0 0 216px; padding: 20px 12px; border-right: 1px solid var(--border);
  background: var(--panel); position: sticky; top: 0; height: 100vh;
}
.brand { font-weight: 700; font-size: 16px; padding: 4px 12px 2px; display:flex; gap:8px; align-items:center; }
.brand .sub { font-size: 11px; color: var(--muted); font-weight: 400; }
.nav { margin-top: 18px; display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: block; padding: 8px 12px; border-radius: 8px; color: var(--text);
}
.nav a:hover { background: var(--panel2); text-decoration: none; }
.nav a.active { background: #2b2b2b; font-weight: 600; }
.sidefoot { margin-top: 24px; padding: 0 12px; font-size: 11px; color: var(--muted); }
.main { flex: 1; padding: 24px 28px 60px; max-width: 1180px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.hint { color: var(--muted); font-size: 12.5px; margin: 0 0 20px; }
.card {
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px 18px; margin-bottom: 18px;
}
.card h2 { font-size: 14px; margin: 0 0 12px; color: var(--text); font-weight: 600; }
.statgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
.stat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; }
.stat .v { font-size: 20px; font-weight: 700; }
.stat .l { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.spread { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.btn {
  background: var(--panel2); color: var(--text); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer;
}
.btn:hover { border-color: #4a4a4a; }
.btn-primary { background: #1d5fbf; border-color: #2a6fd4; }
.btn-primary:hover { background: #2268cf; }
.btn-danger { background: #3d1418; border-color: #6b2028; color: #fecaca; }
.btn-sm { padding: 3px 8px; font-size: 12px; }
.btn[disabled] { opacity: .5; cursor: default; }
select, input[type="text"], input[type="number"], textarea {
  background: var(--panel2); color: var(--text); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 9px; font-size: 13px;
}
input[type="checkbox"] { accent-color: var(--accent); }
.chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px;
  border-radius: 999px; font-size: 11.5px; border: 1px solid; cursor: pointer;
  white-space: nowrap; background: transparent;
}
.chip:hover { filter: brightness(1.25); }
.chip.none { border-style: dashed; color: var(--muted); border-color: #4b5563; }
.tablewrap { overflow-x: auto; }
table.ledger { width: 100%; border-collapse: collapse; font-size: 13px; }
table.ledger th {
  text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
  color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--border);
}
table.ledger td { padding: 7px 8px; border-bottom: 1px solid #232323; vertical-align: middle; }
table.ledger tr:hover td { background: #161616; }
.dayhead {
  display: flex; gap: 10px; align-items: baseline; margin: 18px 0 6px; font-weight: 600;
}
.dayhead .muted { color: var(--muted); font-weight: 400; font-size: 12px; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.high { background: var(--ok); } .dot.medium { background: var(--warn); } .dot.low { background: #6b7280; }
.overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex;
  align-items: center; justify-content: center; z-index: 100;
}
.menu { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px; width: 380px; max-height: 70vh; overflow: auto; }
.menu h3 { margin: 0 0 10px; font-size: 14px; }
.menu .opt {
  display: flex; width: 100%; text-align: left; gap: 8px; align-items: center;
  background: transparent; border: 0; color: var(--text); padding: 7px 8px;
  border-radius: 8px; cursor: pointer; font-size: 13px;
}
.menu .opt:hover { background: var(--panel2); }
.sharebar { height: 6px; border-radius: 4px; background: #2a2a2a; overflow: hidden; flex: 1; min-width: 90px; }
.sharebar > div { height: 100%; }
.rangebar { display: flex; gap: 6px; flex-wrap: wrap; }
.rangebar .btn.active { border-color: var(--accent); color: var(--accent); }
.bulkbar {
  position: sticky; top: 0; z-index: 10; background: #1c2333; border: 1px solid #35415e;
  border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; display: flex; gap: 10px; align-items: center;
}
.legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 260px; }
.legrow { display: flex; align-items: center; gap: 8px; }
.swatch { width: 10px; height: 10px; border-radius: 3px; flex: 0 0 10px; }
.empty { color: var(--muted); padding: 18px 0; text-align: center; }
.queueitem { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid #232323; }
.queueitem:last-child { border-bottom: 0; }
.qlink { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.steps { display: flex; gap: 8px; margin: 10px 0 18px; }
.step { flex: 1; text-align: center; padding: 8px; border-radius: 10px; background: var(--panel2); font-size: 12px; color: var(--muted); }
.step.active { color: var(--text); border: 1px solid var(--accent); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.segmented {
  display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px;
  background: var(--panel2); border: 1px solid var(--border); flex-wrap: wrap;
}
.segment {
  display: flex; align-items: center; gap: 8px; background: transparent;
  border: 1px solid transparent; color: var(--text); cursor: pointer;
  border-radius: 9px; padding: 7px 12px; font-size: 13px; text-align: left;
}
.segment:hover { background: #202020; }
.segment.active {
  background: #1c2333; border-color: var(--accent); color: var(--text);
  box-shadow: inset 0 0 0 1px rgba(91, 141, 239, .25);
}
.segment:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.segment-mark { font-size: 12px; color: var(--accent); line-height: 1; }
.segment-body { display: flex; flex-direction: column; gap: 1px; }
.segment-label { font-weight: 600; }
.segment-hint { font-size: 11px; color: var(--muted); }
.valuetier { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
`
