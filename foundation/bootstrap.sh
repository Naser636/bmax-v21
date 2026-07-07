#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/bootstrap-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG FOUNDATION REPORT"
echo ""
echo "Git..................... $(git rev-parse --is-inside-work-tree >/dev/null && echo OK)"
echo "Node.................... $(node -v)"
echo "npm..................... $(npm -v)"
echo "package.json............ $([ -f package.json ] && echo OK || echo MISSING)"
echo "tsconfig.json........... $([ -f tsconfig.json ] && echo OK || echo MISSING)"
echo "src..................... $([ -d src ] && echo OK || echo MISSING)"
echo ""
echo "STATUS : READY"
} > "$REPORT"

cat "$REPORT"
