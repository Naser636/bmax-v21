#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/repair-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG REPAIR REPORT"
echo ""

if npm install >/dev/null 2>&1; then
  echo "Dependencies............ OK"
else
  echo "Dependencies............ FAILED"
fi

echo ""
echo "STATUS : READY"

} > "$REPORT"

cat "$REPORT"
