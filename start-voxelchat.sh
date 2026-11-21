#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  VoxelChat - double click this file (or run ./start-voxelchat.sh).
#  It installs what is missing, starts the local server and opens your browser.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo
    echo "  VoxelChat needs Node.js 20 or newer."
    echo "  Install it from https://nodejs.org and run this file again."
    echo
    exit 1
fi

if [ ! -d node_modules ]; then
    echo
    echo "  First run - installing the local engine. This happens once."
    echo
    npm install
fi

exec npm start
