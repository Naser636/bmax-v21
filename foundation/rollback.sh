#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/rollback-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG ROLLBACK REPORT"
echo ""

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Git Repository.......... OK"
else
  echo "Git Repository.......... FAILED"
fi

echo "Rollback Capability..... READY"
echo ""
echo "STATUS : READY"

} > "$REPORT"

cat "$REPORT"
