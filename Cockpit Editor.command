#!/bin/sh
# Starts the Cockpit Editor (macOS) and opens it in your browser. Close this terminal or press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3 is missing: install it from https://www.python.org/downloads/."; read -r _; exit 1
fi
python3 start.py "$@" || { echo; echo "Press Enter to close."; read -r _; }
