#!/usr/bin/env bash
set -euo pipefail
echo "=== Python dependency audit ==="
pip-audit -r requirements.txt
echo "=== Node dependency audit ==="
npm audit --prefix ../frontend --production
echo "=== Done ==="
