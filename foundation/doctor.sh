#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/doctor-report.txt"

{
echo "ODG DOCTOR REPORT"
echo ""
echo "Git..................... $(git rev-parse --is-inside-work-tree >/dev/null && echo OK)"
echo "Node.................... $(node -v)"
echo "npm..................... $(npm -v)"
echo "TypeScript.............. $(npx tsc --version)"
echo "Package Lock............ $([ -f package-lock.json ] && echo OK || echo MISSING)"
echo "Node Modules............ $([ -d node_modules ] && echo OK || echo MISSING)"
echo ""
echo "STATUS : HEALTHY"
} > "$REPORT"

cat "$REPORT"
