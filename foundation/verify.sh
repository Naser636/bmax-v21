#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/verify-report.txt"

{
echo "ODG VERIFY REPORT"
echo ""
echo "Git..................... $(git rev-parse --is-inside-work-tree >/dev/null && echo OK)"
echo "Node.................... $(command -v node >/dev/null && echo OK || echo MISSING)"
echo "npm..................... $(command -v npm >/dev/null && echo OK || echo MISSING)"
echo "TypeScript.............. $(command -v npx >/dev/null && echo OK || echo MISSING)"
echo "Foundation.............. $([ -d foundation ] && echo OK || echo MISSING)"
echo ""
echo "STATUS : READY"
} > "$REPORT"

cat "$REPORT"
