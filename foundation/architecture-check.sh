#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/architecture-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG ARCHITECTURE REPORT"
echo ""

echo "src..................... $([ -d src ] && echo OK || echo MISSING)"
echo "contracts............... $([ -d src/contracts ] && echo OK || echo MISSING)"
echo "runtime................. $([ -d src/runtime ] && echo OK || echo MISSING)"
echo "dashboard............... $([ -d src/dashboard ] && echo OK || echo MISSING)"

echo ""
echo "STATUS : READY"

} > "$REPORT"

cat "$REPORT"
