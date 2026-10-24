#!/bin/sh
# Starts the Cockpit Editor (Linux) and opens it in your browser. Close this terminal or press Ctrl+C to stop it.
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
    echo "Python 3 is missing: install it with your package manager (e.g. sudo apt install python3)."; read -r _; exit 1
fi
python3 start.py "$@" || { echo; echo "Press Enter to close."; read -r _; }
