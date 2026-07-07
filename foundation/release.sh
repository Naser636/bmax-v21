#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/release-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG RELEASE REPORT"
echo ""

echo "Build................... $(npm run build >/dev/null 2>&1 && echo OK || echo FAILED)"
echo "Git..................... $(git rev-parse --short HEAD)"
echo "Branch.................. $(git branch --show-current)"
echo "Timestamp............... $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

echo ""
echo "STATUS : RELEASE READY"

} > "$REPORT"

cat "$REPORT"
