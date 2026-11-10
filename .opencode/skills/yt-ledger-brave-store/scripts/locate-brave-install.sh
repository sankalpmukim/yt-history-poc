#!/bin/bash
# Locate the YT Ledger extension's data in the local Brave browser and copy it
# somewhere readable. Brave keeps a LOCK on the LevelDB while running, so this
# always works on a copy — the original is never touched.
#
# Usage: locate-brave-install.sh
# Prints shell-evaluable lines:
#   EXT_ID=<id>
#   PROFILE=<profile dir name>
#   LDB_COPY=<temp dir containing the copied LevelDB>
# Exits 1 with a human-readable explanation if no installation is found.

set -euo pipefail

BRAVE_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && git rev-parse --show-toplevel)"

if [ ! -d "$BRAVE_DIR" ]; then
  echo "No Brave profile directory at $BRAVE_DIR (macOS path; adapt for other OSes)." >&2
  exit 1
fi

# Unpacked extensions live in Secure Preferences; store installs in Preferences.
# Match entries whose path points at this repository's build (the extension is
# loaded unpacked from here), falling back to any path containing yt-history-poc.
matches="$(
  python3 - "$BRAVE_DIR" "$REPO_ROOT" <<'PY'
import json, os, sys

brave_dir, repo_root = sys.argv[1], sys.argv[2]
profiles = ["Default"] + sorted(
    d for d in os.listdir(brave_dir) if d.startswith("Profile ")
)
for profile in profiles:
    for prefs_name in ("Secure Preferences", "Preferences"):
        prefs_path = os.path.join(brave_dir, profile, prefs_name)
        if not os.path.isfile(prefs_path):
            continue
        try:
            with open(prefs_path) as f:
                prefs = json.load(f)
        except (json.JSONDecodeError, OSError):
            continue
        settings = prefs.get("extensions", {}).get("settings", {})
        for ext_id, entry in settings.items():
            path = entry.get("path", "")
            if not path:
                continue
            in_repo = path.startswith(repo_root)
            is_ledger = "yt-history-poc" in path
            if in_repo or (is_ledger and "/build/" in path):
                print(f"{ext_id}\t{profile}\t{path}\t{int(in_repo)}")
PY
)"

if [ -z "$matches" ]; then
  echo "No YT Ledger installation found in any Brave profile." >&2
  echo "Load the unpacked build (Brave → Extensions → Load unpacked →" >&2
  echo "$REPO_ROOT/build/chrome-mv3-prod) and try again." >&2
  exit 1
fi

# Prefer an installation pointing at this checkout; otherwise take the first.
ext_id="$(printf '%s\n' "$matches" | (grep -m1 $'\t1$' || head -1) | cut -f1)"
profile="$(printf '%s\n' "$matches" | (grep -m1 "$ext_id" || true) | head -1 | cut -f2)"
ldb_dir="$BRAVE_DIR/$profile/Local Extension Settings/$ext_id"

if [ ! -d "$ldb_dir" ]; then
  echo "Extension $ext_id found in $profile but no storage at:" >&2
  echo "  $ldb_dir" >&2
  echo "Open the dashboard once so Brave creates the storage, then retry." >&2
  exit 1
fi

copy_dir="$(mktemp -d "${TMPDIR:-/tmp}/yt-ledger-ldb-XXXXXX")/$ext_id"
mkdir -p "$copy_dir"
cp -R "$ldb_dir/." "$copy_dir/"

echo "EXT_ID=$ext_id"
echo "PROFILE=$profile"
echo "LDB_COPY=$copy_dir"
