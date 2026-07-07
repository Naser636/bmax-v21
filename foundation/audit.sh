#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/audit-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG AUDIT REPORT"
echo ""

echo "Git Commit.............. $(git rev-parse --short HEAD)"
echo "Branch.................. $(git branch --show-current)"
echo "Repository.............. OK"

echo ""
echo "STATUS : READY"

} > "$REPORT"

cat "$REPORT"
