#!/usr/bin/env python3
"""
adx.py — robust wrapper for repetitive agent-desktop compound tasks.

Every subcommand wraps a flaky multi-step UI flow with retries, tolerant JSON
parsing, window disambiguation and verification. Designed for the
yt-history-poc loop: update extension -> reload tab -> read console.

Usage:
  adx.py update-extension [--timeout 60]     verified via capture-server sw-started
  adx.py switch-tab SUBSTR                   click a browser tab whose name contains SUBSTR
  adx.py reload-active                       click the toolbar Reload button
  adx.py console-grep PATTERN [OUTFILE]      collect DevTools console lines matching PATTERN
  adx.py sw-restarts                         list recent sw-started capture timestamps
"""

import json
import os
import re
import subprocess
import sys
import time

WINDOW_ID = os.environ.get("ADX_WINDOW", "w-2971")
DUMPS = "/private/tmp/opencode/yt-poc-dumps"
APP = "Brave Browser"


def run(*args, check_json=True):
    """Run agent-desktop, tolerate control chars and error envelopes."""
    cmd = ["agent-desktop", *args]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    raw = p.stdout.strip()
    if not raw:
        return {"ok": False, "error": {"code": "EMPTY", "stderr": p.stderr[:200]}}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return json.loads(raw, strict=False)
        except json.JSONDecodeError:
            return {"ok": False, "error": {"code": "BAD_JSON", "raw": raw[:200]}}


def snapshot(window=True):
    args = ["snapshot", "-i", "--compact"]
    if window:
        args += ["--window-id", WINDOW_ID]
    else:
        args += ["--app", APP]
    return run(*args)


def tree_of(env):
    return (env.get("data") or {}).get("tree") or {}


def walk(node, fn):
    if node is None or not isinstance(node, dict):
        return
    fn(node)
    for c in node.get("children", []):
        walk(c, fn)


def find_ref(pred, window=True, tries=3, delay=0.6):
    """Find first matching element ref, retrying through transient tree churn."""
    for _ in range(tries):
        env = snapshot(window=window)
        hits = []

        def visit(n):
            if pred(n):
                hits.append(n.get("ref_id"))

        walk(tree_of(env), visit)
        if hits:
            return hits[0]
        time.sleep(delay)
    return None


def click(ref, tries=2):
    if not ref:
        return False
    for _ in range(tries):
        env = run("click", ref)
        if env.get("ok"):
            return True
        time.sleep(0.7)
    return False


def latest_sw_restart():
    files = sorted(
        f for f in os.listdir(DUMPS) if f.endswith("-sw-started.json")
    ) if os.path.isdir(DUMPS) else []
    return files[-1] if files else None


def cmd_update_extension(args):
    timeout = float(args.get("--timeout", "90"))
    before = latest_sw_restart()
    deadline = time.time() + timeout

    while time.time() < deadline:
        # 1. open the toolbar extensions popup
        btn = find_ref(
            lambda n: n.get("role") == "combobox" and n.get("name") == "Extensions"
        )
        if not btn or not click(btn):
            time.sleep(1.0)
            continue
        time.sleep(1.2)

        # 2. Manage Extensions
        mgmt = find_ref(
            lambda n: n.get("role") == "button" and "Manage Extensions" in (n.get("name") or "")
        )
        if not mgmt or not click(mgmt):
            run("press", "escape")  # reset popup state
            time.sleep(1.0)
            continue
        time.sleep(1.8)

        # 3. Update
        upd = find_ref(lambda n: n.get("role") == "button" and n.get("name") == "Update")
        if not upd or not click(upd):
            time.sleep(1.0)
            continue

        # 4. verify: new sw-started dump must appear
        for _ in range(20):
            time.sleep(1.0)
            now_latest = latest_sw_restart()
            if now_latest and now_latest != before:
                print(f"UPDATE VERIFIED: sw restart {now_latest}")
                return 0
        print("update click did not restart SW; retrying whole flow", file=sys.stderr)

    print("FAILED: extension update not verified in time", file=sys.stderr)
    return 1


def cmd_switch_tab(args):
    substr = args["<substr>"]
    ref = find_ref(
        lambda n: n.get("role") == "radiobutton" and substr.lower() in (n.get("name") or "").lower()
    )
    if ref and click(ref):
        print(f"switched to tab matching {substr!r}")
        return 0
    print(f"tab matching {substr!r} not found", file=sys.stderr)
    return 1


def cmd_reload_active(args):
    ref = find_ref(lambda n: n.get("role") == "button" and n.get("name") == "Reload")
    if ref and click(ref):
        print("reloaded active tab")
        return 0
    print("Reload button not found", file=sys.stderr)
    return 1


def cmd_console_grep(args):
    pattern = args["<pattern>"]
    out = args.get("<outfile>")
    lines, seen = [], set()
    env = snapshot()
    rx = re.compile(pattern)

    def visit(n):
        name = n.get("name") or ""
        if name.strip() and rx.search(name):
            key = name[:60]
            if key not in seen:
                seen.add(key)
                lines.append(name)

    walk(tree_of(env), visit)
    body = "\n".join(lines)
    if out:
        open(out, "w").write(body)
        print(f"{len(lines)} lines -> {out}")
    else:
        print(body)
    return 0 if lines else 1


def cmd_sw_restarts(args):
    if not os.path.isdir(DUMPS):
        print("no dumps dir")
        return 1
    for f in sorted(f for f in os.listdir(DUMPS) if f.endswith("-sw-started.json"))[-5:]:
        print(f)
    return 0


COMMANDS = {
    "update-extension": cmd_update_extension,
    "switch-tab": cmd_switch_tab,
    "reload-active": cmd_reload_active,
    "console-grep": cmd_console_grep,
    "sw-restarts": cmd_sw_restarts,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        return 2
    argv = sys.argv[2:]
    args = {}
    positional = []
    i = 0
    while i < len(argv):
        if argv[i].startswith("--"):
            args[argv[i]] = argv[i + 1] if i + 1 < len(argv) else ""
            i += 2
        else:
            positional.append(argv[i])
            i += 1
    for key in ("update-extension", "reload-active", "sw-restarts"):
        if sys.argv[1] == key:
            return COMMANDS[key](args)
    cmd = COMMANDS[sys.argv[1]]
    positional_specs = {
        "switch-tab": ["<substr>"],
        "console-grep": ["<pattern>", "<outfile>"],
    }
    spec = positional_specs.get(sys.argv[1], [])
    for i, name in enumerate(spec):
        if i < len(positional):
            args[name] = positional[i]
    return cmd(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
